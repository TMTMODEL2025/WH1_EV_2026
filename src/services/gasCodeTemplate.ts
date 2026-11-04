export const googleAppsScriptCode = `/**
 * EV Charging Management System - Backend API Script
 * ----------------------------------------------------
 * Place this code in script.google.com, bound to your Google Sheet,
 * and deploy as a "Web App" with Access set to "Anyone" (even anonymous).
 */

const SPREADSHEET_ID = ""; // Leave blank if script is bound to the sheet, or paste Spreadsheet ID here

function getActiveSpreadsheet() {
  if (SPREADSHEET_ID && SPREADSHEET_ID !== "") {
    return SpreadsheetApp.openById(SPREADSHEET_ID);
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

/**
 * Handle GET Requests
 */
function doGet(e) {
  try {
    const action = e.parameter.action || "getAll";
    const ss = getActiveSpreadsheet();
    
    // Check if partition / limit requested for sessions (e.g. fast refresh of recent 100 rows + active sessions)
    const limitParam = e.parameter.sessionsLimit || e.parameter.limit;
    const pageParam = e.parameter.page || 1;
    const isRecentOnly = action === "getRecent" || action === "getLatest" || action === "getHistory" || (limitParam && String(limitParam).toLowerCase() !== "all");
    const limitCount = isRecentOnly ? (parseInt(limitParam, 10) || 100) : 0;
    const pageCount = isRecentOnly ? Math.max(1, parseInt(pageParam, 10) || 1) : 1;
    
    if (action === "getAll" || action === "getRecent" || action === "getLatest" || action === "getHistory") {
      const cacheKey = isRecentOnly ? ("tmt_ev_recent_" + limitCount + "_p" + pageCount) : "tmt_ev_all_data";
      const cache = CacheService.getScriptCache();
      const cached = cache.get(cacheKey);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          return jsonResponse({ success: true, data: parsed, cached: true });
        } catch (err) {}
      }

      let usersSheet = ss.getSheetByName("Users");
      if (!usersSheet) {
        try {
          usersSheet = ss.insertSheet("Users");
          usersSheet.appendRow(["Employee ID", "Name"]);
          var initialUsers = [
            ['55019283', 'สมชาย แข็งขัน'],
            ['55019284', 'วิชัย รักงาน'],
            ['55019285', 'มานะ ใจดี'],
            ['55019286', 'สมศักดิ์ รักดี'],
            ['55019287', 'นารี สวยงาม'],
            ['55019288', 'สมเกียรติ มั่นคง'],
            ['55019289', 'ประเสริฐ เลิศล้ำ']
          ];
          for (var i = 0; i < initialUsers.length; i++) {
            usersSheet.appendRow(initialUsers[i]);
          }
        } catch (e) {
          // ignore if cannot create
        }
      }

      const sessionsSheet = ss.getSheetByName("Sessions");
      const totalSessionsCount = sessionsSheet ? Math.max(0, sessionsSheet.getLastRow() - 1) : 0;
      const sessionsData = isRecentOnly
        ? getRecentSessionsData(sessionsSheet, limitCount, pageCount)
        : getSheetData(sessionsSheet);

      // If action is getHistory (page > 1), we only need sessions, but returning light tables keeps full compatibility
      const data = {
        trucks: getSheetData(ss.getSheetByName("Trucks")),
        stations: getSheetData(ss.getSheetByName("Stations")),
        queue: getSheetData(ss.getSheetByName("Queue")),
        sessions: sessionsData,
        users: getSheetData(ss.getSheetByName("Users")),
        isPartialSessions: isRecentOnly,
        page: pageCount,
        limit: limitCount,
        totalSessionsCount: totalSessionsCount
      };

      try {
        const jsonStr = JSON.stringify(data);
        if (jsonStr.length < 100000) {
          cache.put(cacheKey, jsonStr, 15); // Cache for 15 seconds
        }
      } catch (ce) {}

      return jsonResponse({ success: true, data: data });
    }
    
    return jsonResponse({ success: false, error: "Unknown GET action" });
  } catch (error) {
    return jsonResponse({ success: false, error: error.toString() });
  }
}

/**
 * Helper to execute a single write operation (add / update / delete) on a spreadsheet
 */
function executeSingleMutation(ss, op) {
  const action = op.action;
  const sheetName = op.sheet;
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    throw new Error("Sheet not found: " + sheetName);
  }

  if (action === "add") {
    const rowData = op.row;
    // Prevent duplicate Session ID if retried
    if (sheetName === "Sessions" && rowData && rowData[0]) {
      const lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        const checkCount = Math.min(50, lastRow - 1);
        const startCheck = lastRow - checkCount + 1;
        const recentIds = sheet.getRange(startCheck, 1, checkCount, 1).getValues();
        const newId = String(rowData[0]).trim().toUpperCase();
        for (let i = recentIds.length - 1; i >= 0; i--) {
          if (String(recentIds[i][0] || "").trim().toUpperCase() === newId) {
            return { status: "skipped_duplicate", id: newId };
          }
        }
      }
    }
    sheet.appendRow(rowData);
    return { status: "added" };
  }

  if (action === "update") {
    const id = op.id;
    const rowData = op.row;
    let rowIndex = -1;
    const lastRow = sheet.getLastRow();

    if (lastRow <= 1) {
      throw new Error("Sheet is empty: " + sheetName);
    }

    if (sheetName === "Sessions") {
      const targetId = id ? String(id).trim().toUpperCase() : "";
      const targetTruckId = rowData[1] ? String(rowData[1]).trim().toUpperCase() : "";
      const targetStationId = rowData[2] ? String(rowData[2]).trim().toUpperCase() : "";
      const isCompleting = rowData[10] && String(rowData[10]).trim().toUpperCase() === "COMPLETED";

      // Fast path: Search last 250 rows first (active sessions are almost always near the bottom)
      const tailCount = Math.min(250, lastRow - 1);
      const tailStartRow = lastRow - tailCount + 1;
      const tailData = sheet.getRange(tailStartRow, 1, tailCount, Math.min(14, sheet.getLastColumn())).getValues();

      rowIndex = findSessionRowInChunk(tailData, tailStartRow, targetId, targetTruckId, targetStationId, isCompleting, sheet, rowData);

      // Fallback path: Only scan full sheet if not found in last 250 rows
      if (rowIndex === -1 && tailStartRow > 2) {
        const headCount = tailStartRow - 2;
        const headData = sheet.getRange(2, 1, headCount, Math.min(14, sheet.getLastColumn())).getValues();
        rowIndex = findSessionRowInChunk(headData, 2, targetId, targetTruckId, targetStationId, isCompleting, sheet, rowData);
      }
    } else {
      const values = sheet.getRange(1, 1, lastRow, 1).getValues();
      const targetId = id ? String(id).trim().toUpperCase() : "";
      for (let i = values.length - 1; i >= 1; i--) {
        if (values[i][0] !== undefined && String(values[i][0]).trim().toUpperCase() === targetId) {
          rowIndex = i + 1;
          break;
        }
      }
    }

    if (rowIndex === -1) {
      throw new Error("Row ID not found for update: " + id);
    }

    sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
    return { status: "updated", rowIndex: rowIndex };
  }

  if (action === "delete") {
    const id = op.id;
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) throw new Error("Row ID not found for deletion");
    const values = sheet.getRange(1, 1, lastRow, 1).getValues();
    let rowIndex = -1;

    for (let i = values.length - 1; i >= 1; i--) {
      if (values[i][0] !== undefined && String(values[i][0]).trim() === String(id).trim()) {
        rowIndex = i + 1;
        break;
      }
    }

    if (rowIndex === -1) {
      throw new Error("Row ID not found for deletion: " + id);
    }

    sheet.deleteRow(rowIndex);
    return { status: "deleted", rowIndex: rowIndex };
  }

  throw new Error("Unknown mutation action: " + action);
}

function findSessionRowInChunk(chunkData, startRowOffset, targetId, targetTruckId, targetStationId, isCompleting, sheet, rowData) {
  let rowIndex = -1;
  // 1. Search by exact Session ID prioritizing CHARGING / ACTIVE
  if (targetId) {
    for (let i = chunkData.length - 1; i >= 0; i--) {
      const r = chunkData[i];
      if (!r) continue;
      const status = r[10] ? String(r[10]).trim().toUpperCase() : "";
      const hasEndTime = r[5] && String(r[5]).trim() !== "";
      if (r[0] !== undefined && String(r[0]).trim().toUpperCase() === targetId && (status === "CHARGING" || status === "ACTIVE" || !hasEndTime)) {
        rowIndex = startRowOffset + i;
        break;
      }
    }
    if (rowIndex === -1) {
      for (let i = chunkData.length - 1; i >= 0; i--) {
        const r = chunkData[i];
        if (r && r[0] !== undefined && String(r[0]).trim().toUpperCase() === targetId) {
          rowIndex = startRowOffset + i;
          break;
        }
      }
    }
  }

  // 2. Fallback: Search bottom-up by Truck ID or Station ID with active CHARGING status
  if (rowIndex === -1) {
    for (let i = chunkData.length - 1; i >= 0; i--) {
      const r = chunkData[i];
      if (!r) continue;
      const tr = r[1] ? String(r[1]).trim().toUpperCase() : "";
      const st = r[2] ? String(r[2]).trim().toUpperCase() : "";
      const status = r[10] ? String(r[10]).trim().toUpperCase() : "";
      const hasEndTime = r[5] && String(r[5]).trim() !== "";
      if ((status === "CHARGING" || status === "ACTIVE" || !hasEndTime) &&
          ((targetTruckId && tr === targetTruckId) || (targetStationId && st === targetStationId))) {
        rowIndex = startRowOffset + i;
        break;
      }
    }
  }

  // 3. Clean up any remaining orphaned CHARGING rows in this chunk for the same truck/session
  if (isCompleting) {
    for (let i = chunkData.length - 1; i >= 0; i--) {
      const currentRowNum = startRowOffset + i;
      if (currentRowNum === rowIndex) continue;
      const r = chunkData[i];
      if (!r) continue;
      const sid = r[0] ? String(r[0]).trim().toUpperCase() : "";
      const tr = r[1] ? String(r[1]).trim().toUpperCase() : "";
      const status = r[10] ? String(r[10]).trim().toUpperCase() : "";
      const hasEndTime = r[5] && String(r[5]).trim() !== "";
      if ((status === "CHARGING" || status === "ACTIVE" || !hasEndTime) &&
          ((targetId && sid === targetId) || (targetTruckId && tr === targetTruckId))) {
        try {
          sheet.getRange(currentRowNum, 1, 1, rowData.length).setValues([rowData]);
        } catch (e) {}
      }
    }
  }

  return rowIndex;
}

/**
 * Handle POST Requests (Supports single action and atomic "batch" transactions)
 */
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch (lockErr) {
    return jsonResponse({ success: false, error: "Server busy processing another transaction. Please retry." });
  }

  try {
    const postData = JSON.parse(e.postData.contents);
    const action = postData.action;
    const ss = getActiveSpreadsheet();
    
    if (!action) {
      return jsonResponse({ success: false, error: "Action is required in POST payload" });
    }

    if (action === "batch" && Array.isArray(postData.operations)) {
      const results = [];
      for (let i = 0; i < postData.operations.length; i++) {
        results.push(executeSingleMutation(ss, postData.operations[i]));
      }
      SpreadsheetApp.flush();
      invalidateScriptCaches();
      return jsonResponse({ success: true, message: "Batch operations completed", results: results });
    }

    const singleResult = executeSingleMutation(ss, postData);
    SpreadsheetApp.flush();
    invalidateScriptCaches();
    return jsonResponse({ success: true, message: "Operation completed", result: singleResult });
  } catch (error) {
    return jsonResponse({ success: false, error: error.toString() });
  } finally {
    try {
      lock.releaseLock();
    } catch (re) {}
  }
}

function invalidateScriptCaches() {
  try {
    const cache = CacheService.getScriptCache();
    cache.removeAll([
      "tmt_ev_all_data",
      "tmt_ev_recent_100_p1",
      "tmt_ev_recent_100_p2",
      "tmt_ev_recent_100_p3"
    ]);
  } catch (ce) {}
}

/**
 * Utility: Fetch paginated N sessions from the bottom (newest first) plus active CHARGING sessions on page 1
 * Provides 50x speedup when history is large (e.g. 3,185+ rows)
 */
function getRecentSessionsData(sheet, limit, page) {
  if (!sheet) return [];
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow <= 1) return [];

  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const items = [];
  const seenIds = {};

  const numRowsToFetch = limit || 100;
  const pageNum = Math.max(1, page || 1);
  // Calculate endRow and startRow for bottom-up pagination:
  // Page 1: rows [lastRow - limit + 1 .. lastRow]
  // Page 2: rows [lastRow - 2*limit + 1 .. lastRow - limit]
  const endRow = lastRow - ((pageNum - 1) * numRowsToFetch);
  if (endRow < 2) return [];

  const startRow = Math.max(2, endRow - numRowsToFetch + 1);
  const actualNumRows = endRow - startRow + 1;

  if (actualNumRows > 0) {
    const recentRows = sheet.getRange(startRow, 1, actualNumRows, lastCol).getValues();
    for (let i = recentRows.length - 1; i >= 0; i--) {
      const row = recentRows[i];
      if (!row || !row[0]) continue;
      const obj = {};
      for (let j = 0; j < headers.length; j++) {
        obj[headers[j]] = row[j];
      }
      const idKey = String(row[0]).trim().toUpperCase();
      seenIds[idKey] = true;
      items.push(obj);
    }
  }

  // On page 1, also check recent 300 rows above startRow for any still-active CHARGING sessions
  if (pageNum === 1 && startRow > 2 && lastCol >= 11) {
    const scanStart = Math.max(2, startRow - 300);
    const scanCount = startRow - scanStart;
    if (scanCount > 0) {
      const statusCol = sheet.getRange(scanStart, 11, scanCount, 1).getValues();
      for (let i = statusCol.length - 1; i >= 0; i--) {
        const st = String(statusCol[i][0] || '').trim().toUpperCase();
        if (st === 'CHARGING' || st === 'ACTIVE') {
          const rowNum = scanStart + i;
          const activeRow = sheet.getRange(rowNum, 1, 1, lastCol).getValues()[0];
          if (activeRow && activeRow[0]) {
            const idKey = String(activeRow[0]).trim().toUpperCase();
            if (!seenIds[idKey]) {
              seenIds[idKey] = true;
              const obj = {};
              for (let j = 0; j < headers.length; j++) {
                obj[headers[j]] = activeRow[j];
              }
              items.push(obj);
            }
          }
        }
      }
    }
  }

  return items;
}

/**
 * Utility: Convert sheet to JSON array
 */
function getSheetData(sheet) {
  if (!sheet) return [];
  const rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return [];
  
  const headers = rows[0];
  const items = [];
  
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0 || !row[0]) continue;
    
    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = row[j];
    }
    items.push(obj);
  }
  return items;
}

/**
 * Utility: JSON Response Output
 */
function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
`;
