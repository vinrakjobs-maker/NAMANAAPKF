import { jsPDF } from 'jspdf';
import { CLINIC_CONFIG } from '../constants';
import { drawClinicLogoToPdf } from './clinicLogoPdf';
import { loadClinicSettings } from './storage';
import { downloadPdfDoc } from './pdfDownloadHelper';

export interface MonthTaxRecord {
  monthName: string;
  monthKey: string;
  initialFees: number;
  followUpFees: number;
  grossReceipts: number;
  patientVisits: number;
}

export interface TaxReportData {
  selectedFY: number;
  fyMonths: MonthTaxRecord[];
  totalGross: number;
  deemedIncome44ADA: number;
  totalVisits: number;
  uniquePatientsCount: number;
}

/**
 * Formats a number to standard Indian Rupee notation (e.g. 1,25,000)
 */
function formatInr(val: number): string {
  if (!val || isNaN(val)) return '0';
  return val.toLocaleString('en-IN');
}

/**
 * Generates an executive, beautifully formatted A4 PDF Statement
 * for Annual Professional Receipts & Income Tax (Section 44ADA) Filing.
 */
export function generatePdfTaxReport(data: TaxReportData): void {
  const { selectedFY, fyMonths, totalGross, totalVisits, uniquePatientsCount } = data;
  const settings = loadClinicSettings();

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 210mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 297mm
  const margin = 14;
  const contentWidth = pageWidth - margin * 2; // 182mm

  // Background aesthetic border
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.setLineWidth(0.4);
  doc.roundedRect(margin - 4, margin - 4, contentWidth + 8, pageHeight - (margin * 2 - 8), 3, 3, 'D');

  // Top header background
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margin, margin, contentWidth, 24, 2, 2, 'F');
  doc.setDrawColor(224, 242, 254);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, margin, contentWidth, 26, 2, 2, 'D');

  // Draw official clinic logo on left
  drawClinicLogoToPdf(doc, margin + 4, margin + 4, 18);

  // Clinic Header Text (centered across the header text block)
  const headerTextCenterX = margin + 17 + (contentWidth - 17) / 2;

  // Clinic Name
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(3, 105, 161); // Sky blue #0369a1
  doc.text(CLINIC_CONFIG.clinicName.toUpperCase(), headerTextCenterX, margin + 5.5, { align: 'center' });

  // Clinic Address
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(51, 65, 85);
  const addressLines = doc.splitTextToSize(CLINIC_CONFIG.address.full, contentWidth - 26);
  doc.text(addressLines, headerTextCenterX, margin + 9.5, { align: 'center' });

  // Practitioner, Phone & GSTIN
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(71, 85, 105);
  let contactLine = `Consultant: ${CLINIC_CONFIG.consultantName || 'R. Chandrashekar'}, ${CLINIC_CONFIG.consultantEducation || 'BPT, MIAP'} • ${CLINIC_CONFIG.consultantTitle}   •   Mob: ${CLINIC_CONFIG.phone}`;
  if (settings.gstNumber) {
    contactLine += `   •   GSTIN: ${settings.gstNumber}`;
  }
  const contactY = margin + 9.5 + addressLines.length * 3 + 1.2;
  doc.text(contactLine, headerTextCenterX, contactY, { align: 'center' });

  // Services Tagline
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(6.8);
  doc.setTextColor(2, 132, 199);
  doc.text(CLINIC_CONFIG.services, headerTextCenterX, contactY + 3.8, { align: 'center' });

  let y = margin + 28.5;

  // Report Title Banner
  doc.setFillColor(240, 249, 255); // sky-50
  doc.roundedRect(margin, y, contentWidth, 12, 1.5, 1.5, 'F');
  doc.setDrawColor(186, 230, 253);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, y, contentWidth, 12, 1.5, 1.5, 'D');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(3, 105, 161);
  doc.text('ANNUAL PROFESSIONAL RECEIPTS & INCOME TAX STATEMENT', pageWidth / 2, y + 5, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `Financial Year: ${selectedFY} - ${selectedFY + 1}    |    Assessment Year: ${selectedFY + 1} - ${selectedFY + 2}    |    Physiotherapy Practice`,
    pageWidth / 2,
    y + 9.5,
    { align: 'center' }
  );

  y += 16;

  // 4 Metric Summary Boxes
  const boxGap = 2.5;
  const boxWidth = (contentWidth - boxGap * 3) / 4;
  const boxHeight = 15;
  const avgMonthly = Math.round(totalGross / 12);

  const metrics = [
    { label: 'Gross Professional Receipts', val: `Rs. ${formatInr(totalGross)}`, color: [15, 23, 42] },
    { label: 'Monthly Average Receipts', val: `Rs. ${formatInr(avgMonthly)}`, color: [2, 132, 199] },
    { label: 'Unique Patients Treated', val: `${uniquePatientsCount}`, color: [3, 105, 161] },
    { label: 'Total Clinical Sessions', val: `${totalVisits}`, color: [15, 23, 42] },
  ];

  metrics.forEach((m, idx) => {
    const bx = margin + idx * (boxWidth + boxGap);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(bx, y, boxWidth, boxHeight, 1.5, 1.5, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.25);
    doc.roundedRect(bx, y, boxWidth, boxHeight, 1.5, 1.5, 'D');

    // Subtle top indicator strip
    doc.setFillColor(idx === 0 ? 3 : idx === 1 ? 2 : idx === 2 ? 14 : 100, idx === 0 ? 105 : idx === 1 ? 132 : idx === 2 ? 165 : 116, idx === 0 ? 161 : idx === 1 ? 199 : idx === 2 ? 233 : 139);
    doc.rect(bx, y, boxWidth, 1.2, 'F');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(m.label, bx + boxWidth / 2, y + 5.5, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(m.color[0], m.color[1], m.color[2]);
    doc.text(m.val, bx + boxWidth / 2, y + 11.2, { align: 'center' });
  });

  y += boxHeight + 6;

  // Table Section Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text('MONTHLY BREAKDOWN OF CLINICAL REHABILITATION COLLECTIONS', margin, y);

  y += 3.5;

  // Monthly Table Column Definitions
  // Total contentWidth = 182mm
  const colWidths = [38, 38, 38, 24, 44]; 
  const headers = [
    'Financial Month',
    'Initial Consultations (Rs.)',
    'Follow-up Sessions (Rs.)',
    'Sessions Count',
    'Gross Receipts (Rs.)'
  ];

  // Header row
  doc.setFillColor(3, 105, 161); // sky-700
  doc.rect(margin, y, contentWidth, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(255, 255, 255);

  let curX = margin;
  headers.forEach((h, i) => {
    const align = i === 0 ? 'left' : i === 3 ? 'center' : 'right';
    const tx = align === 'left' ? curX + 3 : align === 'center' ? curX + colWidths[i] / 2 : curX + colWidths[i] - 3;
    doc.text(h, tx, y + 4.8, { align });
    curX += colWidths[i];
  });

  y += 7;

  // Data rows
  doc.setFontSize(7);

  fyMonths.forEach((m, idx) => {
    const isEven = idx % 2 === 0;
    if (isEven) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, y, contentWidth, 5.8, 'F');
    }

    // Outer and inner row dividers
    doc.setDrawColor(241, 245, 249);
    doc.setLineWidth(0.15);
    doc.line(margin, y + 5.8, pageWidth - margin, y + 5.8);

    curX = margin;
    
    // Month Name (Left)
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(m.monthName, curX + 3, y + 4.1);
    curX += colWidths[0];

    // Initial Fees (Right)
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(m.initialFees > 0 ? `Rs. ${formatInr(m.initialFees)}` : '—', curX + colWidths[1] - 3, y + 4.1, { align: 'right' });
    curX += colWidths[1];

    // Follow-up Fees (Right)
    doc.text(m.followUpFees > 0 ? `Rs. ${formatInr(m.followUpFees)}` : '—', curX + colWidths[2] - 3, y + 4.1, { align: 'right' });
    curX += colWidths[2];

    // Patient Visits (Center)
    doc.text(String(m.patientVisits), curX + colWidths[3] / 2, y + 4.1, { align: 'center' });
    curX += colWidths[3];

    // Gross Receipts (Right)
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(m.grossReceipts > 0 ? `Rs. ${formatInr(m.grossReceipts)}` : 'Rs. 0', curX + colWidths[4] - 3, y + 4.1, { align: 'right' });

    y += 5.8;
  });

  // Total Summary Row
  const totalInit = fyMonths.reduce((a, b) => a + b.initialFees, 0);
  const totalFollow = fyMonths.reduce((a, b) => a + b.followUpFees, 0);

  doc.setFillColor(224, 242, 254); // sky-100
  doc.rect(margin, y, contentWidth, 7.2, 'F');
  doc.setDrawColor(2, 132, 199);
  doc.setLineWidth(0.4);
  doc.line(margin, y, pageWidth - margin, y);
  doc.line(margin, y + 7.2, pageWidth - margin, y + 7.2);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(3, 105, 161);

  curX = margin;
  doc.text('TOTAL ANNUAL COLLECTIONS', curX + 3, y + 4.9);
  curX += colWidths[0];

  doc.text(`Rs. ${formatInr(totalInit)}`, curX + colWidths[1] - 3, y + 4.9, { align: 'right' });
  curX += colWidths[1];

  doc.text(`Rs. ${formatInr(totalFollow)}`, curX + colWidths[2] - 3, y + 4.9, { align: 'right' });
  curX += colWidths[2];

  doc.text(String(totalVisits), curX + colWidths[3] / 2, y + 4.9, { align: 'center' });
  curX += colWidths[3];

  doc.setTextColor(15, 23, 42);
  doc.text(`Rs. ${formatInr(totalGross)}`, curX + colWidths[4] - 3, y + 4.9, { align: 'right' });

  y += 12;

  // Annual Statement Notice Box
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margin, y, contentWidth, 14, 1.5, 1.5, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, y, contentWidth, 14, 1.5, 1.5, 'D');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(15, 23, 42);
  doc.text('STATUTORY PROFESSIONAL STATEMENT:', margin + 3.5, y + 4.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(71, 85, 105);
  const declaration =
    'This annual statement summarizes bona fide professional collections from outpatient consultation and physiotherapy rehabilitation sessions conducted at Namana Physiotherapy Clinic during the stated financial year. All receipts correspond to authentic treatment records maintained in the clinical registry.';
  doc.text(declaration, margin + 3.5, y + 8.5, { maxWidth: contentWidth - 7 });

  y += 20;

  // Verification & Signature Block
  const todayStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(51, 65, 85);
  doc.text(`Place: Mysuru, Karnataka`, margin + 2, y);
  doc.text(`Date of Statement: ${todayStr}`, margin + 2, y + 5);

  const sigWidth = 60;
  const sigX = pageWidth - margin - sigWidth;
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.4);
  doc.line(sigX, y + 3, pageWidth - margin - 2, y + 3);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text(CLINIC_CONFIG.consultantName || 'R. Chandrashekar', sigX + sigWidth / 2, y + 7, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(71, 85, 105);
  doc.text(`${CLINIC_CONFIG.consultantEducation || 'BPT, MIAP'}`, sigX + sigWidth / 2, y + 10.2, { align: 'center' });

  doc.setFontSize(6.8);
  doc.setTextColor(100, 116, 139);
  doc.text(`${CLINIC_CONFIG.consultantTitle}`, sigX + sigWidth / 2, y + 13.5, { align: 'center' });
  doc.text(`Namana Physiotherapy Clinic`, sigX + sigWidth / 2, y + 16.8, { align: 'center' });

  // Save the PDF
  downloadPdfDoc(doc, `Namana_Physio_Annual_Revenue_FY${selectedFY}-${selectedFY + 1}.pdf`);
}
