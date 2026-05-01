/**
 * Handles incoming HTTP GET requests.
 * Routes to either serving the HTML frontend or returning the waypoints JSON.
 */
function doGet(e) {
  // If the frontend requests the waypoints via API
  if (e.parameter.action === 'getWaypoints') {
    const waypoints = getWaypointsList();
    return ContentService.createTextOutput(JSON.stringify({ status: 'success', data: waypoints }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // Otherwise, serve the HTML Single Page Application
  // (Requires an 'Index.html' file to be created in the Apps Script editor)
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Event Scanner')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
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
    const participantsSheet = ss.getSheetByName("Participants");
    const checkinsSheet = ss.getSheetByName("Checkins");

    // 1. Look up the participant name
    // Assuming Participants tab format: Column A = ID, Column B = Name
    const pData = participantsSheet.getDataRange().getValues();
    let participantName = "Unknown ID";

    // Start loop from 1 to skip the header row
    for (let i = 1; i < pData.length; i++) {
      if (String(pData[i][0]).trim() === participantId) {
        participantName = pData[i][1];
        break;
      }
    }

    // 2. Append to Checkins sheet
    // Format: Timestamp | ID | Name | Waypoint | Latitude | Longitude
    checkinsSheet.appendRow([timestamp, participantId, participantName, waypoint, lat, lng]);

    // 3. Return success response to the SPA
    const response = {
      status: "success",
      name: participantName
    };

    return ContentService.createTextOutput(JSON.stringify(response))
      .setMimeType(ContentService.MimeType.JSON);

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