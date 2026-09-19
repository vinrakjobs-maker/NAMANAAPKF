import React, { useState } from 'react';
import {
  X,
  Download,
  ExternalLink,
  Check,
  Copy,
  FileText,
  Eye,
  Stethoscope,
  Activity,
  Calendar,
  User,
  ShieldCheck,
  Loader2,
} from 'lucide-react';
import { Patient, FollowUpVisit } from '../types';
import { CLINIC_CONFIG, MODALITIES_LIST } from '../constants';
import { calculateBMI } from '../utils/bmi';
import { formatPatientId } from '../utils/storage';
import { generatePdfCaseSheet } from '../utils/pdfCaseSheet';

interface PdfViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  fileName: string;
  blobUrl: string | null;
  dataUri?: string | null;
  onDownloadAgain?: () => void;
  patientName?: string;
  regNo?: string;
  patient?: Patient;
}

export const PdfViewerModal: React.FC<PdfViewerModalProps> = ({
  isOpen,
  onClose,
  title = 'Case Sheet Document Preview',
  fileName,
  blobUrl,
  dataUri,
  onDownloadAgain,
  patientName,
  regNo,
  patient,
}) => {
  const [copied, setCopied] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  if (!isOpen) return null;

  const activeSrc = blobUrl || dataUri || '';
  const presentDate = new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  const bmi = patient ? calculateBMI(patient.height, patient.weight) : null;

  const handleCopyFileName = () => {
    navigator.clipboard.writeText(fileName).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleDownload = async () => {
    if (isDownloading) return;
    setIsDownloading(true);
    try {
      if (onDownloadAgain) {
        await onDownloadAgain();
      } else if (patient) {
        await generatePdfCaseSheet(patient);
      } else if (activeSrc) {
        const a = document.createElement('a');
        a.href = activeSrc;
        a.download = fileName;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          if (document.body.contains(a)) document.body.removeChild(a);
        }, 1500);
      }
    } catch (err) {
      console.error('Download error in PDF viewer modal:', err);
    } finally {
      setIsDownloading(false);
    }
  };

  // Get active modalities
  const activeModalities = patient?.treatment
    ? MODALITIES_LIST.filter((m) => patient.treatment && patient.treatment[m.key])
    : [];

  // Follow-up sessions list
  const followUps: FollowUpVisit[] = patient?.followUps || [];

  // Financial calculations
  const initialFeeNum = patient?.treatmentFee ? Number(patient.treatmentFee) || 0 : 0;
  const followUpsTotalFee = followUps.reduce((acc, fu) => acc + (fu.fee ? Number(fu.fee) || 0 : 0), 0);
  const grandTotalFee = initialFeeNum + followUpsTotalFee;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/80 backdrop-blur-xs animate-fade-in print:p-0 print:bg-white print:static print:inset-auto">
      <div className="bg-white rounded-3xl w-full max-w-5xl h-[94vh] sm:h-[90vh] flex flex-col shadow-2xl border border-sky-200 overflow-hidden print:h-auto print:shadow-none print:border-none print:rounded-none">
        
        {/* Header Bar */}
        <div className="p-3.5 sm:p-4 bg-gradient-to-r from-sky-900 via-sky-800 to-indigo-900 text-white flex items-center justify-between gap-3 shrink-0 print:hidden">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-white/10 text-sky-300 shrink-0">
              <FileText className="w-5 h-5 text-sky-200" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-base font-extrabold truncate text-white">
                  {title}
                </h3>
                {regNo && (
                  <span className="font-mono text-[11px] bg-sky-500/30 text-sky-200 px-2 py-0.5 rounded-md border border-sky-400/30 font-bold shrink-0">
                    ID: {regNo}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-sky-200/80 truncate">
                {patientName ? `Patient: ${patientName} • ` : ''}File: <span className="font-mono">{fileName}</span>
              </p>
            </div>
          </div>

          {/* Action buttons (Cleanly focused: Download & Close) */}
          <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
            {/* Direct Download Button */}
            <button
              type="button"
              id="modal-header-download-btn"
              onClick={handleDownload}
              disabled={isDownloading}
              className="px-3 sm:px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-xs shrink-0"
              title="Download PDF Case Sheet to device"
            >
              {isDownloading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
              ) : (
                <Download className="w-3.5 h-3.5 shrink-0" />
              )}
              <span>{isDownloading ? 'Downloading...' : 'Download PDF'}</span>
            </button>

            {/* Open in New Tab Link for browser platforms */}
            {activeSrc && (
              <a
                href={activeSrc}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden sm:flex px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-all cursor-pointer items-center gap-1.5 border border-white/15"
                title="Open PDF directly in a new browser tab"
              >
                <ExternalLink className="w-3.5 h-3.5 text-sky-200" />
                <span>Open Tab</span>
              </a>
            )}

            {/* Close Modal */}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl hover:bg-white/20 text-white/80 hover:text-white transition-colors cursor-pointer ml-1"
              title="Close Preview"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Notice Banner */}
        <div className="px-4 py-2 bg-emerald-50 border-b border-emerald-200 flex flex-wrap items-center justify-between gap-2 text-xs shrink-0 print:hidden">
          <div className="flex items-center gap-2 min-w-0 text-emerald-900">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="truncate">
              <b>Official Clinical Record:</b> Verified case sheet for <span className="font-semibold">{patientName || 'Patient'}</span> ({regNo || 'NPC'})
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleCopyFileName}
              className="text-[11px] font-bold text-emerald-700 hover:text-emerald-900 flex items-center gap-1 bg-emerald-100/60 hover:bg-emerald-100 px-2 py-0.5 rounded-lg transition-colors cursor-pointer"
            >
              {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3 text-emerald-600" />}
              <span>{copied ? 'Copied name' : 'Copy file name'}</span>
            </button>
            {activeSrc && (
              <a
                href={activeSrc}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] font-bold text-sky-700 hover:text-sky-900 underline flex items-center gap-1"
              >
                <Eye className="w-3 h-3" />
                <span>Full Browser Tab</span>
              </a>
            )}
          </div>
        </div>

        {/* Main Document Content Area: 100% Reliable Clinical Case Sheet View */}
        <div className="flex-1 bg-slate-100 overflow-y-auto p-3 sm:p-6 print:p-0 print:bg-white print:overflow-visible">
          <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-md border border-slate-200 p-6 sm:p-10 space-y-6 text-slate-800 font-sans print:shadow-none print:border-none print:p-0 print:max-w-full">
            
            {/* Clinic Header */}
            <div className="border-b-2 border-sky-800 pb-4 text-center space-y-1">
              <h1 className="text-xl sm:text-2xl font-black text-sky-950 tracking-tight uppercase">
                {CLINIC_CONFIG.clinicName}
              </h1>
              <p className="text-xs font-semibold italic text-sky-700">
                "{CLINIC_CONFIG.tagline}"
              </p>
              <div className="text-[11px] text-slate-600 max-w-xl mx-auto leading-relaxed pt-1">
                <p>{CLINIC_CONFIG.address.full}</p>
                <p>
                  <b>Phone:</b> {CLINIC_CONFIG.phone} • <b>Email:</b> {CLINIC_CONFIG.email}
                </p>
                <p>
                  <b>Consultant:</b> {CLINIC_CONFIG.consultantName} ({CLINIC_CONFIG.consultantEducation}) • {CLINIC_CONFIG.consultantTitle}
                </p>
              </div>
              <div className="pt-2">
                <span className="inline-block bg-sky-900 text-white font-bold text-xs uppercase tracking-wider px-4 py-1 rounded-full">
                  Physiotherapy Clinical Case Sheet
                </span>
              </div>
            </div>

            {/* Patient Demographics Card */}
            <div className="bg-sky-50/50 rounded-xl p-4 border border-sky-100">
              <div className="flex items-center gap-2 mb-3 text-sky-950 font-bold text-xs uppercase tracking-wider">
                <User className="w-4 h-4 text-sky-700" />
                <span>Patient Demographics & Registration</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <span className="text-[11px] text-slate-500 block">Registration ID</span>
                  <span className="font-bold text-slate-900 font-mono">
                    {regNo || formatPatientId(patient?.date || '', patient?.serial || 0)}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-500 block">Patient Name</span>
                  <span className="font-bold text-slate-900">{patient?.name || patientName || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-500 block">Age / Gender</span>
                  <span className="font-bold text-slate-900">
                    {patient?.age || '—'} yrs • {patient?.gender || '—'}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-500 block">Contact Phone</span>
                  <span className="font-bold text-slate-900">{patient?.phone || '—'}</span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-500 block">First Visit Date</span>
                  <span className="font-bold text-slate-900">{patient?.date || '—'}</span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-500 block">Occupation</span>
                  <span className="font-bold text-slate-900">{patient?.occupation || '—'}</span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-500 block">Referred By Dr.</span>
                  <span className="font-bold text-slate-900">{patient?.referredByDoctor || 'Direct / Self'}</span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-500 block">Height / Weight / BMI</span>
                  <span className="font-bold text-slate-900">
                    {patient?.height ? `${patient.height} cm` : '—'} / {patient?.weight ? `${patient.weight} kg` : '—'}
                    {bmi ? ` (${bmi.bmi} - ${bmi.category})` : ''}
                  </span>
                </div>
              </div>
            </div>

            {/* Clinical Assessment & Diagnosis */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-1 border-b border-slate-200 text-sky-950 font-bold text-xs uppercase tracking-wider">
                <Stethoscope className="w-4 h-4 text-sky-700" />
                <span>Clinical Diagnosis & Medical History</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                  <span className="font-bold text-slate-700 block mb-1">Primary Clinical Diagnosis</span>
                  <p className="text-slate-900 font-semibold text-sm">
                    {patient?.diagnosis || 'General Physiotherapy Evaluation'}
                  </p>
                </div>
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                  <span className="font-bold text-slate-700 block mb-1">Chief Complaints / Presenting Symptoms</span>
                  <p className="text-slate-900">
                    {patient?.complaints || 'No specific complaints recorded'}
                  </p>
                </div>
              </div>

              {/* Medical History Details */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-slate-500 block text-[11px] font-semibold">History of Present Illness</span>
                  <p className="text-slate-800 mt-1">{patient?.historyOfPresentIllness || 'None recorded'}</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-slate-500 block text-[11px] font-semibold">Past Medical History</span>
                  <p className="text-slate-800 mt-1">{patient?.pastMedicalHistory || 'Nil significant'}</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-slate-500 block text-[11px] font-semibold">Surgical History</span>
                  <p className="text-slate-800 mt-1">{patient?.surgicalHistory || 'Nil'}</p>
                </div>
              </div>

              {/* Objective Examination */}
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-2">
                <span className="font-bold text-slate-700 block">Physical Examination Findings</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-slate-800">
                  <div>
                    <span className="text-slate-500 font-semibold text-[11px]">Range of Motion (ROM):</span>
                    <p>{patient?.rangeOfMotion || 'Within normal functional limits'}</p>
                  </div>
                  <div>
                    <span className="text-slate-500 font-semibold text-[11px]">Manual Muscle Testing (MMT):</span>
                    <p>{patient?.manualMuscleTesting || 'Grade 5/5'}</p>
                  </div>
                  <div className="sm:col-span-2">
                    <span className="text-slate-500 font-semibold text-[11px]">Special Tests & Functional Assessment:</span>
                    <p>{patient?.specialTests || 'Negative for major impingement or instability'}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Pain Scale (VAS) Evaluation */}
            <div className="bg-amber-50/50 rounded-xl p-4 border border-amber-200/80">
              <div className="flex items-center gap-2 mb-2 text-amber-900 font-bold text-xs uppercase tracking-wider">
                <Activity className="w-4 h-4 text-amber-700" />
                <span>Visual Analog Pain Scale (VAS: 0 - 10)</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="p-3 bg-white rounded-lg border border-amber-200 flex items-center justify-between">
                  <span className="font-semibold text-slate-700">Initial Pain Score (Pre-Treatment):</span>
                  <span className="font-black text-lg text-rose-600 bg-rose-50 px-3 py-1 rounded-md border border-rose-200 font-mono">
                    {patient?.painScale !== undefined && patient?.painScale !== null ? `${patient.painScale} / 10` : 'Not Rated'}
                  </span>
                </div>
                <div className="p-3 bg-white rounded-lg border border-amber-200 flex items-center justify-between">
                  <span className="font-semibold text-slate-700">Current / Post-Treatment Pain Score:</span>
                  <span className="font-black text-lg text-emerald-600 bg-emerald-50 px-3 py-1 rounded-md border border-emerald-200 font-mono">
                    {patient?.painScaleAfter !== undefined && patient?.painScaleAfter !== null ? `${patient.painScaleAfter} / 10` : 'Not Rated'}
                  </span>
                </div>
              </div>
            </div>

            {/* Prescribed Treatment Modalities */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 pb-1 border-b border-slate-200 text-sky-950 font-bold text-xs uppercase tracking-wider">
                <Stethoscope className="w-4 h-4 text-sky-700" />
                <span>Prescribed Physiotherapy Modalities</span>
              </div>
              {activeModalities.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {activeModalities.map((mod) => (
                    <span
                      key={mod.key}
                      className="px-3 py-1 rounded-lg bg-sky-100 text-sky-900 font-bold text-xs border border-sky-300 shadow-2xs"
                    >
                      {mod.label}
                    </span>
                  ))}
                  {patient?.treatment?.other && patient?.treatment?.otherText && (
                    <span className="px-3 py-1 rounded-lg bg-indigo-100 text-indigo-900 font-bold text-xs border border-indigo-300 shadow-2xs">
                      {patient.treatment.otherText}
                    </span>
                  )}
                </div>
              ) : (
                <p className="text-xs text-slate-500 italic">No specific electrotherapy or manual modalities logged.</p>
              )}
            </div>

            {/* Follow-up Sessions Log */}
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-1 border-b border-slate-200">
                <div className="flex items-center gap-2 text-sky-950 font-bold text-xs uppercase tracking-wider">
                  <Calendar className="w-4 h-4 text-sky-700" />
                  <span>Rehabilitation Follow-up Visits ({followUps.length} Sessions)</span>
                </div>
                <span className="text-xs text-slate-500 font-medium">
                  Total Sessions Logged: {followUps.length}
                </span>
              </div>

              {followUps.length > 0 ? (
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                      <tr>
                        <th className="p-2.5">#</th>
                        <th className="p-2.5">Date</th>
                        <th className="p-2.5">Treatments Given</th>
                        <th className="p-2.5">VAS Pain</th>
                        <th className="p-2.5">Clinical Progress Notes</th>
                        <th className="p-2.5 text-right">Fee (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {followUps.map((fu, idx) => (
                        <tr key={fu.id || idx} className="hover:bg-slate-50">
                          <td className="p-2.5 font-bold text-slate-600 font-mono">{idx + 1}</td>
                          <td className="p-2.5 font-medium whitespace-nowrap">{fu.date}</td>
                          <td className="p-2.5">
                            {fu.treatmentsGiven && fu.treatmentsGiven.length > 0 ? (
                              <span className="text-sky-900 font-semibold">{fu.treatmentsGiven.join(', ')}</span>
                            ) : (
                              <span className="text-slate-400 italic">—</span>
                            )}
                          </td>
                          <td className="p-2.5 font-mono font-bold">
                            {fu.painScale !== undefined || fu.painScaleBefore !== undefined ? (
                              <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                {fu.painScale ?? fu.painScaleBefore}/10
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="p-2.5 text-slate-700 max-w-xs">{fu.notes || '—'}</td>
                          <td className="p-2.5 text-right font-mono font-bold text-slate-900">
                            ₹{fu.fee || 0}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-50 font-bold border-t border-slate-200 text-slate-900">
                      <tr>
                        <td colSpan={5} className="p-2.5 text-right">Total Follow-ups Fee:</td>
                        <td className="p-2.5 text-right font-mono text-emerald-700">₹{followUpsTotalFee}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : (
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-center text-xs text-slate-500">
                  No rehabilitation follow-up visits recorded yet.
                </div>
              )}
            </div>

            {/* Financial Summary */}
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <div className="space-y-0.5 text-center sm:text-left">
                <span className="font-bold text-slate-800">Complete Financial Ledger</span>
                <p className="text-slate-500">
                  Initial Consultation: <b>₹{initialFeeNum}</b> • Follow-ups ({followUps.length}): <b>₹{followUpsTotalFee}</b>
                </p>
              </div>
              <div className="bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-2xs text-center sm:text-right">
                <span className="text-[11px] text-slate-500 block">Total Clinical Fees Collected</span>
                <span className="text-base font-black text-emerald-700 font-mono">₹{grandTotalFee}</span>
              </div>
            </div>

            {/* Authorized Signature & Footer */}
            <div className="pt-6 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-[11px] text-slate-500 space-y-0.5 text-center sm:text-left">
                <p>Document Generated Date: <b>{presentDate}</b></p>
                <p>Official Patient Rehabilitation Record • Namana Physiotherapy Clinic</p>
              </div>
              <div className="text-center sm:text-right space-y-1">
                <div className="h-10"></div>
                <p className="font-bold text-slate-900 text-xs">{CLINIC_CONFIG.consultantName || 'R. Chandrashekar'}</p>
                <p className="text-[10.5px] text-slate-600">{CLINIC_CONFIG.consultantEducation || 'BPT, MIAP'}</p>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">{CLINIC_CONFIG.consultantTitle}</p>
              </div>
            </div>

          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-600 shrink-0 print:hidden">
          <div className="text-[11px] text-slate-500">
            Official Clinical Record • Namana Physiotherapy Clinic, Mysuru
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              id="modal-footer-download-btn"
              onClick={handleDownload}
              disabled={isDownloading}
              className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold text-xs transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
              title="Download PDF Case Sheet to device"
            >
              {isDownloading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
              ) : (
                <Download className="w-3.5 h-3.5 shrink-0" />
              )}
              <span>{isDownloading ? 'Downloading...' : 'Download PDF'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
