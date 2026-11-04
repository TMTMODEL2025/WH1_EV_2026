import { EVTruck, ChargingStation, QueueItem, SessionLog } from '../types/ev';
import { UserItem } from '../data/users';
import { getThailandISOString } from '../utils/date';

// Base helper for Sheets API requests with automatic retry on transient network errors
async function sheetsFetch(spreadsheetId: string, endpoint: string, token: string, options: RequestInit = {}, retries = 2) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}${endpoint}`;
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...options.headers,
  };

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, { ...options, headers });
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Google Sheets API Error (${response.status}): ${errText}`);
      }
      return await response.json();
    } catch (err: any) {
      if (attempt < retries && (err?.message?.includes('Failed to fetch') || err?.message?.includes('fetch') || err?.name === 'TypeError')) {
        await new Promise((res) => setTimeout(res, 1000 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
}

// Drive API helper to create a file
async function driveCreateSpreadsheet(name: string, token: string, retries = 2): Promise<string> {
  const url = 'https://www.googleapis.com/drive/v3/files';
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  const body = JSON.stringify({
    name: name,
    mimeType: 'application/vnd.google-apps.spreadsheet',
  });

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body,
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Google Drive API Error (${response.status}): ${errText}`);
      }

      const file = await response.json();
      return file.id;
    } catch (err: any) {
      if (attempt < retries && (err?.message?.includes('Failed to fetch') || err?.message?.includes('fetch') || err?.name === 'TypeError')) {
        await new Promise((res) => setTimeout(res, 1000 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
  throw new Error('Drive API creation failed');
}

/**
 * Direct Google Sheets Database Operations (Mode A)
 */
export const googleSheetsDirect = {
  /**
   * Automatically create and initialize a new EV Charging database in Google Sheets
   */
  async createAndInitializeDatabase(token: string): Promise<string> {
    const spreadsheetId = await driveCreateSpreadsheet('EV Charging Management Database', token);

    // 1. Create the four sheets by batch updating the spreadsheet structure
    // By default, a spreadsheet has one sheet ("Sheet1" or similar). We will rename it and add the others.
    const metadata = await sheetsFetch(spreadsheetId, '', token);
    const firstSheetId = metadata.sheets?.[0]?.properties?.sheetId || 0;
    const firstSheetTitle = metadata.sheets?.[0]?.properties?.title || 'Sheet1';

    const requests = [
      // Rename first sheet to Trucks
      {
        updateSheetProperties: {
          properties: {
            sheetId: firstSheetId,
            title: 'Trucks',
          },
          fields: 'title',
        },
      },
      // Add Stations sheet
      {
        addSheet: {
          properties: {
            title: 'Stations',
          },
        },
      },
      // Add Queue sheet
      {
        addSheet: {
          properties: {
            title: 'Queue',
          },
        },
      },
      // Add Sessions sheet
      {
        addSheet: {
          properties: {
            title: 'Sessions',
          },
        },
      },
      // Add Users sheet
      {
        addSheet: {
          properties: {
            title: 'Users',
          },
        },
      },
    ];

    await sheetsFetch(spreadsheetId, ':batchUpdate', token, {
      method: 'POST',
      body: JSON.stringify({ requests }),
    });

    // 2. Populate sheets with Initial Headers Only (No Mock Data)
    const initialData = {
      'Trucks!A1': [
        ['Truck ID', 'License Plate', 'Model', 'Battery Capacity (kWh)', 'Current SOC (%)', 'Status', 'Last Updated', 'Last Odometer (km)']
      ],
      'Stations!A1': [
        ['Station ID', 'Station Name', 'Charger Type', 'Power Output (kW)', 'Status', 'Occupying Truck ID', 'Last Updated']
      ],
      'Queue!A1': [
        ['Queue ID', 'Truck ID', 'Priority', 'Requested Charger Type', 'Status', 'Request Time', 'Estimated Wait Time (min)']
      ],
      'Sessions!A1': [
        ['Session ID', 'Truck ID', 'Station ID', 'Operator', 'Start Time', 'End Time', 'Start SOC (%)', 'End SOC (%)', 'Energy Consumed (kWh)', 'Duration (mins)', 'Status', 'Odometer (km)', 'Price per Unit (THB)', 'Total Cost (THB)']
      ],
      'Users!A1': [
        ['Employee ID', 'Name', 'Role']
      ]
    };

    // Use batchUpdate values to write everything in a single trip
    const dataRequests = Object.entries(initialData).map(([range, values]) => ({
      range,
      values,
    }));

    await sheetsFetch(spreadsheetId, '/values:batchUpdate', token, {
      method: 'POST',
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data: dataRequests,
      }),
    });

    return spreadsheetId;
  },

  /**
   * Validate that the Spreadsheet ID has the required sheet names
   */
  async validateSpreadsheet(spreadsheetId: string, token: string): Promise<boolean> {
    try {
      const metadata = await sheetsFetch(spreadsheetId, '', token);
      const sheetTitles = metadata.sheets?.map((s: any) => s.properties?.title) || [];
      const required = ['Trucks', 'Stations', 'Queue', 'Sessions'];
      return required.every(title => sheetTitles.includes(title));
    } catch (e) {
      console.error('Validation failed:', e);
      return false;
    }
  },

  /**
   * Read all data from the database
   */
  async fetchAllData(spreadsheetId: string, token: string) {
    let sheetTitles: string[] = [];
    try {
      const metadata = await sheetsFetch(spreadsheetId, '', token);
      sheetTitles = metadata.sheets?.map((s: any) => s.properties?.title) || [];
    } catch (err) {
      console.error('Failed to fetch spreadsheet metadata:', err);
    }

    // Auto-create and seed Users sheet if it's missing but we have access
    if (sheetTitles.length > 0 && !sheetTitles.includes('Users')) {
      try {
        const requests = [{
          addSheet: {
            properties: {
              title: 'Users',
            },
          },
        }];
        await sheetsFetch(spreadsheetId, ':batchUpdate', token, {
          method: 'POST',
          body: JSON.stringify({ requests }),
        });

        const initialUsers = [
          ['Employee ID', 'Name', 'Role']
        ];
        await sheetsFetch(spreadsheetId, '/values/Users!A1?valueInputOption=USER_ENTERED', token, {
          method: 'PUT',
          body: JSON.stringify({
            values: initialUsers,
          }),
        });

        sheetTitles.push('Users');
      } catch (err) {
        console.error('Failed to auto-create and seed Users sheet:', err);
      }
    }

    const ranges = ['Trucks!A:H', 'Stations!A:G', 'Queue!A:G', 'Sessions!A:N'];
    const hasUsers = sheetTitles.includes('Users');
    if (hasUsers) {
      ranges.push('Users!A:C');
    }

    const result = await sheetsFetch(spreadsheetId, `/values:batchGet?ranges=${ranges.join('&ranges=')}`, token);
    const valueRanges = result.valueRanges || [];

    // Parse Trucks with deduplication by Truck ID
    const trucksRowData = valueRanges[0]?.values || [];
    const rawTrucks: EVTruck[] = parseSheetRows(trucksRowData, (row) => {
      const rawStatus = (row[5] || '').toString().trim();
      const status = rawStatus.toLowerCase() === 'charging' ? 'Charging' : (rawStatus.toLowerCase() === 'maintenance' ? 'Maintenance' : 'Available');
      return {
        id: (row[0] || '').toString().trim().toUpperCase(),
        licensePlate: (row[1] || '').toString().trim(),
        model: (row[2] || '').toString().trim(),
        batteryCapacity: parseFloat(row[3]) || 0,
        currentSOC: parseFloat(row[4]) || 0,
        status: status as any,
        lastUpdated: (row[6] || '').toString().trim(),
        currentOdometer: parseFloat(String(row[7] || '0').replace(/,/g, '')) || 0,
      };
    });
    const trucksMap = new Map<string, EVTruck>();
    for (const t of rawTrucks) {
      if (!t.id) continue;
      const existing = trucksMap.get(t.id);
      if (!existing) {
        trucksMap.set(t.id, t);
      } else {
        const tExisting = new Date(existing.lastUpdated || '').getTime() || 0;
        const tNew = new Date(t.lastUpdated || '').getTime() || 0;
        const newer = tNew >= tExisting ? t : existing;
        const older = tNew >= tExisting ? existing : t;
        trucksMap.set(t.id, {
          ...older,
          ...newer,
          id: t.id,
          licensePlate: newer.licensePlate || older.licensePlate,
          model: newer.model || older.model,
          batteryCapacity: newer.batteryCapacity || older.batteryCapacity || 282,
          currentOdometer: Math.max(Number(existing.currentOdometer) || 0, Number(t.currentOdometer) || 0),
        });
      }
    }
    const trucks = Array.from(trucksMap.values());

    // Parse Stations with deduplication by Station ID
    const stationsRowData = valueRanges[1]?.values || [];
    const rawStations: ChargingStation[] = parseSheetRows(stationsRowData, (row) => {
      const rawStatus = (row[4] || '').toString().trim();
      const status = rawStatus.toLowerCase() === 'occupied' ? 'Occupied' : (rawStatus.toLowerCase() === 'maintenance' ? 'Maintenance' : 'Available');
      return {
        id: (row[0] || '').toString().trim().toUpperCase(),
        name: (row[1] || '').toString().trim(),
        chargerType: (row[2] || 'DC Fast Charger') as any,
        powerOutput: parseFloat(row[3]) || 0,
        status: status as any,
        occupyingTruckId: (row[5] || '').toString().trim(),
        lastUpdated: (row[6] || '').toString().trim(),
      };
    });
    const stationsMap = new Map<string, ChargingStation>();
    for (const s of rawStations) {
      if (!s.id) continue;
      const existing = stationsMap.get(s.id);
      if (!existing) {
        stationsMap.set(s.id, s);
      } else {
        const tExisting = new Date(existing.lastUpdated || '').getTime() || 0;
        const tNew = new Date(s.lastUpdated || '').getTime() || 0;
        stationsMap.set(s.id, tNew >= tExisting ? s : existing);
      }
    }
    const stations = Array.from(stationsMap.values());

    // Parse Queue with deduplication by Queue ID
    const queueRowData = valueRanges[2]?.values || [];
    const rawQueue: QueueItem[] = parseSheetRows(queueRowData, (row) => ({
      id: (row[0] || '').toString().trim(),
      truckId: (row[1] || '').toString().trim(),
      priority: (row[2] || 'Normal') as any,
      requestedChargerType: (row[3] || 'DC') as any,
      status: (row[4] || 'Waiting') as any,
      requestTime: (row[5] || '').toString().trim(),
      estimatedWaitTime: parseFloat(row[6]) || 0,
    }));
    const queueMap = new Map<string, QueueItem>();
    for (const q of rawQueue) {
      if (!q.id) continue;
      queueMap.set(q.id, q);
    }
    const queue = Array.from(queueMap.values());

    // Parse Sessions with intelligent deduplication (Completed status takes precedence over Charging for duplicate Session IDs)
    const sessionsRowData = valueRanges[3]?.values || [];
    const sessionsRaw: SessionLog[] = parseSheetRows(sessionsRowData, (row) => {
      const rawStatus = (row[10] || '').toString().trim();
      const status = rawStatus.toLowerCase() === 'charging' ? 'Charging' : (rawStatus.toLowerCase() === 'completed' ? 'Completed' : (rawStatus || 'Completed'));
      return {
        id: (row[0] || '').toString().trim(),
        truckId: (row[1] || '').toString().trim(),
        stationId: (row[2] || '').toString().trim(),
        operatorName: (row[3] || '').toString().trim(),
        startTime: (row[4] || '').toString().trim(),
        endTime: (row[5] || '').toString().trim(),
        startSOC: parseFloat(row[6]) || 0,
        endSOC: parseFloat(row[7]) || 0,
        energyConsumed: parseFloat(row[8]) || 0,
        duration: parseFloat(row[9]) || 0,
        status: status as any,
        odometer: parseFloat(row[11]) || 0,
        pricePerUnit: parseFloat(row[12]) || 3.5000,
        totalCost: parseFloat(row[13]) || 0,
      };
    });

    const sessionsMap = new Map<string, SessionLog>();
    for (const sess of sessionsRaw) {
      if (!sess.id) continue;
      const key = String(sess.id).trim().toUpperCase();
      const existing = sessionsMap.get(key);
      if (!existing) {
        sessionsMap.set(key, sess);
      } else {
        if (existing.status === 'Charging' && sess.status === 'Completed') {
          sessionsMap.set(key, sess);
        } else if (existing.status === 'Completed' && sess.status === 'Charging') {
          // Keep Completed
        } else if (sess.endTime && !existing.endTime) {
          sessionsMap.set(key, sess);
        }
      }
    }
    const sessions = Array.from(sessionsMap.values());

    // Parse Users with deduplication
    let users: UserItem[] = [];
    if (hasUsers && valueRanges[4]) {
      const usersRowData = valueRanges[4]?.values || [];
      const rawUsers = parseSheetRows(usersRowData, (row) => ({
        employeeId: (row[0] || '').toString().trim(),
        name: (row[1] || '').toString().trim(),
        role: (row[2]?.toString() as any) || 'Driver',
      }));
      const usersMap = new Map<string, UserItem>();
      for (const u of rawUsers) {
        const key = u.employeeId || u.name;
        if (!key) continue;
        usersMap.set(key, u);
      }
      users = Array.from(usersMap.values());
    }

    return { trucks, stations, queue, sessions, users };
  },

  /**
   * Append a new item to a sheet
   */
  async appendRow(spreadsheetId: string, sheetName: string, rowValues: any[], token: string) {
    const range = `${sheetName}!A:Z`;
    return sheetsFetch(spreadsheetId, `/values/${range}:append?valueInputOption=USER_ENTERED`, token, {
      method: 'POST',
      body: JSON.stringify({
        values: [rowValues],
      }),
    });
  },

  /**
   * Update an existing row in a sheet by finding it by its ID (Column A)
   */
  async updateRow(spreadsheetId: string, sheetName: string, id: string, rowValues: any[], token: string) {
    let index = -1;

    if (sheetName === 'Sessions') {
      const fullResp = await sheetsFetch(spreadsheetId, `/values/${sheetName}!A:K`, token);
      const fullRows: any[][] = fullResp.values || [];
      const targetId = String(id).trim().toUpperCase();
      const targetTruckId = rowValues[1] ? String(rowValues[1]).trim().toUpperCase() : '';
      const targetStationId = rowValues[2] ? String(rowValues[2]).trim().toUpperCase() : '';
      const isCompletingSession = rowValues[10] && String(rowValues[10]).trim().toUpperCase() === 'COMPLETED';

      // 1. Search for exact Session ID in Column A prioritizing CHARGING / ACTIVE / uncompleted row
      if (targetId) {
        // 1a. First pass: look for exact targetId that is still CHARGING / ACTIVE / uncompleted
        for (let i = fullRows.length - 1; i >= 1; i--) {
          const r = fullRows[i];
          if (!r) continue;
          const status = r[10] ? String(r[10]).trim().toUpperCase() : '';
          const hasEndTime = r[5] && String(r[5]).trim() !== '';
          if (r[0] !== undefined && String(r[0]).trim().toUpperCase() === targetId && (status === 'CHARGING' || status === 'ACTIVE' || !hasEndTime)) {
            index = i;
            break;
          }
        }
        // 1b. Second pass: fallback to any row with exact targetId
        if (index === -1) {
          for (let i = fullRows.length - 1; i >= 1; i--) {
            const r = fullRows[i];
            if (!r) continue;
            if (r[0] !== undefined && String(r[0]).trim().toUpperCase() === targetId) {
              index = i;
              break;
            }
          }
        }
      }

      // 2. If exact Session ID not found, search bottom-up for matching Truck ID / Station ID with status 'CHARGING'
      if (index === -1) {
        for (let i = fullRows.length - 1; i >= 1; i--) {
          const r = fullRows[i];
          if (!r) continue;
          const tr = r[1] ? String(r[1]).trim().toUpperCase() : '';
          const st = r[2] ? String(r[2]).trim().toUpperCase() : '';
          const status = r[10] ? String(r[10]).trim().toUpperCase() : '';
          const hasEndTime = r[5] && String(r[5]).trim() !== '';

          if ((status === 'CHARGING' || status === 'ACTIVE' || !hasEndTime) &&
              ((targetTruckId && tr === targetTruckId) || (targetStationId && st === targetStationId))) {
            index = i;
            break;
          }
        }
      }

      // 3. If completing session, clean up any additional duplicate/orphaned rows for targetId or targetTruckId that are still CHARGING
      if (isCompletingSession) {
        for (let i = fullRows.length - 1; i >= 1; i--) {
          if (i === index) continue;
          const r = fullRows[i];
          if (!r) continue;
          const sid = r[0] ? String(r[0]).trim().toUpperCase() : '';
          const tr = r[1] ? String(r[1]).trim().toUpperCase() : '';
          const status = r[10] ? String(r[10]).trim().toUpperCase() : '';
          const hasEndTime = r[5] && String(r[5]).trim() !== '';

          if ((status === 'CHARGING' || status === 'ACTIVE' || !hasEndTime) &&
              ((targetId && sid === targetId) || (targetTruckId && tr === targetTruckId))) {
            const orphanRowNumber = i + 1;
            const orphanRange = `${sheetName}!A${orphanRowNumber}:${orphanRowNumber}`;
            try {
              await sheetsFetch(spreadsheetId, `/values/${orphanRange}?valueInputOption=USER_ENTERED`, token, {
                method: 'PUT',
                body: JSON.stringify({ values: [rowValues] }),
              });
            } catch (err) {
              console.warn(`Cleaned up orphan session at row ${orphanRowNumber}`, err);
            }
          }
        }
      }
    } else {
      const response = await sheetsFetch(spreadsheetId, `/values/${sheetName}!A:A`, token);
      const rows = response.values || [];
      const targetId = String(id).trim().toUpperCase();

      for (let i = rows.length - 1; i >= 0; i--) {
        const r = rows[i];
        if (r && r[0] !== undefined && String(r[0]).trim().toUpperCase() === targetId) {
          index = i;
          break;
        }
      }
    }

    if (index === -1) {
      throw new Error(`Row with ID ${id} not found in sheet ${sheetName}`);
    }

    const rowNumber = index + 1; // Sheets are 1-indexed
    const range = `${sheetName}!A${rowNumber}:${rowNumber}`;

    return sheetsFetch(spreadsheetId, `/values/${range}?valueInputOption=USER_ENTERED`, token, {
      method: 'PUT',
      body: JSON.stringify({
        values: [rowValues],
      }),
    });
  },

  /**
   * Delete a row by ID (In Google Sheets, we clear the row or rewrite the list. 
   * For simplicity and robustness, we can clear the cells of that row or remove the values).
   * Note: We delete it by clearing its contents.
   */
  async deleteRow(spreadsheetId: string, sheetName: string, id: string, token: string) {
    const response = await sheetsFetch(spreadsheetId, `/values/${sheetName}!A:A`, token);
    const rows = response.values || [];
    const index = rows.findIndex((r: any[]) => r && r[0] !== undefined && String(r[0]).trim() === String(id).trim());

    if (index === -1) {
      throw new Error(`Row with ID ${id} not found in sheet ${sheetName}`);
    }

    const rowNumber = index + 1;
    const range = `${sheetName}!A${rowNumber}:Z${rowNumber}`;
    return sheetsFetch(spreadsheetId, `/values/${range}:clear`, token, {
      method: 'POST',
    });
  }
};

/**
 * Parses raw row arrays from a spreadsheet response into typed JS objects, skipping the header.
 */
function parseSheetRows<T>(rows: any[][], mapper: (row: any[]) => T): T[] {
  if (rows.length <= 1) return [];
  const header = rows[0];
  const items: T[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    // Ignore empty or dummy rows
    if (!row || row.length === 0 || !row[0]) continue;
    items.push(mapper(row));
  }
  return items;
}
