/**
 * Google Apps Script Web App
 *
 * Deploy this as a Web App:
 * 1. Open https://script.google.com/ -> New Project
 * 2. Paste this code, save
 * 3. Deploy > New Deployment > Web App
 *    - Execute as: Me
 *    - Who can access: Anyone
 * 4. Copy the Web App URL -> set as APPS_SCRIPT_URL in .env.local
 *
 * Before deploying, set these Script Properties:
 *   - DRIVE_FOLDER_ID: the Google Drive folder ID for admin invoices
 *
 * The script must be bound to your Google Sheet OR you set SHEET_ID in Script Properties.
 * If bound (File > New > Script from within the Sheet), it auto-detects the sheet.
 */

// ─── CONFIG ────────────────────────────────────────────
// If this script is NOT bound to your sheet, set SHEET_ID in Script Properties.
// If it IS bound, leave this empty — it auto-detects.

function getSheetId_() {
  const props = PropertiesService.getScriptProperties();
  const bound = SpreadsheetApp.getActiveSpreadsheet();
  if (bound) return bound.getId();
  return props.getProperty('SHEET_ID');
}

function getDriveFolderId_() {
  return PropertiesService.getScriptProperties().getProperty('DRIVE_FOLDER_ID');
}

function getOrCreateSheet_(ss, sheetName) {
  let sheet = ss.getSheetByName(sheetName);
  if (sheet) return sheet;
  sheet = ss.insertSheet(sheetName);
  sheet.appendRow([
    'Timestamp', 'Invoice ID', 'Name', 'Address', 'Phone',
    'Course Name', 'Full Amount', 'Payment Type', 'Paid Amount',
    'Due Amount', 'DU Status', 'Academic Session', 'Department',
    'Hall Name', 'DU Registration ID', 'Payment Method', 'Transaction ID', 'Drive Link'
  ]);
  return sheet;
}

// ─── DO POST ────────────────────────────────────────────
function doPost(e) {
  const headers = { 'Content-Type': 'application/json' };

  try {
    const data = JSON.parse(e.postData.contents);
    const {
      name, address, phone, service, amount, isDuStudent,
      academicSession, department, hallName, duRegistrationId,
      paymentMethod, transactionId, paymentType, fullAmount, formMode,
      adminPdfBase64, filename, timestamp: clientTimestamp,
    } = data;

    const isMember = formMode === 'member';
    const courseName = isMember ? 'N/A' : service;

    // Validate
    if (!name || !phone || !paymentMethod || !transactionId) {
      return ContentService.createTextOutput(JSON.stringify({ error: 'Missing required fields' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Timestamp & invoice ID
    const now = clientTimestamp ? new Date(clientTimestamp) : new Date();
    const timestamp = now.toISOString();
    const currentYear = now.getFullYear();
    const sheetName = isMember ? 'member recruitment' : 'course recruitment';

    // Get sheet
    const sheetId = getSheetId_();
    if (!sheetId) {
      return ContentService.createTextOutput(JSON.stringify({ error: 'SHEET_ID not configured' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const ss = SpreadsheetApp.openById(sheetId);
    const sheet = getOrCreateSheet_(ss, sheetName);
    const allData = sheet.getDataRange().getValues();

    // Calculate invoice serial
    let invoiceSerial = 1;
    for (let i = 1; i < allData.length; i++) {
      const val = String(allData[i][1] || '');
      if (isMember && val.startsWith('M')) {
        const n = parseInt(val.substring(1), 10);
        if (!isNaN(n) && n >= invoiceSerial) invoiceSerial = n + 1;
      } else if (!isMember && val.startsWith(String(currentYear))) {
        const n = parseInt(val.substring(String(currentYear).length), 10);
        if (!isNaN(n) && n >= invoiceSerial) invoiceSerial = n + 1;
      }
    }

    const invoiceId = isMember
      ? `M${String(invoiceSerial).padStart(2, '0')}`
      : `${currentYear}${String(invoiceSerial).padStart(2, '0')}`;

    // Upload PDF to Drive (if provided)
    let driveLink = '';
    const driveFolderId = getDriveFolderId_();

    if (adminPdfBase64 && driveFolderId) {
      try {
        const pdfBytes = Utilities.base64Decode(adminPdfBase64);
        const blob = Utilities.newBlob(pdfBytes, 'application/pdf', filename || `invoice-${invoiceId}.pdf`);
        const folder = DriveApp.getFolderById(driveFolderId);
        const file = folder.createFile(blob);
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        driveLink = file.getUrl();
      } catch (e) {
        console.error('Drive upload failed: ' + e.message);
      }
    }

    // Append row to sheet
    const fullAmt = Number(fullAmount);
    const paidAmt = Number(amount);
    const dueAmt = fullAmt - paidAmt;

    sheet.appendRow([
      timestamp,
      invoiceId,
      name,
      isMember ? '' : (address || ''),
      phone,
      courseName,
      fullAmt,
      'Full',
      paidAmt,
      dueAmt,
      isMember ? 'DU Student' : (isDuStudent ? 'DU Student' : 'Non-DU'),
      academicSession || '',
      department || '',
      hallName || '',
      duRegistrationId || '',
      paymentMethod,
      transactionId,
      driveLink,
    ]);

    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      invoiceId: invoiceId,
      driveLink: driveLink,
      serialNumber: String(invoiceSerial).padStart(2, '0'),
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      error: error.message || 'Unknown error',
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ─── DO GET (simple health check) ──────────────────────
function doGet() {
  return ContentService.createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}
