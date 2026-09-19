import React, { useState } from 'react';
import {
  FileText,
  Download,
  Receipt,
  Trash2,
  RotateCcw,
  Calendar,
  Activity,
  Plus,
  Stethoscope,
  DollarSign,
  ChevronRight,
  ClipboardList,
  Check,
  AlertTriangle,
  CreditCard,
  X,
  Sparkles,
  ArrowRight,
  ArrowDown,
  UserCheck,
  Settings2,
  MessageSquare,
  Share2,
  Send,
  Phone,
  TrendingDown,
  Loader2,
} from 'lucide-react';
import { Patient, TreatmentModalities, FollowUpVisit, ReceiptData, PaymentMethod, LocumPhysiotherapist } from '../types';
import { MODALITIES_LIST, BLOOD_GROUPS, COMMON_DIAGNOSES, HEIGHT_PRESETS } from '../constants';
import { calculateBMI } from '../utils/bmi';
import {
  defaultTreatmentModalities,
  generateReceiptNumber,
  formatPatientId,
  formatTime24Hour,
  getLocumPhysiotherapists,
  getCommonReferralDoctors,
  saveCommonReferralDoctors,
  getFollowUpTreatmentsList,
  addCustomTreatment,
  deleteCustomTreatment,
} from '../utils/storage';
import { generatePdfCaseSheet, getPdfCaseSheetBlob } from '../utils/pdfCaseSheet';
import { getPdfReceiptBlob } from '../utils/pdfReceipt';
import { ManageReferralDoctorsModal } from './ManageReferralDoctorsModal';
import { ManageTreatmentsModal } from './ManageTreatmentsModal';
import {
  PainScaleComponent,
  PainImprovementBadge,
  calculatePainImprovement,
  getPainSeverityInfo,
  getPainScoreButtonClass,
} from './PainScaleComponent';
import { PainImprovementModal } from './PainImprovementModal';
import {
  formatClinicalReportWhatsApp,
  formatReceiptsWhatsApp,
  formatBothWhatsApp,
  openWhatsApp,
  sharePdfViaWhatsApp,
  getCleanPhone,
} from '../utils/whatsappHelper';

interface PatientCaseSheetProps {
  patient: Patient;
  clinicName?: string;
  onUpdatePatient: (updated: Patient) => void;
  onDeletePatient: (id: string) => void;
  onRestorePatient: (id: string) => void;
  onOpenReceipt: (data: Partial<ReceiptData>) => void;
  onClosePatient?: () => void;
}

type SubTab = 'diagnosis' | 'modalities' | 'followups';

const PAYMENT_MODES: PaymentMethod[] = ['Cash', 'UPI', 'Card', 'Bank Transfer'];

