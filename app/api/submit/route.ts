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
    callAppsScript({
      action: 'save', isMember, invoiceId,
      name, address, phone, service, amount, isDuStudent,
      academicSession, department, hallName, duRegistrationId,
      paymentMethod, transactionId, fullAmount, formMode,
      sheetId: process.env.GOOGLE_SHEET_ID,
      folderId: process.env.GOOGLE_DRIVE_FOLDER_ID,
      pdfBase64: adminPdfBytes ? uint8ToBase64(adminPdfBytes) : null,
      filename: attachmentFilename,
    }).catch(() => {});

    const ua = request.headers.get('user-agent') || '';
    const isFbWebview = /FBAN|FBAV|FB_IAB|Messenger/i.test(ua);

    if (isFbWebview) {
      const pdfData = uint8ToBase64(clientPdfBytes);
      return new Response(
        `<!DOCTYPE html><html lang="bn"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>রসিদ ডাউনলোড</title><style>body{text-align:center;padding:40px 20px;font-family:sans-serif;background:#f1f5f9;color:#1e293b;margin:0} .card{background:#fff;border-radius:16px;padding:32px 20px;max-width:400px;margin:0 auto;box-shadow:0 4px 24px rgba(0,0,0,.08)} h2{font-size:22px;margin:0 0 12px} p{font-size:15px;color:#64748b;line-height:1.7;margin:0 0 8px} .btn{display:inline-block;padding:16px 32px;background:#059669;color:#fff;border-radius:12px;text-decoration:none;font-size:17px;font-weight:700;margin-top:20px;box-shadow:0 4px 16px rgba(5,150,105,.3)} .icon{font-size:48px;margin-bottom:16px} .note{font-size:13px;color:#94a3b8;margin-top:20px}</style></head><body><div class="card"><div class="icon">📄</div><h2>রসিদ ডাউনলোড</h2><p>আপনি ফেসবুক বা মেসেঞ্জার ব্রাউজার ব্যবহার করছেন।</p><p>সরাসরি ডাউনলোড করতে নিচের বাটনে ক্লিক করুন, অথবা উপরে ডানদিকে ⋮ মেনু থেকে <b>"Open in Browser"</b> সিলেক্ট করে আপনার ফোনের ব্রাউজারে খুলুন।</p><a class="btn" href="data:application/pdf;base64,${pdfData}" download="invoice-${invoiceId}.pdf">📥 রসিদ ডাউনলোড করুন</a><p class="note">ডাউনলোড না হলে ⋮ মেনু দিয়ে ব্রাউজারে খুলুন</p></div></body></html>`,
        { status: 200, headers: { 'Content-Type': 'text/html;charset=utf-8' } }
      );
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
