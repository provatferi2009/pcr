function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const sheet = SpreadsheetApp.openById(data.sheetId).getSheetByName(
      data.isMember ? 'Member Recruitment' : 'Course Recruitment'
    );

    if (data.action === 'getId') {
      const rows = sheet.getDataRange().getValues();
      const currentYear = new Date().getFullYear();
      let serial = 1;
      for (let i = 1; i < rows.length; i++) {
        const val = String(rows[i][1] || '');
        if (data.isMember && val.startsWith('M')) {
          const n = parseInt(val.substring(1), 10);
          if (!isNaN(n) && n >= serial) serial = n + 1;
        } else if (!data.isMember && val.startsWith(String(currentYear))) {
          const n = parseInt(val.substring(String(currentYear).length), 10);
          if (!isNaN(n) && n >= serial) serial = n + 1;
        }
      }
      const invoiceId = data.isMember
        ? 'M' + String(serial).padStart(2, '0')
        : currentYear + String(serial).padStart(2, '0');
      return json({ invoiceId });
    }

    if (data.action === 'save') {
      const row = [
        new Date().toISOString(),
        data.invoiceId,
        data.name,
        data.isMember ? '' : (data.address || ''),
        data.phone,
        data.isMember ? 'N/A' : data.service,
        Number(data.fullAmount),
        'Full',
        Number(data.amount),
        Number(data.fullAmount) - Number(data.amount),
        data.isMember ? 'DU Student' : (data.isDuStudent ? 'DU Student' : 'Non-DU'),
        data.academicSession || '',
        data.department || '',
        data.hallName || '',
        data.duRegistrationId || '',
        data.paymentMethod,
        data.transactionId,
      ];

      if (sheet.getLastRow() === 0) {
        sheet.appendRow(['Timestamp', 'Invoice ID', 'Name', 'Address', 'Phone',
          'Course Name', 'Full Amount', 'Payment Type', 'Paid Amount',
          'Due Amount', 'DU Status', 'Academic Session', 'Department',
          'Hall Name', 'DU Registration ID', 'Payment Method', 'Transaction ID']);
      }

      sheet.appendRow(row);

      if (data.pdfBase64 && data.filename) {
        const folder = DriveApp.getFolderById(data.folderId);
        const decoded = Utilities.base64Decode(data.pdfBase64);
        folder.createFile(Utilities.newBlob(decoded, 'application/pdf', data.filename));
      }

      return json({ success: true });
    }

    return json({ error: 'Unknown action' });
  } catch (err) {
    return json({ error: err.toString() });
  }
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return json({ status: 'ok' });
}
