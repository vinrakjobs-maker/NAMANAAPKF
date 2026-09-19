import { jsPDF } from 'jspdf';
import { CLINIC_CONFIG } from '../constants';
import { downloadPdfDoc } from './pdfDownloadHelper';

export interface MonthlySessionRecord {
  id: string;
  patientId: string;
  serial: number;
  regNo: string;
  patientName: string;
  date: string;
  type: string;
  diagnosis: string;
  fee: number;
  visitType: string;
  paymentMethod: string;
}

export interface MonthlyReportExportData {
  selectedMonth: string;
  monthLabel: string;
  totalVisits: number;
  newPatients: number;
  uniquePatients: number;
  totalFees: number;
  sessions: MonthlySessionRecord[];
}

export function generatePdfMonthlyReport(data: MonthlyReportExportData): void {
  const { selectedMonth, monthLabel, totalVisits, newPatients, uniquePatients, totalFees, sessions } = data;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;

  let y = margin + 5;

  // Header - Clinic Name
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(2, 132, 199); // Sky blue
  doc.text(CLINIC_CONFIG.clinicName, pageWidth / 2, y, { align: 'center' });

  y += 5;
  // Tagline
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(9);
  doc.setTextColor(220, 38, 38);
  doc.text("Remove pain, ", pageWidth / 2 - 12, y, { align: 'right' });
  doc.setTextColor(22, 163, 74);
  doc.text("Move Again", pageWidth / 2 - 10, y, { align: 'left' });

  y += 4.5;
  // Address - dynamically wrapped so long addresses never overwrite text
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(51, 65, 85);
  const addressLines = doc.splitTextToSize(CLINIC_CONFIG.address.full, contentWidth);
  doc.text(addressLines, pageWidth / 2, y, { align: 'center' });
  y += addressLines.length * 3.3 + 1.2;

  // Practitioner & Contact
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  const contactText = `Consultant: ${CLINIC_CONFIG.consultantName || 'R. Chandrashekar'}, ${CLINIC_CONFIG.consultantEducation || 'BPT, MIAP'} • ${CLINIC_CONFIG.consultantTitle} • Mob: ${CLINIC_CONFIG.phone} • Email: ${CLINIC_CONFIG.email}`;
  const contactLines = doc.splitTextToSize(contactText, contentWidth);
  doc.text(contactLines, pageWidth / 2, y, { align: 'center' });
  y += contactLines.length * 3.2 + 2;

  // Divider
  doc.setDrawColor(2, 132, 199);
  doc.setLineWidth(0.6);
  doc.line(margin, y, pageWidth - margin, y);

  y += 4;
  // Report Title Banner
  doc.setFillColor(240, 249, 255); // sky-50
  doc.roundedRect(margin, y, contentWidth, 13, 1.5, 1.5, 'F');
  doc.setDrawColor(186, 230, 253);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, y, contentWidth, 13, 1.5, 1.5, 'D');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(3, 105, 161);
  doc.text('MONTHLY CLINICAL PERFORMANCE & REVENUE LEDGER', pageWidth / 2, y + 5, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text(`Month of ${monthLabel} (${selectedMonth}) • Total Registered & Follow-up Sessions`, pageWidth / 2, y + 9.5, { align: 'center' });

  y += 18;

  // 4 Metric Summary Boxes
  const boxWidth = (contentWidth - 6) / 4;
  const boxHeight = 16;

  const metrics = [
    { label: 'Total Sessions Logged', val: `${totalVisits}`, color: [15, 23, 42] },
    { label: 'New Patient Charts', val: `${newPatients}`, color: [22, 163, 74] },
    { label: 'Unique Patients', val: `${uniquePatients}`, color: [3, 105, 161] },
    { label: 'Total Fees Collected', val: `₹${totalFees.toLocaleString()}`, color: [15, 23, 42] },
  ];

  metrics.forEach((m, idx) => {
    const bx = margin + idx * (boxWidth + 2);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.roundedRect(bx, y, boxWidth, boxHeight, 1, 1, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(m.label, bx + boxWidth / 2, y + 4.5, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(m.color[0], m.color[1], m.color[2]);
    doc.text(m.val, bx + boxWidth / 2, y + 11.5, { align: 'center' });
  });

  y += boxHeight + 7;

  // Sessions Table Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text(`CLINICAL SESSIONS DETAIL (${sessions.length} Records)`, margin, y);

  y += 4;

  const headers = [
    { label: 'Date', width: 22 },
    { label: 'Reg No', width: 25 },
    { label: 'Patient Name', width: 38 },
    { label: 'Session Type', width: 28 },
    { label: 'Diagnosis / Notes', width: 42 },
    { label: 'Mode', width: 14 },
    { label: 'Fee (₹)', width: 13 },
  ];

  const renderTableHeader = (currY: number) => {
    doc.setFillColor(2, 132, 199);
    doc.rect(margin, currY, contentWidth, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);

    let x = margin + 2;
    headers.forEach((h) => {
      doc.text(h.label, x, currY + 4.5);
      x += h.width;
    });
  };

  renderTableHeader(y);
  y += 7;

  // Table Rows
  sessions.forEach((s, idx) => {
    if (y > pageHeight - 20) {
      doc.addPage();
      y = margin + 5;
      renderTableHeader(y);
      y += 7;
    }

    doc.setFillColor(idx % 2 === 0 ? 255 : 248, idx % 2 === 0 ? 255 : 250, idx % 2 === 0 ? 255 : 252);
    doc.rect(margin, y, contentWidth, 6.5, 'F');
    doc.setDrawColor(241, 245, 249);
    doc.line(margin, y + 6.5, pageWidth - margin, y + 6.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(51, 65, 85);

    let x = margin + 2;

    // Date
    doc.text(s.date || '—', x, y + 4.2);
    x += headers[0].width;

    // Reg No
    doc.setFont('helvetica', 'bold');
    doc.text(s.regNo || '—', x, y + 4.2);
    doc.setFont('helvetica', 'normal');
    x += headers[1].width;

    // Patient Name
    doc.text(doc.splitTextToSize(s.patientName, headers[2].width - 3)[0] || '—', x, y + 4.2);
    x += headers[2].width;

    // Session Type
    doc.text(s.type === 'Follow-up Session' ? 'Follow-up' : 'Initial', x, y + 4.2);
    x += headers[3].width;

    // Diagnosis / Notes
    doc.text(doc.splitTextToSize(s.diagnosis, headers[4].width - 3)[0] || '—', x, y + 4.2);
    x += headers[4].width;

    // Mode
    doc.text(s.visitType || 'Clinic', x, y + 4.2);
    x += headers[5].width;

    // Fee
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(s.fee > 0 ? `₹${s.fee}` : 'Free', x, y + 4.2);

    y += 6.5;
  });

  // Total Row
  if (y > pageHeight - 20) {
    doc.addPage();
    y = margin + 5;
  }
  doc.setFillColor(240, 249, 255);
  doc.rect(margin, y, contentWidth, 7, 'F');
  doc.setDrawColor(2, 132, 199);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageWidth - margin, y);
  doc.line(margin, y + 7, pageWidth - margin, y + 7);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(3, 105, 161);
  doc.text(`TOTAL FOR ${monthLabel.toUpperCase()} (${sessions.length} SESSIONS)`, margin + 3, y + 4.8);
  doc.text(`₹${totalFees.toLocaleString()}`, margin + contentWidth - 18, y + 4.8);

  // Footer on all pages
  const totalPages = doc.internal.pages.length - 1;
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `${CLINIC_CONFIG.clinicName} • Monthly Performance & Revenue Audit • Page ${i} of ${totalPages}`,
      pageWidth / 2,
      pageHeight - 8,
      { align: 'center' }
    );
  }

  downloadPdfDoc(doc, `Namana_Physio_Monthly_${selectedMonth}.pdf`);
}
