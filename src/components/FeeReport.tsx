import React, { useState, useMemo } from 'react';
import {
  IndianRupee,
  Download,
  Search,
  TrendingUp,
  CreditCard,
  Wallet,
  Calendar,
  UserCheck,
  Stethoscope,
  ChevronRight,
  ListFilter,
  PieChart,
  Users,
} from 'lucide-react';
import { Patient, ReceiptData } from '../types';
import { formatPatientId, generateReceiptNumber, deduplicatePatients, getLocumPhysiotherapists } from '../utils/storage';
import { CLINIC_CONFIG } from '../constants';
import { downloadCsv } from '../utils/fileDownloadHelper';

interface FeeReportProps {
  patients: Patient[];
  onOpenReceipt?: (data: Partial<ReceiptData>) => void;
  onSelectPatient?: (id: string) => void;
}

type PeriodFilter = 'all' | 'month' | 'day';
type ViewTab = 'ledger' | 'seenBy' | 'referredBy';

export const FeeReport: React.FC<FeeReportProps> = ({ patients, onOpenReceipt, onSelectPatient }) => {
  const [activeTab, setActiveTab] = useState<ViewTab>('ledger');
  const [period, setPeriod] = useState<PeriodFilter>('all');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [searchQuery, setSearchQuery] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<string>('all');
  const [seenByFilter, setSeenByFilter] = useState<string>('all');
  const [referredByFilter, setReferredByFilter] = useState<string>('all');

  // Extract all fee transactions across patients and followups
  const transactions = useMemo(() => {
    const list: Array<{
      id: string;
      patientId: string;
      patientName: string;
      regNo: string;
      date: string;
      amount: number;
      type: 'Initial Consultation' | 'Follow-up Session';
      receiptNo: string;
      paymentMethod: string;
      visitType: string;
      seenBy: string;
      referredBy: string;
    }> = [];

    const seenTxIds = new Set<string>();
    const uniquePatients = deduplicatePatients(patients);

    uniquePatients.forEach((p) => {
      if (p.deleted) return;

      const patientRegNo = p.regNo || formatPatientId(p.date, p.serial);
      const attending = (p.seenBy || CLINIC_CONFIG.doctorName).trim();
      const referrer = (p.referredBy || 'Self / Direct Walk-in').trim();

      // Initial session
      if (p.treatmentFee && p.date) {
        const amt = parseFloat(String(p.treatmentFee)) || 0;
        if (amt > 0) {
          const txId = `fee_init_${p.id}`;
          if (!seenTxIds.has(txId)) {
            seenTxIds.add(txId);
            list.push({
              id: txId,
              patientId: p.id,
              patientName: p.name || 'Unnamed',
              regNo: patientRegNo,
              date: p.date,
              amount: amt,
              type: 'Initial Consultation',
              receiptNo: p.receiptNo || generateReceiptNumber(p),
              paymentMethod: p.paymentMethod || 'Cash',
              visitType: p.visitType || 'Clinic',
              seenBy: attending,
              referredBy: referrer,
            });
          }
        }
      }

      // Follow-ups
      (p.followUps || []).forEach((fu, idx) => {
        if (fu.fee && fu.date) {
          const amt = parseFloat(String(fu.fee)) || 0;
          if (amt > 0) {
            const txId = fu.id ? `fee_fu_${fu.id}` : `fee_fu_${p.id}_${idx}`;
            if (!seenTxIds.has(txId)) {
              seenTxIds.add(txId);
              list.push({
                id: txId,
                patientId: p.id,
                patientName: p.name || 'Unnamed',
                regNo: patientRegNo,
                date: fu.date,
                amount: amt,
                type: 'Follow-up Session',
                receiptNo: fu.receiptNo || generateReceiptNumber(p, idx + 1),
                paymentMethod: fu.paymentMethod || 'Cash',
                visitType: fu.visitType || p.visitType || 'Clinic',
                seenBy: (fu.seenBy || attending).trim(),
                referredBy: referrer,
              });
            }
          }
        }
      });
    });

    return list.sort((a, b) => b.date.localeCompare(a.date));
  }, [patients]);

  // Unique lists for filter dropdowns
  const availableSeenBy = useMemo(() => {
    const set = new Set<string>();
    transactions.forEach((t) => set.add(t.seenBy));
    return Array.from(set).sort();
  }, [transactions]);

  const availableReferredBy = useMemo(() => {
    const set = new Set<string>();
    transactions.forEach((t) => set.add(t.referredBy));
    return Array.from(set).sort();
  }, [transactions]);

  // Base date/period filtered transactions
  const periodTransactions = useMemo(() => {
    const currentMonthPrefix = selectedDate.slice(0, 7);
    return transactions.filter((t) => {
      if (period === 'day' && t.date !== selectedDate) return false;
      if (period === 'month' && !t.date.startsWith(currentMonthPrefix)) return false;
      return true;
    });
  }, [transactions, period, selectedDate]);

  // Fully filtered transactions for Ledger
  const filteredTransactions = useMemo(() => {
    return periodTransactions.filter((t) => {
      if (paymentFilter !== 'all' && t.paymentMethod !== paymentFilter) return false;
      if (seenByFilter !== 'all' && t.seenBy !== seenByFilter) return false;
      if (referredByFilter !== 'all' && t.referredBy !== referredByFilter) return false;

      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          t.patientName.toLowerCase().includes(q) ||
          t.regNo.toLowerCase().includes(q) ||
          t.receiptNo.toLowerCase().includes(q) ||
          t.seenBy.toLowerCase().includes(q) ||
          t.referredBy.toLowerCase().includes(q)
        );
      }

      return true;
    });
  }, [periodTransactions, paymentFilter, seenByFilter, referredByFilter, searchQuery]);

  // Overall totals based on period
  const totalCollected = useMemo(() => {
    return periodTransactions.reduce((acc, curr) => acc + curr.amount, 0);
  }, [periodTransactions]);

  const totalCash = useMemo(() => {
    return periodTransactions.filter((t) => t.paymentMethod === 'Cash').reduce((acc, c) => acc + c.amount, 0);
  }, [periodTransactions]);

  const totalDigital = useMemo(() => {
    return periodTransactions.filter((t) => t.paymentMethod !== 'Cash').reduce((acc, c) => acc + c.amount, 0);
  }, [periodTransactions]);

  // 1. REVENUE BREAKDOWN BY SEEN BY (PHYSIOTHERAPIST)
  const physiotherapistBreakdown = useMemo(() => {
    const map = new Map<
      string,
      {
        name: string;
        initialCount: number;
        initialRevenue: number;
        followUpCount: number;
        followUpRevenue: number;
        totalRevenue: number;
        totalSessions: number;
        cashRevenue: number;
        digitalRevenue: number;
        uniquePatients: Set<string>;
      }
    >();

    periodTransactions.forEach((t) => {
      const doc = t.seenBy || CLINIC_CONFIG.doctorName;
      if (!map.has(doc)) {
        map.set(doc, {
          name: doc,
          initialCount: 0,
          initialRevenue: 0,
          followUpCount: 0,
          followUpRevenue: 0,
          totalRevenue: 0,
          totalSessions: 0,
          cashRevenue: 0,
          digitalRevenue: 0,
          uniquePatients: new Set<string>(),
        });
      }

      const entry = map.get(doc)!;
      entry.totalSessions += 1;
      entry.totalRevenue += t.amount;
      entry.uniquePatients.add(t.patientId);

      if (t.type === 'Initial Consultation') {
        entry.initialCount += 1;
        entry.initialRevenue += t.amount;
      } else {
        entry.followUpCount += 1;
        entry.followUpRevenue += t.amount;
      }

      if (t.paymentMethod === 'Cash') {
        entry.cashRevenue += t.amount;
      } else {
        entry.digitalRevenue += t.amount;
      }
    });

    return Array.from(map.values()).sort((a, b) => b.totalRevenue - a.totalRevenue);
  }, [periodTransactions]);

  // 2. REVENUE BREAKDOWN BY REFERRED BY (DOCTOR)
  const referredByBreakdown = useMemo(() => {
    const map = new Map<
      string,
      {
        doctorName: string;
        initialCount: number;
        initialRevenue: number;
        followUpCount: number;
        followUpRevenue: number;
        totalRevenue: number;
        uniquePatients: Set<string>;
      }
    >();

    periodTransactions.forEach((t) => {
      const ref = t.referredBy || 'Self / Direct Walk-in';
      if (!map.has(ref)) {
        map.set(ref, {
          doctorName: ref,
          initialCount: 0,
          initialRevenue: 0,
          followUpCount: 0,
          followUpRevenue: 0,
          totalRevenue: 0,
          uniquePatients: new Set<string>(),
        });
      }

      const entry = map.get(ref)!;
      entry.totalRevenue += t.amount;
      entry.uniquePatients.add(t.patientId);

      if (t.type === 'Initial Consultation') {
        entry.initialCount += 1;
        entry.initialRevenue += t.amount;
      } else {
        entry.followUpCount += 1;
        entry.followUpRevenue += t.amount;
      }
    });

    return Array.from(map.values()).sort((a, b) => b.totalRevenue - a.totalRevenue);
  }, [periodTransactions]);

  // Export CSV Handlers
  const handleExportTransactionsCsv = () => {
    const headers = [
      'Date',
      'Receipt No',
      'Reg No',
      'Patient Name',
      'Seen By (Physiotherapist)',
      'Referred By (Doctor)',
      'Session Type',
      'Payment Mode',
      'Amount (INR)',
    ];
    const rows = filteredTransactions.map((t) => [
      t.date,
      `"${t.receiptNo}"`,
      `"${t.regNo}"`,
      `"${t.patientName}"`,
      `"${t.seenBy}"`,
      `"${t.referredBy}"`,
      `"${t.type}"`,
      `"${t.paymentMethod}"`,
      t.amount,
    ]);

    const csvContent =
      '\uFEFF' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    downloadCsv(csvContent, `Namana_Physio_Fee_Transactions_${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const handleExportPhysioCsv = () => {
    const headers = [
      'Physiotherapist Name',
      'Unique Patients',
      'Initial Consultations Count',
      'Initial Consultation Revenue (INR)',
      'Follow-up Sessions Count',
      'Follow-up Sessions Revenue (INR)',
      'Total Sessions Handled',
      'Total Revenue Earned (INR)',
      'Cash Collections (INR)',
      'Digital Collections (INR)',
      '% Share of Clinic Revenue',
    ];

    const rows = physiotherapistBreakdown.map((p) => {
      const share = totalCollected > 0 ? ((p.totalRevenue / totalCollected) * 100).toFixed(1) : '0.0';
      return [
        `"${p.name}"`,
        p.uniquePatients.size,
        p.initialCount,
        p.initialRevenue,
        p.followUpCount,
        p.followUpRevenue,
        p.totalSessions,
        p.totalRevenue,
        p.cashRevenue,
        p.digitalRevenue,
        `"${share}%"`,
      ];
    });

    const csvContent =
      '\uFEFF' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    downloadCsv(csvContent, `Namana_Physiotherapists_Revenue_${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const handleExportReferredDoctorCsv = () => {
    const headers = [
      'Referring Doctor / Source',
      'Total Referred Patients',
      'Initial Consultation Revenue (INR)',
      'Follow-up Rehabilitation Revenue (INR)',
      'Total Revenue Earned Through Reference (INR)',
      '% Share of Clinic Revenue',
    ];

    const rows = referredByBreakdown.map((r) => {
      const share = totalCollected > 0 ? ((r.totalRevenue / totalCollected) * 100).toFixed(1) : '0.0';
      return [
        `"${r.doctorName}"`,
        r.uniquePatients.size,
        r.initialRevenue,
        r.followUpRevenue,
        r.totalRevenue,
        `"${share}%"`,
      ];
    });

    const csvContent =
      '\uFEFF' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    downloadCsv(csvContent, `Namana_Doctor_References_Revenue_${new Date().toISOString().slice(0, 10)}.csv`);
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6 bg-slate-50 text-slate-800">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Top Control Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-3xl border border-sky-100 shadow-xs">
          <div>
            <h2 className="text-lg font-bold text-sky-950 flex items-center gap-2">
              <IndianRupee className="w-5 h-5 text-emerald-600" />
              <span>Fee Collected & Revenue Ledger</span>
            </h2>
            <p className="text-xs text-slate-500">
              Track fee collections, revenue by attending physiotherapist, and revenue earned through referring doctors.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Period selector */}
            <div className="flex items-center p-1 bg-slate-100 border border-slate-200 rounded-xl">
              <button
                type="button"
                onClick={() => setPeriod('all')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  period === 'all' ? 'bg-sky-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All Time
              </button>
              <button
                type="button"
                onClick={() => setPeriod('month')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  period === 'month' ? 'bg-sky-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Month
              </button>
              <button
                type="button"
                onClick={() => setPeriod('day')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  period === 'day' ? 'bg-sky-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Day
              </button>
            </div>

            {/* Date picker if day or month selected */}
            {period !== 'all' && (
              <input
                type={period === 'month' ? 'month' : 'date'}
                value={period === 'month' ? selectedDate.slice(0, 7) : selectedDate}
                onChange={(e) =>
                  setSelectedDate(period === 'month' ? `${e.target.value}-01` : e.target.value)
                }
                className="px-3 py-1.5 bg-white border border-sky-200 rounded-xl text-xs font-semibold text-slate-800 outline-none shadow-2xs"
              />
            )}

            {/* CSV Export Dropdown / Action */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={
                  activeTab === 'seenBy'
                    ? handleExportPhysioCsv
                    : activeTab === 'referredBy'
                    ? handleExportReferredDoctorCsv
                    : handleExportTransactionsCsv
                }
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-xs"
                title="Export current view to CSV"
              >
                <Download className="w-3.5 h-3.5 text-emerald-600" />
                <span>
                  {activeTab === 'seenBy'
                    ? 'Export Physio Summary'
                    : activeTab === 'referredBy'
                    ? 'Export Doctor Summary'
                    : 'Export Ledger CSV'}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* 3 Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Total Collected */}
          <div className="bg-gradient-to-br from-sky-600 via-sky-700 to-sky-800 text-white p-5 rounded-3xl shadow-sm space-y-1">
            <div className="flex items-center justify-between opacity-90">
              <span className="text-xs font-semibold text-sky-100">Total Revenue Collected</span>
              <TrendingUp className="w-4 h-4 text-sky-200" />
            </div>
            <p className="text-2xl sm:text-3xl font-black font-mono">₹{totalCollected.toLocaleString()}</p>
            <p className="text-[11px] text-sky-200">
              {periodTransactions.length} recorded payments ({period === 'all' ? 'All records' : period})
            </p>
          </div>

          {/* Cash Payments */}
          <div className="bg-white p-5 rounded-3xl border border-sky-100 shadow-xs space-y-1">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-semibold">Cash Receipts</span>
              <Wallet className="w-4 h-4 text-amber-500" />
            </div>
            <p className="text-2xl font-black text-slate-900 font-mono">₹{totalCash.toLocaleString()}</p>
            <p className="text-[11px] text-slate-400">Direct clinic counter cash</p>
          </div>

          {/* Digital Payments (UPI / Card / Bank) */}
          <div className="bg-white p-5 rounded-3xl border border-sky-100 shadow-xs space-y-1">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-semibold">UPI & Digital</span>
              <CreditCard className="w-4 h-4 text-sky-600" />
            </div>
            <p className="text-2xl font-black text-sky-700 font-mono">₹{totalDigital.toLocaleString()}</p>
            <p className="text-[11px] text-slate-400">GPay, PhonePe, Card, Bank transfers</p>
          </div>
        </div>

        {/* Navigation Tabs for Views: Ledger, Seen by Physiotherapist, Referred by Doctor */}
        <div className="flex items-center gap-2 p-1.5 bg-white border border-sky-100 rounded-2xl shadow-2xs overflow-x-auto">
          <button
            type="button"
            id="tab-fee-ledger"
            onClick={() => setActiveTab('ledger')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'ledger'
                ? 'bg-sky-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-sky-900 hover:bg-sky-50/60'
            }`}
          >
            <ListFilter className="w-4 h-4" />
            <span>1. All Transactions Ledger</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${
                activeTab === 'ledger' ? 'bg-sky-500 text-white' : 'bg-slate-100 text-slate-600'
              }`}
            >
              {filteredTransactions.length}
            </span>
          </button>

          <button
            type="button"
            id="tab-fee-seen-by"
            onClick={() => setActiveTab('seenBy')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'seenBy'
                ? 'bg-sky-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-sky-900 hover:bg-sky-50/60'
            }`}
          >
            <UserCheck className="w-4 h-4" />
            <span>2. By Physiotherapist (Seen By)</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${
                activeTab === 'seenBy' ? 'bg-sky-500 text-white' : 'bg-slate-100 text-slate-600'
              }`}
            >
              {physiotherapistBreakdown.length}
            </span>
          </button>

          <button
            type="button"
            id="tab-fee-referred-by"
            onClick={() => setActiveTab('referredBy')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'referredBy'
                ? 'bg-sky-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-sky-900 hover:bg-sky-50/60'
            }`}
          >
            <Stethoscope className="w-4 h-4" />
            <span>3. By Referred Doctor (References)</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${
                activeTab === 'referredBy' ? 'bg-sky-500 text-white' : 'bg-slate-100 text-slate-600'
              }`}
            >
              {referredByBreakdown.length}
            </span>
          </button>
        </div>

        {/* TAB 1: ALL TRANSACTIONS LEDGER */}
        {activeTab === 'ledger' && (
          <div className="bg-white rounded-3xl border border-sky-100 shadow-xs overflow-hidden space-y-3">
            <div className="p-4 sm:p-5 border-b border-sky-50 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div>
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-sky-950">
                  Transaction Records ({filteredTransactions.length})
                </h3>
                <p className="text-[11px] text-slate-500">
                  Filter by attending physiotherapist, referring doctor, payment mode, or patient name.
                </p>
              </div>

              {/* Filters grid */}
              <div className="flex items-center gap-2 flex-wrap">
                {/* Seen By Filter */}
                <select
                  value={seenByFilter}
                  onChange={(e) => setSeenByFilter(e.target.value)}
                  className="px-2.5 py-1.5 bg-white border border-sky-200 rounded-xl text-xs font-semibold text-slate-800 outline-none cursor-pointer shadow-2xs"
                  title="Filter by attending physiotherapist"
                >
                  <option value="all">All Physiotherapists</option>
                  {availableSeenBy.map((doc) => (
                    <option key={doc} value={doc}>
                      {doc}
                    </option>
                  ))}
                </select>

                {/* Referred By Filter */}
                <select
                  value={referredByFilter}
                  onChange={(e) => setReferredByFilter(e.target.value)}
                  className="px-2.5 py-1.5 bg-white border border-sky-200 rounded-xl text-xs font-semibold text-slate-800 outline-none cursor-pointer shadow-2xs"
                  title="Filter by referring doctor"
                >
                  <option value="all">All Referring Doctors</option>
                  {availableReferredBy.map((ref) => (
                    <option key={ref} value={ref}>
                      {ref}
                    </option>
                  ))}
                </select>

                {/* Payment mode filter */}
                <select
                  value={paymentFilter}
                  onChange={(e) => setPaymentFilter(e.target.value)}
                  className="px-2.5 py-1.5 bg-white border border-sky-200 rounded-xl text-xs font-semibold text-slate-800 outline-none cursor-pointer shadow-2xs"
                >
                  <option value="all">All Modes</option>
                  <option value="Cash">Cash</option>
                  <option value="UPI">UPI / GPay</option>
                  <option value="Card">Card</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                </select>

                {/* Search Input */}
                <div className="relative w-44 sm:w-56">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search receipt, name..."
                    className="w-full pl-8 pr-3 py-1.5 bg-white border border-sky-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 outline-none focus:border-sky-500 shadow-2xs"
                  />
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-sky-50/60 text-[11px] font-bold text-sky-950 uppercase tracking-wider border-b border-sky-100">
                  <tr>
                    <th className="p-3.5 pl-5">Date</th>
                    <th className="p-3.5">Receipt No</th>
                    <th className="p-3.5">Patient Details</th>
                    <th className="p-3.5">Seen By</th>
                    <th className="p-3.5">Referred By</th>
                    <th className="p-3.5">Type</th>
                    <th className="p-3.5">Mode</th>
                    <th className="p-3.5 text-right">Fee (₹)</th>
                    <th className="p-3.5 pr-5 text-center">Receipt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-sky-50 font-medium">
                  {filteredTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-8 text-center text-slate-500 text-xs">
                        No fee records matching the selected filters.
                      </td>
                    </tr>
                  ) : (
                    filteredTransactions.map((tx) => (
                      <tr key={tx.id} className="hover:bg-sky-50/40 transition-colors">
                        <td className="p-3.5 pl-5 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                          {tx.date}
                        </td>
                        <td className="p-3.5 font-mono text-[11px] font-semibold text-slate-600 whitespace-nowrap">
                          {tx.receiptNo}
                        </td>
                        <td className="p-3.5">
                          <div
                            onClick={() => onSelectPatient && onSelectPatient(tx.patientId)}
                            className="font-bold text-slate-900 hover:text-sky-700 cursor-pointer"
                          >
                            {tx.patientName}
                          </div>
                          <span className="font-mono text-[10px] text-sky-700">{tx.regNo}</span>
                        </td>
                        <td className="p-3.5">
                          <span className="font-semibold text-slate-800">{tx.seenBy}</span>
                        </td>
                        <td className="p-3.5">
                          <span className="text-slate-600">{tx.referredBy}</span>
                        </td>
                        <td className="p-3.5 text-[11px] text-slate-500 whitespace-nowrap">{tx.type}</td>
                        <td className="p-3.5">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              tx.paymentMethod === 'Cash'
                                ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                : tx.paymentMethod === 'UPI'
                                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                : 'bg-sky-50 text-sky-800 border border-sky-200'
                            }`}
                          >
                            {tx.paymentMethod}
                          </span>
                        </td>
                        <td className="p-3.5 text-right font-mono font-bold text-emerald-700 whitespace-nowrap">
                          ₹{tx.amount.toLocaleString()}
                        </td>
                        <td className="p-3.5 pr-5 text-center">
                          {onOpenReceipt && (
                            <button
                              type="button"
                              onClick={() =>
                                onOpenReceipt({
                                  name: tx.patientName,
                                  receiptNo: tx.receiptNo,
                                  date: tx.date,
                                  amount: tx.amount,
                                  visitType: tx.visitType as any,
                                  paymentMethod: tx.paymentMethod as any,
                                })
                              }
                              className="text-[11px] font-bold text-sky-700 hover:text-sky-900 hover:underline cursor-pointer"
                            >
                              View
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: REVENUE BY PHYSIOTHERAPIST (SEEN BY) */}
        {activeTab === 'seenBy' && (
          <div className="space-y-4">
            <div className="bg-white p-5 rounded-3xl border border-sky-100 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-extrabold text-sky-950 flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-sky-600" />
                  <span>Revenue Generated by Attending Physiotherapist</span>
                </h3>
                <p className="text-xs text-slate-500">
                  Breakdown of consultations and follow-up sessions seen by each physiotherapist and their financial contribution.
                </p>
              </div>

              <button
                type="button"
                onClick={handleExportPhysioCsv}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-xs self-start sm:self-auto"
              >
                <Download className="w-3.5 h-3.5 text-emerald-600" />
                <span>Export Physio CSV</span>
              </button>
            </div>

            {/* Table of Physiotherapists */}
            <div className="bg-white rounded-3xl border border-sky-100 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-sky-50/60 text-[11px] font-bold text-sky-950 uppercase tracking-wider border-b border-sky-100">
                    <tr>
                      <th className="p-3.5 pl-5">Physiotherapist (Seen By)</th>
                      <th className="p-3.5 text-center">Unique Patients</th>
                      <th className="p-3.5 text-center">Initial Visits</th>
                      <th className="p-3.5 text-center">Follow-ups</th>
                      <th className="p-3.5 text-center">Total Sessions</th>
                      <th className="p-3.5 text-right">Initial Fees</th>
                      <th className="p-3.5 text-right">Follow-up Fees</th>
                      <th className="p-3.5 text-right">Total Revenue (₹)</th>
                      <th className="p-3.5 text-center">% Share</th>
                      <th className="p-3.5 pr-5 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-sky-50 font-medium">
                    {physiotherapistBreakdown.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="p-8 text-center text-slate-500 text-xs">
                          No revenue records found for the selected period.
                        </td>
                      </tr>
                    ) : (
                      physiotherapistBreakdown.map((pt) => {
                        const share =
                          totalCollected > 0 ? ((pt.totalRevenue / totalCollected) * 100).toFixed(1) : '0.0';
                        return (
                          <tr key={pt.name} className="hover:bg-sky-50/40 transition-colors">
                            <td className="p-3.5 pl-5 font-bold text-slate-900 flex items-center gap-2">
                              <div className="w-7 h-7 rounded-xl bg-sky-100 border border-sky-200 flex items-center justify-center text-sky-700 text-xs font-black">
                                {pt.name.charAt(0)}
                              </div>
                              <div>
                                <p className="text-slate-900">{pt.name}</p>
                                <p className="text-[10px] text-slate-500 font-normal">
                                  Cash: ₹{pt.cashRevenue.toLocaleString()} | Digital: ₹{pt.digitalRevenue.toLocaleString()}
                                </p>
                              </div>
                            </td>
                            <td className="p-3.5 text-center font-mono font-bold text-slate-700">
                              {pt.uniquePatients.size}
                            </td>
                            <td className="p-3.5 text-center font-mono text-slate-700">{pt.initialCount}</td>
                            <td className="p-3.5 text-center font-mono text-slate-700">{pt.followUpCount}</td>
                            <td className="p-3.5 text-center font-mono font-bold text-sky-800">
                              {pt.totalSessions}
                            </td>
                            <td className="p-3.5 text-right font-mono text-slate-600">
                              ₹{pt.initialRevenue.toLocaleString()}
                            </td>
                            <td className="p-3.5 text-right font-mono text-slate-600">
                              ₹{pt.followUpRevenue.toLocaleString()}
                            </td>
                            <td className="p-3.5 text-right font-mono font-extrabold text-emerald-700 text-sm">
                              ₹{pt.totalRevenue.toLocaleString()}
                            </td>
                            <td className="p-3.5 text-center">
                              <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-800 border border-sky-200">
                                {share}%
                              </span>
                            </td>
                            <td className="p-3.5 pr-5 text-center">
                              <button
                                type="button"
                                onClick={() => {
                                  setSeenByFilter(pt.name);
                                  setActiveTab('ledger');
                                }}
                                className="px-2.5 py-1 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-700 text-[11px] font-bold border border-sky-200 transition-colors cursor-pointer"
                              >
                                View Ledger
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                  {physiotherapistBreakdown.length > 0 && (
                    <tfoot className="bg-sky-50/80 font-bold border-t border-sky-200 text-sky-950">
                      <tr>
                        <td className="p-3.5 pl-5 uppercase text-xs tracking-wider">All Physiotherapists Total</td>
                        <td className="p-3.5 text-center font-mono">
                          {new Set(periodTransactions.map((t) => t.patientId)).size}
                        </td>
                        <td className="p-3.5 text-center font-mono">
                          {physiotherapistBreakdown.reduce((a, b) => a + b.initialCount, 0)}
                        </td>
                        <td className="p-3.5 text-center font-mono">
                          {physiotherapistBreakdown.reduce((a, b) => a + b.followUpCount, 0)}
                        </td>
                        <td className="p-3.5 text-center font-mono">
                          {physiotherapistBreakdown.reduce((a, b) => a + b.totalSessions, 0)}
                        </td>
                        <td className="p-3.5 text-right font-mono">
                          ₹{physiotherapistBreakdown.reduce((a, b) => a + b.initialRevenue, 0).toLocaleString()}
                        </td>
                        <td className="p-3.5 text-right font-mono">
                          ₹{physiotherapistBreakdown.reduce((a, b) => a + b.followUpRevenue, 0).toLocaleString()}
                        </td>
                        <td className="p-3.5 text-right font-mono text-emerald-800 text-sm">
                          ₹{totalCollected.toLocaleString()}
                        </td>
                        <td className="p-3.5 text-center">100%</td>
                        <td className="p-3.5 pr-5"></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: REVENUE BY REFERRED DOCTOR (REFERENCES) */}
        {activeTab === 'referredBy' && (
          <div className="space-y-4">
            <div className="bg-white p-5 rounded-3xl border border-sky-100 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-extrabold text-sky-950 flex items-center gap-2">
                  <Stethoscope className="w-4 h-4 text-sky-600" />
                  <span>Revenue Earned Through Doctor References</span>
                </h3>
                <p className="text-xs text-slate-500">
                  Total revenue and number of patients earned through each referring doctor or reference channel.
                </p>
              </div>

              <button
                type="button"
                onClick={handleExportReferredDoctorCsv}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-xs self-start sm:self-auto"
              >
                <Download className="w-3.5 h-3.5 text-emerald-600" />
                <span>Export Reference CSV</span>
              </button>
            </div>

            {/* Table of Referred Doctors */}
            <div className="bg-white rounded-3xl border border-sky-100 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-sky-50/60 text-[11px] font-bold text-sky-950 uppercase tracking-wider border-b border-sky-100">
                    <tr>
                      <th className="p-3.5 pl-5">Referring Doctor / Source</th>
                      <th className="p-3.5 text-center">Referred Patients</th>
                      <th className="p-3.5 text-right">Initial Consultation Revenue</th>
                      <th className="p-3.5 text-right">Follow-up Rehabilitation Revenue</th>
                      <th className="p-3.5 text-right">Total Revenue Earned (₹)</th>
                      <th className="p-3.5 text-center">% Share of Clinic Earnings</th>
                      <th className="p-3.5 pr-5 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-sky-50 font-medium">
                    {referredByBreakdown.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-slate-500 text-xs">
                          No doctor reference records found for the selected period.
                        </td>
                      </tr>
                    ) : (
                      referredByBreakdown.map((ref) => {
                        const share =
                          totalCollected > 0 ? ((ref.totalRevenue / totalCollected) * 100).toFixed(1) : '0.0';
                        return (
                          <tr key={ref.doctorName} className="hover:bg-sky-50/40 transition-colors">
                            <td className="p-3.5 pl-5 font-bold text-slate-900 flex items-center gap-2">
                              <div className="w-7 h-7 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 text-xs font-black">
                                <Stethoscope className="w-3.5 h-3.5" />
                              </div>
                              <div>
                                <p className="text-slate-900">{ref.doctorName}</p>
                                <p className="text-[10px] text-slate-500 font-normal">
                                  {ref.initialCount} Initial • {ref.followUpCount} Follow-up Sessions
                                </p>
                              </div>
                            </td>
                            <td className="p-3.5 text-center font-mono font-bold text-slate-800">
                              {ref.uniquePatients.size}
                            </td>
                            <td className="p-3.5 text-right font-mono text-slate-600">
                              ₹{ref.initialRevenue.toLocaleString()}
                            </td>
                            <td className="p-3.5 text-right font-mono text-slate-600">
                              ₹{ref.followUpRevenue.toLocaleString()}
                            </td>
                            <td className="p-3.5 text-right font-mono font-extrabold text-emerald-700 text-sm">
                              ₹{ref.totalRevenue.toLocaleString()}
                            </td>
                            <td className="p-3.5 text-center">
                              <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                {share}%
                              </span>
                            </td>
                            <td className="p-3.5 pr-5 text-center">
                              <button
                                type="button"
                                onClick={() => {
                                  setReferredByFilter(ref.doctorName);
                                  setActiveTab('ledger');
                                }}
                                className="px-2.5 py-1 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-700 text-[11px] font-bold border border-sky-200 transition-colors cursor-pointer"
                              >
                                View Ledger
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                  {referredByBreakdown.length > 0 && (
                    <tfoot className="bg-sky-50/80 font-bold border-t border-sky-200 text-sky-950">
                      <tr>
                        <td className="p-3.5 pl-5 uppercase text-xs tracking-wider">All Reference Channels Total</td>
                        <td className="p-3.5 text-center font-mono">
                          {new Set(periodTransactions.map((t) => t.patientId)).size}
                        </td>
                        <td className="p-3.5 text-right font-mono">
                          ₹{referredByBreakdown.reduce((a, b) => a + b.initialRevenue, 0).toLocaleString()}
                        </td>
                        <td className="p-3.5 text-right font-mono">
                          ₹{referredByBreakdown.reduce((a, b) => a + b.followUpRevenue, 0).toLocaleString()}
                        </td>
                        <td className="p-3.5 text-right font-mono text-emerald-800 text-sm">
                          ₹{totalCollected.toLocaleString()}
                        </td>
                        <td className="p-3.5 text-center">100%</td>
                        <td className="p-3.5 pr-5"></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
