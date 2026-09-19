import React, { useState } from 'react';
import {
  X,
  Download,
  ExternalLink,
  Printer,
  Check,
  Copy,
  FileText,
  Eye,
  Stethoscope,
  Activity,
  Calendar,
  User,
  ShieldCheck,
  AlertCircle,
  FileCode,
} from 'lucide-react';
import { Patient, FollowUpVisit } from '../types';
import { CLINIC_CONFIG, MODALITIES_LIST } from '../constants';
import { calculateBMI } from '../utils/bmi';
import { formatPatientId } from '../utils/storage';

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
  const [viewMode, setViewMode] = useState<'document' | 'embed'>('document');
  const [embedLoadFailed, setEmbedLoadFailed] = useState(false);

  if (!isOpen) return null;

  const activeSrc = blobUrl || dataUri || '';
  const presentDate = new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  const bmi = patient ? calculateBMI(patient.height, patient.weight) : null;

  const handleOpenInNewTab = () => {
    if (blobUrl) {
      window.open(blobUrl, '_blank', 'noopener,noreferrer');
    } else if (dataUri) {
      const win = window.open();
      if (win) {
        win.document.write(
          `<iframe src="${dataUri}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`
        );
      }
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleCopyFileName = () => {
    navigator.clipboard.writeText(fileName).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
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
        
        {/* Header Bar - Hidden on Print */}
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

          {/* Action buttons & View Mode Switcher */}
          <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
            {/* View Mode Toggle */}
            <div className="hidden sm:flex items-center bg-white/10 p-0.5 rounded-xl border border-white/15 text-xs">
              <button
                type="button"
                onClick={() => setViewMode('document')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  viewMode === 'document'
                    ? 'bg-white text-sky-900 shadow-xs'
                    : 'text-sky-200 hover:text-white'
                }`}
                title="View clean, formatted printable clinical document"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Document View</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('embed')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  viewMode === 'embed'
                    ? 'bg-white text-sky-900 shadow-xs'
                    : 'text-sky-200 hover:text-white'
                }`}
                title="View embedded PDF plugin"
              >
                <FileCode className="w-3.5 h-3.5" />
                <span>PDF Plugin</span>
              </button>
            </div>

            {/* Open in New Tab Link */}
            {activeSrc && (
              <a
                href={activeSrc}
                target="_blank"
                rel="noopener noreferrer"
                className="px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border border-white/15"
                title="Open PDF directly in a new browser tab"
              >
                <ExternalLink className="w-3.5 h-3.5 text-sky-200" />
                <span className="hidden sm:inline">Open New Tab</span>
              </a>
            )}

            {/* Direct Download Button */}
            {onDownloadAgain ? (
              <button
                type="button"
                onClick={onDownloadAgain}
                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-xs"
                title="Download complete PDF Case Sheet to device"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Download PDF</span>
              </button>
            ) : activeSrc ? (
              <a
                href={activeSrc}
                download={fileName}
                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-xs"
                title="Download PDF to device"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Download PDF</span>
              </a>
            ) : null}

            {/* Print Button */}
            <button
              type="button"
              onClick={handlePrint}
              className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border border-white/15"
              title="Print Document"
            >
              <Printer className="w-3.5 h-3.5 text-sky-200" />
              <span className="hidden md:inline">Print</span>
            </button>

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

        {/* Download & Notice Banner - Hidden on Print */}
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

        {/* Main Document Content Area */}
        <div className="flex-1 bg-slate-100 overflow-y-auto p-3 sm:p-6 print:p-0 print:bg-white print:overflow-visible">
          
          {/* VIEW MODE 1: Print-Ready HTML Clinical Case Sheet (100% Reliable, never blank!) */}
          {viewMode === 'document' ? (
            <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-md border border-slate-200 p-6 sm:p-10 space-y-6 text-slate-800 font-sans print:shadow-none print:border-none print:p-0 print:max-w-full">
              
              {/* Clinic Header */}
              <div className="border-b-2 border-sky-800 pb-4 text-center space-y-1">
                <h1 className="text-xl sm:text-2xl font-black text-sky-950 tracking-tight uppercase">
                  {CLINIC_CONFIG.clinicName}
                </h1>
                <p className="text-xs font-semibold italic text-sky-700">
                  "{CLINIC_CONFIG.tagline}"
                </p>
                <p className="text-[11px] text-slate-600 max-w-2xl mx-auto leading-relaxed">
                  {CLINIC_CONFIG.address.full}
                </p>
                <div className="flex flex-wrap items-center justify-center gap-3 text-[11px] font-medium text-slate-700 pt-1">
                  <span><b>Phone:</b> {CLINIC_CONFIG.phone}</span>
                  <span>•</span>
                  <span><b>Email:</b> {CLINIC_CONFIG.email}</span>
                  <span>•</span>
                  <span><b>Consultant:</b> {CLINIC_CONFIG.consultantName}, {CLINIC_CONFIG.consultantEducation}</span>
                </div>
              </div>

              {/* Title & Document Ref Bar */}
              <div className="bg-sky-50 border border-sky-200 rounded-xl p-3 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs font-bold text-sky-950">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 bg-sky-700 text-white rounded-lg text-[11px] uppercase tracking-wider font-extrabold">
                    Clinical Case Sheet
                  </span>
                  <span className="font-mono text-slate-800">
                    Reg No: <b>{regNo || (patient ? formatPatientId(patient.date, patient.serial) : '—')}</b>
                  </span>
                </div>
                <div className="flex items-center gap-4 text-slate-600 font-medium">
                  <span>Reg Date: <b>{patient?.date || '—'} {patient?.time ? `(${patient.time})` : ''}</b></span>
                  <span>•</span>
                  <span>Visit: <b>{patient?.visitType || 'Clinic'}</b></span>
                </div>
              </div>

              {/* Patient Demographics Card */}
              <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 space-y-3">
                <h3 className="text-xs font-black uppercase tracking-wider text-sky-900 flex items-center gap-1.5 pb-2 border-b border-slate-200">
                  <User className="w-3.5 h-3.5 text-sky-600" />
                  <span>Patient Demographics & Medical Profile</span>
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="text-slate-500 block text-[10.5px]">Patient Name</span>
                    <span className="font-bold text-slate-900 text-sm">{patient?.name || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10.5px]">Age & Sex</span>
                    <span className="font-bold text-slate-900">{patient?.age ? `${patient.age} yrs` : '—'} / {patient?.sex || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10.5px]">Contact Number</span>
                    <span className="font-bold text-slate-900 font-mono">{patient?.contact || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10.5px]">Blood Group</span>
                    <span className="font-bold text-slate-900">{patient?.bloodGroup || '—'}</span>
                  </div>

                  <div>
                    <span className="text-slate-500 block text-[10.5px]">Height & Weight</span>
                    <span className="font-bold text-slate-900">{patient?.height || '—'} / {patient?.weight ? `${patient.weight} kg` : '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10.5px]">BMI Analysis</span>
                    <span className="font-bold text-slate-900">{bmi ? `${bmi.bmi} (${bmi.category})` : '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10.5px]">Referred By</span>
                    <span className="font-bold text-slate-900">{patient?.referredBy || 'Self / Direct'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10.5px]">Consultant In-Charge</span>
                    <span className="font-bold text-slate-900">{patient?.seenBy || CLINIC_CONFIG.consultantName}</span>
                  </div>

                  <div className="col-span-2 sm:col-span-4">
                    <span className="text-slate-500 block text-[10.5px]">Residential Address</span>
                    <span className="font-medium text-slate-800">{patient?.address || '—'}</span>
                  </div>
                </div>
              </div>

              {/* Clinical Assessment & Diagnosis */}
              <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-3">
                <h3 className="text-xs font-black uppercase tracking-wider text-sky-900 flex items-center gap-1.5 pb-2 border-b border-slate-200">
                  <Stethoscope className="w-3.5 h-3.5 text-sky-600" />
                  <span>Clinical Assessment & Medical History</span>
                </h3>
                
                <div className="space-y-3 text-xs">
                  <div>
                    <span className="text-slate-500 font-bold block text-[11px]">Clinical Diagnosis:</span>
                    <p className="font-bold text-slate-950 text-sm mt-0.5 bg-sky-50/70 p-2.5 rounded-lg border border-sky-100">
                      {patient?.diagnosis || 'General Musculoskeletal Rehabilitation'}
                    </p>
                  </div>

                  <div>
                    <span className="text-slate-500 font-bold block text-[11px]">Chief Complaints & Presenting History:</span>
                    <p className="text-slate-800 mt-0.5 whitespace-pre-wrap leading-relaxed bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                      {patient?.history || 'No presenting history recorded.'}
                    </p>
                  </div>

                  {/* Pain Assessment (VAS) & Comorbidities */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                      <span className="text-[11px] font-bold text-slate-600 block">Initial VAS Pain Assessment:</span>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs">Before: <b className="text-slate-900">{patient?.painScaleBefore ?? patient?.painScale ?? '—'}/10</b></span>
                        <span>➔</span>
                        <span className="text-xs">After: <b className="text-sky-800">{patient?.painScaleAfter !== undefined ? `${patient.painScaleAfter}/10` : '—'}</b></span>
                      </div>
                    </div>

                    <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                      <span className="text-[11px] font-bold text-slate-600 block">Comorbid Conditions:</span>
                      <p className="text-xs text-slate-800 mt-1">
                        {[
                          patient?.comorbid?.diabetes ? 'Diabetes Mellitus' : '',
                          patient?.comorbid?.bp ? 'Hypertension (BP)' : '',
                          patient?.comorbid?.thyroid ? 'Thyroid' : '',
                          patient?.comorbid?.other && patient.comorbid.otherText ? patient.comorbid.otherText : '',
                        ].filter(Boolean).join(', ') || 'None reported'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Initial Modalities Administered */}
              <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-2.5">
                <h3 className="text-xs font-black uppercase tracking-wider text-sky-900 flex items-center gap-1.5 pb-2 border-b border-slate-200">
                  <Activity className="w-3.5 h-3.5 text-sky-600" />
                  <span>Initial Physiotherapy Modalities & Interventions</span>
                </h3>
                {activeModalities.length > 0 ? (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {activeModalities.map((mod) => (
                      <span
                        key={mod.key}
                        className="px-2.5 py-1 bg-sky-50 text-sky-900 border border-sky-200 rounded-lg text-xs font-semibold flex items-center gap-1.5"
                      >
                        <Check className="w-3 h-3 text-sky-600 stroke-[2.5]" />
                        <span>{mod.label}</span>
                      </span>
                    ))}
                    {patient?.treatment?.other && patient.treatment.otherText && (
                      <span className="px-2.5 py-1 bg-indigo-50 text-indigo-900 border border-indigo-200 rounded-lg text-xs font-semibold">
                        Other: {patient.treatment.otherText}
                      </span>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 italic">No initial modalities specified.</p>
                )}
              </div>

              {/* Follow-Up Rehabilitation Sessions (Complete Table!) */}
              <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                  <h3 className="text-xs font-black uppercase tracking-wider text-emerald-950 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Follow-Up Rehabilitation Sessions ({followUps.length} Recorded)</span>
                  </h3>
                  <span className="text-xs font-bold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                    Total Follow-ups: {followUps.length}
                  </span>
                </div>

                {followUps.length > 0 ? (
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-xs text-left">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-slate-700 font-bold">
                          <th className="py-2.5 px-3">Session</th>
                          <th className="py-2.5 px-3">Date</th>
                          <th className="py-2.5 px-3">Mode</th>
                          <th className="py-2.5 px-3">VAS Pain</th>
                          <th className="py-2.5 px-3">Interventions Given & Clinical Notes</th>
                          <th className="py-2.5 px-3 text-right">Fee & Mode</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {followUps.map((fu, idx) => {
                          const fuB = fu.painScaleBefore ?? fu.painScale;
                          const fuA = fu.painScaleAfter;
                          return (
                            <tr key={fu.id || idx} className="hover:bg-slate-50/60 transition-colors">
                              <td className="py-2 px-3 font-bold text-slate-900">#{idx + 1}</td>
                              <td className="py-2 px-3 font-semibold text-slate-800 whitespace-nowrap">{fu.date}</td>
                              <td className="py-2 px-3 text-slate-600">{fu.visitType || 'Clinic'}</td>
                              <td className="py-2 px-3 whitespace-nowrap">
                                {fuB !== undefined && fuA !== undefined ? (
                                  <span className="font-bold text-sky-800">{fuB} ➔ {fuA}/10</span>
                                ) : fuB !== undefined ? (
                                  <span className="text-slate-700 font-medium">{fuB}/10</span>
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                              </td>
                              <td className="py-2 px-3 text-slate-700 max-w-sm">
                                {fu.treatmentsGiven && fu.treatmentsGiven.length > 0
                                  ? fu.treatmentsGiven.join(', ')
                                  : fu.notes || 'Routine physiotherapy rehabilitation session'}
                              </td>
                              <td className="py-2 px-3 text-right whitespace-nowrap">
                                <span className="font-bold text-slate-900">₹{fu.fee || 0}/-</span>{' '}
                                <span className="text-[10px] text-slate-500 font-medium">({fu.paymentMethod || 'Cash'})</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="py-4 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200 text-xs text-slate-500">
                    No subsequent follow-up rehabilitation sessions recorded to date.
                  </div>
                )}
              </div>

              {/* Financial & Fee Summary */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div>
                  <span className="text-slate-500 text-[10.5px] block">Initial Consultation Fee:</span>
                  <span className="font-bold text-slate-900">₹{patient?.treatmentFee || 0}/- ({patient?.paymentMethod || 'Cash'})</span>
                </div>
                <div>
                  <span className="text-slate-500 text-[10.5px] block">Follow-up Sessions Total:</span>
                  <span className="font-bold text-emerald-800">₹{followUpsTotalFee}/- ({followUps.length} Sessions)</span>
                </div>
                <div className="text-right">
                  <span className="text-slate-500 text-[10.5px] block">Grand Total Received:</span>
                  <span className="font-black text-slate-950 text-sm">₹{grandTotalFee}/-</span>
                </div>
              </div>

              {/* Authorized Signature & Footer */}
              <div className="pt-6 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-[11px] text-slate-500 space-y-0.5 text-center sm:text-left">
                  <p>Document Generated / Printed Date: <b>{presentDate}</b></p>
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
          ) : (
            /* VIEW MODE 2: Raw Embedded PDF Plugin */
            <div className="w-full h-full min-h-[600px] bg-slate-200 rounded-2xl overflow-hidden relative flex flex-col">
              {activeSrc && !embedLoadFailed ? (
                <object
                  data={activeSrc}
                  type="application/pdf"
                  className="w-full h-full flex-1 border-0 bg-white"
                  onError={() => setEmbedLoadFailed(true)}
                >
                  <div className="flex flex-col items-center justify-center p-8 text-center bg-white h-full space-y-3">
                    <AlertCircle className="w-12 h-12 text-amber-500" />
                    <h4 className="text-base font-bold text-slate-800">
                      Browser PDF Plugin Not Supported in this Frame
                    </h4>
                    <p className="text-xs text-slate-600 max-w-md">
                      Your browser cannot render embedded PDF plugins inside this window. Switch to the <b>Clinical Document View</b> or open the PDF in a new tab.
                    </p>
                    <div className="flex items-center gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setViewMode('document')}
                        className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer"
                      >
                        Switch to Clinical Document View
                      </button>
                      <a
                        href={activeSrc}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl shadow-xs"
                      >
                        Open in New Tab
                      </a>
                    </div>
                  </div>
                </object>
              ) : (
                <div className="flex flex-col items-center justify-center p-8 text-center bg-white h-full space-y-3">
                  <AlertCircle className="w-12 h-12 text-amber-500" />
                  <h4 className="text-base font-bold text-slate-800">
                    PDF Plugin Blocked or Unsupported
                  </h4>
                  <p className="text-xs text-slate-600 max-w-md">
                    Switch back to the Clinical Document View to read all patient records, assessment notes, and follow-up sessions immediately.
                  </p>
                  <div className="flex items-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setViewMode('document')}
                      className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer"
                    >
                      Switch to Document View
                    </button>
                    {activeSrc && (
                      <a
                        href={activeSrc}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl shadow-xs"
                      >
                        Open in New Tab
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

        </div>

        {/* Modal Footer - Hidden on Print */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-600 shrink-0 print:hidden">
          <div className="text-[11px] text-slate-500">
            Official Clinical Record • Namana Physiotherapy Clinic, Mysuru
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Sheet</span>
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
