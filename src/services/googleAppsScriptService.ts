import { EVTruck, ChargingStation, QueueItem, SessionLog } from '../types/ev';
import { UserItem } from '../data/users';

export const DEFAULT_PRODUCTION_GAS_URL = 'https://script.google.com/macros/s/AKfycbztaFLd4jxg1kv-_WLefXTA6y3N0anaOdoN5qPa0__18kBHGL1YIVvMfvrOI3Tc3iw/exec';

export function sanitizeBaseGasUrl(url: string): string {
  let clean = (url || '').trim();
  if (!clean) return DEFAULT_PRODUCTION_GAS_URL;
  if (clean.includes('#')) {
    clean = clean.split('#')[0];
  }
  if (clean.includes('?')) {
    clean = clean.split('?')[0];
  }
  clean = clean.replace(/\/+$/, '');
  if (clean.endsWith('/dev')) {
    clean = clean.replace(/\/dev$/, '/exec');
  }
  clean = clean.replace(/\/exec\/+$/, '/exec');
  if (clean.includes('/macros/s/') && !clean.endsWith('/exec')) {
    const parts = clean.split('/macros/s/')[1]?.split('/');
    if (parts && parts.length === 1) {
      clean = `${clean}/exec`;
    }
  }
  return clean;
}

export function sanitizeGasUrl(url: string): string {
  return sanitizeBaseGasUrl(url);
}

/**
 * Robust JSON parser that unpacks JSON embedded in Google Apps Script HTML responses
 */
export function parseGasResponse(text: string): any {
  if (!text || typeof text !== 'string') return null;
  // 1. Direct JSON parse
  try {
    return JSON.parse(text);
  } catch (e) {
    // Continue to HTML extraction
  }

  // 2. Unpack JSON embedded inside Google HTML / interstitial page
  const startIdx = text.indexOf('{"success":');
  if (startIdx !== -1) {
    const endIdx = text.lastIndexOf('}') + 1;
    if (endIdx > startIdx) {
      try {
        const jsonSub = text.substring(startIdx, endIdx);
        return JSON.parse(jsonSub);
      } catch (e) {
        // Continue
      }
    }
  }

  // 3. Match any object with success: true / false
  const regex = /\{[\s\S]*"success"\s*:\s*(?:true|false)[\s\S]*\}/;
  const match = text.match(regex);
  if (match) {
    try {
      return JSON.parse(match[0]);
    } catch (e) {
      // Continue
    }
  }

  return null;
}

let isProxyAvailable: boolean | null = null;

async function fetchGasWithRetry(url: string, options: RequestInit = {}, retries = 1, isFast = false) {
  let lastError: any = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    // Generous timeout of 60 seconds for full sheet payload download from Google Apps Script
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort(new Error('การเชื่อมต่อหมดเวลา (Timeout 60s): เครือข่ายหรือเซิร์ฟเวอร์ Google Apps Script ตอบสนองช้า'));
    }, 60000);

    try {
      let rawText = '';
      let isOk = false;

      // Strategy 1: If proxy is available or not yet tested, try /api/gas-proxy (Vite dev server or Netlify Function)
      const isBrowser = typeof window !== 'undefined';
      if (isBrowser && window.location && isProxyAvailable !== false) {
        try {
          const fastParam = isFast ? '&fast=1' : '';
          const proxyUrl = `/api/gas-proxy?url=${encodeURIComponent(url)}${fastParam}`;
          const proxyRes = await fetch(proxyUrl, {
            ...options,
            signal: controller.signal,
          });
          if (proxyRes.ok) {
            isProxyAvailable = true;
            rawText = await proxyRes.text();
            isOk = true;
          } else {
            // Netlify or serverless proxy timed out or failed (502, 504, 404) -> disable proxy to stop gateway timeouts
            isProxyAvailable = false;
          }
        } catch (proxyErr) {
          isProxyAvailable = false;
        }
      }

      // Strategy 2: Direct fetch to Google Apps Script with credentials: 'omit'
      if (!isOk) {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
          redirect: 'follow',
          credentials: 'omit',
        });
        rawText = await response.text();
        isOk = response.ok;
      }

      // Parse JSON with smart HTML unwrapping
      const parsed = parseGasResponse(rawText);
      if (parsed && typeof parsed === 'object') {
        return parsed;
      }

      if (!isOk) {
        // If 404 or other HTTP error and no valid JSON extracted, try default production URL fallback if applicable
        const defaultBase = sanitizeBaseGasUrl(DEFAULT_PRODUCTION_GAS_URL);
        const currentBase = sanitizeBaseGasUrl(url);
        if (currentBase !== defaultBase) {
          console.warn(`URL returned error (${url}), attempting fallback to default production gateway...`);
          const fallbackUrl = url.replace(currentBase, defaultBase);
          try {
            const fallbackRes = await fetch(fallbackUrl, {
              ...options,
              signal: controller.signal,
              redirect: 'follow',
              credentials: 'omit',
            });
            const fbText = await fallbackRes.text();
            const fbParsed = parseGasResponse(fbText);
            if (fbParsed && typeof fbParsed === 'object') {
              return fbParsed;
            }
          } catch (fbErr) {
            console.warn('Fallback to default production gateway failed:', fbErr);
          }
        }

        throw new Error('ไม่พบ Web App Deployment นี้ หรือเซิร์ฟเวอร์ยังไม่พร้อมใช้งาน กรุณากด "⚡ รีเซ็ต URL เริ่มต้น"');
      }

      throw new Error('ไม่สามารถแปลงข้อมูลที่ได้รับจาก Google Apps Script เป็น JSON ได้');
    } catch (err: any) {
      lastError = err;
      if (attempt < retries) {
        await new Promise((res) => setTimeout(res, 1000));
        continue;
      }
      throw lastError || err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError || new Error('Google Apps Script request failed');
}