export const PatientCaseSheet: React.FC<PatientCaseSheetProps> = ({
  patient,
  onUpdatePatient,
  onDeletePatient,
  onRestorePatient,
  onOpenReceipt,
  onClosePatient,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('diagnosis');
  const [showDeletePatientModal, setShowDeletePatientModal] = useState(false);
  const [deleteFollowUpIdx, setDeleteFollowUpIdx] = useState<number | null>(null);

  // Locum Tenens & Referral Doctors state
  const [locums] = useState<LocumPhysiotherapist[]>(() => getLocumPhysiotherapists());
  const [referralDocs, setReferralDocs] = useState<string[]>(() => getCommonReferralDoctors());
  const [isAddingNewDoc, setIsAddingNewDoc] = useState(false);
  const [showManageDoctorsModal, setShowManageDoctorsModal] = useState(false);
  const [newDocInput, setNewDocInput] = useState('');

  // WhatsApp Report & Receipt Modal state
  const [whatsAppModalOpen, setWhatsAppModalOpen] = useState(false);
  const [whatsAppOption, setWhatsAppOption] = useState<'report' | 'receipts' | 'both'>('both');
  const [whatsAppFormat, setWhatsAppFormat] = useState<'text' | 'pdf'>('text');
  const [isSharingPdf, setIsSharingPdf] = useState(false);
  const [pdfShareSuccess, setPdfShareSuccess] = useState<string | null>(null);
  const [customPhone, setCustomPhone] = useState('');

  // PDF Generation state for Patient ID & Top PDF action
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [pdfSuccessToast, setPdfSuccessToast] = useState(false);

  const handleDownloadCaseSheetPdf = async () => {
    if (isGeneratingPdf) return;
    setIsGeneratingPdf(true);
    try {
      const success = await generatePdfCaseSheet(patient);
      if (success) {
        setPdfSuccessToast(true);
        setTimeout(() => setPdfSuccessToast(false), 3500);
      }
    } catch (err) {
      console.error('Failed to generate PDF Case Sheet:', err);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // Pain scale trajectory modal
  const [showPainModal, setShowPainModal] = useState(false);

  // Follow-up Custom Treatments state
  const [availableTreatments, setAvailableTreatments] = useState<string[]>(() => getFollowUpTreatmentsList());
  const [addingTreatmentSessionIdx, setAddingTreatmentSessionIdx] = useState<number | null>(null);
  const [inlineTreatmentInput, setInlineTreatmentInput] = useState('');
  const [showManageTreatmentsModal, setShowManageTreatmentsModal] = useState(false);

  const isDeleted = !!patient.deleted;
  const bmi = calculateBMI(patient.height, patient.weight);

  const getActiveTreatmentsForFollowUp = (fu: FollowUpVisit): string[] => {
    if (fu.treatmentsGiven && Array.isArray(fu.treatmentsGiven) && fu.treatmentsGiven.length > 0) {
      return fu.treatmentsGiven;
    }
    const list: string[] = [];
    if (fu.treatment) {
      MODALITIES_LIST.forEach((item) => {
        if (fu.treatment[item.key] && !list.includes(item.label)) {
          list.push(item.label);
        }
      });
      if (fu.treatment.other && fu.treatment.otherText && !list.includes(fu.treatment.otherText)) {
        list.push(fu.treatment.otherText.trim());
      }
    }
    return list;
  };

  const handleToggleTreatment = (sessionIdx: number, treatmentName: string) => {
    const currentFu = (patient.followUps || [])[sessionIdx];
    if (!currentFu) return;

    const currentList = getActiveTreatmentsForFollowUp(currentFu);
    const isSelected = currentList.includes(treatmentName);
    const nextList = isSelected
      ? currentList.filter((t) => t !== treatmentName)
      : [...currentList, treatmentName];

    const currentMod = currentFu.treatment || defaultTreatmentModalities();
    const nextMod = { ...currentMod };
    const lower = treatmentName.toLowerCase();
    if (lower === 'ift') nextMod.ift = !isSelected;
    if (lower.includes('ultrasound') || lower.includes('ust')) nextMod.ust = !isSelected;
    if (lower === 'tens') nextMod.tens = !isSelected;
    if (lower.includes('cervical')) nextMod.cervicalTraction = !isSelected;
    if (lower.includes('pelvic')) nextMod.pelvicTraction = !isSelected;
    if (lower.includes('exercise')) nextMod.exercise = !isSelected;
    if (lower.includes('manual')) nextMod.manual = !isSelected;
    if (lower.includes('cold pack')) nextMod.coldPack = !isSelected;
    if (lower.includes('moist')) nextMod.moist = !isSelected;
    if (lower.includes('gait')) nextMod.gait = !isSelected;

    handleUpdateFollowUp(sessionIdx, {
      treatmentsGiven: nextList,
      treatment: nextMod,
    });
  };

  const handleAddCustomTreatmentToClinic = (name: string, sessionIdx?: number) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const updated = addCustomTreatment(trimmed);
    setAvailableTreatments(updated);
    if (sessionIdx !== undefined && sessionIdx !== null) {
      handleToggleTreatment(sessionIdx, trimmed);
    }
  };

  const handleDeleteCustomTreatmentFromClinic = (name: string) => {
    const updated = deleteCustomTreatment(name);
    setAvailableTreatments(updated);
    if (patient.followUps && patient.followUps.length > 0) {
      const updatedFollowUps = patient.followUps.map((fu) => {
        const active = getActiveTreatmentsForFollowUp(fu);
        if (active.includes(name)) {
          return {
            ...fu,
            treatmentsGiven: active.filter((t) => t !== name),
          };
        }
        return fu;
      });
      updateField('followUps', updatedFollowUps);
    }
  };

  const handleAddNewReferralDoc = () => {
    const doc = newDocInput.trim();
    if (!doc) return;
    if (!referralDocs.includes(doc)) {
      const updated = [...referralDocs, doc];
      setReferralDocs(updated);
      saveCommonReferralDoctors(updated);
    }
    updateField('referredBy', doc);
    setNewDocInput('');
    setIsAddingNewDoc(false);
  };

  // Field update helper
  const updateField = <K extends keyof Patient>(field: K, value: Patient[K]) => {
    const updatedTime = (!patient.time || patient.time === '10:00:00' || patient.time === '10:00')
      ? formatTime24Hour()
      : formatTime24Hour(patient.time);

    onUpdatePatient({
      ...patient,
      [field]: value,
      time: updatedTime,
      updatedAt: Date.now(),
    });
  };

  // Treatment modality toggle helper
  const toggleModality = (key: keyof TreatmentModalities) => {
    const current = patient.treatment || defaultTreatmentModalities();
    updateField('treatment', {
      ...current,
      [key]: !current[key],
    });
  };

  // Co-morbid condition toggle helper
  const toggleComorbid = (key: 'diabetes' | 'bp' | 'thyroid' | 'other') => {
    const current = patient.comorbid || { diabetes: false, bp: false, thyroid: false, other: false, otherText: '' };
    updateField('comorbid', {
      ...current,
      [key]: !current[key],
    });
  };

  // Add a follow-up visit
  const handleAddFollowUp = () => {
    const followUps = patient.followUps || [];
    const nextSessionNum = followUps.length + 1;
    const today = new Date().toISOString().slice(0, 10);
    const receiptNum = generateReceiptNumber(patient, nextSessionNum);

    const newVisit: FollowUpVisit = {
      id: `fu_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      date: today,
      time: formatTime24Hour(),
      notes: `Session ${nextSessionNum}: Reassessed joint range of motion and muscular tone. Patient reported progressive relief.`,
      painScale: 5,
      treatment: { ...patient.treatment },
      fee: patient.treatmentFee || '500',
      receiptNo: receiptNum,
      visitType: patient.visitType || 'Clinic',
      paymentMethod: patient.paymentMethod || 'Cash',
    };

    updateField('followUps', [...followUps, newVisit]);
    setActiveSubTab('followups');
  };

  // Update a follow-up visit
  const handleUpdateFollowUp = (index: number, updated: Partial<FollowUpVisit>) => {
    const followUps = [...(patient.followUps || [])];
    followUps[index] = { ...followUps[index], ...updated };
    updateField('followUps', followUps);
  };

  // Delete a follow-up visit
  const handleDeleteFollowUp = (index: number) => {
    const followUps = (patient.followUps || []).filter((_, idx) => idx !== index);
    updateField('followUps', followUps);
    setDeleteFollowUpIdx(null);
  };

  // Open receipt for initial consultation
  const handleOpenInitialReceipt = () => {
    onOpenReceipt({
      name: patient.name,
      serial: patient.serial,
      receiptNo: patient.receiptNo || generateReceiptNumber(patient),
      date: patient.date,
      amount: patient.treatmentFee || '500',
      visitType: patient.visitType || 'Clinic',
      address: patient.address,
      age: patient.age,
      therapyFor: patient.diagnosis || 'Physiotherapy Consultation',
      sessionFrom: patient.date,
      sessionTo: patient.date,
      paymentMethod: patient.paymentMethod || 'Cash',
    });
  };

  // Open receipt for specific follow up
  const handleOpenFollowUpReceipt = (fu: FollowUpVisit) => {
    onOpenReceipt({
      name: patient.name,
      serial: patient.serial,
      receiptNo: fu.receiptNo || generateReceiptNumber(patient),
      date: fu.date,
      amount: fu.fee || '500',
      visitType: fu.visitType || patient.visitType || 'Clinic',
      address: patient.address,
      age: patient.age,
      therapyFor: patient.diagnosis || 'Follow-up Physiotherapy Session',
      sessionFrom: fu.date,
      sessionTo: fu.date,
      paymentMethod: fu.paymentMethod || 'Cash',
    });
  };

  return (
    <div className="flex-1 overflow-y-auto p-3 sm:p-6 lg:p-8 transition-colors bg-slate-50 text-slate-800">
      <div className="max-w-4xl mx-auto space-y-5">
        {/* Deleted record banner */}
        {isDeleted && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 flex items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
              <div>
                <p className="text-xs font-bold text-rose-900">This patient chart is in Trash</p>
                <p className="text-[11px] text-rose-700">
                  Data is retained until permanently cleared. You can restore this patient anytime.
                </p>
              </div>
            </div>
            <button
              onClick={() => onRestorePatient(patient.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-bold border border-rose-300 transition-colors cursor-pointer shadow-2xs"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restore Patient</span>
            </button>
          </div>
        )}

        {/* Master Case Sheet Top Header Card */}
        <div className="bg-white rounded-3xl p-4 sm:p-6 border border-sky-100 shadow-xs space-y-4">
          <div className="flex flex-col md:flex-row md:items-start lg:items-center justify-between gap-3.5 pb-4 border-b border-sky-50">
            {/* Name and Reg No */}
            <div className="flex-1 space-y-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  id="btn-patient-id-badge"
                  onClick={handleDownloadCaseSheetPdf}
                  disabled={isGeneratingPdf}
                  className="font-mono text-xs font-bold text-sky-800 bg-sky-100 hover:bg-sky-200 active:bg-sky-300 border border-sky-300 px-2.5 py-1 rounded-lg shrink-0 flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs group"
                  title="Click Patient ID to download/view Complete Case Sheet PDF"
                >
                  {isGeneratingPdf ? (
                    <Loader2 className="w-3.5 h-3.5 text-sky-600 animate-spin shrink-0" />
                  ) : (
                    <Download className="w-3.5 h-3.5 text-sky-600 group-hover:scale-110 transition-transform shrink-0" />
                  )}
                  <span>Patient ID: {patient.regNo || formatPatientId(patient.date, patient.serial)}</span>
                  <span className="text-[9px] bg-sky-600 group-hover:bg-sky-700 text-white font-sans px-1.5 py-0.2 rounded font-extrabold uppercase tracking-wide">
                    PDF
                  </span>
                </button>
                <input
                  id="patient-name-input"
                  type="text"
                  value={patient.name}
                  onChange={(e) => updateField('name', e.target.value)}
                  placeholder="Patient Full Name *"
                  disabled={isDeleted}
                  className="text-lg sm:text-xl font-extrabold text-sky-950 placeholder-slate-400 outline-none border-b border-transparent focus:border-sky-500 bg-transparent flex-1 min-w-0"
                />
              </div>

              {/* PDF Download Success Banner */}
              {pdfSuccessToast && (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-semibold animate-fade-in">
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Case sheet PDF generated successfully!</span>
                </div>
              )}

              {/* Quick Details line */}
              <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                <span>Date: <b className="text-slate-800">{patient.date || '—'}</b></span>
                <span>•</span>
                <span>Time: <b className="text-slate-800 font-mono">{patient.time || formatTime24Hour(patient.createdAt)}</b></span>
                <span>•</span>
                <span>Mode: <b className="text-slate-800">{patient.visitType || 'Clinic'}</b></span>
                <span>•</span>
                <span>Fee Mode: <b className="text-sky-700 font-bold">{patient.paymentMethod || 'Cash'}</b></span>
                <span>•</span>
                <span>
                  Consultant: <b className="text-slate-800">{patient.seenBy || 'R. Chandrashekar'}</b>{' '}
                  <span className="text-[10px] text-slate-500 font-normal">
                    {locums.find((l) => l.name === patient.seenBy)?.qualification || (patient.seenBy === 'R. Chandrashekar' || !patient.seenBy ? 'BPT, MIAP' : '')}
                  </span>
                </span>
                {bmi && (
                  <>
                    <span>•</span>
                    <span className="px-2 py-0.5 rounded-md text-[11px] font-bold border border-sky-200 bg-sky-50 text-sky-900">
                      BMI {bmi.bmi} ({bmi.category})
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Top Right Action Controls: Red Close Button placed ABOVE Receipt and PDF buttons, with zero overflow across tab and mobile */}
            <div className="flex flex-col items-stretch sm:items-end gap-2 shrink-0 self-stretch sm:self-auto min-w-0">
              {onClosePatient && (
                <button
                  type="button"
                  id="close-patient-action-btn"
                  onClick={onClosePatient}
                  className="flex items-center justify-center text-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white border border-rose-700 text-xs font-bold transition-all cursor-pointer shadow-xs w-full sm:w-auto"
                  title="Close Patient Record (Show Sidebar Directory & No Patient Selected Screen)"
                >
                  <X className="w-3.5 h-3.5 text-white shrink-0 stroke-[2.5]" />
                  <span className="text-center whitespace-nowrap">Close Patient</span>
                </button>
              )}

              <div className="flex items-center justify-center sm:justify-end gap-1.5 w-full sm:w-auto flex-wrap">
                <button
                  type="button"
                  id="btn-case-sheet-receipt"
                  onClick={handleOpenInitialReceipt}
                  className="flex-1 sm:flex-initial flex items-center justify-center text-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 active:bg-emerald-200 text-emerald-700 border border-emerald-200 text-xs font-bold transition-colors cursor-pointer shadow-2xs whitespace-nowrap min-w-0"
                  title="Generate Official Consultation Receipt"
                >
                  <Receipt className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span className="text-center">Receipt</span>
                </button>

                <button
                  type="button"
                  id="btn-case-sheet-pdf"
                  onClick={handleDownloadCaseSheetPdf}
                  disabled={isGeneratingPdf}
                  className="flex-1 sm:flex-initial flex items-center justify-center text-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-50 hover:bg-sky-100 active:bg-sky-200 text-sky-800 border border-sky-200 text-xs font-bold transition-colors cursor-pointer shadow-2xs whitespace-nowrap min-w-0"
                  title="Download Complete Case Sheet PDF"
                >
                  {isGeneratingPdf ? (
                    <Loader2 className="w-3.5 h-3.5 text-sky-600 animate-spin shrink-0" />
                  ) : (
                    <Download className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                  )}
                  <span className="text-center">{isGeneratingPdf ? 'Saving PDF...' : 'PDF'}</span>
                </button>

                {!isDeleted ? (
                  <button
                    type="button"
                    id="btn-case-sheet-delete"
                    onClick={() => setShowDeletePatientModal(true)}
                    className="flex items-center justify-center text-center p-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 text-xs transition-colors cursor-pointer shadow-2xs shrink-0"
                    title="Delete Patient Record"
                  >
                    <Trash2 className="w-4 h-4 shrink-0" />
                  </button>
                ) : (
                  <button
                    type="button"
                    id="btn-case-sheet-restore"
                    onClick={() => onRestorePatient(patient.id)}
                    className="flex items-center justify-center text-center p-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs transition-colors cursor-pointer shadow-2xs shrink-0"
                    title="Restore patient"
                  >
                    <RotateCcw className="w-4 h-4 shrink-0" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Sub-Navigation Tabs with Order Flow, Dynamic Starry Indicator & Responsive Layout */}
          <div className="pt-2 border-t border-sky-100">
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>Clinical Workflow (Follow Steps in Order 1 ➔ 2 ➔ 3):</span>
              </span>
              <span className="text-[10px] font-mono text-slate-400">
                Step {activeSubTab === 'diagnosis' ? '1' : activeSubTab === 'modalities' ? '2' : '3'} of 3
              </span>
            </div>

            {/* Container: If width permits, appears on the SAME line. On narrow mobile phones and tablet view, listed below one another */}
            <nav
              className="flex flex-col lg:flex-row lg:items-center gap-2 p-1.5 bg-slate-50/80 rounded-2xl border border-sky-100/80 shadow-2xs"
              aria-label="Clinical workflow steps"
            >
              {/* STEP 1: Assessment & Demographics */}
              <button
                type="button"
                id="tab-step-1-assessment"
                onClick={() => setActiveSubTab('diagnosis')}
                className={`w-full lg:flex-1 p-2.5 sm:px-3 sm:py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-between gap-2 border relative overflow-hidden group ${
                  activeSubTab === 'diagnosis'
                    ? 'bg-sky-600 text-white border-sky-700 shadow-xs ring-2 ring-sky-300'
                    : 'bg-white text-slate-700 border-sky-200 hover:bg-sky-50/60 hover:text-sky-950'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[10.5px] font-black shrink-0 ${
                      activeSubTab === 'diagnosis'
                        ? 'bg-white text-sky-700'
                        : 'bg-sky-100 text-sky-800'
                    }`}
                  >
                    1
                  </span>
                  <Stethoscope className={`w-3.5 h-3.5 shrink-0 ${activeSubTab === 'diagnosis' ? 'text-white' : 'text-sky-600'}`} />
                  <span className="truncate">1. Assessment & Demographics</span>
                </div>

                {activeSubTab === 'diagnosis' ? (
                  <Sparkles className="w-4 h-4 text-amber-300 animate-pulse shrink-0" title="Active Step" />
                ) : (
                  <span className="text-[9.5px] uppercase font-bold text-sky-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    Go ➔
                  </span>
                )}
              </button>

              {/* Arrow Indicator: Right on desktop, Down on mobile/tablet */}
              <div className="flex items-center justify-center shrink-0 text-sky-400">
                <ArrowRight className="hidden lg:block w-4 h-4" />
                <ArrowDown className="block lg:hidden w-3.5 h-3.5 text-sky-300" />
              </div>

              {/* STEP 2: Modalities & Fee */}
              <button
                type="button"
                id="tab-step-2-modalities"
                onClick={() => setActiveSubTab('modalities')}
                className={`w-full lg:flex-1 p-2.5 sm:px-3 sm:py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-between gap-2 border relative overflow-hidden group ${
                  activeSubTab === 'modalities'
                    ? 'bg-indigo-600 text-white border-indigo-700 shadow-xs ring-2 ring-indigo-300'
                    : 'bg-white text-slate-700 border-indigo-200 hover:bg-indigo-50/60 hover:text-indigo-950'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[10.5px] font-black shrink-0 ${
                      activeSubTab === 'modalities'
                        ? 'bg-white text-indigo-700'
                        : 'bg-indigo-100 text-indigo-800'
                    }`}
                  >
                    2
                  </span>
                  <Activity className={`w-3.5 h-3.5 shrink-0 ${activeSubTab === 'modalities' ? 'text-white' : 'text-indigo-600'}`} />
                  <span className="truncate">2. Modalities & Fee</span>
                </div>

                {activeSubTab === 'modalities' ? (
                  <Sparkles className="w-4 h-4 text-amber-300 animate-pulse shrink-0" title="Active Step" />
                ) : (
                  <span className="text-[9.5px] uppercase font-bold text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    Go ➔
                  </span>
                )}
              </button>

              {/* Arrow Indicator: Right on desktop, Down on mobile/tablet */}
              <div className="flex items-center justify-center shrink-0 text-indigo-400">
                <ArrowRight className="hidden lg:block w-4 h-4" />
                <ArrowDown className="block lg:hidden w-3.5 h-3.5 text-indigo-300" />
              </div>

              {/* STEP 3: Follow-up Sessions */}
              <button
                type="button"
                id="tab-step-3-followups"
                onClick={() => setActiveSubTab('followups')}
                className={`w-full lg:flex-1 p-2.5 sm:px-3 sm:py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-between gap-2 border relative overflow-hidden group ${
                  activeSubTab === 'followups'
                    ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs ring-2 ring-emerald-300'
                    : 'bg-white text-slate-700 border-emerald-200 hover:bg-emerald-50/60 hover:text-emerald-950'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[10.5px] font-black shrink-0 ${
                      activeSubTab === 'followups'
                        ? 'bg-white text-emerald-700'
                        : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    3
                  </span>
                  <Calendar className={`w-3.5 h-3.5 shrink-0 ${activeSubTab === 'followups' ? 'text-white' : 'text-emerald-600'}`} />
                  <span className="truncate">3. Follow-up Sessions</span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold border ${
                      activeSubTab === 'followups'
                        ? 'bg-white text-emerald-800 border-white/40'
                        : 'bg-emerald-100 text-emerald-800 border-emerald-200'
                    }`}
                  >
                    {patient.followUps?.length || 0}
                  </span>
                  {activeSubTab === 'followups' && (
                    <Sparkles className="w-4 h-4 text-amber-200 animate-pulse shrink-0" title="Active Step" />
                  )}
                </div>
              </button>
            </nav>
          </div>
        </div>

        {/* SUBTAB 1: Assessment & Demographics */}
        {activeSubTab === 'diagnosis' && (
          <div className="space-y-5">
            {/* Banner placed right below the Patient ID details container */}
            <div className="p-4 sm:p-5 bg-indigo-50/85 border border-indigo-200 rounded-3xl flex flex-col gap-3 shadow-2xs">
              <div className="flex items-start gap-2.5">
                <Sparkles className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <h4 className="text-xs font-extrabold text-indigo-950">Done with Assessment & Demographics?</h4>
                  <p className="text-[11px] text-indigo-800 mt-0.5">Proceed to Step 2 to configure treatment modalities and consultation fees.</p>
                </div>
              </div>
              <div className="pt-0.5 flex">
                <button
                  type="button"
                  onClick={() => setActiveSubTab('modalities')}
                  className="w-full sm:w-auto px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>Proceed to 2. Modalities & Fee</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Demographics Card */}
            <div className="bg-white rounded-3xl p-5 sm:p-6 border border-sky-100 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-sky-50">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-sky-950 flex items-center gap-1.5">
                  <ClipboardList className="w-4 h-4 text-sky-600" />
                  <span>Patient Demographics</span>
                </h3>

                {/* Seen By: Dropdown of Locum Tenens Physiotherapists - Fully responsive, never overflows screen */}
                <div className="flex items-center gap-2 w-full sm:w-auto min-w-0">
                  <label htmlFor="seen-by-physio-select" className="text-xs font-bold text-slate-700 flex items-center gap-1 whitespace-nowrap shrink-0">
                    <UserCheck className="w-3.5 h-3.5 text-sky-600" />
                    <span>Seen by:</span>
                  </label>
                  <select
                    id="seen-by-physio-select"
                    value={patient.seenBy || locums[0]?.name || 'R. Chandrashekar'}
                    onChange={(e) => updateField('seenBy', e.target.value)}
                    disabled={isDeleted}
                    className="flex-1 sm:flex-initial min-w-0 w-full sm:w-auto max-w-full sm:max-w-xs md:max-w-sm px-3 py-1.5 bg-sky-50 border border-sky-200 text-sky-950 rounded-xl text-xs font-bold focus:border-sky-500 focus:ring-1 focus:ring-sky-200 outline-none cursor-pointer shadow-2xs truncate"
                  >
                    {locums.map((pt) => (
                      <option key={pt.id} value={pt.name}>
                        {pt.name} {pt.qualification ? `• ${pt.qualification}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 1: Age, Sex, Height, Weight */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                {/* Age */}
                <div>
                  <div className="h-5 flex items-center mb-1">
                    <label className="block text-[11px] font-bold text-slate-600">Age (Years)</label>
                  </div>
                  <input
                    type="number"
                    value={patient.age}
                    onChange={(e) => updateField('age', e.target.value)}
                    placeholder="e.g. 45"
                    disabled={isDeleted}
                    className="w-full px-3 py-2 bg-white border border-slate-200 text-slate-900 rounded-xl focus:border-sky-500 focus:ring-1 focus:ring-sky-200 outline-none font-semibold shadow-2xs h-10"
                  />
                </div>

                {/* Sex */}
                <div>
                  <div className="h-5 flex items-center mb-1">
                    <label className="block text-[11px] font-bold text-slate-600">Sex</label>
                  </div>
                  <select
                    value={patient.sex || 'Male'}
                    onChange={(e) => updateField('sex', e.target.value as any)}
                    disabled={isDeleted}
                    className="w-full px-3 py-2 bg-white border border-slate-200 text-slate-900 rounded-xl focus:border-sky-500 focus:ring-1 focus:ring-sky-200 outline-none font-semibold cursor-pointer shadow-2xs h-10"
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                {/* Height */}
                <div>
                  <div className="h-5 flex items-center mb-1">
                    <label className="block text-[11px] font-bold text-slate-600">Height (e.g. 5'7")</label>
                  </div>
                  <input
                    type="text"
                    value={patient.height}
                    onChange={(e) => updateField('height', e.target.value)}
                    placeholder="5'7&quot; or cm"
                    list="height-presets"
                    disabled={isDeleted}
                    className="w-full px-3 py-2 bg-white border border-slate-200 text-slate-900 rounded-xl focus:border-sky-500 focus:ring-1 focus:ring-sky-200 outline-none font-semibold shadow-2xs h-10"
                  />
                  <datalist id="height-presets">
                    {HEIGHT_PRESETS.map((h) => (
                      <option key={h} value={h} />
                    ))}
                  </datalist>
                </div>

                {/* Weight */}
                <div>
                  <div className="h-5 flex items-center mb-1">
                    <label className="block text-[11px] font-bold text-slate-600">Weight (kg)</label>
                  </div>
                  <input
                    type="number"
                    value={patient.weight}
                    onChange={(e) => updateField('weight', e.target.value)}
                    placeholder="e.g. 68"
                    disabled={isDeleted}
                    className="w-full px-3 py-2 bg-white border border-slate-200 text-slate-900 rounded-xl focus:border-sky-500 focus:ring-1 focus:ring-sky-200 outline-none font-semibold shadow-2xs h-10"
                  />
                </div>
              </div>

              {/* Row 2: Blood Group, Contact Phone, Visit Type, Referred By (Unified Single Row in Tab & Desktop) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs items-end">
                {/* Blood Group */}
                <div>
                  <div className="h-5 flex items-center justify-between mb-1">
                    <label className="block text-[11px] font-bold text-slate-600">Blood Group</label>
                  </div>
                  <select
                    value={patient.bloodGroup || 'O+'}
                    onChange={(e) => updateField('bloodGroup', e.target.value)}
                    disabled={isDeleted}
                    className="w-full px-3 py-2 bg-white border border-slate-200 text-slate-900 rounded-xl focus:border-sky-500 focus:ring-1 focus:ring-sky-200 outline-none font-semibold cursor-pointer shadow-2xs h-10"
                  >
                    {BLOOD_GROUPS.map((bg) => (
                      <option key={bg} value={bg}>
                        {bg}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Phone */}
                <div>
                  <div className="h-5 flex items-center justify-between mb-1">
                    <label className="block text-[11px] font-bold text-slate-600 truncate">Contact Phone</label>
                    <button
                      type="button"
                      id="btn-whatsapp-menu"
                      onClick={() => {
                        setCustomPhone(patient.contact || '');
                        setWhatsAppModalOpen(true);
                      }}
                      className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-1.5 py-0.5 rounded-lg cursor-pointer transition-colors shadow-2xs shrink-0"
                      title="Send Clinical Report, All Receipts, or Both via WhatsApp"
                    >
                      <MessageSquare className="w-2.5 h-2.5 text-emerald-600" />
                      <span>WhatsApp</span>
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5 h-10">
                    <input
                      type="text"
                      value={patient.contact}
                      onChange={(e) => updateField('contact', e.target.value)}
                      placeholder="e.g. 9880517715"
                      disabled={isDeleted}
                      className="w-full px-3 py-2 bg-white border border-slate-200 text-slate-900 rounded-xl focus:border-sky-500 focus:ring-1 focus:ring-sky-200 outline-none font-semibold font-mono shadow-2xs h-10"
                    />
                    <button
                      type="button"
                      id="btn-quick-whatsapp"
                      onClick={() => {
                        setCustomPhone(patient.contact || '');
                        setWhatsAppModalOpen(true);
                      }}
                      className="shrink-0 w-10 h-10 flex items-center justify-center bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-xs transition-colors cursor-pointer"
                      title="Send Report & Receipts via WhatsApp"
                      aria-label="WhatsApp Report & Receipts Menu"
                    >
                      <MessageSquare className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Visit Type */}
                <div>
                  <div className="h-5 flex items-center justify-between mb-1">
                    <label className="block text-[11px] font-bold text-slate-600">Visit Type</label>
                  </div>
                  <select
                    value={patient.visitType || 'Clinic'}
                    onChange={(e) => updateField('visitType', e.target.value as any)}
                    disabled={isDeleted}
                    className="w-full px-3 py-2 bg-white border border-slate-200 text-slate-900 rounded-xl focus:border-sky-500 focus:ring-1 focus:ring-sky-200 outline-none font-semibold cursor-pointer shadow-2xs h-10"
                  >
                    <option value="Clinic">Clinic Visit</option>
                    <option value="Home Visit">Home Visit</option>
                  </select>
                </div>

                {/* Referred By Dropdown with Add Common Referral Doctor */}
                <div>
                  <div className="h-5 flex items-center justify-between mb-1">
                    <label className="block text-[11px] font-bold text-slate-600 truncate">Referred By</label>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => setShowManageDoctorsModal(true)}
                        className="text-[10px] font-bold text-slate-500 hover:text-sky-700 transition-colors flex items-center gap-0.5 cursor-pointer"
                        title="Manage referral doctors (Add or Remove)"
                      >
                        <Settings2 className="w-2.5 h-2.5" />
                        <span>Manage</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsAddingNewDoc(!isAddingNewDoc)}
                        className="text-[10px] font-bold text-sky-600 hover:text-sky-800 transition-colors flex items-center gap-0.5 cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                        <span>{isAddingNewDoc ? 'Cancel' : '+ Add'}</span>
                      </button>
                    </div>
                  </div>

                  {isAddingNewDoc ? (
                    <div className="flex items-center gap-1.5 h-10">
                      <input
                        type="text"
                        value={newDocInput}
                        onChange={(e) => setNewDocInput(e.target.value)}
                        placeholder="e.g. Dr. Kumar (Ortho)"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddNewReferralDoc();
                          }
                        }}
                        className="flex-1 px-3 py-1.5 bg-white border border-sky-300 rounded-xl text-xs font-semibold text-slate-900 focus:ring-1 focus:ring-sky-300 outline-none shadow-2xs h-10"
                      />
                      <button
                        type="button"
                        onClick={handleAddNewReferralDoc}
                        className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold shadow-2xs cursor-pointer h-10"
                      >
                        Save
                      </button>
                    </div>
                  ) : (
                    <select
                      value={patient.referredBy || 'Self / Direct'}
                      onChange={(e) => {
                        if (e.target.value === '__add_new__') {
                          setIsAddingNewDoc(true);
                        } else if (e.target.value === '__manage_docs__') {
                          setShowManageDoctorsModal(true);
                        } else {
                          updateField('referredBy', e.target.value);
                        }
                      }}
                      disabled={isDeleted}
                      className="w-full px-3 py-2 bg-white border border-slate-200 text-slate-900 rounded-xl focus:border-sky-500 focus:ring-1 focus:ring-sky-200 outline-none font-semibold cursor-pointer shadow-2xs h-10"
                    >
                      {patient.referredBy && !referralDocs.includes(patient.referredBy) && (
                        <option value={patient.referredBy}>{patient.referredBy}</option>
                      )}
                      {referralDocs.map((doc) => (
                        <option key={doc} value={doc}>
                          {doc}
                        </option>
                      ))}
                      <option value="__add_new__">+ Add New Referral Doctor...</option>
                      <option value="__manage_docs__">⚙️ Manage Doctor List (Add/Remove)...</option>
                    </select>
                  )}
                </div>
              </div>

              {/* Full Address */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Residential Address</label>
                <input
                  type="text"
                  value={patient.address}
                  onChange={(e) => updateField('address', e.target.value)}
                  placeholder="Street address, Locality, Mysuru"
                  disabled={isDeleted}
                  className="w-full px-3 py-2 bg-white border border-slate-200 text-slate-900 rounded-xl focus:border-sky-500 focus:ring-1 focus:ring-sky-200 outline-none font-medium text-xs shadow-2xs"
                />
              </div>
            </div>

            {/* Clinical Diagnosis & History Card */}
            <div className="bg-white rounded-3xl p-5 sm:p-6 border border-sky-100 shadow-xs space-y-4">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-sky-950 flex items-center gap-1.5">
                <Stethoscope className="w-4 h-4 text-sky-600" />
                <span>Clinical Diagnosis & Assessment</span>
              </h3>

              {/* Diagnosis Input */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-[11px] font-bold text-slate-600">
                    Primary Clinical Diagnosis *
                  </label>
                  <span className="text-[10px] text-sky-700 font-semibold bg-sky-50 px-2 py-0.5 rounded-md border border-sky-200">
                    Select preset or type your own
                  </span>
                </div>

                {/* Preset Dropdown */}
                <select
                  disabled={isDeleted}
                  value={COMMON_DIAGNOSES.includes(patient.diagnosis) ? patient.diagnosis : (patient.diagnosis ? '__custom__' : '')}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '__custom__') {
                      if (COMMON_DIAGNOSES.includes(patient.diagnosis)) {
                        updateField('diagnosis', '');
                      }
                    } else if (val) {
                      updateField('diagnosis', val);
                    }
                  }}
                  className="w-full px-3 py-2 bg-white border border-slate-200 text-slate-800 rounded-xl focus:border-sky-500 outline-none text-xs font-semibold shadow-2xs cursor-pointer"
                >
                  <option value="">— Select from Common Diagnoses (or type below) —</option>
                  {COMMON_DIAGNOSES.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                  <option value="__custom__">✎ Other / Type Custom Diagnosis (Type below)...</option>
                </select>

                <input
                  type="text"
                  value={patient.diagnosis}
                  onChange={(e) => updateField('diagnosis', e.target.value)}
                  placeholder="e.g. Cervical Spondylosis, Lumbar Disc Herniation, Frozen Shoulder..."
                  disabled={isDeleted}
                  className="w-full px-3 py-2.5 bg-white border border-slate-200 text-slate-900 rounded-xl focus:border-sky-500 focus:ring-1 focus:ring-sky-200 outline-none font-bold text-sm shadow-2xs"
                />

                {/* Quick diagnosis chips */}
                <div className="flex items-center gap-1.5 flex-wrap mt-1">
                  <span className="text-[10px] text-slate-500 font-semibold">Common:</span>
                  {COMMON_DIAGNOSES.slice(0, 6).map((diag) => (
                    <button
                      type="button"
                      key={diag}
                      onClick={() => updateField('diagnosis', diag)}
                      disabled={isDeleted}
                      className={`text-[10px] px-2 py-0.5 rounded-lg border transition-colors cursor-pointer ${
                        patient.diagnosis === diag
                          ? 'bg-sky-600 text-white border-sky-600 font-bold'
                          : 'bg-slate-100 hover:bg-sky-50 hover:text-sky-900 text-slate-700 border-slate-200'
                      }`}
                    >
                      {diag}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      if (COMMON_DIAGNOSES.includes(patient.diagnosis)) {
                        updateField('diagnosis', '');
                      }
                      const el = document.querySelector('input[placeholder*="e.g. Cervical Spondylosis"]') as HTMLInputElement;
                      if (el) el.focus();
                    }}
                    disabled={isDeleted}
                    className={`text-[10px] px-2 py-0.5 rounded-lg border transition-colors cursor-pointer ${
                      patient.diagnosis && !COMMON_DIAGNOSES.includes(patient.diagnosis)
                        ? 'bg-indigo-600 text-white border-indigo-600 font-bold'
                        : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
                    }`}
                  >
                    + Other / Custom
                  </button>
                </div>
              </div>

              {/* Chief Complaints & Clinical History */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Chief Complaints, On Examination & Clinical History
                </label>
                <textarea
                  rows={4}
                  value={patient.history}
                  onChange={(e) => updateField('history', e.target.value)}
                  placeholder="Describe patient's pain onset, aggravating/relieving factors, postural alignment, range of motion limitations, tenderness, sensory changes..."
                  disabled={isDeleted}
                  className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl focus:border-sky-500 focus:ring-1 focus:ring-sky-200 outline-none text-xs font-normal text-slate-800 leading-relaxed shadow-2xs"
                />
              </div>

              {/* Pain Scale in Clinical Diagnosis (Before & After Treatment) */}
              <div className="space-y-2 pt-1 border-t border-sky-50">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <span className="text-[11px] font-extrabold text-slate-700">
                      Pain Scale Assessment (VAS 0–10 Score)
                    </span>
                    <PainImprovementBadge
                      before={patient.painScaleBefore}
                      after={patient.painScaleAfter}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowPainModal(true)}
                    className="text-[11px] font-bold text-sky-700 hover:text-sky-900 flex items-center gap-1 cursor-pointer bg-sky-50 hover:bg-sky-100 px-2.5 py-1 rounded-xl border border-sky-200 transition-colors shadow-2xs"
                    title="View full pain recovery trajectory and chart"
                  >
                    <TrendingDown className="w-3.5 h-3.5 text-sky-600" />
                    <span>View Pain Score Improvement</span>
                  </button>
                </div>

                <PainScaleComponent
                  beforeValue={patient.painScaleBefore ?? patient.painScale}
                  afterValue={patient.painScaleAfter}
                  onChangeBefore={(val) => {
                    onUpdatePatient({
                      ...patient,
                      painScaleBefore: val,
                      painScale: val,
                      updatedAt: Date.now(),
                    });
                  }}
                  onChangeAfter={(val) => {
                    onUpdatePatient({
                      ...patient,
                      painScaleAfter: val,
                      updatedAt: Date.now(),
                    });
                  }}
                  disabled={isDeleted}
                />
              </div>

              {/* Co-morbidities */}
              <div className="pt-2">
                <label className="block text-[11px] font-bold text-slate-600 mb-2">
                  Co-morbid Medical Conditions
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5 sm:gap-3 p-1">
                  <button
                    type="button"
                    onClick={() => toggleComorbid('diabetes')}
                    disabled={isDeleted}
                    className={`w-full max-w-full flex items-center justify-center text-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-semibold transition-colors cursor-pointer min-h-[46px] ${
                      patient.comorbid?.diabetes
                        ? 'bg-amber-50 border-amber-300 text-amber-900 shadow-2xs'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border ${
                        patient.comorbid?.diabetes ? 'bg-amber-500 border-amber-500 text-white font-bold' : 'border-slate-300'
                      }`}
                    >
                      {patient.comorbid?.diabetes && <Check className="w-3 h-3 stroke-[2.5]" />}
                    </div>
                    <span className="text-center leading-tight break-words min-w-0 max-w-full">Diabetes Mellitus</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleComorbid('bp')}
                    disabled={isDeleted}
                    className={`w-full max-w-full flex items-center justify-center text-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-semibold transition-colors cursor-pointer min-h-[46px] ${
                      patient.comorbid?.bp
                        ? 'bg-rose-50 border-rose-300 text-rose-900 shadow-2xs'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border ${
                        patient.comorbid?.bp ? 'bg-rose-500 border-rose-500 text-white font-bold' : 'border-slate-300'
                      }`}
                    >
                      {patient.comorbid?.bp && <Check className="w-3 h-3 stroke-[2.5]" />}
                    </div>
                    <span className="text-center leading-tight break-words min-w-0 max-w-full">Hypertension (BP)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleComorbid('thyroid')}
                    disabled={isDeleted}
                    className={`w-full max-w-full flex items-center justify-center text-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-semibold transition-colors cursor-pointer min-h-[46px] ${
                      patient.comorbid?.thyroid
                        ? 'bg-purple-50 border-purple-300 text-purple-900 shadow-2xs'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border ${
                        patient.comorbid?.thyroid ? 'bg-purple-500 border-purple-500 text-white font-bold' : 'border-slate-300'
                      }`}
                    >
                      {patient.comorbid?.thyroid && <Check className="w-3 h-3 stroke-[2.5]" />}
                    </div>
                    <span className="text-center leading-tight break-words min-w-0 max-w-full">Thyroid Disorder</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleComorbid('other')}
                    disabled={isDeleted}
                    className={`w-full max-w-full flex items-center justify-center text-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-semibold transition-colors cursor-pointer min-h-[46px] ${
                      patient.comorbid?.other
                        ? 'bg-sky-50 border-sky-300 text-sky-900 shadow-2xs'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border ${
                        patient.comorbid?.other ? 'bg-sky-600 border-sky-600 text-white font-bold' : 'border-slate-300'
                      }`}
                    >
                      {patient.comorbid?.other && <Check className="w-3 h-3 stroke-[2.5]" />}
                    </div>
                    <span className="text-center leading-tight break-words min-w-0 max-w-full">Other Condition</span>
                  </button>
                </div>

                {patient.comorbid?.other && (
                  <div className="mt-2">
                    <input
                      type="text"
                      value={patient.comorbid?.otherText || ''}
                      onChange={(e) =>
                        updateField('comorbid', { ...patient.comorbid, otherText: e.target.value })
                      }
                      placeholder="Specify other medical conditions / surgeries..."
                      disabled={isDeleted}
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 shadow-2xs"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Proceed to Step 2 action button */}
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setActiveSubTab('modalities')}
                className="w-full sm:w-auto px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer shrink-0"
              >
                <span>Proceed to 2. Modalities & Fee</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* SUBTAB 2: Modalities & Treatment Fee */}
        {activeSubTab === 'modalities' && (
          <div className="space-y-5">
            {/* Instruction placed below the Patient ID details container */}
            <div className="p-4 sm:p-5 bg-emerald-50 border border-emerald-200 rounded-3xl flex flex-col gap-3 shadow-2xs">
              <div className="flex items-start gap-2.5">
                <Sparkles className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5 animate-bounce" />
                <div className="min-w-0">
                  <h4 className="text-xs font-extrabold text-emerald-950">Next in Order: Step 3 — Follow-up Sessions</h4>
                  <p className="text-[11px] text-emerald-800 mt-0.5">Log recurring treatment visits, pain progression (VAS scores), and follow-up fee receipts.</p>
                </div>
              </div>
              <div className="pt-0.5 flex">
                <button
                  type="button"
                  onClick={() => setActiveSubTab('followups')}
                  className="w-full sm:w-auto px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>Proceed to 3. Follow-up Sessions</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modalities Selection Card */}
            <div className="bg-white rounded-3xl p-5 sm:p-6 border border-sky-100 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-sky-950 flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-sky-600" />
                  <span>Initial Physiotherapy Modalities & Interventions</span>
                </h3>
                <span className="text-[11px] font-bold text-sky-800 bg-sky-100 px-2.5 py-1 rounded-full border border-sky-200 font-mono">
                  {MODALITIES_LIST.filter((m) => patient.treatment && patient.treatment[m.key]).length} Selected
                </span>
              </div>

              {/* Interactive Modality Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {MODALITIES_LIST.map((mod) => {
                  const isChecked = !!(patient.treatment && patient.treatment[mod.key]);
                  return (
                    <div
                      key={mod.key}
                      onClick={() => !isDeleted && toggleModality(mod.key)}
                      className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-start gap-2.5 ${
                        isChecked
                          ? 'bg-sky-50/80 border-sky-300 shadow-xs'
                          : 'bg-white border-slate-200 hover:border-sky-200 hover:bg-sky-50/30'
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded mt-0.5 flex items-center justify-center shrink-0 border ${
                          isChecked ? 'bg-sky-600 border-sky-600 text-white font-bold' : 'border-slate-300 bg-slate-50'
                        }`}
                      >
                        {isChecked && <Check className="w-3 h-3" />}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <p className={`text-xs font-bold ${isChecked ? 'text-sky-950' : 'text-slate-800'}`}>
                            {mod.label}
                          </p>
                        </div>
                        <p className="text-[10px] text-slate-500 leading-tight mt-0.5 line-clamp-2">
                          {mod.description}
                        </p>
                        <span className="inline-block mt-1 text-[9px] font-mono font-bold text-sky-800 bg-sky-100/60 border border-sky-200/60 px-1.5 py-0.2 rounded">
                          {mod.category}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Other Modality custom input */}
              <div className="pt-2 border-t border-sky-50">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="other-modality-check"
                    checked={!!patient.treatment?.other}
                    onChange={() => toggleModality('other')}
                    disabled={isDeleted}
                    className="w-4 h-4 rounded bg-white border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer"
                  />
                  <label htmlFor="other-modality-check" className="text-xs font-bold text-slate-700 cursor-pointer">
                    Other Customized Intervention
                  </label>
                </div>
                {patient.treatment?.other && (
                  <div className="mt-2 pl-6">
                    <input
                      type="text"
                      value={patient.treatment?.otherText || ''}
                      onChange={(e) =>
                        updateField('treatment', { ...patient.treatment, otherText: e.target.value })
                      }
                      placeholder="e.g. Dry Needling, Kinesiology Taping, Trigger Point Therapy..."
                      disabled={isDeleted}
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 shadow-2xs"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Treatment Fee & Billing Card with Explicit Payment Modes */}
            <div className="bg-white rounded-3xl p-5 sm:p-6 border border-sky-100 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-sky-950 flex items-center gap-1.5">
                  <DollarSign className="w-4 h-4 text-emerald-600" />
                  <span>Consultation Fee & Payment Collection</span>
                </h3>
                <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                  Mode: {patient.paymentMethod || 'Cash'}
                </span>
              </div>

              {/* Fee Amount and Presets */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-700">Fee Amount: ₹</span>
                  <input
                    type="number"
                    value={patient.treatmentFee}
                    onChange={(e) => updateField('treatmentFee', e.target.value)}
                    placeholder="500"
                    disabled={isDeleted}
                    className="w-28 px-3 py-2 bg-white border border-slate-200 rounded-xl text-base font-extrabold font-mono text-emerald-700 focus:border-sky-500 focus:ring-1 focus:ring-sky-200 outline-none shadow-2xs"
                  />
                  <span className="text-xs text-slate-500 font-medium">/ session</span>
                </div>

                {/* Quick fee presets */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] text-slate-500 font-semibold">Presets:</span>
                  {['400', '500', '600', '700', '800', '1000'].map((amt) => (
                    <button
                      type="button"
                      key={amt}
                      onClick={() => updateField('treatmentFee', amt)}
                      disabled={isDeleted}
                      className={`text-xs px-2.5 py-1 rounded-xl font-bold font-mono transition-colors cursor-pointer ${
                        String(patient.treatmentFee) === amt
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
                      }`}
                    >
                      ₹{amt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Payment Mode Selection when Collecting Fee */}
              <div className="pt-3 border-t border-slate-100 space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5 text-sky-600" />
                    <span>Select Payment Collection Mode:</span>
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Will reflect directly in Fee Collected & Monthly statements
                  </span>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {PAYMENT_MODES.map((mode) => {
                    const isSelected = (patient.paymentMethod || 'Cash') === mode;
                    return (
                      <button
                        type="button"
                        key={mode}
                        onClick={() => updateField('paymentMethod', mode)}
                        disabled={isDeleted}
                        className={`text-xs px-3.5 py-1.5 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                          isSelected
                            ? 'bg-sky-600 text-white shadow-xs ring-2 ring-sky-200'
                            : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200'
                        }`}
                      >
                        <span>{mode}</span>
                        {isSelected && <Check className="w-3.5 h-3.5" />}
                      </button>
                    );
                  })}

                  <div className="sm:ml-auto">
                    <button
                      type="button"
                      onClick={handleOpenInitialReceipt}
                      className="flex items-center gap-1.5 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer"
                    >
                      <Receipt className="w-3.5 h-3.5" />
                      <span>Issue Receipt ({patient.paymentMethod || 'Cash'})</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Proceed to Step 3 action button */}
            <div className="flex justify-end pt-2">
              <button
                type="button"
                id="btn-proceed-to-followups"
                onClick={() => setActiveSubTab('followups')}
                className="w-full sm:w-auto px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer shrink-0"
              >
                <span>Proceed to 3. Follow-up Sessions</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* SUBTAB 3: Follow-up Sessions */}
        {activeSubTab === 'followups' && (
          <div className="space-y-4">
            <div className="bg-white rounded-3xl p-4 sm:p-5 border border-sky-100 shadow-xs flex flex-col gap-3">
              {/* Complete text placed first */}
              <div className="w-full space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-bold text-sky-950">Follow-Up Rehabilitation Sessions</h3>
                  {patient.followUps && patient.followUps.length > 0 && (
                    <PainImprovementBadge
                      before={patient.painScaleBefore}
                      after={
                        patient.followUps[patient.followUps.length - 1]?.painScaleAfter ??
                        patient.followUps[patient.followUps.length - 1]?.painScale
                      }
                    />
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  Track ongoing treatment sessions, pain progression (VAS Before & After), payment modes, and receipts.
                </p>
              </div>

              {/* Next in order: Pain Improvement Chart & Add Session buttons */}
              <div className="flex flex-wrap items-center gap-2.5 pt-0.5">
                <button
                  type="button"
                  onClick={() => setShowPainModal(true)}
                  className="px-3.5 py-2.5 bg-sky-50 hover:bg-sky-100 text-sky-800 rounded-xl text-xs font-bold border border-sky-200 transition-colors cursor-pointer shadow-2xs flex items-center justify-center gap-1.5"
                  title="View full pain recovery trajectory and chart"
                >
                  <TrendingDown className="w-3.5 h-3.5 text-sky-600" />
                  <span>Pain Improvement Chart</span>
                </button>

                <button
                  id="add-followup-btn"
                  type="button"
                  onClick={handleAddFollowUp}
                  disabled={isDeleted}
                  className="px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Session #{ (patient.followUps?.length || 0) + 1 }</span>
                </button>
              </div>
            </div>

            {/* Follow-up Sessions List */}
            {(!patient.followUps || patient.followUps.length === 0) ? (
              <div className="bg-white rounded-3xl p-8 border border-sky-100 text-center space-y-3 shadow-xs">
                <Calendar className="w-8 h-8 mx-auto text-slate-300" />
                <p className="text-xs font-bold text-slate-700">No follow-up sessions recorded yet</p>
                <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                  Click the "Add Session" button above to record regular physiotherapy visits, treatments given, pain scale ratings, and payment receipts.
                </p>
                <button
                  type="button"
                  onClick={handleAddFollowUp}
                  disabled={isDeleted}
                  className="px-4 py-2 bg-sky-50 hover:bg-sky-100 text-sky-800 rounded-xl text-xs font-bold border border-sky-200 transition-colors inline-flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Record First Follow-up Visit</span>
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {patient.followUps.map((fu, idx) => {
                  const fuBefore = fu.painScaleBefore ?? fu.painScale ?? 5;
                  const fuAfter = fu.painScaleAfter;
                  const fuDiff = fuAfter !== undefined ? fuBefore - fuAfter : 0;

                  return (
                    <div
                      key={fu.id || idx}
                      className="bg-white rounded-3xl p-4 sm:p-5 border border-sky-100 shadow-xs space-y-3 hover:border-sky-200 transition-colors"
                    >
                      {/* Session Header */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-sky-50">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-sky-800 bg-sky-100 border border-sky-200 px-2 py-0.5 rounded-lg">
                            Session #{idx + 1}
                          </span>
                          <input
                            type="date"
                            value={fu.date}
                            onChange={(e) => handleUpdateFollowUp(idx, { date: e.target.value })}
                            disabled={isDeleted}
                            className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 font-semibold outline-none shadow-2xs"
                          />
                          <select
                            value={fu.visitType || 'Clinic'}
                            onChange={(e) => handleUpdateFollowUp(idx, { visitType: e.target.value as any })}
                            disabled={isDeleted}
                            className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 font-semibold outline-none cursor-pointer shadow-2xs"
                          >
                            <option value="Clinic">Clinic</option>
                            <option value="Home Visit">Home Visit</option>
                          </select>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                          {/* Follow up Fee input */}
                          <div className="flex items-center gap-1">
                            <span className="text-xs font-bold text-slate-600">Fee: ₹</span>
                            <input
                              type="number"
                              value={fu.fee}
                              onChange={(e) => handleUpdateFollowUp(idx, { fee: e.target.value })}
                              placeholder="500"
                              disabled={isDeleted}
                              className="w-20 px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold font-mono text-emerald-700 outline-none shadow-2xs"
                            />
                          </div>

                          {/* Payment Mode Selector for this Follow-up */}
                          <div className="flex items-center gap-1">
                            <span className="text-[11px] font-bold text-slate-600">Mode:</span>
                            <select
                              value={fu.paymentMethod || 'Cash'}
                              onChange={(e) => handleUpdateFollowUp(idx, { paymentMethod: e.target.value as any })}
                              disabled={isDeleted}
                              className="px-2 py-1 bg-sky-50 border border-sky-200 rounded-lg text-xs font-bold text-sky-900 outline-none cursor-pointer shadow-2xs"
                            >
                              <option value="Cash">Cash</option>
                              <option value="UPI">UPI</option>
                              <option value="Card">Card</option>
                              <option value="Bank Transfer">Bank Transfer</option>
                            </select>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleOpenFollowUpReceipt(fu)}
                            className="flex items-center gap-1 px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-2xs"
                          >
                            <Receipt className="w-3 h-3 text-emerald-600" />
                            <span>Receipt</span>
                          </button>

                          {!isDeleted && (
                            <button
                              type="button"
                              onClick={() => setDeleteFollowUpIdx(idx)}
                              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                              title="Remove session"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Notes & Treatment Modalities */}
                      <div className="space-y-2">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">
                            Progress & Clinical Treatment Notes
                          </label>
                          <input
                            type="text"
                            value={fu.notes}
                            onChange={(e) => handleUpdateFollowUp(idx, { notes: e.target.value })}
                            placeholder="e.g. Range of motion improved, pain reduced, exercises tolerated well..."
                            disabled={isDeleted}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium outline-none text-slate-800 focus:border-sky-500 focus:ring-1 focus:ring-sky-200 shadow-2xs"
                          />
                        </div>

                        {/* Follow-up Treatment Given Section with Custom Add/Delete */}
                        {(() => {
                          const selectedTreatments = getActiveTreatmentsForFollowUp(fu);
                          return (
                            <div className="pt-2 border-t border-slate-100 space-y-2">
                              <div className="flex items-center justify-between flex-wrap gap-2">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[11px] font-bold text-slate-700">Treatment Given:</span>
                                  {selectedTreatments.length > 0 && (
                                    <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 border border-sky-200">
                                      {selectedTreatments.length} applied
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    disabled={isDeleted}
                                    onClick={() => {
                                      if (addingTreatmentSessionIdx === idx) {
                                        setAddingTreatmentSessionIdx(null);
                                      } else {
                                        setAddingTreatmentSessionIdx(idx);
                                        setInlineTreatmentInput('');
                                      }
                                    }}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-lg transition-colors cursor-pointer"
                                  >
                                    <Plus className="w-3 h-3" />
                                    Add Treatment
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setShowManageTreatmentsModal(true)}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors cursor-pointer"
                                    title="Manage treatment list (add / delete treatments)"
                                  >
                                    <Settings2 className="w-3 h-3" />
                                    Manage List
                                  </button>
                                </div>
                              </div>

                              {/* Inline Quick Add Input Form */}
                              {addingTreatmentSessionIdx === idx && (
                                <div className="flex items-center gap-1.5 p-2 bg-sky-50/80 rounded-xl border border-sky-200 animate-in fade-in duration-150">
                                  <input
                                    type="text"
                                    value={inlineTreatmentInput}
                                    onChange={(e) => setInlineTreatmentInput(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        if (inlineTreatmentInput.trim()) {
                                          handleAddCustomTreatmentToClinic(inlineTreatmentInput, idx);
                                          setInlineTreatmentInput('');
                                          setAddingTreatmentSessionIdx(null);
                                        }
                                      } else if (e.key === 'Escape') {
                                        setAddingTreatmentSessionIdx(null);
                                      }
                                    }}
                                    placeholder="e.g. Laser Therapy, Shockwave, Acupressure..."
                                    className="flex-1 px-2.5 py-1 text-xs bg-white border border-sky-300 rounded-lg outline-none focus:ring-1 focus:ring-sky-400 text-slate-800 shadow-2xs"
                                    autoFocus
                                  />
                                  <button
                                    type="button"
                                    disabled={!inlineTreatmentInput.trim()}
                                    onClick={() => {
                                      if (inlineTreatmentInput.trim()) {
                                        handleAddCustomTreatmentToClinic(inlineTreatmentInput, idx);
                                        setInlineTreatmentInput('');
                                        setAddingTreatmentSessionIdx(null);
                                      }
                                    }}
                                    className="px-2.5 py-1 bg-sky-600 hover:bg-sky-700 disabled:opacity-40 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
                                  >
                                    + Add & Select
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setAddingTreatmentSessionIdx(null)}
                                    className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/50 cursor-pointer"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}

                              {/* Treatment Chips */}
                              <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                                {availableTreatments.map((treatment) => {
                                  const isSelected = selectedTreatments.includes(treatment);
                                  return (
                                    <button
                                      key={treatment}
                                      type="button"
                                      disabled={isDeleted}
                                      onClick={() => handleToggleTreatment(idx, treatment)}
                                      className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-lg border transition-all cursor-pointer ${
                                        isSelected
                                          ? 'bg-sky-600 text-white border-sky-600 shadow-2xs font-bold scale-[1.02]'
                                          : 'bg-white text-slate-700 border-slate-200 hover:border-sky-300 hover:bg-sky-50/50'
                                      }`}
                                    >
                                      {isSelected ? (
                                        <Check className="w-2.5 h-2.5 text-white stroke-[3]" />
                                      ) : (
                                        <span className="text-slate-400 text-[10px] font-normal">+</span>
                                      )}
                                      <span>{treatment}</span>
                                    </button>
                                  );
                                })}
                              </div>

                              {/* Selected summary */}
                              {selectedTreatments.length > 0 && (
                                <div className="text-[10px] text-slate-500 flex items-center justify-between pt-0.5">
                                  <span className="truncate">
                                    <span className="font-bold text-slate-700">Applied:</span> {selectedTreatments.join(', ')}
                                  </span>
                                  <button
                                    type="button"
                                    disabled={isDeleted}
                                    onClick={() => {
                                      handleUpdateFollowUp(idx, {
                                        treatmentsGiven: [],
                                        treatment: defaultTreatmentModalities(),
                                      });
                                    }}
                                    className="text-[10px] text-slate-400 hover:text-rose-600 ml-2 underline cursor-pointer shrink-0"
                                  >
                                    Clear all
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>

                      {/* Pain Scale in this Follow-up Session (Before & After) - Side by Side in Same Line on Tab & Desktop */}
                      <div className="pt-2 border-t border-sky-50 bg-sky-50/40 p-3 rounded-2xl border border-sky-100/60 space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 items-start">
                          {/* Before Treatment Pain */}
                          <div className="space-y-1.5 bg-white/70 p-2.5 rounded-xl border border-slate-200/70 shadow-2xs">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5 min-w-0">
                                <span className="truncate">Pain Before Session:</span>
                                <span className="text-[10px] text-slate-400 font-medium shrink-0">(VAS 0–10)</span>
                              </span>
                              <span
                                className={`text-[10px] sm:text-[11px] font-extrabold px-1.5 py-0.5 rounded-md border shrink-0 ${
                                  getPainSeverityInfo(fuBefore).bg
                                } ${getPainSeverityInfo(fuBefore).color} ${getPainSeverityInfo(fuBefore).border}`}
                              >
                                {getPainSeverityInfo(fuBefore).emoji} {fuBefore}/10 • {getPainSeverityInfo(fuBefore).label}
                              </span>
                            </div>
                            {/* Single Line 0-10 Grid Scale */}
                            <div className="grid grid-cols-11 gap-1 w-full">
                              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => (
                                <button
                                  key={v}
                                  type="button"
                                  disabled={isDeleted}
                                  onClick={() =>
                                    handleUpdateFollowUp(idx, {
                                      painScaleBefore: v,
                                      painScale: v,
                                    })
                                  }
                                  className={`h-7 sm:h-8 w-full rounded-lg border text-[11px] font-bold transition-all cursor-pointer flex items-center justify-center ${getPainScoreButtonClass(
                                    v,
                                    fuBefore
                                  )}`}
                                  title={`Pain Before: ${v}/10 - ${getPainSeverityInfo(v).label}`}
                                >
                                  {v}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* After Treatment Pain */}
                          <div className="space-y-1.5 bg-white/70 p-2.5 rounded-xl border border-slate-200/70 shadow-2xs">
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5 min-w-0">
                                  <span className="truncate">Pain After Session:</span>
                                  <span className="text-[10px] text-slate-400 font-medium shrink-0">(VAS 0–10)</span>
                                </span>
                                {fuAfter !== undefined && (
                                  <button
                                    type="button"
                                    disabled={isDeleted}
                                    onClick={() => handleUpdateFollowUp(idx, { painScaleAfter: undefined })}
                                    className="text-[10px] text-rose-600 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-1.5 py-0.5 rounded font-bold cursor-pointer transition-colors shrink-0"
                                    title="Clear after score"
                                  >
                                    Clear
                                  </button>
                                )}
                              </div>
                              {fuAfter !== undefined ? (
                                <span
                                  className={`text-[10px] sm:text-[11px] font-extrabold px-1.5 py-0.5 rounded-md border shrink-0 ${
                                    getPainSeverityInfo(fuAfter).bg
                                  } ${getPainSeverityInfo(fuAfter).color} ${getPainSeverityInfo(fuAfter).border}`}
                                >
                                  {getPainSeverityInfo(fuAfter).emoji} {fuAfter}/10 • {getPainSeverityInfo(fuAfter).label}
                                </span>
                              ) : (
                                <span className="text-[10px] font-semibold text-slate-400 italic shrink-0">Not rated</span>
                              )}
                            </div>
                            {/* Single Line 0-10 Grid Scale */}
                            <div className="grid grid-cols-11 gap-1 w-full">
                              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => (
                                <button
                                  key={v}
                                  type="button"
                                  disabled={isDeleted}
                                  onClick={() => handleUpdateFollowUp(idx, { painScaleAfter: v })}
                                  className={`h-7 sm:h-8 w-full rounded-lg border text-[11px] font-bold transition-all cursor-pointer flex items-center justify-center ${getPainScoreButtonClass(
                                    v,
                                    fuAfter
                                  )}`}
                                  title={`Pain After: ${v}/10 - ${getPainSeverityInfo(v).label}`}
                                >
                                  {v}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Session Relief Indicator */}
                        {fuAfter !== undefined && (
                          <div className="flex items-center justify-between text-[11px] pt-1.5 border-t border-sky-100 flex-wrap gap-1.5">
                            <span className="font-semibold text-slate-600 shrink-0">Session Pain Relief:</span>
                            <span
                              className={`font-bold px-2 py-0.5 rounded-md text-center max-w-full ${
                                fuDiff > 0
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : fuDiff === 0
                                  ? 'bg-slate-100 text-slate-700'
                                  : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              {fuDiff > 0
                                ? `↓ Improved by ${fuDiff} pts (${Math.round((fuDiff / (fuBefore || 1)) * 100)}% relief)`
                                : fuDiff === 0
                                ? 'No immediate change'
                                : `↑ Increased by ${Math.abs(fuDiff)} pts`}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Delete Patient Confirmation Modal with Warning */}
      {showDeletePatientModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-rose-200 space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl border border-rose-100 shrink-0">
                <AlertTriangle className="w-6 h-6 text-rose-600" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-extrabold text-slate-900">Are you sure you want to delete this patient?</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Warning: Patient record for <b className="text-slate-900 font-bold">{patient.name || 'this patient'}</b> (Reg No: <b className="font-mono">{patient.regNo || formatPatientId(patient.date, patient.serial)}</b>) will be moved to Trash.
                </p>
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1">
              <p className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                <span>Important Notice</span>
              </p>
              <p className="text-[11px] text-amber-800">
                Their clinical assessments, {patient.followUps?.length || 0} follow-up records, and fee history will be archived. You can still restore the record from the Trash filter if needed.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowDeletePatientModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDeletePatientModal(false);
                  onDeletePatient(patient.id);
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white transition-colors cursor-pointer shadow-xs flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Yes, Delete Record</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Follow-up Session Confirmation Modal */}
      {deleteFollowUpIdx !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-rose-200 space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl border border-rose-100 shrink-0">
                <AlertTriangle className="w-6 h-6 text-rose-600" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-extrabold text-slate-900">
                  Delete Follow-up Session #{deleteFollowUpIdx + 1}?
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Warning: Are you sure you want to permanently delete Session #{deleteFollowUpIdx + 1}? All notes and fee records logged in this session will be removed.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setDeleteFollowUpIdx(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDeleteFollowUp(deleteFollowUpIdx)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white transition-colors cursor-pointer shadow-xs flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Yes, Delete Session</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <ManageReferralDoctorsModal
        isOpen={showManageDoctorsModal}
        onClose={() => setShowManageDoctorsModal(false)}
        onDoctorsUpdated={(updated) => setReferralDocs(updated)}
        currentSelectedDoc={patient.referredBy}
        onSelectDoctor={(doc) => updateField('referredBy', doc)}
      />

      {/* WhatsApp Report & Receipts Share Modal */}
      {whatsAppModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-emerald-100 space-y-5">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shrink-0">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    Send via WhatsApp
                  </h3>
                  <p className="text-xs text-slate-500">
                    Patient: <b className="text-slate-800">{patient.name || 'Unnamed'}</b> (ID: {patient.regNo || formatPatientId(patient.date, patient.serial)})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setWhatsAppModalOpen(false)}
                className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Recipient Phone Number */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">Recipient Phone Number (WhatsApp)</label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  value={customPhone}
                  onChange={(e) => setCustomPhone(e.target.value)}
                  placeholder="e.g. 9880517715"
                  className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 focus:bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-200 outline-none"
                />
              </div>
              {customPhone && (
                <p className="text-[11px] text-slate-500 font-mono">
                  Standardized link: <b>wa.me/{getCleanPhone(customPhone) || '...'}</b>
                </p>
              )}
            </div>

            {/* Format Selection: PDF Document vs Text Message */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">Select Format:</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setWhatsAppFormat('pdf')}
                  className={`p-2.5 rounded-2xl border text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
                    whatsAppFormat === 'pdf'
                      ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs ring-2 ring-emerald-200'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <FileText className="w-4 h-4" />
                  <span>Official PDF Document</span>
                </button>
                <button
                  type="button"
                  onClick={() => setWhatsAppFormat('text')}
                  className={`p-2.5 rounded-2xl border text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
                    whatsAppFormat === 'text'
                      ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs ring-2 ring-emerald-200'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>WhatsApp Text Message</span>
                </button>
              </div>
            </div>

            {/* Selection Options: Report, Receipts (All including follow-up), or Both */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700">Choose Content to Send:</label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setWhatsAppOption('report')}
                  className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-1.5 ${
                    whatsAppOption === 'report'
                      ? 'bg-emerald-50 border-emerald-500 ring-2 ring-emerald-200 text-emerald-950 font-bold shadow-2xs'
                      : 'bg-white border-slate-200 hover:border-emerald-200 text-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold">Report Only</span>
                    <FileText className="w-4 h-4 text-emerald-600" />
                  </div>
                  <p className="text-[10px] text-slate-500 font-normal leading-tight">
                    {whatsAppFormat === 'pdf' ? 'Full Case Sheet & Assessment PDF' : 'Clinical diagnosis, complaints, modalities & precautions'}
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setWhatsAppOption('receipts')}
                  className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-1.5 ${
                    whatsAppOption === 'receipts'
                      ? 'bg-emerald-50 border-emerald-500 ring-2 ring-emerald-200 text-emerald-950 font-bold shadow-2xs'
                      : 'bg-white border-slate-200 hover:border-emerald-200 text-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold">All Receipts</span>
                    <Receipt className="w-4 h-4 text-emerald-600" />
                  </div>
                  <p className="text-[10px] text-slate-500 font-normal leading-tight">
                    Initial receipt + all {(patient.followUps || []).length} follow-up session receipts
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setWhatsAppOption('both')}
                  className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-1.5 ${
                    whatsAppOption === 'both'
                      ? 'bg-emerald-50 border-emerald-500 ring-2 ring-emerald-200 text-emerald-950 font-bold shadow-2xs'
                      : 'bg-white border-slate-200 hover:border-emerald-200 text-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold">Report & Receipts</span>
                    <Sparkles className="w-4 h-4 text-emerald-600" />
                  </div>
                  <p className="text-[10px] text-slate-500 font-normal leading-tight">
                    Complete case sheet plus all receipts and grand total
                  </p>
                </button>
              </div>
            </div>

            {/* Preview or PDF Info Banner */}
            {whatsAppFormat === 'pdf' ? (
              <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-2xl space-y-1.5 text-xs text-emerald-950">
                <div className="flex items-center gap-2 font-bold text-emerald-900">
                  <FileText className="w-4 h-4 text-emerald-600" />
                  <span>PDF Direct Document Generation</span>
                </div>
                <p className="text-[11px] text-emerald-800 leading-relaxed">
                  Generates an official clinic PDF report including complete diagnosis, pain assessment (VAS before & after), treatment modalities, precautions, and billing receipts. Supports native WhatsApp sharing in APK/Mobile and desktop download.
                </p>
                {pdfShareSuccess && (
                  <p className="text-[11px] font-bold text-emerald-700 bg-emerald-100/80 px-2 py-1 rounded-lg">
                    {pdfShareSuccess}
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">Message Preview:</label>
                <div className="max-h-36 overflow-y-auto p-3 bg-slate-50 border border-slate-200 rounded-2xl text-[11px] font-mono text-slate-700 whitespace-pre-wrap leading-relaxed">
                  {whatsAppOption === 'report' && formatClinicalReportWhatsApp(patient)}
                  {whatsAppOption === 'receipts' && formatReceiptsWhatsApp(patient)}
                  {whatsAppOption === 'both' && formatBothWhatsApp(patient)}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  setWhatsAppModalOpen(false);
                  setPdfShareSuccess(null);
                }}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSharingPdf}
                onClick={async () => {
                  if (whatsAppFormat === 'pdf') {
                    try {
                      setIsSharingPdf(true);
                      setPdfShareSuccess('Generating official PDF report...');

                      // Get appropriate PDF Blob
                      let blob: Blob;
                      let fileName: string;
                      const cleanReg = (patient.regNo || formatPatientId(patient.date, patient.serial)).replace(/[^a-zA-Z0-9_-]/g, '_');
                      const safeName = (patient.name || 'Patient').replace(/[^a-zA-Z0-9_-]/g, '_');

                      if (whatsAppOption === 'receipts') {
                        // Receipts PDF
                        const receiptData: ReceiptData = {
                          open: true,
                          receiptNo: patient.receiptNo || generateReceiptNumber(patient),
                          date: patient.date,
                          serial: patient.serial,
                          regNo: patient.regNo || formatPatientId(patient.date, patient.serial),
                          name: patient.name,
                          age: patient.age,
                          address: patient.address,
                          therapyFor: patient.diagnosis || 'Physiotherapy & Rehabilitation',
                          amount:
                            Number(patient.treatmentFee || 0) +
                            (patient.followUps || []).reduce((acc, f) => acc + Number(f.fee || 0), 0),
                          visitType: patient.visitType || 'Clinic',
                          paymentMethod: patient.paymentMethod || 'Cash',
                        };
                        blob = await getPdfReceiptBlob(receiptData);
                        fileName = `${safeName}_Receipts_${cleanReg}.pdf`;
                      } else {
                        // Case Sheet / Clinical Report PDF
                        blob = await getPdfCaseSheetBlob(patient);
                        fileName = `${safeName}_CaseSheet_${cleanReg}.pdf`;
                      }

                      const captionText =
                        whatsAppOption === 'report'
                          ? formatClinicalReportWhatsApp(patient)
                          : whatsAppOption === 'receipts'
                          ? formatReceiptsWhatsApp(patient)
                          : formatBothWhatsApp(patient);

                      setPdfShareSuccess('Launching WhatsApp sharing...');
                      await sharePdfViaWhatsApp(customPhone, blob, fileName, captionText);

                      setIsSharingPdf(false);
                      setPdfShareSuccess('PDF report dispatched successfully!');
                      setTimeout(() => {
                        setWhatsAppModalOpen(false);
                        setPdfShareSuccess(null);
                      }, 2000);
                    } catch (err: any) {
                      console.error('PDF WhatsApp sharing error:', err);
                      setIsSharingPdf(false);
                      setPdfShareSuccess(`Sharing note: ${err?.message || 'Download initiated'}`);
                    }
                  } else {
                    // Standard Text WhatsApp
                    const text =
                      whatsAppOption === 'report'
                        ? formatClinicalReportWhatsApp(patient)
                        : whatsAppOption === 'receipts'
                        ? formatReceiptsWhatsApp(patient)
                        : formatBothWhatsApp(patient);
                    openWhatsApp(customPhone, text);
                    setWhatsAppModalOpen(false);
                  }
                }}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition-all cursor-pointer shadow-xs flex items-center gap-2 disabled:opacity-50"
              >
                {isSharingPdf ? (
                  <>
                    <Sparkles className="w-3.5 h-3.5 animate-spin" />
                    <span>Preparing PDF...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>
                      {whatsAppFormat === 'pdf'
                        ? whatsAppOption === 'receipts'
                          ? 'Send PDF Receipts via WhatsApp'
                          : 'Send PDF Report via WhatsApp'
                        : whatsAppOption === 'report'
                        ? 'Send Clinical Report'
                        : whatsAppOption === 'receipts'
                        ? 'Send All Receipts'
                        : 'Send Report & Receipts'}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pain Score Trajectory & Clinical Recovery Modal */}
      <PainImprovementModal
        isOpen={showPainModal}
        onClose={() => setShowPainModal(false)}
        patient={patient}
      />

      {/* Manage Custom Follow-up Treatments Modal */}
      <ManageTreatmentsModal
        isOpen={showManageTreatmentsModal}
        onClose={() => setShowManageTreatmentsModal(false)}
        treatments={availableTreatments}
        onAddTreatment={(name) => handleAddCustomTreatmentToClinic(name)}
        onDeleteTreatment={handleDeleteCustomTreatmentFromClinic}
      />
    </div>
  );
};
