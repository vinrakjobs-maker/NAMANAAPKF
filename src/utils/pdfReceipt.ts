import { jsPDF } from 'jspdf';
import { CLINIC_CONFIG } from '../constants';
import { ReceiptData } from '../types';
import { drawClinicLogoToPdf } from './clinicLogoPdf';
import { loadClinicSettings, formatPatientId, parsePatientId } from './storage';
import { downloadPdfDoc } from './pdfDownloadHelper';

export function createPdfReceiptDoc(receipt: ReceiptData): jsPDF {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a5', // A5 is standard medical receipt slip size
  });

  const settings = loadClinicSettings();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 10;
  const contentWidth = pageWidth - margin * 2;

  // Outer decorative border
  doc.setDrawColor(2, 132, 199); // Sky blue #0284c7
  doc.setLineWidth(0.8);
  doc.rect(margin, margin, contentWidth, pageHeight - margin * 2);

  // Inner thin border
  doc.setDrawColor(186, 230, 253); // Light sky
  doc.setLineWidth(0.3);
  doc.rect(margin + 1.5, margin + 1.5, contentWidth - 3, pageHeight - margin * 2 - 3);

  // Official Clinic Logo Crest
  const logoSize = 16;
  const logoY = margin + 3;
  drawClinicLogoToPdf(doc, pageWidth / 2 - logoSize / 2, logoY, logoSize);

  // Header - Clinic Name (positioned cleanly below logo with proper clearance)
  let y = logoY + logoSize + 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13.5);
  doc.setTextColor(3, 105, 161); // #0369a1
  doc.text(CLINIC_CONFIG.clinicName, pageWidth / 2, y, { align: 'center' });

  y += 5;
  // Address - dynamically wrapped so long addresses never overwrite text
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(51, 65, 85);
  const addressLines = doc.splitTextToSize(CLINIC_CONFIG.address.full, contentWidth - 4);
  doc.text(addressLines, pageWidth / 2, y, { align: 'center' });
  y += addressLines.length * 3 + 1;

  // Services & Phone
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.setTextColor(100, 116, 139);
  const contactText = `${CLINIC_CONFIG.services} • Phone: ${CLINIC_CONFIG.phone} • Email: ${CLINIC_CONFIG.email}`;
  const contactLines = doc.splitTextToSize(contactText, contentWidth - 4);
  doc.text(contactLines, pageWidth / 2, y, { align: 'center' });
  y += contactLines.length * 2.8 + 1;

  // GST Number display if enabled
  const gstToDisplay = receipt.gstNumber || (settings.showGstOnReceipt && settings.gstNumber ? settings.gstNumber : '');
  if (gstToDisplay) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(2, 132, 199);
    doc.text(`GSTIN: ${gstToDisplay}`, pageWidth / 2, y, { align: 'center' });
    y += 3.5;
  }

  // Divider
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.4);
  doc.line(margin + 5, y, pageWidth - margin - 5, y);

  y += 5;
  // Receipt Banner
  doc.setFillColor(240, 249, 255); // sky-50
  doc.roundedRect(pageWidth / 2 - 35, y - 4, 70, 7, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(3, 105, 161);
  doc.text('CONSULTATION & THERAPY RECEIPT', pageWidth / 2, y + 1, { align: 'center' });

  y += 9;

  // Metadata Row: Receipt No and Date
  doc.setFontSize(8.5);
  doc.setTextColor(30, 41, 59);
  doc.setFont('helvetica', 'bold');
  doc.text('Receipt No: ', margin + 6, y);
  doc.setFont('helvetica', 'normal');
  doc.text(receipt.receiptNo || '—', margin + 25, y);

  doc.setFont('helvetica', 'bold');
  doc.text('Date: ', pageWidth - margin - 40, y);
  doc.setFont('helvetica', 'normal');
  doc.text(receipt.date || new Date().toISOString().slice(0, 10), pageWidth - margin - 30, y);

  y += 6;
  // Reg No and Visit Type
  const rawReg = (receipt.regNo || '').trim();
  const parsedReg = parsePatientId(rawReg);
  const patientRegNo = parsedReg
    ? formatPatientId(receipt.date, parsedReg.seq)
    : rawReg || (receipt.serial ? formatPatientId(receipt.date, Number(receipt.serial)) : '—');
  doc.setFont('helvetica', 'bold');
  doc.text('Patient ID: ', margin + 6, y);
  doc.setFont('helvetica', 'normal');
  doc.text(patientRegNo, margin + 26, y);

  doc.setFont('helvetica', 'bold');
  doc.text('Visit Mode: ', pageWidth - margin - 40, y);
  doc.setFont('helvetica', 'normal');
  doc.text(receipt.visitType || 'Clinic Visit', pageWidth - margin - 22, y);

  y += 7;
  // Patient Details Box
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(255, 255, 255);
  doc.rect(margin + 5, y, contentWidth - 10, 48);

  let boxY = y + 6;
  doc.setFont('helvetica', 'bold');
  doc.text('Patient Name:', margin + 8, boxY);
  doc.setFont('helvetica', 'normal');
  doc.text(receipt.name || '—', margin + 34, boxY);

  if (receipt.age) {
    doc.setFont('helvetica', 'bold');
    doc.text('Age:', pageWidth - margin - 35, boxY);
    doc.setFont('helvetica', 'normal');
    doc.text(`${receipt.age} Yrs`, pageWidth - margin - 25, boxY);
  }

  boxY += 7;
  doc.setFont('helvetica', 'bold');
  doc.text('Address:', margin + 8, boxY);
  doc.setFont('helvetica', 'normal');
  const cleanAddr = receipt.address ? receipt.address.slice(0, 60) : 'Mysuru, Karnataka';
  doc.text(cleanAddr, margin + 26, boxY);

  boxY += 7;
  doc.setFont('helvetica', 'bold');
  doc.text('Therapy for:', margin + 8, boxY);
  doc.setFont('helvetica', 'normal');
  doc.text(receipt.therapyFor || 'Physiotherapy & Rehabilitation', margin + 30, boxY);

  boxY += 7;
  doc.setFont('helvetica', 'bold');
  doc.text('Session Dates:', margin + 8, boxY);
  doc.setFont('helvetica', 'normal');
  doc.text(`From: ${receipt.sessionFrom || receipt.date || '—'}    To: ${receipt.sessionTo || receipt.date || '—'}`, margin + 34, boxY);

  boxY += 7;
  doc.setFont('helvetica', 'bold');
  doc.text('Payment Mode:', margin + 8, boxY);
  doc.setFont('helvetica', 'normal');
  doc.text(receipt.paymentMethod || 'Cash / Digital', margin + 36, boxY);

  boxY += 7;
  doc.setFont('helvetica', 'bold');
  doc.text('Amount Received:', margin + 8, boxY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(3, 105, 161);
  doc.text(`INR  ${receipt.amount}/-`, margin + 42, boxY);

  y = y + 54;

  // Signature Block
  doc.setTextColor(30, 41, 59);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text(CLINIC_CONFIG.consultantName || 'R. Chandrashekar', pageWidth - margin - 12, y + 6.5, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(71, 85, 105);
  doc.text(`${CLINIC_CONFIG.consultantEducation || 'BPT, MIAP'}`, pageWidth - margin - 12, y + 9.8, { align: 'right' });
  doc.setFontSize(6.8);
  doc.text(CLINIC_CONFIG.consultantTitle, pageWidth - margin - 12, y + 13, { align: 'right' });
  doc.setTextColor(148, 163, 184);
  doc.setFontSize(6.5);
  doc.text('Authorized Signature', pageWidth - margin - 12, y + 16.5, { align: 'right' });

  // Bottom Notice
  doc.setFontSize(6.5);
  doc.setTextColor(148, 163, 184);
  doc.text('This is an official computer-generated receipt issued by Namana Physiotherapy Clinic.', pageWidth / 2, pageHeight - margin - 3, { align: 'center' });

  return doc;
}

export function getPdfReceiptBlob(receipt: ReceiptData): Blob {
  const doc = createPdfReceiptDoc(receipt);
  return doc.output('blob');
}

export async function generatePdfReceipt(receipt: ReceiptData): Promise<boolean> {
  try {
    const doc = createPdfReceiptDoc(receipt);
    const safeName = (receipt.name || 'patient').replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
    const safeReceiptNo = (receipt.receiptNo || 'slip').replace(/[^a-zA-Z0-9_-]/g, '_');
    const fileName = `Receipt_${safeReceiptNo}_${safeName}.pdf`;

    return await downloadPdfDoc(doc, fileName);
  } catch (err) {
    console.error('Receipt PDF download failed:', err);
    return false;
  }
}