export interface GasBatchOperation {
  action: 'add' | 'update' | 'delete';
  sheet: string;
  id?: string;
  row?: any[];
  description?: string;
}

/**
 * Google Apps Script Web App API Client (Mode B)
 */
export const googleAppsScriptService = {
  /**
   * Parse raw GAS payload into typed entities
   */
  parseFullResult(data: any, isFast = false, limit = 100, page = 1) {
    if (!data) {
      return { trucks: [], stations: [], queue: [], sessions: [], users: [], isPartialSessions: false, totalSessionsCount: 0, hasMore: false };
    }

    const trucks: EVTruck[] = (data.trucks || []).map((item: any) => {
      const rawStatus = (item['Status'] || '').toString().trim();
      const status = rawStatus.toLowerCase() === 'charging' ? 'Charging' : (rawStatus.toLowerCase() === 'maintenance' ? 'Maintenance' : 'Available');
      return {
        id: (item['Truck ID'] || '').toString().trim(),
        licensePlate: (item['License Plate'] || '').toString().trim(),
        model: (item['Model'] || '').toString().trim(),
        batteryCapacity: parseFloat(item['Battery Capacity (kWh)']) || 0,
        currentSOC: parseFloat(item['Current SOC (%)']) || 0,
        status: status as any,
        lastUpdated: (item['Last Updated'] || '').toString().trim(),
        currentOdometer: parseFloat(String(item['Last Odometer (km) (เลขไมล์ล่าสุด)'] || item['Last Odometer (km)'] || item['เลขไมล์ล่าสุด'] || item['Last Odometer'] || '0').replace(/,/g, '')) || 0,
      };
    });

    const stations: ChargingStation[] = (data.stations || []).map((item: any) => {
      const rawStatus = (item['Status'] || '').toString().trim();
      const status = rawStatus.toLowerCase() === 'occupied' ? 'Occupied' : (rawStatus.toLowerCase() === 'maintenance' ? 'Maintenance' : 'Available');
      return {
        id: (item['Station ID'] || '').toString().trim(),
        name: (item['Station Name'] || '').toString().trim(),
        chargerType: (item['Charger Type'] || 'DC Fast Charger') as any,
        powerOutput: parseFloat(item['Power Output (kW)']) || 0,
        status: status as any,
        occupyingTruckId: (item['Occupying Truck ID'] || '').toString().trim(),
        lastUpdated: (item['Last Updated'] || '').toString().trim(),
      };
    });

    const queue: QueueItem[] = (data.queue || []).map((item: any) => ({
      id: (item['Queue ID'] || '').toString().trim(),
      truckId: (item['Truck ID'] || '').toString().trim(),
      priority: (item['Priority'] || 'Normal') as any,
      requestedChargerType: (item['Requested Charger Type'] || 'DC') as any,
      status: (item['Status'] || 'Waiting') as any,
      requestTime: (item['Request Time'] || '').toString().trim(),
      estimatedWaitTime: parseFloat(item['Estimated Wait Time (min)']) || 0,
    }));

    const sessionsRaw: SessionLog[] = (data.sessions || []).map((item: any) => {
      const rawStatus = (item['Status'] || '').toString().trim();
      const status = rawStatus.toLowerCase() === 'charging' ? 'Charging' : (rawStatus.toLowerCase() === 'completed' ? 'Completed' : (rawStatus || 'Completed'));
      return {
        id: (item['Session ID'] || '').toString().trim(),
        truckId: (item['Truck ID'] || '').toString().trim(),
        stationId: (item['Station ID'] || '').toString().trim(),
        operatorName: (item['Operator'] || '').toString().trim(),
        startTime: (item['Start Time'] || '').toString().trim(),
        endTime: (item['End Time'] || '').toString().trim(),
        startSOC: parseFloat(item['Start SOC (%)']) || 0,
        endSOC: parseFloat(item['End SOC (%)']) || 0,
        energyConsumed: parseFloat(item['Energy Consumed (kWh)']) || 0,
        duration: parseFloat(item['Duration (mins)']) || 0,
        status: status as any,
        odometer: parseFloat(item['Odometer (km)']) || undefined,
        pricePerUnit: parseFloat(item['Price per Unit (THB)']) || 3.5000,
        totalCost: parseFloat(item['Total Cost (THB)']) || undefined,
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
    let finalSessions = Array.from(sessionsMap.values());
    const totalCount = data.totalSessionsCount || finalSessions.length;
    let hasMore = data.hasMore !== undefined
      ? Boolean(data.hasMore)
      : (page * limit < totalCount);

    // If client requested fast/paginated mode and backend returned the full untrimmed history, slice by page & limit
    if (isFast && !data.isPartialSessions && finalSessions.length > limit) {
      const endIndex = Math.max(0, finalSessions.length - ((page - 1) * limit));
      const startIndex = Math.max(0, endIndex - limit);
      const pageSlice = finalSessions.slice(startIndex, endIndex);
      const mergedMap = new Map<string, SessionLog>();
      for (const s of pageSlice) {
        if (s.id) mergedMap.set(String(s.id).trim().toUpperCase(), s);
      }
      if (page === 1) {
        const activeSessions = finalSessions.filter(s => s.status === 'Charging');
        for (const s of activeSessions) {
          if (s.id) mergedMap.set(String(s.id).trim().toUpperCase(), s);
        }
      }
      finalSessions = Array.from(mergedMap.values());
      hasMore = startIndex > 0;
    }

    const users: UserItem[] = (data.users || []).map((item: any) => ({
      employeeId: item['Employee ID']?.toString() || '',
      name: item['Name']?.toString() || '',
      role: (item['Role']?.toString() as any) || 'Driver',
    }));

    return {
      trucks,
      stations,
      queue,
      sessions: finalSessions,
      users,
      isPartialSessions: isFast || !!data.isPartialSessions,
      totalSessionsCount: totalCount,
      hasMore,
    };
  },

  /**
   * Fast load (Default) & Paginated Load: Fetch latest or specific page of data (1-2s).
   * Safe with both new and existing legacy Google Apps Script deployments.
   */
  async fetchRecentData(webAppUrl: string, limit = 100, page = 1) {
    const baseUrl = sanitizeBaseGasUrl(webAppUrl) || DEFAULT_PRODUCTION_GAS_URL;
    const actionName = page > 1 ? 'getHistory' : 'getRecent';
    const url = `${baseUrl}?action=${actionName}&page=${page}&limit=${limit}`;
    let result = await fetchGasWithRetry(url, {}, 1, true);

    // Legacy GAS fallback if deployed script only knows getRecent / getAll
    if (!result.success && page > 1 && String(result.error || '').includes('Unknown GET action')) {
      const fallbackUrl = `${baseUrl}?action=getRecent&limit=${limit}&page=${page}`;
      result = await fetchGasWithRetry(fallbackUrl, {}, 1, true);
    }

    if (!result.success) {
      throw new Error(result.error || 'Failed to fetch data from GAS Web App');
    }
    return this.parseFullResult(result.data, true, limit, page);
  },

  /**
   * Full historical load: Fetches all sessions for reports and long-term analysis.
   */
  async fetchAllData(webAppUrl: string) {
    const baseUrl = sanitizeBaseGasUrl(webAppUrl) || DEFAULT_PRODUCTION_GAS_URL;
    const url = `${baseUrl}?action=getAll`;
    const result = await fetchGasWithRetry(url, {}, 1, false);
    if (!result.success) {
      throw new Error(result.error || 'Failed to fetch data from GAS Web App');
    }
    return this.parseFullResult(result.data, false);
  },

  /**
   * Execute multiple mutations atomically in a single HTTP request (or fallback sequentially on legacy GAS)
   * Returns an array of operations that failed (empty array if all succeeded).
   */
  async batchWrite(webAppUrl: string, operations: GasBatchOperation[]): Promise<GasBatchOperation[]> {
    if (!operations || operations.length === 0) return [];
    const baseUrl = sanitizeBaseGasUrl(webAppUrl) || DEFAULT_PRODUCTION_GAS_URL;

    try {
      const batchResult = await fetchGasWithRetry(baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
        },
        body: JSON.stringify({
          action: 'batch',
          operations: operations.map(op => ({
            action: op.action,
            sheet: op.sheet,
            id: op.id,
            row: op.row,
          })),
        }),
      });

      if (batchResult && batchResult.success) {
        return [];
      }

      // If legacy GAS deployment does not support "batch" action yet, execute sequentially
      const errStr = String(batchResult?.error || '');
      if (errStr.includes('Unknown POST action') || errStr.includes('Unknown mutation action')) {
        const failedOps: GasBatchOperation[] = [];
        for (const op of operations) {
          try {
            if (op.action === 'add') {
              await this.appendRow(baseUrl, op.sheet, op.row!);
            } else if (op.action === 'update') {
              await this.updateRow(baseUrl, op.sheet, op.id!, op.row!);
            } else if (op.action === 'delete') {
              await this.deleteRow(baseUrl, op.sheet, op.id!);
            }
          } catch (singleErr) {
            failedOps.push(op);
          }
        }
        return failedOps;
      }

      throw new Error(batchResult?.error || 'Batch write failed');
    } catch (err) {
      return operations;
    }
  },

  /**
   * Append a row using the Google Apps Script POST endpoint
   */
  async appendRow(webAppUrl: string, sheetName: string, rowValues: any[]) {
    const baseUrl = sanitizeBaseGasUrl(webAppUrl) || DEFAULT_PRODUCTION_GAS_URL;
    const result = await fetchGasWithRetry(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain', // Use text/plain to avoid CORS preflight options check which can fail on script.google.com
      },
      body: JSON.stringify({
        action: 'add',
        sheet: sheetName,
        row: rowValues,
      }),
    });

    if (!result.success) {
      throw new Error(result.error || 'Failed to append row via GAS Web App');
    }
    return result;
  },

  /**
   * Update an existing row via Google Apps Script POST endpoint
   */
  async updateRow(webAppUrl: string, sheetName: string, id: string, rowValues: any[]) {
    const baseUrl = sanitizeBaseGasUrl(webAppUrl) || DEFAULT_PRODUCTION_GAS_URL;
    const result = await fetchGasWithRetry(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
      },
      body: JSON.stringify({
        action: 'update',
        sheet: sheetName,
        id,
        row: rowValues,
      }),
    });

    if (!result.success) {
      throw new Error(result.error || 'Failed to update row via GAS Web App');
    }
    return result;
  },

  /**
   * Delete a row via Google Apps Script POST endpoint
   */
  async deleteRow(webAppUrl: string, sheetName: string, id: string) {
    const baseUrl = sanitizeBaseGasUrl(webAppUrl) || DEFAULT_PRODUCTION_GAS_URL;
    const result = await fetchGasWithRetry(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
      },
      body: JSON.stringify({
        action: 'delete',
        sheet: sheetName,
        id,
      }),
    });

    if (!result.success) {
      throw new Error(result.error || 'Failed to delete row via GAS Web App');
    }
    return result;
  },
};
