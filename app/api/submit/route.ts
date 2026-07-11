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

  const sheetName = isMember ? 'member recruitment' : 'course recruitment';
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
  const sheetName = isMember ? 'member recruitment' : 'course recruitment';
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
  } catch {
    // silent fail
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

    (async () => {
      const gmailUser = process.env.GMAIL_USER;
      const gmailAppPassword = process.env.GMAIL_APP_PASSWORD;
      const adminEmail = process.env.ADMIN_EMAIL;
      if (!gmailUser || !gmailAppPassword || !adminEmail || !adminPdfBytes) return;

      try {
        const nodemailer = await import('nodemailer');
        const transporter = nodemailer.default.createTransport({
          service: 'gmail',
          auth: { user: gmailUser, pass: gmailAppPassword },
        });

        const title = isMember ? 'New Club Membership' : 'New Course Registration';
        const rows = isMember ? `
          <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Invoice ID</td><td style="padding:8px;border:1px solid #ddd">${invoiceId}</td></tr>
          <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Name</td><td style="padding:8px;border:1px solid #ddd">${name}</td></tr>
          <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Phone</td><td style="padding:8px;border:1px solid #ddd">${phone}</td></tr>
          <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Amount</td><td style="padding:8px;border:1px solid #ddd">${amount} BDT</td></tr>
          <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Payment</td><td style="padding:8px;border:1px solid #ddd">${paymentMethod.toUpperCase()}</td></tr>
          <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Transaction ID</td><td style="padding:8px;border:1px solid #ddd">${transactionId}</td></tr>
        ` : `
          <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Invoice ID</td><td style="padding:8px;border:1px solid #ddd">${invoiceId}</td></tr>
          <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Name</td><td style="padding:8px;border:1px solid #ddd">${name}</td></tr>
          <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Phone</td><td style="padding:8px;border:1px solid #ddd">${phone}</td></tr>
          <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Address</td><td style="padding:8px;border:1px solid #ddd">${address}</td></tr>
          <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Course</td><td style="padding:8px;border:1px solid #ddd">${courseName}</td></tr>
          <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">DU Student</td><td style="padding:8px;border:1px solid #ddd">${isDuStudent ? 'Yes' : 'No'}</td></tr>
          ${Boolean(isDuStudent) ? `
            <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Session</td><td style="padding:8px;border:1px solid #ddd">${academicSession}</td></tr>
            <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Department</td><td style="padding:8px;border:1px solid #ddd">${department}</td></tr>
            <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Hall</td><td style="padding:8px;border:1px solid #ddd">${hallName}</td></tr>
            <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Reg ID</td><td style="padding:8px;border:1px solid #ddd">${duRegistrationId}</td></tr>
          ` : ''}
          <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Amount</td><td style="padding:8px;border:1px solid #ddd">${amount} BDT</td></tr>
          <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Payment</td><td style="padding:8px;border:1px solid #ddd">${paymentMethod.toUpperCase()}</td></tr>
          <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Transaction ID</td><td style="padding:8px;border:1px solid #ddd">${transactionId}</td></tr>
        `;

        await transporter.sendMail({
          from: `"Provatferi Portal" <${gmailUser}>`,
          to: adminEmail,
          subject: isMember ? `Member Recruitment Form (${invoiceId})` : `PCR2026 (${courseName}) - ${invoiceId}`,
          html: `<h2 style="color:#9c4121">${title}</h2>
            <table style="border-collapse:collapse;width:100%;font-family:sans-serif;">${rows}</table>
            <p style="margin-top:16px">Admin invoice PDF is attached.</p>`,
          attachments: [{
            filename: attachmentFilename,
            content: Buffer.from(adminPdfBytes),
            contentType: 'application/pdf',
          }],
        });
      } catch (e: any) {
        console.error('Email send failed:', e.message);
      }
    })();

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
