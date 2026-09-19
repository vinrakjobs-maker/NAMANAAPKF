import { Patient } from '../types';
import { CLINIC_CONFIG, MODALITIES_LIST } from '../constants';
import { formatPatientId } from './storage';

/**
 * Formats standard 10-digit Indian phone numbers with 91 country code for WhatsApp wa.me links
 */
export function getCleanPhone(phoneStr?: string): string {
  if (!phoneStr) return '';
  const digits = phoneStr.replace(/\D/g, '');
  if (digits.length === 10) {
    return `91${digits}`;
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits;
  }
  return digits;
}

/**
 * Generates formatted WhatsApp text for Clinical Assessment / Case Sheet
 */
export function formatClinicalReportWhatsApp(patient: Patient): string {
  const patientId = patient.regNo || formatPatientId(patient.date, patient.serial);
  const consultant = patient.seenBy || CLINIC_CONFIG.doctorName;
  const referred = patient.referredBy || 'Self / Direct Walk-in';

  // Extract selected modalities
  const modalities: string[] = [];
  if (patient.treatment) {
    MODALITIES_LIST.forEach((m) => {
      if (patient.treatment[m.key]) {
        modalities.push(m.label);
      }
    });
    if (patient.treatment.other && patient.treatment.otherText) {
      modalities.push(patient.treatment.otherText);
    }
  }

  const lines = [
    `🏥 *${CLINIC_CONFIG.clinicName.toUpperCase()}*`,
    `📍 ${CLINIC_CONFIG.address.full}`,
    `📞 Phone: ${CLINIC_CONFIG.phone}`,
    `----------------------------------------`,
    `📋 *PHYSIOTHERAPY CLINICAL REPORT*`,
    `----------------------------------------`,
    `👤 *Patient Name:* ${patient.name || 'N/A'}`,
    `🆔 *Patient ID:* ${patientId}`,
    `📅 *Date of Visit:* ${patient.date || 'N/A'}`,
    `🎂 *Age / Gender:* ${patient.age || '—'} Yrs / ${patient.gender || '—'}`,
    `👨‍⚕️ *Attending Physiotherapist:* ${consultant} (BPT, MIAP)`,
    `🩺 *Referred By:* ${referred}`,
    `🚗 *Visit Mode:* ${patient.visitType || 'Clinic Visit'}`,
    ``,
    `📝 *Clinical Diagnosis:*`,
    `${patient.diagnosis || 'Physiotherapy Evaluation & Management'}`,
    ``,
    (patient.painScaleBefore !== undefined || patient.painScaleAfter !== undefined)
      ? `📊 *Pain Assessment (VAS 0–10 Scale):*\n• Before Treatment: ${patient.painScaleBefore !== undefined ? `${patient.painScaleBefore}/10` : '—'}\n• After Treatment: ${patient.painScaleAfter !== undefined ? `${patient.painScaleAfter}/10` : '—'}${
          patient.painScaleBefore !== undefined && patient.painScaleAfter !== undefined && (Number(patient.painScaleBefore) - Number(patient.painScaleAfter)) > 0
            ? `\n• ✨ *Improvement:* -${Number(patient.painScaleBefore) - Number(patient.painScaleAfter)} pts (${Math.round(((Number(patient.painScaleBefore) - Number(patient.painScaleAfter)) / (Number(patient.painScaleBefore) || 1)) * 100)}% Pain Relief)`
            : ''
        }\n`
      : '',
    patient.history ? `📖 *History & Clinical Notes:*\n${patient.history}\n` : '',
    modalities.length > 0 ? `⚡ *Prescribed Modalities / Treatment:*\n• ${modalities.join('\n• ')}\n` : '',
    patient.followUps && patient.followUps.length > 0
      ? `🔄 *Follow-Up Sessions Progress (${patient.followUps.length}):*\n${patient.followUps.map((fu, i) => {
          const b = fu.painScaleBefore !== undefined ? `${fu.painScaleBefore}/10` : (fu.painScale ? `${fu.painScale}/10` : '—');
          const a = fu.painScaleAfter !== undefined ? `${fu.painScaleAfter}/10` : '—';
          return `  • Visit #${i + 1} (${fu.date}): Pain: ${b} ➔ ${a} | Fee: ₹${fu.fee || 0}`;
        }).join('\n')}\n`
      : '',
    `----------------------------------------`,
    `💡 *Advice & Precautions:* Follow prescribed ergonomic posture and home exercises daily.`,
    `_Wishing you a swift and complete rehabilitation recovery._`,
  ];

  return lines.filter(Boolean).join('\n');
}

/**
 * Shares a generated PDF document directly via WhatsApp
 * Uses Web Share API with file support where available (e.g. Android APK, Chrome mobile),
 * and falls back to auto-downloading the PDF and launching WhatsApp chat.
 */
export async function sharePdfViaWhatsApp(
  phone: string,
  pdfBlob: Blob,
  fileName: string,
  captionText: string
): Promise<{ success: boolean; method: 'web-share' | 'download-wa' }> {
  const cleanPhone = getCleanPhone(phone);
  const pdfFile = new File([pdfBlob], fileName, { type: 'application/pdf' });

  // Check if Web Share API with files is supported (Standard on Android/APK)
  if (navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
    try {
      await navigator.share({
        files: [pdfFile],
        title: fileName,
        text: captionText,
      });
      return { success: true, method: 'web-share' };
    } catch (err: any) {
      // User cancelled share sheet or share failed, proceed to fallback
      if (err.name === 'AbortError') {
        return { success: false, method: 'web-share' };
      }
    }
  }

  // Fallback: Trigger instant browser download of PDF and open WhatsApp chat
  const url = URL.createObjectURL(pdfBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);

  // Open WhatsApp chat pre-populated with note
  const note = `${captionText}\n\n📎 *Official PDF Report (${fileName}) has been downloaded to your device and is ready to attach here.*`;
  openWhatsApp(cleanPhone, note);

  return { success: true, method: 'download-wa' };
}

/**
 * Generates formatted WhatsApp text for ALL Receipts (Initial + All Follow-ups)
 */
export function formatReceiptsWhatsApp(patient: Patient): string {
  const patientId = patient.regNo || formatPatientId(patient.date, patient.serial);
  const consultant = patient.seenBy || CLINIC_CONFIG.doctorName;

  const initialFee = parseFloat(String(patient.treatmentFee)) || 0;
  const initialReceiptNo = patient.receiptNo || 'REC-INIT';
  const followUps = patient.followUps || [];

  let totalFollowUpFees = 0;
  const followUpLines: string[] = [];

  followUps.forEach((fu, idx) => {
    const fuFee = parseFloat(String(fu.fee)) || 0;
    totalFollowUpFees += fuFee;
    const sessionNum = idx + 1;
    const rNo = fu.receiptNo || `REC-FU-${sessionNum}`;
    const pMode = fu.paymentMethod || 'Cash';
    followUpLines.push(
      `  • *Session #${sessionNum}* (${fu.date}): ₹${fuFee} | Rec: ${rNo} | ${pMode}`
    );
  });

  const grandTotal = initialFee + totalFollowUpFees;

  const lines = [
    `🧾 *${CLINIC_CONFIG.clinicName.toUpperCase()}*`,
    `📍 ${CLINIC_CONFIG.address.full}`,
    `📞 Phone: ${CLINIC_CONFIG.phone}`,
    `----------------------------------------`,
    `💰 *OFFICIAL PAYMENT RECEIPT(S) SUMMARY*`,
    `----------------------------------------`,
    `👤 *Patient Name:* ${patient.name || 'N/A'}`,
    `🆔 *Patient ID:* ${patientId}`,
    `👨‍⚕️ *Consultant:* ${consultant}`,
    `----------------------------------------`,
    `📌 *INITIAL CONSULTATION / ASSESSMENT:*`,
    `  • Date: ${patient.date || 'N/A'}`,
    `  • Receipt No: ${initialReceiptNo}`,
    `  • Amount Paid: ₹${initialFee}`,
    `  • Payment Mode: ${patient.paymentMethod || 'Cash'}`,
    `  • Visit Mode: ${patient.visitType || 'Clinic'}`,
    ``,
  ];

  if (followUps.length > 0) {
    lines.push(
      `📌 *FOLLOW-UP REHABILITATION SESSIONS (${followUps.length}):*`,
      ...followUpLines,
      `  *Follow-up Subtotal:* ₹${totalFollowUpFees}`,
      ``
    );
  }

  lines.push(
    `========================================`,
    `💵 *TOTAL REVENUE PAID TO DATE: ₹${grandTotal}*`,
    `STATUS: ✅ PAID IN FULL`,
    `========================================`,
    `_Thank you for choosing ${CLINIC_CONFIG.clinicName}._`
  );

  return lines.join('\n');
}

/**
 * Generates formatted WhatsApp text for BOTH Clinical Report & All Receipts
 */
export function formatBothWhatsApp(patient: Patient): string {
  const report = formatClinicalReportWhatsApp(patient);
  const receipts = formatReceiptsWhatsApp(patient);

  return `${report}\n\n========================================\n\n${receipts}`;
}

/**
 * Opens WhatsApp link in new browser tab
 */
export function openWhatsApp(phone: string, text: string): void {
  const cleanPhone = getCleanPhone(phone);
  const encoded = encodeURIComponent(text);
  const url = cleanPhone
    ? `https://wa.me/${cleanPhone}?text=${encoded}`
    : `https://wa.me/?text=${encoded}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}
