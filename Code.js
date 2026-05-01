/**
 * Handles incoming HTTP GET requests. JSON API only.
 */
function doGet(e) {
  if (e.parameter.action === 'getWaypoints') {
    const waypoints = getWaypointsList();
    return ContentService.createTextOutput(JSON.stringify({ status: 'success', data: waypoints }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Unknown action' }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Handles incoming HTTP POST requests for check-ins.
 * Uses LockService to prevent data loss during concurrent scans.
 */
function doPost(e) {
  const lock = LockService.getScriptLock();

  // Wait for up to 5 seconds for other concurrent executions to finish
  if (!lock.tryLock(5000)) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Server busy. Please try again.' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  try {
    // Parse the incoming JSON payload
    const payload = JSON.parse(e.postData.contents);
    const participantId = String(payload.participantId).trim();
    const waypoint = payload.waypoint;
    const lat = payload.latitude || "N/A";
    const lng = payload.longitude || "N/A";
    const timestamp = payload.timestamp || new Date().toISOString();

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const checkinsSheet = ss.getSheetByName("Checkins");

    // 1. Reject duplicate check-ins (same participant + same waypoint)
    // Checkins format: Timestamp | ID | Waypoint | Latitude | Longitude
    const cData = checkinsSheet.getDataRange().getValues();
    for (let i = 1; i < cData.length; i++) {
      if (String(cData[i][1]).trim() === participantId &&
          String(cData[i][2]).trim() === String(waypoint).trim()) {
        return ContentService.createTextOutput(JSON.stringify({
          status: "duplicate",
          id: participantId,
          waypoint: waypoint,
          originalTimestamp: String(cData[i][0])
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }

    // 2. Append to Checkins sheet, then flush so the next request's
    //    duplicate scan can see this row immediately (otherwise Apps
    //    Script buffers the write and concurrent scans race).
    checkinsSheet.appendRow([timestamp, participantId, waypoint, lat, lng]);
    SpreadsheetApp.flush();

    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      id: participantId
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    // Handle malformed JSON or other errors gracefully
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    // Always release the lock, even if the script errors out
    lock.releaseLock();
  }
}

/**
 * Helper function to extract waypoints from the spreadsheet.
 */
function getWaypointsList() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Waypoints");
  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();
  const waypoints = [];

  // Assuming Waypoints tab format: Column A = Waypoint Name
  // Start loop from 1 to skip the header row
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] !== "") {
      waypoints.push(String(data[i][0]).trim());
    }
  }

  return waypoints;
}