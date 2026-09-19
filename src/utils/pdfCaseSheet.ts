import { jsPDF } from 'jspdf';
import { CLINIC_CONFIG, MODALITIES_LIST } from '../constants';
import { Patient } from '../types';
import { drawClinicLogoToPdf } from './clinicLogoPdf';
import { loadClinicSettings, formatPatientId } from './storage';
import { downloadPdfDoc } from './pdfDownloadHelper';

export function createPdfCaseSheetDoc(patient: Patient): jsPDF {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const settings = loadClinicSettings();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;

  // Official Clinic Logo Crest
  const logoSize = 16;
  drawClinicLogoToPdf(doc, pageWidth / 2 - logoSize / 2, margin, logoSize);

  // Header - Clinic Name (positioned cleanly below logo with proper clearance)
  let y = margin + logoSize + 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(2, 132, 199); // Sky blue
  doc.text(CLINIC_CONFIG.clinicName, pageWidth / 2, y, { align: 'center' });

  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.setTextColor(51, 65, 85);
  // Dynamically wrap address lines so long clinic addresses never overwrite subsequent lines
  const addressLines = doc.splitTextToSize(CLINIC_CONFIG.address.full, pageWidth - margin * 2);
  doc.text(addressLines, pageWidth / 2, y, { align: 'center' });
  y += addressLines.length * 3.1 + 1;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  const contactText = `${CLINIC_CONFIG.services} • Consultant: ${CLINIC_CONFIG.consultantName || 'R. Chandrashekar'}, ${CLINIC_CONFIG.consultantEducation || 'BPT, MIAP'} • Mob: ${CLINIC_CONFIG.phone} • Email: ${CLINIC_CONFIG.email}`;
  const contactLines = doc.splitTextToSize(contactText, pageWidth - margin * 2);
  doc.text(contactLines, pageWidth / 2, y, { align: 'center' });
  y += contactLines.length * 2.8 + 1;

  // Optional GSTIN on Patient Data Case Sheet
  if (settings.showGstOnPatientData && settings.gstNumber) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(2, 132, 199);
    doc.text(`GSTIN: ${settings.gstNumber}`, pageWidth / 2, y, { align: 'center' });
    y += 3.5;
  }

  doc.setDrawColor(2, 132, 199);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);

  y += 4;
  doc.setFillColor(240, 249, 255);
  doc.roundedRect(margin, y, pageWidth - margin * 2, 7, 1.5, 1.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(3, 105, 161);
  doc.text('CONFIDENTIAL CLINICAL PHYSIOTHERAPY CASE SHEET', pageWidth / 2, y + 4.8, { align: 'center' });

  y += 11;
  doc.setFontSize(8.5);
  doc.setTextColor(30, 41, 59);

  // Present date of PDF download / generation
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const presentDate = `${yyyy}-${mm}-${dd}`;

  // Row 1: Reg No, Present Download Date, Visit Mode
  doc.setFont('helvetica', 'bold');
  doc.text('Reg No: ', margin, y);
  doc.setFont('helvetica', 'normal');
  doc.text(patient.regNo || formatPatientId(patient.date, patient.serial), margin + 15, y);

  doc.setFont('helvetica', 'bold');
  doc.text('Date: ', margin + 60, y);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(2, 132, 199); // Highlighted present download date
  doc.text(presentDate, margin + 72, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(30, 41, 59);

  if (patient.date && patient.date !== presentDate) {
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(`(Reg: ${patient.date})`, margin + 93, y);
    doc.setFontSize(8.5);
    doc.setTextColor(30, 41, 59);
  }

  doc.setFont('helvetica', 'bold');
  doc.text('Visit Mode: ', margin + 118, y);
  doc.setFont('helvetica', 'normal');
  doc.text(patient.visitType || 'Clinic', margin + 138, y);

  y += 6;
  // Row 2: Name & Age/Sex
  doc.setFont('helvetica', 'bold');
  doc.text('Patient Name: ', margin, y);
  doc.setFont('helvetica', 'normal');
  doc.text(patient.name || '—', margin + 25, y);

  doc.setFont('helvetica', 'bold');
  doc.text('Age / Sex: ', margin + 85, y);
  doc.setFont('helvetica', 'normal');
  doc.text(`${patient.age || '—'} Yrs / ${patient.sex || '—'}`, margin + 105, y);

  doc.setFont('helvetica', 'bold');
  doc.text('Blood Group: ', margin + 140, y);
  doc.setFont('helvetica', 'normal');
  doc.text(patient.bloodGroup || '—', margin + 162, y);

  y += 6;
  // Row 3: Height, Weight, Contact
  doc.setFont('helvetica', 'bold');
  doc.text('Ht / Wt: ', margin, y);
  doc.setFont('helvetica', 'normal');
  doc.text(`${patient.height || '—'} / ${patient.weight ? patient.weight + ' kg' : '—'}`, margin + 15, y);

  doc.setFont('helvetica', 'bold');
  doc.text('Contact: ', margin + 60, y);
  doc.setFont('helvetica', 'normal');
  doc.text(patient.contact || '—', margin + 75, y);

  doc.setFont('helvetica', 'bold');
  doc.text('Referred By: ', margin + 115, y);
  doc.setFont('helvetica', 'normal');
  doc.text((patient.referredBy || 'Self').slice(0, 35), margin + 137, y);

  y += 6;
  // Row 4: Address
  doc.setFont('helvetica', 'bold');
  doc.text('Address: ', margin, y);
  doc.setFont('helvetica', 'normal');
  doc.text((patient.address || 'Mysuru').slice(0, 80), margin + 16, y);

  y += 8;
  // Clinical Diagnosis
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margin, y - 3, pageWidth - margin * 2, 14, 1.5, 1.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(3, 105, 161);
  doc.text('CLINICAL DIAGNOSIS:', margin + 3, y + 1.5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text(patient.diagnosis || 'Clinical evaluation pending', margin + 45, y + 1.5);

  y += 6;
  // Co-morbidities
  const comorbList: string[] = [];
  if (patient.comorbid?.diabetes) comorbList.push('Diabetes Mellitus');
  if (patient.comorbid?.bp) comorbList.push('Hypertension (BP)');
  if (patient.comorbid?.thyroid) comorbList.push('Thyroid Disorder');
  if (patient.comorbid?.other && patient.comorbid.otherText) comorbList.push(patient.comorbid.otherText);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(71, 85, 105);
  doc.text('Co-morbidities: ', margin + 3, y + 2);
  doc.setFont('helvetica', 'normal');
  doc.text(comorbList.length > 0 ? comorbList.join(', ') : 'None reported', margin + 28, y + 2);

  y += 12;
  // Chief Complaints & History
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(30, 41, 59);
  doc.text('Chief Complaints & Clinical Assessment History:', margin, y);
  y += 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  const historyLines = doc.splitTextToSize(patient.history || 'No detailed complaints recorded.', pageWidth - margin * 2);
  doc.text(historyLines, margin, y);
  y += historyLines.length * 4.5 + 4;

  // Visual Analogue Pain Scale Assessment (Before & After Treatment)
  if (patient.painScaleBefore !== undefined || patient.painScaleAfter !== undefined) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(3, 105, 161);
    doc.text('Pain Assessment (VAS 0–10 Numeric Rating Scale):', margin, y);
    y += 4;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    const bStr = patient.painScaleBefore !== undefined ? `${patient.painScaleBefore}/10` : '—';
    const aStr = patient.painScaleAfter !== undefined ? `${patient.painScaleAfter}/10` : '—';
    let painText = `Pre-Treatment Pain: ${bStr}  |  Post-Treatment Pain: ${aStr}`;
    if (patient.painScaleBefore !== undefined && patient.painScaleAfter !== undefined) {
      const diff = Number(patient.painScaleBefore) - Number(patient.painScaleAfter);
      if (diff > 0) {
        painText += `  (Improvement: -${diff} pts / ${Math.round((diff / (Number(patient.painScaleBefore) || 1)) * 100)}% pain relief)`;
      } else if (diff === 0) {
        painText += `  (Pain Level Stable)`;
      }
    }
    doc.text(painText, margin, y);
    y += 5.5;
  }

  // Modalities Prescribed
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('Prescribed Initial Modalities & Interventions:', margin, y);
  y += 4;
  const activeModalities = MODALITIES_LIST.filter(
    (m) => patient.treatment && patient.treatment[m.key]
  ).map((m) => m.label);

  if (patient.treatment?.other && patient.treatment.otherText) {
    activeModalities.push(patient.treatment.otherText);
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  const modText = activeModalities.length > 0 ? activeModalities.join(' • ') : 'Therapeutic exercise and ergonomics';
  const modLines = doc.splitTextToSize(modText, pageWidth - margin * 2);
  doc.text(modLines, margin, y);
  y += modLines.length * 4.5 + 4;

  // Follow-up Sessions (Full Multi-Page Support - Never Skipped or Truncated)
  const followUpsList = patient.followUps || [];
  if (followUpsList.length > 0) {
    // If not enough room on current page for at least the header and 1-2 sessions, start a new page
    if (y > pageHeight - 55) {
      doc.addPage();
      y = margin + 10;
      // Header on continuation page
      doc.setFillColor(240, 249, 255);
      doc.rect(margin, y - 4, pageWidth - margin * 2, 8, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(3, 105, 161);
      doc.text(`Namana Physiotherapy Clinic • Follow-up Records for: ${patient.name || 'Patient'} (${patient.regNo || formatPatientId(patient.date, patient.serial)})`, margin + 3, y + 1);
      y += 9;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(3, 105, 161);
    doc.text(`Follow-Up Rehabilitation Sessions (${followUpsList.length} recorded):`, margin, y);
    y += 5;

    // Follow-ups Table Header
    doc.setFillColor(224, 242, 254);
    doc.rect(margin, y - 3, pageWidth - margin * 2, 6.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(12, 74, 110);
    doc.text('SESSION & DATE', margin + 3, y + 1.5);
    doc.text('MODE', margin + 36, y + 1.5);
    doc.text('VAS PAIN', margin + 56, y + 1.5);
    doc.text('INTERVENTIONS & CLINICAL NOTES', margin + 78, y + 1.5);
    doc.text('FEE & RECEIPT', pageWidth - margin - 36, y + 1.5);
    y += 6.5;

    followUpsList.forEach((fu, idx) => {
      // If close to page bottom, add a new page
      if (y > pageHeight - 38) {
        doc.addPage();
        y = margin + 10;
        doc.setFillColor(240, 249, 255);
        doc.rect(margin, y - 4, pageWidth - margin * 2, 8, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(3, 105, 161);
        doc.text(`Namana Physiotherapy Clinic • Follow-up Records for: ${patient.name || 'Patient'} (Contd.)`, margin + 3, y + 1);
        y += 9;

        // Re-print table header
        doc.setFillColor(224, 242, 254);
        doc.rect(margin, y - 3, pageWidth - margin * 2, 6.5, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(12, 74, 110);
        doc.text('SESSION & DATE', margin + 3, y + 1.5);
        doc.text('MODE', margin + 36, y + 1.5);
        doc.text('VAS PAIN', margin + 56, y + 1.5);
        doc.text('INTERVENTIONS & CLINICAL NOTES', margin + 78, y + 1.5);
        doc.text('FEE & RECEIPT', pageWidth - margin - 36, y + 1.5);
        y += 6.5;
      }

      // Alternate row background fill
      if (idx % 2 === 0) {
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, y - 3, pageWidth - margin * 2, 9, 'F');
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(30, 41, 59);
      doc.text(`#${idx + 1}  ${fu.date}`, margin + 3, y + 2);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(71, 85, 105);
      doc.text(fu.visitType || 'Clinic', margin + 36, y + 2);

      // Pain VAS
      const fuB = fu.painScaleBefore !== undefined ? `${fu.painScaleBefore}` : (fu.painScale !== undefined ? `${fu.painScale}` : '');
      const fuA = fu.painScaleAfter !== undefined ? `${fu.painScaleAfter}` : '';
      doc.setFont('helvetica', fuB && fuA ? 'bold' : 'normal');
      if (fuB && fuA) {
        doc.setTextColor(3, 105, 161);
      } else {
        doc.setTextColor(71, 85, 105);
      }
      if (fuB && fuA) {
        doc.text(`${fuB} ➔ ${fuA}/10`, margin + 56, y + 2);
      } else if (fuB) {
        doc.text(`${fuB}/10`, margin + 56, y + 2);
      } else {
        doc.text('—', margin + 56, y + 2);
      }

      // Treatments & Notes
      const rxGiven = (fu.treatmentsGiven && fu.treatmentsGiven.length > 0)
        ? fu.treatmentsGiven.join(', ')
        : [
            fu.treatment?.ift ? 'IFT' : '',
            fu.treatment?.ust ? 'UST' : '',
            fu.treatment?.tens ? 'TENS' : '',
            fu.treatment?.cervicalTraction ? 'C-Trac' : '',
            fu.treatment?.pelvicTraction ? 'P-Trac' : '',
            fu.treatment?.exercise ? 'Exercise' : '',
            fu.treatment?.manual ? 'Manual' : '',
          ].filter(Boolean).join(', ');

      const descText = [rxGiven ? `[${rxGiven}]` : '', fu.notes || ''].filter(Boolean).join(' ');
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(51, 65, 85);
      doc.text(descText ? descText.slice(0, 52) : 'Routine maintenance & modality', margin + 78, y + 2);

      // Fee & Receipt
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      const feeText = fu.fee !== undefined && fu.fee !== '' ? `Rs. ${fu.fee}/-` : 'Rs. 0/-';
      const payMode = fu.paymentMethod || 'Cash';
      doc.text(`${feeText} (${payMode})`, pageWidth - margin - 36, y + 2);

      y += 9.5;
    });
    y += 3;
  } else {
    // If no follow-ups recorded yet, print a subtle placeholder line so the section is clear
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text('Follow-Up Rehabilitation Sessions: None recorded to date.', margin, y);
    y += 6;
  }

  // Check if signature fits on current page; if not, add page
  if (y > pageHeight - 35) {
    doc.addPage();
    y = margin + 15;
  }

  // Footer / Signature
  y = Math.max(y + 8, pageHeight - margin - 22);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(30, 41, 59);
  doc.text(CLINIC_CONFIG.consultantName || 'R. Chandrashekar', pageWidth - margin - 5, y, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(71, 85, 105);
  doc.text(`${CLINIC_CONFIG.consultantEducation || 'BPT, MIAP'}`, pageWidth - margin - 5, y + 3.8, { align: 'right' });
  doc.setFontSize(6.8);
  doc.text(CLINIC_CONFIG.consultantTitle, pageWidth - margin - 5, y + 7.2, { align: 'right' });
  doc.setTextColor(148, 163, 184);
  doc.setFontSize(6.5);
  doc.text('Authorized Physiotherapist Signature', pageWidth - margin - 5, y + 10.5, { align: 'right' });

  // Present Date stamp in bottom-left footer
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text(`Document Date (Generated/Downloaded): ${presentDate}`, margin, y + 10.5);

  // Add Page Numbers to all pages
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(148, 163, 184);
    doc.text(`Page ${i} of ${totalPages}`, pageWidth / 2, pageHeight - 8, { align: 'center' });
  }

  return doc;
}

export function getPdfCaseSheetBlob(patient: Patient): Blob {
  const doc = createPdfCaseSheetDoc(patient);
  return doc.output('blob');
}

export function getPdfCaseSheetFileInfo(patient: Patient): {
  fileName: string;
  blob: Blob;
  blobUrl: string;
  dataUri: string;
} {
  const doc = createPdfCaseSheetDoc(patient);
  const regClean = (patient.regNo || formatPatientId(patient.date, patient.serial) || 'record')
    .replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeName = (patient.name || 'patient').replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
  const todayStr = new Date().toISOString().split('T')[0];
  const fileName = `CaseSheet_${regClean}_${safeName}_${todayStr}.pdf`;
  const blob = doc.output('blob');
  const blobUrl = URL.createObjectURL(blob);
  const dataUri = doc.output('datauristring');
  return { fileName, blob, blobUrl, dataUri };
}

export async function generatePdfCaseSheet(patient: Patient): Promise<boolean> {
  try {
    const doc = createPdfCaseSheetDoc(patient);
    const regClean = (patient.regNo || formatPatientId(patient.date, patient.serial) || 'record')
      .replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeName = (patient.name || 'patient').replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
    const todayStr = new Date().toISOString().split('T')[0];
    const fileName = `CaseSheet_${regClean}_${safeName}_${todayStr}.pdf`;

    return await downloadPdfDoc(doc, fileName);
  } catch (primaryErr) {
    console.error('Case Sheet PDF download failed:', primaryErr);
    return false;
  }
}
