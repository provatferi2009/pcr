import { NextRequest, NextResponse } from 'next/server';

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function callAppsScript(payload: any): Promise<any> {
  const url = process.env.APPS_SCRIPT_URL;
  if (!url) return null;
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });
    return await resp.json();
  } catch (e: any) {
    console.error('Apps Script call failed:', e.message);
    return null;
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

    // Step 1: Get invoice ID from Apps Script
    const idResult = await callAppsScript({
      action: 'getId', isMember,
      sheetId: process.env.GOOGLE_SHEET_ID,
    });
    const invoiceId = idResult?.invoiceId || (isMember ? 'M01' : `${new Date().getFullYear()}01`);

    const timestamp = new Date().toISOString();

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

    // Step 2: Send PDF + data to Apps Script for sheet append + Drive upload
    const saveResult = await callAppsScript({
      action: 'save', isMember, invoiceId,
      name, address, phone, service, amount, isDuStudent,
      academicSession, department, hallName, duRegistrationId,
      paymentMethod, transactionId, fullAmount, formMode,
      sheetId: process.env.GOOGLE_SHEET_ID,
      folderId: process.env.GOOGLE_DRIVE_FOLDER_ID,
      pdfBase64: adminPdfBytes ? uint8ToBase64(adminPdfBytes) : null,
      filename: attachmentFilename,
    });
    if (!saveResult?.success) {
      console.error('Save to sheet/Drive failed:', JSON.stringify(saveResult));
    }

    return new Response(clientPdfBytes as any, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="invoice-${invoiceId}.pdf"`,
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
