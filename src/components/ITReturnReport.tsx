import React, { useState, useMemo, useEffect } from 'react';
import {
  FileSpreadsheet,
  Download,
  FileText,
  TrendingUp,
  Users,
  Activity,
  Calculator,
  Building2,
  Receipt,
  FileCheck,
  CheckCircle2,
  UserCheck,
  Calendar,
  Briefcase,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';
import { Patient, ClinicSettings } from '../types';
import { CLINIC_CONFIG } from '../constants';
import { generatePdfTaxReport, MonthTaxRecord, TaxReportData } from '../utils/pdfTaxReport';
import { loadClinicSettings, saveClinicSettings, getLocumPhysiotherapists } from '../utils/storage';
import { downloadCsv } from '../utils/fileDownloadHelper';

interface ITReturnReportProps {
  patients: Patient[];
  onUpdateClinicSettings?: (newSettings: ClinicSettings) => void;
}

type ITReportViewMode = 'clinic' | 'physiotherapist';

export const ITReturnReport: React.FC<ITReturnReportProps> = ({ patients, onUpdateClinicSettings }) => {
  const [viewMode, setViewMode] = useState<ITReportViewMode>('clinic');
  const [selectedPhysio, setSelectedPhysio] = useState<string>('all'); // 'all' or specific name

  // Load and manage clinic GST settings
  const [settings, setSettings] = useState<ClinicSettings>(() => loadClinicSettings());
  const [gstNumber, setGstNumber] = useState<string>(settings.gstNumber || '');
  const [showGstOnReceipt, setShowGstOnReceipt] = useState<boolean>(settings.showGstOnReceipt ?? false);
  const [showGstOnPatientData, setShowGstOnPatientData] = useState<boolean>(settings.showGstOnPatientData ?? false);
  const [isSavedNotice, setIsSavedNotice] = useState<boolean>(false);

  // Synchronize state when external settings change
  useEffect(() => {
    const current = loadClinicSettings();
    setSettings(current);
    if (current.gstNumber !== undefined) setGstNumber(current.gstNumber);
    if (current.showGstOnReceipt !== undefined) setShowGstOnReceipt(current.showGstOnReceipt);
    if (current.showGstOnPatientData !== undefined) setShowGstOnPatientData(current.showGstOnPatientData);
  }, []);

  const handleSaveGstConfig = (
    newGst: string,
    newShowReceipt: boolean,
    newShowPatientData: boolean
  ) => {
    const updated: ClinicSettings = {
      ...settings,
      gstNumber: newGst.trim().toUpperCase(),
      showGstOnReceipt: newShowReceipt,
      showGstOnPatientData: newShowPatientData,
    };
    setSettings(updated);
    saveClinicSettings(updated);
    onUpdateClinicSettings?.(updated);
    setIsSavedNotice(true);
    setTimeout(() => setIsSavedNotice(false), 3000);
  };

  // Determine available Financial Years (April - March cycle)
  const getFinancialYearStart = (dateStr: string): number => {
    if (!dateStr) return new Date().getFullYear();
    const [yStr, mStr] = dateStr.split('-');
    const year = parseInt(yStr, 10);
    const month = parseInt(mStr, 10);
    return month >= 4 ? year : year - 1;
  };

  const availableYears = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const currentFY = new Date().getMonth() + 1 >= 4 ? currentYear : currentYear - 1;
    const yearsSet = new Set<number>([currentFY, currentFY - 1, currentFY - 2]);

    patients.forEach((p) => {
      if (p.date) yearsSet.add(getFinancialYearStart(p.date));
      (p.followUps || []).forEach((fu) => {
        if (fu.date) yearsSet.add(getFinancialYearStart(fu.date));
      });
    });

    return Array.from(yearsSet).sort((a, b) => b - a);
  }, [patients]);

  const [selectedFY, setSelectedFY] = useState<number>(availableYears[0] || 2026);

  // List of all Physiotherapists
  const allPhysiotherapists = useMemo(() => {
    const set = new Set<string>();
    set.add(CLINIC_CONFIG.doctorName);
    const locums = getLocumPhysiotherapists();
    locums.forEach((l) => set.add(l.name));
    patients.forEach((p) => {
      if (p.seenBy) set.add(p.seenBy);
      (p.followUps || []).forEach((fu) => {
        if (fu.seenBy) set.add(fu.seenBy);
      });
    });
    return Array.from(set).sort();
  }, [patients]);

  // Helper to compute 12-month FY data for a given filter (clinic or specific physiotherapist)
  const computeFyMonthsFor = (physioFilter?: string) => {
    const months = [
      { name: 'Apr', m: '04', y: selectedFY },
      { name: 'May', m: '05', y: selectedFY },
      { name: 'Jun', m: '06', y: selectedFY },
      { name: 'Jul', m: '07', y: selectedFY },
      { name: 'Aug', m: '08', y: selectedFY },
      { name: 'Sep', m: '09', y: selectedFY },
      { name: 'Oct', m: '10', y: selectedFY },
      { name: 'Nov', m: '11', y: selectedFY },
      { name: 'Dec', m: '12', y: selectedFY },
      { name: 'Jan', m: '01', y: selectedFY + 1 },
      { name: 'Feb', m: '02', y: selectedFY + 1 },
      { name: 'Mar', m: '03', y: selectedFY + 1 },
    ];

    return months.map((item) => {
      const monthKey = `${item.y}-${item.m}`;
      let initialFees = 0;
      let followUpFees = 0;
      let patientVisits = 0;

      patients.forEach((p) => {
        if (p.deleted) return;
        const attending = (p.seenBy || CLINIC_CONFIG.doctorName).trim();

        if (p.date && p.date.startsWith(monthKey)) {
          if (!physioFilter || physioFilter === 'all' || attending === physioFilter) {
            const fee = parseFloat(String(p.treatmentFee)) || 0;
            initialFees += fee;
            patientVisits += 1;
          }
        }

        (p.followUps || []).forEach((fu) => {
          const fuDoc = (fu.seenBy || attending).trim();
          if (fu.date && fu.date.startsWith(monthKey)) {
            if (!physioFilter || physioFilter === 'all' || fuDoc === physioFilter) {
              const fee = parseFloat(String(fu.fee)) || 0;
              followUpFees += fee;
              patientVisits += 1;
            }
          }
        });
      });

      return {
        monthName: `${item.name} '${String(item.y).slice(2)}`,
        monthKey,
        initialFees,
        followUpFees,
        grossReceipts: initialFees + followUpFees,
        patientVisits,
      };
    });
  };

  // Clinic Overall 12 Months
  const fyMonths = useMemo(() => computeFyMonthsFor(), [patients, selectedFY]);
  const totalGross = useMemo(() => fyMonths.reduce((a, b) => a + b.grossReceipts, 0), [fyMonths]);
  const totalVisits = useMemo(() => fyMonths.reduce((a, b) => a + b.patientVisits, 0), [fyMonths]);
  const deemedIncome44ADA = Math.round(totalGross * 0.5);

  // Unique patients in this FY for clinic
  const uniquePatientsCount = useMemo(() => {
    const set = new Set<string>();
    const fyStart = `${selectedFY}-04-01`;
    const fyEnd = `${selectedFY + 1}-03-31`;

    patients.forEach((p) => {
      if (p.deleted) return;
      if (p.date && p.date >= fyStart && p.date <= fyEnd) {
        set.add(p.id);
      }
      (p.followUps || []).forEach((fu) => {
        if (fu.date && fu.date >= fyStart && fu.date <= fyEnd) {
          set.add(p.id);
        }
      });
    });

    return set.size;
  }, [patients, selectedFY]);

  const maxMonthlyGross = useMemo(() => Math.max(...fyMonths.map((m) => m.grossReceipts), 1), [fyMonths]);
  const avgMonthlyGross = Math.round(totalGross / 12);

  // Physiotherapist-Specific Calculations
  const physioAnnualSummary = useMemo(() => {
    return allPhysiotherapists.map((docName) => {
      const docMonths = computeFyMonthsFor(docName);
      const gross = docMonths.reduce((a, b) => a + b.grossReceipts, 0);
      const initial = docMonths.reduce((a, b) => a + b.initialFees, 0);
      const followUp = docMonths.reduce((a, b) => a + b.followUpFees, 0);
      const visits = docMonths.reduce((a, b) => a + b.patientVisits, 0);
      const deemed = Math.round(gross * 0.5);

      return {
        name: docName,
        months: docMonths,
        gross,
        initial,
        followUp,
        visits,
        deemedIncome44ADA: deemed,
        shareOfClinic: totalGross > 0 ? ((gross / totalGross) * 100).toFixed(1) : '0.0',
      };
    });
  }, [allPhysiotherapists, patients, selectedFY, totalGross]);

  // Specific selected physiotherapist data
  const currentPhysioData = useMemo(() => {
    if (selectedPhysio === 'all') return null;
    return physioAnnualSummary.find((p) => p.name === selectedPhysio) || null;
  }, [selectedPhysio, physioAnnualSummary]);

  // Export Overall Clinic CSV
  const handleExportClinicCsv = () => {
    const headers = [
      'Financial Month',
      'Initial Consultation Fees (INR)',
      'Follow-up Therapy Fees (INR)',
      'Gross Professional Receipts (INR)',
      'Patient Visits',
    ];
    const rows = fyMonths.map((m) => [
      `"${m.monthName}"`,
      m.initialFees,
      m.followUpFees,
      m.grossReceipts,
      m.patientVisits,
    ]);

    rows.push(['"TOTAL ANNUAL RECEIPTS"', totalGross, totalGross, totalGross, totalVisits]);
    rows.push(['"PRESUMPTIVE TAXABLE INCOME (SEC 44ADA 50%)"', deemedIncome44ADA, '', '', '']);

    const csvContent =
      '\uFEFF' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    downloadCsv(csvContent, `Namana_Clinic_Overall_IT_Return_FY${selectedFY}-${selectedFY + 1}.csv`);
  };

  // Export Physiotherapist Comparison or Individual CSV
  const handleExportPhysioReturnCsv = () => {
    if (selectedPhysio !== 'all' && currentPhysioData) {
      // Export individual physiotherapist 12-month return
      const headers = [
        'Financial Month',
        'Initial Consultation Fees (INR)',
        'Follow-up Therapy Fees (INR)',
        'Gross Professional Receipts (INR)',
        'Patient Visits',
      ];
      const rows = currentPhysioData.months.map((m) => [
        `"${m.monthName}"`,
        m.initialFees,
        m.followUpFees,
        m.grossReceipts,
        m.patientVisits,
      ]);
      rows.push(['"TOTAL ANNUAL GROSS RECEIPTS"', currentPhysioData.gross, '', '', currentPhysioData.visits]);
      rows.push([
        '"PRESUMPTIVE TAXABLE INCOME (SEC 44ADA 50%)"',
        currentPhysioData.deemedIncome44ADA,
        '',
        '',
        '',
      ]);

      const csvContent =
        '\uFEFF' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
      downloadCsv(
        csvContent,
        `IT_Return_${currentPhysioData.name.replace(/\s+/g, '_')}_FY${selectedFY}-${selectedFY + 1}.csv`
      );
    } else {
      // Export all physiotherapists comparison
      const headers = [
        'Physiotherapist Name',
        'Initial Consultations Fee (INR)',
        'Follow-up Therapy Fee (INR)',
        'Total Gross Professional Receipts (INR)',
        'Deemed Taxable Income (Sec 44ADA 50%) (INR)',
        'Clinical Sessions Handled',
        '% Share of Clinic Revenue',
      ];
      const rows = physioAnnualSummary.map((p) => [
        `"${p.name}"`,
        p.initial,
        p.followUp,
        p.gross,
        p.deemedIncome44ADA,
        p.visits,
        `"${p.shareOfClinic}%"`,
      ]);

      const csvContent =
        '\uFEFF' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
      downloadCsv(csvContent, `Namana_Physiotherapists_IT_Returns_FY${selectedFY}-${selectedFY + 1}.csv`);
    }
  };

  const reportData: TaxReportData = useMemo(
    () => ({
      selectedFY,
      fyMonths,
      totalGross,
      deemedIncome44ADA,
      totalVisits,
      uniquePatientsCount,
    }),
    [selectedFY, fyMonths, totalGross, deemedIncome44ADA, totalVisits, uniquePatientsCount]
  );

  const handleDownloadPdf = () => {
    generatePdfTaxReport(reportData);
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6 bg-slate-50 text-slate-800">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Top Control Bar with FY Selector and View Mode */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-3xl border border-sky-100 shadow-xs">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 bg-sky-50 text-sky-600 rounded-2xl border border-sky-200">
                <FileSpreadsheet className="w-5 h-5" />
              </span>
              <div>
                <h2 className="text-lg font-bold text-sky-950">
                  Income Tax Return (ITR) & Presumptive Taxation (Sec 44ADA)
                </h2>
                <p className="text-xs text-slate-500">
                  Annual professional revenue, Sec 44ADA deemed profit (50%), and individual physiotherapist returns.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Financial Year Selector */}
            <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-2xl border border-slate-200">
              <span className="text-xs font-bold text-slate-600 px-2">FY:</span>
              <select
                value={selectedFY}
                onChange={(e) => setSelectedFY(Number(e.target.value))}
                className="bg-white px-3 py-1.5 rounded-xl text-xs font-bold text-sky-900 border border-slate-200 shadow-2xs outline-none cursor-pointer"
              >
                {availableYears.map((year) => (
                  <option key={year} value={year}>
                    FY {year} - {year + 1}
                  </option>
                ))}
              </select>
            </div>

            {/* Export CSV */}
            <button
              type="button"
              onClick={viewMode === 'clinic' ? handleExportClinicCsv : handleExportPhysioReturnCsv}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer border border-slate-200"
              title="Export Statement as CSV"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>CSV</span>
            </button>

            {/* Download PDF (Clinic) */}
            {viewMode === 'clinic' && (
              <button
                type="button"
                onClick={handleDownloadPdf}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-xs"
                title="Download Official Revenue Summary PDF"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Download PDF</span>
              </button>
            )}
          </div>
        </div>

        {/* View Mode Switcher: 1. Overall Clinic IT Return | 2. Physiotherapist IT Return */}
        <div className="flex items-center gap-2 p-1.5 bg-white border border-sky-100 rounded-2xl shadow-2xs overflow-x-auto">
          <button
            type="button"
            id="tab-it-clinic"
            onClick={() => setViewMode('clinic')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              viewMode === 'clinic'
                ? 'bg-sky-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-sky-900 hover:bg-sky-50/60'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>1. Overall Clinic IT Return</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${
                viewMode === 'clinic' ? 'bg-sky-500 text-white' : 'bg-slate-100 text-slate-600'
              }`}
            >
              FY {selectedFY}-{String(selectedFY + 1).slice(2)}
            </span>
          </button>

          <button
            type="button"
            id="tab-it-physio"
            onClick={() => setViewMode('physiotherapist')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              viewMode === 'physiotherapist'
                ? 'bg-sky-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-sky-900 hover:bg-sky-50/60'
            }`}
          >
            <UserCheck className="w-4 h-4" />
            <span>2. Physiotherapist IT Return</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${
                viewMode === 'physiotherapist' ? 'bg-sky-500 text-white' : 'bg-slate-100 text-slate-600'
              }`}
            >
              {allPhysiotherapists.length} Therapists
            </span>
          </button>
        </div>

        {/* ============================================================ */}
        {/* VIEW 1: OVERALL CLINIC IT RETURN */}
        {/* ============================================================ */}
        {viewMode === 'clinic' && (
          <div className="space-y-6 animate-fade-in">
            {/* GST Registration & Invoicing Configuration */}
            <div className="bg-white p-5 sm:p-6 rounded-3xl border border-sky-100 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-sky-50 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-2xl bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-600">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-sky-950">GST Number & Invoicing Configuration</h3>
                    <p className="text-[11px] text-slate-500">
                      Manage your Goods and Services Tax Identification Number (GSTIN) and visibility on clinic documents.
                    </p>
                  </div>
                </div>

                {isSavedNotice && (
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200 animate-fade-in">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Settings Saved</span>
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
                {/* GST Number Input Box */}
                <div className="md:col-span-5 space-y-2">
                  <label className="block text-xs font-bold text-slate-700">Clinic GST Number (GSTIN)</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={gstNumber}
                      onChange={(e) => {
                        const val = e.target.value.toUpperCase();
                        setGstNumber(val);
                        handleSaveGstConfig(val, showGstOnReceipt, showGstOnPatientData);
                      }}
                      placeholder="e.g. 29AAAAA0000A1Z5"
                      maxLength={15}
                      className="w-full font-mono font-bold tracking-wider text-sm px-3.5 py-2.5 rounded-xl border border-sky-200 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 outline-none uppercase text-slate-900 bg-white shadow-2xs"
                    />
                    {gstNumber.trim() ? (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                        Active
                      </span>
                    ) : (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-medium text-slate-400">
                        Optional
                      </span>
                    )}
                  </div>
                  <p className="text-[10.5px] text-slate-500">
                    Standard 15-character Goods & Services Tax Identification Number for clinical rehabilitation services.
                  </p>
                </div>

                {/* Display Control Buttons */}
                <div className="md:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Toggle 1: Show on Receipt */}
                  <div
                    className={`p-3.5 rounded-2xl border transition-all flex flex-col justify-between gap-3 ${
                      showGstOnReceipt ? 'bg-sky-50/70 border-sky-300' : 'bg-slate-50/70 border-slate-200'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <Receipt
                        className={`w-4 h-4 mt-0.5 shrink-0 ${showGstOnReceipt ? 'text-sky-600' : 'text-slate-400'}`}
                      />
                      <div>
                        <span className="text-xs font-bold text-slate-800 block">Show in Receipt</span>
                        <span className="text-[10.5px] text-slate-500 leading-tight block mt-0.5">
                          Display GSTIN on consultation and therapy payment receipt slips.
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[11px] font-semibold text-slate-600">
                        Status:{' '}
                        <b className={showGstOnReceipt ? 'text-sky-700' : 'text-slate-500'}>
                          {showGstOnReceipt ? 'Visible' : 'Hidden'}
                        </b>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const next = !showGstOnReceipt;
                          setShowGstOnReceipt(next);
                          handleSaveGstConfig(gstNumber, next, showGstOnPatientData);
                        }}
                        className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs border ${
                          showGstOnReceipt
                            ? 'bg-sky-600 text-white border-sky-600 hover:bg-sky-700'
                            : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                        }`}
                      >
                        {showGstOnReceipt ? 'Shown in Receipt ✓' : 'Hide in Receipt'}
                      </button>
                    </div>
                  </div>

                  {/* Toggle 2: Show on Patient Data */}
                  <div
                    className={`p-3.5 rounded-2xl border transition-all flex flex-col justify-between gap-3 ${
                      showGstOnPatientData ? 'bg-emerald-50/70 border-emerald-300' : 'bg-slate-50/70 border-slate-200'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <FileCheck
                        className={`w-4 h-4 mt-0.5 shrink-0 ${
                          showGstOnPatientData ? 'text-emerald-600' : 'text-slate-400'
                        }`}
                      />
                      <div>
                        <span className="text-xs font-bold text-slate-800 block">Show in Patient Data</span>
                        <span className="text-[10.5px] text-slate-500 leading-tight block mt-0.5">
                          Display GSTIN on confidential clinical physiotherapy case sheets.
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[11px] font-semibold text-slate-600">
                        Status:{' '}
                        <b className={showGstOnPatientData ? 'text-emerald-700' : 'text-slate-500'}>
                          {showGstOnPatientData ? 'Visible' : 'Hidden'}
                        </b>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const next = !showGstOnPatientData;
                          setShowGstOnPatientData(next);
                          handleSaveGstConfig(gstNumber, showGstOnReceipt, next);
                        }}
                        className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs border ${
                          showGstOnPatientData
                            ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'
                            : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                        }`}
                      >
                        {showGstOnPatientData ? 'Shown in Case Sheet ✓' : 'Hide in Case Sheet'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 4 Summary Tax Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
              {/* Gross Receipts */}
              <div className="bg-white p-5 rounded-3xl border border-sky-100 shadow-xs space-y-1">
                <div className="flex items-center justify-between text-slate-500">
                  <span className="text-xs font-semibold">Gross Receipts (FY)</span>
                  <TrendingUp className="w-4 h-4 text-emerald-600" />
                </div>
                <p className="text-2xl font-black text-slate-950 font-mono">₹{totalGross.toLocaleString()}</p>
                <p className="text-[11px] text-slate-400">Total clinical professional fees</p>
              </div>

              {/* Deemed Taxable Income Sec 44ADA */}
              <div className="bg-gradient-to-br from-emerald-600 to-teal-700 text-white p-5 rounded-3xl shadow-sm space-y-1">
                <div className="flex items-center justify-between opacity-90">
                  <span className="text-xs font-semibold text-emerald-100">Sec 44ADA Income (50%)</span>
                  <ShieldCheck className="w-4 h-4 text-emerald-200" />
                </div>
                <p className="text-2xl font-black font-mono">₹{deemedIncome44ADA.toLocaleString()}</p>
                <p className="text-[11px] text-emerald-100">Presumptive net taxable income</p>
              </div>

              {/* Average Monthly Receipts */}
              <div className="bg-white p-5 rounded-3xl border border-sky-100 shadow-xs space-y-1">
                <div className="flex items-center justify-between text-slate-500">
                  <span className="text-xs font-semibold">Monthly Average</span>
                  <Calculator className="w-4 h-4 text-sky-600" />
                </div>
                <p className="text-2xl font-black text-sky-800 font-mono">₹{avgMonthlyGross.toLocaleString()}</p>
                <p className="text-[11px] text-slate-400">Average collection per month</p>
              </div>

              {/* Total Patient Sessions */}
              <div className="bg-white p-5 rounded-3xl border border-sky-100 shadow-xs space-y-1">
                <div className="flex items-center justify-between text-slate-500">
                  <span className="text-xs font-semibold">Clinical Sessions</span>
                  <Activity className="w-4 h-4 text-sky-600" />
                </div>
                <p className="text-2xl font-black text-slate-950 font-mono">{totalVisits}</p>
                <p className="text-[11px] text-slate-400">Consultation & therapy visits</p>
              </div>
            </div>

            {/* Visual Monthly Revenue Distribution Bars */}
            <div className="bg-white p-5 rounded-3xl border border-sky-100 shadow-xs space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pb-1 border-b border-slate-100">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-sky-950">
                  Monthly Professional Receipts Visual Trend (FY {selectedFY} - {selectedFY + 1})
                </h3>
                <span className="text-[11px] font-semibold text-slate-500">
                  Highest Month: ₹{maxMonthlyGross.toLocaleString()}
                </span>
              </div>

              <div className="overflow-x-auto pb-2 pt-2">
                <div className="min-w-[640px] grid grid-cols-12 gap-2.5 items-end h-40">
                  {fyMonths.map((m) => {
                    const pct =
                      maxMonthlyGross > 0
                        ? Math.min(Math.round((m.grossReceipts / maxMonthlyGross) * 100), 100)
                        : 0;
                    return (
                      <div key={m.monthKey} className="flex flex-col items-center gap-1.5 h-full justify-end group">
                        <span className="text-[10px] font-mono font-bold text-slate-500 group-hover:text-sky-700 whitespace-nowrap">
                          {m.grossReceipts > 0 ? `₹${Math.round(m.grossReceipts / 1000)}k` : '—'}
                        </span>
                        <div className="w-full bg-slate-100 rounded-lg h-24 flex items-end p-0.5 overflow-hidden border border-slate-200">
                          <div
                            style={{ height: `${Math.max(pct, 4)}%` }}
                            className={`w-full rounded-md transition-all ${
                              m.grossReceipts > 0 ? 'bg-sky-600 group-hover:bg-sky-500' : 'bg-slate-200'
                            }`}
                            title={`${m.monthName}: ₹${m.grossReceipts.toLocaleString()} (${m.patientVisits} visits)`}
                          />
                        </div>
                        <span className="text-[10px] font-bold text-slate-600 uppercase whitespace-nowrap">
                          {m.monthName.split(' ')[0]}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Monthly Breakdown Data Table */}
            <div className="bg-white rounded-3xl border border-sky-100 shadow-xs overflow-hidden">
              <div className="p-4 sm:p-5 border-b border-sky-50 flex items-center justify-between">
                <h3 className="text-sm font-bold text-sky-950">
                  Detailed Monthly Clinical Receipts Breakdown (FY {selectedFY} - {selectedFY + 1})
                </h3>
                <span className="text-xs font-mono font-bold text-slate-500">12 Months (Apr - Mar)</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-sky-50/60 text-sky-900 uppercase text-[10px] font-extrabold tracking-wider border-b border-sky-100">
                    <tr>
                      <th className="py-3 px-4">Financial Month</th>
                      <th className="py-3 px-4 text-right">Initial Consultation (₹)</th>
                      <th className="py-3 px-4 text-right">Follow-Up Sessions (₹)</th>
                      <th className="py-3 px-4 text-center">Patient Visits</th>
                      <th className="py-3 px-4 text-right">Gross Receipts (₹)</th>
                      <th className="py-3 px-4 text-right">Sec 44ADA (50%) (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {fyMonths.map((m) => (
                      <tr key={m.monthKey} className="hover:bg-sky-50/30 transition-colors">
                        <td className="py-3 px-4 font-bold text-slate-800">{m.monthName}</td>
                        <td className="py-3 px-4 text-right font-mono text-slate-600">
                          ₹{m.initialFees.toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-slate-600">
                          ₹{m.followUpFees.toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-center font-mono">
                          <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[11px] font-bold">
                            {m.patientVisits}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                          ₹{m.grossReceipts.toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-emerald-700 font-semibold">
                          ₹{Math.round(m.grossReceipts * 0.5).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-sky-50/80 font-bold border-t-2 border-sky-200">
                    <tr>
                      <td className="py-3.5 px-4 font-black text-sky-950">TOTAL ANNUAL SUMMARY</td>
                      <td className="py-3.5 px-4 text-right font-mono text-slate-700">
                        ₹{fyMonths.reduce((a, b) => a + b.initialFees, 0).toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-slate-700">
                        ₹{fyMonths.reduce((a, b) => a + b.followUpFees, 0).toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4 text-center font-mono text-sky-900 font-extrabold text-sm">
                        {totalVisits}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-black text-sky-950 text-sm">
                        ₹{totalGross.toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-black text-emerald-800 text-sm">
                        ₹{deemedIncome44ADA.toLocaleString()}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* VIEW 2: PHYSIOTHERAPIST-WISE IT RETURN */}
        {/* ============================================================ */}
        {viewMode === 'physiotherapist' && (
          <div className="space-y-6 animate-fade-in">
            {/* Sub-bar: Select specific Physiotherapist or View All Comparison */}
            <div className="bg-white p-4 sm:p-5 rounded-3xl border border-sky-100 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-extrabold text-sky-950 flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-sky-600" />
                  <span>Physiotherapist Individual IT Returns (Sec 44ADA)</span>
                </h3>
                <p className="text-xs text-slate-500">
                  Calculate annual gross receipts and 50% presumptive net taxable income for each physiotherapist.
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-slate-600">Select Physiotherapist:</span>
                <select
                  value={selectedPhysio}
                  onChange={(e) => setSelectedPhysio(e.target.value)}
                  className="px-3 py-1.5 bg-white border border-sky-200 rounded-xl text-xs font-bold text-sky-900 outline-none cursor-pointer shadow-2xs"
                >
                  <option value="all">All Physiotherapists (Comparison Table)</option>
                  {allPhysiotherapists.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={handleExportPhysioReturnCsv}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-2xs"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Export ITR CSV</span>
                </button>
              </div>
            </div>

            {/* CASE A: ALL PHYSIOTHERAPISTS COMPARISON */}
            {selectedPhysio === 'all' && (
              <div className="space-y-4">
                {/* Summary Metrics */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-white p-5 rounded-3xl border border-sky-100 shadow-xs space-y-1">
                    <span className="text-xs font-semibold text-slate-500">Physiotherapists Contributing</span>
                    <p className="text-2xl font-black text-slate-900 font-mono">{allPhysiotherapists.length}</p>
                    <p className="text-[11px] text-slate-400">Total registered practitioners</p>
                  </div>

                  <div className="bg-white p-5 rounded-3xl border border-sky-100 shadow-xs space-y-1">
                    <span className="text-xs font-semibold text-slate-500">Top Gross Revenue Contributor</span>
                    <p className="text-lg font-black text-sky-900 truncate">
                      {physioAnnualSummary[0]?.name || '—'}
                    </p>
                    <p className="text-[11px] text-emerald-600 font-bold font-mono">
                      ₹{physioAnnualSummary[0]?.gross.toLocaleString() || 0} ({physioAnnualSummary[0]?.shareOfClinic || 0}%)
                    </p>
                  </div>

                  <div className="bg-gradient-to-br from-emerald-600 to-teal-700 text-white p-5 rounded-3xl shadow-sm space-y-1">
                    <span className="text-xs font-semibold text-emerald-100">Combined Sec 44ADA Income (50%)</span>
                    <p className="text-2xl font-black font-mono">₹{deemedIncome44ADA.toLocaleString()}</p>
                    <p className="text-[11px] text-emerald-100">Total presumptive taxable profit across all doctors</p>
                  </div>
                </div>

                {/* Comparative Table */}
                <div className="bg-white rounded-3xl border border-sky-100 shadow-xs overflow-hidden">
                  <div className="p-4 sm:p-5 border-b border-sky-50 flex items-center justify-between">
                    <h4 className="text-xs font-extrabold uppercase tracking-wider text-sky-950">
                      Annual IT Return Comparison by Physiotherapist (FY {selectedFY} - {selectedFY + 1})
                    </h4>
                    <span className="text-xs font-mono font-bold text-slate-500">Section 44ADA Presumptive Taxation</span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-slate-700">
                      <thead className="bg-sky-50/60 text-[11px] font-bold text-sky-950 uppercase tracking-wider border-b border-sky-100">
                        <tr>
                          <th className="p-3.5 pl-5">Physiotherapist Name</th>
                          <th className="p-3.5 text-center">Sessions Handled</th>
                          <th className="p-3.5 text-right">Initial Fees (₹)</th>
                          <th className="p-3.5 text-right">Follow-up Fees (₹)</th>
                          <th className="p-3.5 text-right">Gross Annual Receipts (₹)</th>
                          <th className="p-3.5 text-right">Sec 44ADA Deemed Profit (50%)</th>
                          <th className="p-3.5 text-center">% Share</th>
                          <th className="p-3.5 pr-5 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-sky-50 font-medium">
                        {physioAnnualSummary.map((pt) => (
                          <tr key={pt.name} className="hover:bg-sky-50/40 transition-colors">
                            <td className="p-3.5 pl-5 font-bold text-slate-900 flex items-center gap-2">
                              <div className="w-7 h-7 rounded-xl bg-sky-100 border border-sky-200 flex items-center justify-center text-sky-700 text-xs font-black">
                                {pt.name.charAt(0)}
                              </div>
                              <div>
                                <p className="text-slate-900">{pt.name}</p>
                                <p className="text-[10px] text-slate-500 font-normal">
                                  {pt.name === CLINIC_CONFIG.doctorName
                                    ? 'Chief Consultant (BPT, MIAP)'
                                    : 'Locum Tenens Physiotherapist'}
                                </p>
                              </div>
                            </td>
                            <td className="p-3.5 text-center font-mono font-bold text-slate-700">{pt.visits}</td>
                            <td className="p-3.5 text-right font-mono text-slate-600">
                              ₹{pt.initial.toLocaleString()}
                            </td>
                            <td className="p-3.5 text-right font-mono text-slate-600">
                              ₹{pt.followUp.toLocaleString()}
                            </td>
                            <td className="p-3.5 text-right font-mono font-black text-slate-950">
                              ₹{pt.gross.toLocaleString()}
                            </td>
                            <td className="p-3.5 text-right font-mono font-bold text-emerald-700">
                              ₹{pt.deemedIncome44ADA.toLocaleString()}
                            </td>
                            <td className="p-3.5 text-center">
                              <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-800 border border-sky-200">
                                {pt.shareOfClinic}%
                              </span>
                            </td>
                            <td className="p-3.5 pr-5 text-center">
                              <button
                                type="button"
                                onClick={() => setSelectedPhysio(pt.name)}
                                className="px-2.5 py-1 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-700 text-[11px] font-bold border border-sky-200 transition-colors cursor-pointer"
                              >
                                View 12-Mo ITR
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-sky-50/80 font-bold border-t border-sky-200 text-sky-950">
                        <tr>
                          <td className="p-3.5 pl-5 uppercase text-xs tracking-wider">Total Across All Physiotherapists</td>
                          <td className="p-3.5 text-center font-mono">{totalVisits}</td>
                          <td className="p-3.5 text-right font-mono">
                            ₹{physioAnnualSummary.reduce((a, b) => a + b.initial, 0).toLocaleString()}
                          </td>
                          <td className="p-3.5 text-right font-mono">
                            ₹{physioAnnualSummary.reduce((a, b) => a + b.followUp, 0).toLocaleString()}
                          </td>
                          <td className="p-3.5 text-right font-mono font-black text-sm">
                            ₹{totalGross.toLocaleString()}
                          </td>
                          <td className="p-3.5 text-right font-mono font-black text-emerald-800 text-sm">
                            ₹{deemedIncome44ADA.toLocaleString()}
                          </td>
                          <td className="p-3.5 text-center">100%</td>
                          <td className="p-3.5 pr-5"></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* CASE B: INDIVIDUAL SELECTED PHYSIOTHERAPIST 12-MONTH IT RETURN */}
            {selectedPhysio !== 'all' && currentPhysioData && (
              <div className="space-y-5 animate-fade-in">
                {/* Doctor Identity Header Banner */}
                <div className="bg-gradient-to-r from-sky-800 via-sky-700 to-sky-900 text-white p-5 sm:p-6 rounded-3xl shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5">
                    <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-white text-lg font-black">
                      {currentPhysioData.name.charAt(0)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base sm:text-lg font-black">{currentPhysioData.name}</h3>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/20 text-white font-mono font-bold">
                          Sec 44ADA Eligible
                        </span>
                      </div>
                      <p className="text-xs text-sky-200">
                        Annual Tax Statement • FY {selectedFY} - {selectedFY + 1} (12 Months)
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-start sm:self-auto">
                    <button
                      type="button"
                      onClick={() => setSelectedPhysio('all')}
                      className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold border border-white/20 transition-colors cursor-pointer"
                    >
                      ← Back to All Physiotherapists
                    </button>
                  </div>
                </div>

                {/* 4 Cards for this individual physiotherapist */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
                  <div className="bg-white p-5 rounded-3xl border border-sky-100 shadow-xs space-y-1">
                    <span className="text-xs font-semibold text-slate-500">Gross Annual Receipts</span>
                    <p className="text-2xl font-black text-slate-900 font-mono">
                      ₹{currentPhysioData.gross.toLocaleString()}
                    </p>
                    <p className="text-[11px] text-slate-400">Total fees earned in FY</p>
                  </div>

                  <div className="bg-emerald-50 p-5 rounded-3xl border border-emerald-200 shadow-xs space-y-1">
                    <span className="text-xs font-semibold text-emerald-800">Sec 44ADA Deemed Income</span>
                    <p className="text-2xl font-black text-emerald-900 font-mono">
                      ₹{currentPhysioData.deemedIncome44ADA.toLocaleString()}
                    </p>
                    <p className="text-[11px] text-emerald-700">50% presumptive taxable profit</p>
                  </div>

                  <div className="bg-white p-5 rounded-3xl border border-sky-100 shadow-xs space-y-1">
                    <span className="text-xs font-semibold text-slate-500">Clinical Sessions</span>
                    <p className="text-2xl font-black text-sky-900 font-mono">{currentPhysioData.visits}</p>
                    <p className="text-[11px] text-slate-400">Initial + follow-up treatments</p>
                  </div>

                  <div className="bg-white p-5 rounded-3xl border border-sky-100 shadow-xs space-y-1">
                    <span className="text-xs font-semibold text-slate-500">Monthly Average</span>
                    <p className="text-2xl font-black text-slate-900 font-mono">
                      ₹{Math.round(currentPhysioData.gross / 12).toLocaleString()}
                    </p>
                    <p className="text-[11px] text-slate-400">Average collection per month</p>
                  </div>
                </div>

                {/* 12-Month Month-by-Month Detailed Table */}
                <div className="bg-white rounded-3xl border border-sky-100 shadow-xs overflow-hidden">
                  <div className="p-4 sm:p-5 border-b border-sky-50 flex items-center justify-between">
                    <h4 className="text-sm font-bold text-sky-950">
                      Month-by-Month IT Return Ledger for {currentPhysioData.name}
                    </h4>
                    <span className="text-xs font-mono font-bold text-slate-500">
                      FY {selectedFY} - {selectedFY + 1}
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-sky-50/60 text-sky-900 uppercase text-[10px] font-extrabold tracking-wider border-b border-sky-100">
                        <tr>
                          <th className="py-3 px-4">Financial Month</th>
                          <th className="py-3 px-4 text-right">Initial Consultation (₹)</th>
                          <th className="py-3 px-4 text-right">Follow-Up Sessions (₹)</th>
                          <th className="py-3 px-4 text-center">Patient Visits</th>
                          <th className="py-3 px-4 text-right">Gross Receipts (₹)</th>
                          <th className="py-3 px-4 text-right">Sec 44ADA (50%) (₹)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {currentPhysioData.months.map((m) => (
                          <tr key={m.monthKey} className="hover:bg-sky-50/30 transition-colors">
                            <td className="py-3 px-4 font-bold text-slate-800">{m.monthName}</td>
                            <td className="py-3 px-4 text-right font-mono text-slate-600">
                              ₹{m.initialFees.toLocaleString()}
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-slate-600">
                              ₹{m.followUpFees.toLocaleString()}
                            </td>
                            <td className="py-3 px-4 text-center font-mono">
                              <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[11px] font-bold">
                                {m.patientVisits}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                              ₹{m.grossReceipts.toLocaleString()}
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-emerald-700 font-semibold">
                              ₹{Math.round(m.grossReceipts * 0.5).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-sky-50/80 font-bold border-t-2 border-sky-200">
                        <tr>
                          <td className="py-3.5 px-4 font-black text-sky-950">ANNUAL TOTAL ({currentPhysioData.name})</td>
                          <td className="py-3.5 px-4 text-right font-mono text-slate-700">
                            ₹{currentPhysioData.initial.toLocaleString()}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono text-slate-700">
                            ₹{currentPhysioData.followUp.toLocaleString()}
                          </td>
                          <td className="py-3.5 px-4 text-center font-mono text-sky-900 font-extrabold text-sm">
                            {currentPhysioData.visits}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono font-black text-sky-950 text-sm">
                            ₹{currentPhysioData.gross.toLocaleString()}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono font-black text-emerald-800 text-sm">
                            ₹{currentPhysioData.deemedIncome44ADA.toLocaleString()}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                {/* Statutory 44ADA Guidance Note */}
                <div className="bg-sky-50 border border-sky-200 rounded-3xl p-5 text-xs text-sky-900 space-y-1.5">
                  <div className="flex items-center gap-2 font-bold text-sky-950">
                    <ShieldCheck className="w-4 h-4 text-sky-600" />
                    <span>Statutory Presumptive Taxation Guidelines under Section 44ADA</span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    Under Section 44ADA of the Indian Income Tax Act, 1961, qualified physiotherapy professionals with annual gross receipts up to ₹75 Lakhs (or ₹50 Lakhs if non-digital transactions exceed 5%) can declare 50% or more of their gross receipts as deemed taxable profit. No requirement to maintain detailed books of accounts under Section 44AA or undergo tax audit under Section 44AB applies when filing under Section 44ADA.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
