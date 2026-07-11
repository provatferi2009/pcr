import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

export interface InvoiceData {
  name: string;
  email: string;
  phone: string;
  service: string;
  amount: number;
  invoiceId: string;
  serialNumber: string;
  timestamp: string;
  isDuStudent: boolean;
  academicSession?: string;
  department?: string;
  hallName?: string;
  duRegistrationId?: string;
  paymentMethod: string;
  transactionId: string;
  paymentType: string;
  fullAmount: number;
}

const C = {
  primary: rgb(0.61, 0.25, 0.13),
  primaryDark: rgb(0.43, 0.16, 0.07),
  secondary: rgb(0.94, 0.66, 0.14),
  text: rgb(0.12, 0.12, 0.12),
  textMuted: rgb(0.55, 0.55, 0.55),
  textLight: rgb(0.78, 0.78, 0.78),
  white: rgb(1, 1, 1),
  bgLight: rgb(0.97, 0.97, 0.97),
  border: rgb(0.9, 0.9, 0.9),
  accent: rgb(0.88, 0.38, 0.13),
};

const PW = 595;
const PH = 842;
const M = 40;
const CW = PW - M * 2;

function fd(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function esc(t: string): string {
  return t.replace(/[^\x00-\xFF]/g, '').trim() || '-';
}

function rx(font: any, text: string, size: number): number {
  return PW - M - font.widthOfTextAtSize(text, size);
}

async function header(pdfDoc: PDFDocument, page: any, font: any, bold: any, title: string, invId: string, ts: string, logo?: Uint8Array) {
  let y = PH - M;

  if (logo) {
    try {
      const img = await pdfDoc.embedPng(logo);
      const mh = 50;
      const r = img.width / img.height;
      page.drawImage(img, { x: M, y: y - mh, width: mh * r, height: mh });
      page.drawText('Sangsritik Sangsad', { x: M + mh * r + 16, y: y - 16, size: 16, font: bold, color: C.primaryDark });
      page.drawText('University of Dhaka', { x: M + mh * r + 16, y: y - 34, size: 10, font, color: C.textMuted });
    } catch {
      page.drawText('Sangsritik Sangsad', { x: M, y: y - 18, size: 18, font: bold, color: C.primaryDark });
      page.drawText('University of Dhaka', { x: M, y: y - 36, size: 11, font, color: C.textMuted });
    }
  } else {
    page.drawText('Sangsritik Sangsad', { x: M, y: y - 18, size: 18, font: bold, color: C.primaryDark });
    page.drawText('University of Dhaka', { x: M, y: y - 36, size: 11, font, color: C.textMuted });
  }

  page.drawText(title, { x: rx(bold, title, 20), y: y - 16, size: 20, font: bold, color: C.primary });
  page.drawText(`Invoice #${esc(invId)}`, { x: rx(font, `Invoice #${esc(invId)}`, 9), y: y - 38, size: 9, font, color: C.textMuted });

  y -= 62;
  page.drawLine({ start: { x: M, y }, end: { x: PW - M, y }, thickness: 2, color: C.secondary });

  y -= 18;
  page.drawText(fd(ts), { x: rx(font, fd(ts), 9), y, size: 9, font, color: C.textMuted });

  y -= 24;
  return y;
}

function section(page: any, bold: any, label: string, y: number): number {
  page.drawRectangle({ x: M, y: y - 14, width: 4, height: 18, color: C.accent });
  page.drawText(label, { x: M + 14, y: y - 2, size: 11, font: bold, color: C.primaryDark });
  y -= 24;
  return y;
}

function row(page: any, font: any, bold: any, pairs: [string, string][], y: number): number {
  const rh = 28;
  const cw = CW / 2;

  for (let i = 0; i < pairs.length; i++) {
    if (i % 2 === 0) {
      page.drawRectangle({ x: M, y: y - rh, width: CW, height: rh, color: i % 4 === 0 ? C.bgLight : C.white });
    }
    const colIdx = i % 2;
    const lx = M + colIdx * cw + 12;
    const label = pairs[i][0];
    const val = pairs[i][1];

    page.drawText(label, { x: lx, y: y + 2, size: 7, font: bold, color: C.textMuted });
    page.drawText(val, { x: lx, y: y - 14, size: 10, font, color: C.text });
    if (i % 2 === 1 || i === pairs.length - 1) {
      y -= rh + 2;
    }
  }

  return y - 8;
}

function totalBox(page: any, font: any, bold: any, label: string, amount: number, note: string, y: number): number {
  y -= 10;
  const bh = 56;
  page.drawRectangle({ x: M, y: y - bh, width: CW, height: bh, color: C.primaryDark });
  page.drawRectangle({ x: M, y: y - bh, width: 6, height: bh, color: C.secondary });
  page.drawText(label, { x: M + 20, y: y - 16, size: 9, font: bold, color: C.secondary });
  page.drawText(`${amount} BDT`, { x: M + 20, y: y - 42, size: 24, font: bold, color: C.white });
  if (note) {
    page.drawText(note, { x: rx(font, note, 9), y: y - 16, size: 9, font, color: C.textLight });
  }
  y -= bh + 18;
  return y;
}

function footer(page: any, font: any, text: string, y: number) {
  page.drawLine({ start: { x: M, y }, end: { x: PW - M, y }, thickness: 0.5, color: C.border });
  y -= 16;
  page.drawText(text, { x: M, y, size: 8, font, color: C.textLight });
  page.drawText('Sangsritik Sangsad, University of Dhaka', { x: rx(font, 'Sangsritik Sangsad, University of Dhaka', 8), y, size: 8, font, color: C.textLight });
  return y;
}

export async function generateClientInvoice(data: InvoiceData, logoBytes?: Uint8Array): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([PW, PH]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let y = await header(pdfDoc, page, font, bold, 'INVOICE', data.invoiceId, data.timestamp, logoBytes);

  y = section(page, bold, 'APPLICANT INFORMATION', y);

  const fields: [string, string][] = [
    ['Name', esc(data.name)],
    ['Phone', data.phone],
  ];
  if (data.email) fields.push(['Email', esc(data.email)]);
  fields.push(['Course', esc(data.service)]);

  if (data.isDuStudent) {
    if (data.department) fields.push(['Department', esc(data.department)]);
    if (data.academicSession) fields.push(['Session', esc(data.academicSession)]);
    if (data.hallName) fields.push(['Hall', esc(data.hallName)]);
    if (data.duRegistrationId) fields.push(['Reg ID', esc(data.duRegistrationId)]);
  }

  y = row(page, font, bold, fields, y);

  y = section(page, bold, 'PAYMENT DETAILS', y);

  const due = data.fullAmount - data.amount;
  const note = data.paymentType === 'partial' ? `Due: ${due} BDT` : (due > 0 ? `Due: ${due} BDT` : '');

  const pay: [string, string][] = [
    ['Payment Method', data.paymentMethod.toUpperCase()],
    ['Transaction ID', esc(data.transactionId)],
  ];
  if (data.paymentType === 'partial') {
    pay.unshift(['Total Fee', `${data.fullAmount} BDT`]);
    pay.splice(2, 0, ['Paid Amount', `${data.amount} BDT`]);
    pay.splice(3, 0, ['Due Amount', `${due} BDT`]);
  }
  y = row(page, font, bold, pay, y);

  y = totalBox(page, font, bold, 'TOTAL AMOUNT', data.amount, note, y);
  footer(page, font, 'Thank you for your registration!', y);

  return pdfDoc.save();
}

export async function generateAdminInvoice(data: InvoiceData, logoBytes?: Uint8Array): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([PW, PH]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let y = await header(pdfDoc, page, font, bold, 'ADMIN INVOICE', data.invoiceId, data.timestamp, logoBytes);

  y = section(page, bold, 'APPLICANT INFORMATION', y);

  const fields: [string, string][] = [
    ['Name', esc(data.name)],
    ['Phone', data.phone],
  ];
  if (data.email) fields.push(['Email', esc(data.email)]);
  fields.push(['Course', esc(data.service)]);
  fields.push(['DU Status', data.isDuStudent ? 'DU Student' : 'Non-DU']);

  if (data.isDuStudent) {
    if (data.department) fields.push(['Department', esc(data.department)]);
    if (data.academicSession) fields.push(['Session', esc(data.academicSession)]);
    if (data.hallName) fields.push(['Hall', esc(data.hallName)]);
    if (data.duRegistrationId) fields.push(['Reg ID', esc(data.duRegistrationId)]);
  }

  y = row(page, font, bold, fields, y);

  y = section(page, bold, 'PAYMENT DETAILS', y);

  const due = data.fullAmount - data.amount;
  const pay: [string, string][] = [
    ['Total Fee', `${data.fullAmount} BDT`],
    ['Paid Amount', `${data.amount} BDT`],
    ['Due Amount', `${due} BDT`],
    ['Payment Type', data.paymentType === 'partial' ? 'Partial' : 'Full'],
    ['Payment Method', data.paymentMethod.toUpperCase()],
    ['Transaction ID', esc(data.transactionId)],
  ];
  y = row(page, font, bold, pay, y);

  const extra = due > 0 ? `Due: ${due} BDT` : '';
  y = totalBox(page, font, bold, 'TOTAL PAID', data.amount, extra, y);
  footer(page, font, 'ADMIN COPY', y);

  return pdfDoc.save();
}

export async function generateMemberInvoice(data: InvoiceData, logoBytes?: Uint8Array): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([PW, PH]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let y = await header(pdfDoc, page, font, bold, 'MEMBERSHIP', data.invoiceId, data.timestamp, logoBytes);

  y = section(page, bold, 'MEMBER INFORMATION', y);

  const fields: [string, string][] = [
    ['Name', esc(data.name)],
    ['Phone', data.phone],
    ['Type', 'Club Membership'],
  ];
  if (data.department) fields.push(['Department', esc(data.department)]);
  if (data.academicSession) fields.push(['Session', esc(data.academicSession)]);
  if (data.hallName) fields.push(['Hall', esc(data.hallName)]);
  if (data.duRegistrationId) fields.push(['Reg ID', esc(data.duRegistrationId)]);

  y = row(page, font, bold, fields, y);

  y = section(page, bold, 'PAYMENT DETAILS', y);

  const pay: [string, string][] = [
    ['Membership Fee', '100 BDT'],
    ['Paid Amount', `${data.amount} BDT`],
    ['Payment Method', data.paymentMethod.toUpperCase()],
    ['Transaction ID', esc(data.transactionId)],
  ];
  y = row(page, font, bold, pay, y);

  y = totalBox(page, font, bold, 'TOTAL PAID', data.amount, '', y);
  footer(page, font, 'Welcome to the club! Thank you for your membership.', y);

  return pdfDoc.save();
}
