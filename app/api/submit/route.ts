import { NextRequest, NextResponse } from 'next/server';

function b64(s: string) { return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }

async function jwtToken(scope: string): Promise<string | null> {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_PRIVATE_KEY;
  if (!email || !rawKey) return null;

  const privateKey = rawKey.replace(/\\n/g, '\n');
  const now = Math.floor(Date.now() / 1000);
  const jwt = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' })) + '.' +
    b64(JSON.stringify({ iss: email, scope, aud: 'https://oauth2.googleapis.com/token', exp: now + 3600, iat: now }));

  const nodeCrypto = await import('crypto');
  const signer = nodeCrypto.createSign('sha256');
  signer.update(jwt);
  signer.end();
  const sig = b64(String.fromCharCode(...new Uint8Array(signer.sign(privateKey))));

  const ac = new AbortController();
  const to = setTimeout(() => ac.abort(), 5000);
  try {
    const resp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt + '.' + sig }),
      signal: ac.signal,
    });
    const data: any = await resp.json();
    return data.access_token || null;
  } finally {
    clearTimeout(to);
  }
}

async function getSheetInvoiceId(isMember: boolean): Promise<string> {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) return isMember ? 'M01' : `${new Date().getFullYear()}01`;

  const token = await jwtToken('https://www.googleapis.com/auth/spreadsheets');
  if (!token) return isMember ? 'M01' : `${new Date().getFullYear()}01`;

  const sheetName = isMember ? 'Member Recruitment' : 'Course Recruitment';
  const currentYear = new Date().getFullYear();

  const ac = new AbortController();
  const to = setTimeout(() => ac.abort(), 5000);
  try {
    const resp = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(sheetName + '!A:R')}`,
      { headers: { Authorization: `Bearer ${token}` }, signal: ac.signal }
    );
    const data: any = await resp.json();
    const rows: string[][] = data.values || [];

    let serial = 1;
    for (let i = 1; i < rows.length; i++) {
      const val = rows[i][1] || '';
      if (isMember && val.startsWith('M')) {
        const n = parseInt(val.substring(1), 10);
        if (!isNaN(n) && n >= serial) serial = n + 1;
      } else if (!isMember && val.startsWith(String(currentYear))) {
        const n = parseInt(val.substring(String(currentYear).length), 10);
        if (!isNaN(n) && n >= serial) serial = n + 1;
      }
    }

    return isMember
      ? `M${String(serial).padStart(2, '0')}`
      : `${currentYear}${String(serial).padStart(2, '0')}`;
  } catch {
    return isMember ? 'M01' : `${new Date().getFullYear()}01`;
  } finally {
    clearTimeout(to);
  }
}

async function appendToSheet(data: Record<string, any>, invoiceId: string) {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) return;

  const token = await jwtToken('https://www.googleapis.com/auth/spreadsheets');
  if (!token) return;

  const isMember = data.formMode === 'member';
  const sheetName = isMember ? 'Member Recruitment' : 'Course Recruitment';
  const fullAmt = Number(data.fullAmount);
  const paidAmt = Number(data.amount);
  const dueAmt = fullAmt - paidAmt;

  const row = [
    new Date().toISOString(),
    invoiceId,
    data.name,
    isMember ? '' : (data.address || ''),
    data.phone,
    isMember ? 'N/A' : data.service,
    fullAmt,
    'Full',
    paidAmt,
    dueAmt,
    isMember ? 'DU Student' : (data.isDuStudent ? 'DU Student' : 'Non-DU'),
    data.academicSession || '',
    data.department || '',
    data.hallName || '',
    data.duRegistrationId || '',
    data.paymentMethod,
    data.transactionId,
  ];

  const range = encodeURIComponent(`${sheetName}!A:R`);
  const ac = new AbortController();
  const to = setTimeout(() => ac.abort(), 5000);

  try {
    const existingResp = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}`,
      { headers: { Authorization: `Bearer ${token}` }, signal: ac.signal }
    );
    const existingData: any = await existingResp.json();
    if (!(existingData.values || []).length) {
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?valueInputOption=USER_ENTERED`,
        {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            values: [[
              'Timestamp', 'Invoice ID', 'Name', 'Address', 'Phone',
              'Course Name', 'Full Amount', 'Payment Type', 'Paid Amount',
              'Due Amount', 'DU Status', 'Academic Session', 'Department',
              'Hall Name', 'DU Registration ID', 'Payment Method', 'Transaction ID',
            ]],
          }),
          signal: ac.signal,
        }
      );
    }

    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: [row] }),
        signal: ac.signal,
      }
    );
  } catch (e: any) {
    console.error('appendToSheet failed:', e.message);
  } finally {
    clearTimeout(to);
  }
}

async function uploadToDrive(pdfBytes: Uint8Array, filename: string): Promise<boolean> {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!folderId) return false;

  const token = await jwtToken('https://www.googleapis.com/auth/drive.file');
  if (!token) return false;

  const ac = new AbortController();
  const to = setTimeout(() => ac.abort(), 10000);
  try {
    const createResp = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: filename, parents: [folderId] }),
      signal: ac.signal,
    });
    const createData: any = await createResp.json();
    if (!createResp.ok) {
      console.error('Drive metadata create failed:', createResp.status, JSON.stringify(createData));
      return false;
    }

    await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${createData.id}?uploadType=media`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/pdf' },
        body: pdfBytes,
        signal: ac.signal,
      }
    );
    return true;
  } catch (e: any) {
    console.error('Drive upload error:', e.message);
    return false;
  } finally {
    clearTimeout(to);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      name, address, phone, service, amount, isDuStudent,
      academicSession, department, hallName, duRegistrationId,
      paymentMethod, transactionId, paymentType, fullAmount, formMode,
    } = body;

    const isMember = formMode === 'member';
    const courseName = isMember ? 'N/A' : service;

    if (!name || !phone || !paymentMethod || !transactionId) {
      return NextResponse.json({ error: 'সবগুলো প্রয়োজনীয় ফিল্ড পূরণ করুন।' }, { status: 400 });
    }
    if (!isMember && !address) {
      return NextResponse.json({ error: 'ঠিকানা আবশ্যক।' }, { status: 400 });
    }
    if (!isMember && !service) {
      return NextResponse.json({ error: 'কোর্স সিলেক্ট করুন।' }, { status: 400 });
    }
    if (isMember && (!academicSession || !department || !hallName || !duRegistrationId)) {
      return NextResponse.json({ error: 'সবগুলো প্রয়োজনীয় ফিল্ড পূরণ করুন।' }, { status: 400 });
    }

    const timestamp = new Date().toISOString();
    const invoiceId = await getSheetInvoiceId(isMember);

    const { generateClientInvoice, generateAdminInvoice, generateMemberInvoice } = await import('../../utils/invoiceGenerator');
    const logoBytes = (await import('../../utils/logo')).default();

    const baseInvoiceData = {
      name,
      email: isMember ? '' : address,
      phone,
      service: courseName,
      amount: Number(amount),
      invoiceId,
      serialNumber: invoiceId,
      timestamp,
      isDuStudent: isMember ? true : Boolean(isDuStudent),
      academicSession: academicSession || '',
      department: department || '',
      hallName: hallName || '',
      duRegistrationId: duRegistrationId || '',
      paymentMethod,
      transactionId,
      paymentType: 'full',
      fullAmount: Number(fullAmount),
    };

    let clientPdfBytes: Uint8Array;
    let adminPdfBytes: Uint8Array | null = null;
    let attachmentFilename: string;

    if (isMember) {
      clientPdfBytes = await generateMemberInvoice(baseInvoiceData, logoBytes);
      adminPdfBytes = await generateAdminInvoice(baseInvoiceData, logoBytes);
      attachmentFilename = `member-${invoiceId}-admin.pdf`;
    } else {
      clientPdfBytes = await generateClientInvoice(baseInvoiceData, logoBytes);
      adminPdfBytes = await generateAdminInvoice(baseInvoiceData, logoBytes);
      attachmentFilename = `invoice-${invoiceId}-admin.pdf`;
    }

    // Fire background tasks — never block the response
    appendToSheet(body, invoiceId).catch(() => {});
    if (adminPdfBytes) uploadToDrive(adminPdfBytes, attachmentFilename).catch(() => {});

    return new Response(clientPdfBytes as any, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="invoice-${invoiceId}.pdf"`,
      },
    });
  } catch (error: any) {
    console.error('Submit error:', error);
    return NextResponse.json(
      { error: error.message || 'সার্ভার প্রক্রিয়াকরণে সমস্যা হয়েছে।' },
      { status: 500 }
    );
  }
}
