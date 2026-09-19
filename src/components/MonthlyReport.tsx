import React, { useState, useMemo } from 'react';
import { Calendar, Users, Activity, IndianRupee, Download, Search, FileText } from 'lucide-react';
import { Patient } from '../types';
import { MONTH_NAMES } from '../constants';
import { generatePdfMonthlyReport } from '../utils/pdfMonthlyReport';
import { formatPatientId, deduplicatePatients } from '../utils/storage';
import { downloadCsv } from '../utils/fileDownloadHelper';

interface MonthlyReportProps {
  patients: Patient[];
  onSelectPatient?: (id: string) => void;
}

interface MonthlyStat {
  newPatients: number;
  uniquePatients: Set<string>;
  totalVisits: number;
  totalFees: number;
}

export const MonthlyReport: React.FC<MonthlyReportProps> = ({ patients, onSelectPatient }) => {
  // Aggregate stats by month key "YYYY-MM"
  const monthlyData = useMemo(() => {
    const map: Record<string, MonthlyStat> = {};
    const uniquePatients = deduplicatePatients(patients);

    uniquePatients.forEach((p) => {
      if (p.deleted) return;

      // Initial visit
      if (p.date) {
        const monthKey = p.date.slice(0, 7);
        if (!map[monthKey]) {
          map[monthKey] = {
            newPatients: 0,
            uniquePatients: new Set(),
            totalVisits: 0,
            totalFees: 0,
          };
        }
        map[monthKey].newPatients += 1;
        map[monthKey].totalVisits += 1;
        map[monthKey].uniquePatients.add(p.id);
        const fee = parseFloat(String(p.treatmentFee)) || 0;
        map[monthKey].totalFees += fee;
      }

      // Follow-up visits
      (p.followUps || []).forEach((fu) => {
        if (fu.date) {
          const monthKey = fu.date.slice(0, 7);
          if (!map[monthKey]) {
            map[monthKey] = {
              newPatients: 0,
              uniquePatients: new Set(),
              totalVisits: 0,
              totalFees: 0,
            };
          }
          map[monthKey].totalVisits += 1;
          map[monthKey].uniquePatients.add(p.id);
          const fee = parseFloat(String(fu.fee)) || 0;
          map[monthKey].totalFees += fee;
        }
      });
    });

    return map;
  }, [patients]);

  const monthKeys = useMemo(() => {
    const keys = Object.keys(monthlyData).sort().reverse();
    if (keys.length === 0) {
      const current = new Date().toISOString().slice(0, 7);
      return [current];
    }
    return keys;
  }, [monthlyData]);

  const [selectedMonth, setSelectedMonth] = useState<string>(monthKeys[0] || new Date().toISOString().slice(0, 7));
  const [searchQuery, setSearchQuery] = useState('');

  const formatMonthLabel = (mKey: string) => {
    const [year, month] = mKey.split('-');
    const mIdx = parseInt(month, 10) - 1;
    return `${MONTH_NAMES[mIdx] || month} ${year}`;
  };

  const currentStat = monthlyData[selectedMonth] || {
    newPatients: 0,
    uniquePatients: new Set(),
    totalVisits: 0,
    totalFees: 0,
  };

  // Detailed sessions list for selected month
  const sessions = useMemo(() => {
    const list: Array<{
      id: string;
      patientId: string;
      serial: number;
      regNo: string;
      patientName: string;
      date: string;
      type: 'Initial Session' | 'Follow-up Session';
      diagnosis: string;
      fee: number;
      visitType: string;
      paymentMethod: string;
    }> = [];

    const seenIds = new Set<string>();
    const uniquePatients = deduplicatePatients(patients);

    uniquePatients.forEach((p) => {
      if (p.deleted) return;
      const patientRegNo = p.regNo || formatPatientId(p.date, p.serial);

      if (p.date && p.date.startsWith(selectedMonth)) {
        const sessId = `init_${p.id}`;
        if (!seenIds.has(sessId)) {
          seenIds.add(sessId);
          list.push({
            id: sessId,
            patientId: p.id,
            serial: p.serial,
            regNo: patientRegNo,
            patientName: p.name || 'Unnamed',
            date: p.date,
            type: 'Initial Session',
            diagnosis: p.diagnosis || 'General Assessment',
            fee: parseFloat(String(p.treatmentFee)) || 0,
            visitType: p.visitType || 'Clinic',
            paymentMethod: p.paymentMethod || 'Cash',
          });
        }
      }

      (p.followUps || []).forEach((fu, fIdx) => {
        if (fu.date && fu.date.startsWith(selectedMonth)) {
          const sessId = fu.id ? `fu_${fu.id}` : `fu_${p.id}_${fIdx}`;
          if (!seenIds.has(sessId)) {
            seenIds.add(sessId);
            list.push({
              id: sessId,
              patientId: p.id,
              serial: p.serial,
              regNo: patientRegNo,
              patientName: p.name || 'Unnamed',
              date: fu.date,
              type: 'Follow-up Session',
              diagnosis: fu.notes || p.diagnosis || 'Rehabilitation',
              fee: parseFloat(String(fu.fee)) || 0,
              visitType: fu.visitType || p.visitType || 'Clinic',
              paymentMethod: fu.paymentMethod || 'Cash',
            });
          }
        }
      });
    });

    return list.sort((a, b) => b.date.localeCompare(a.date));
  }, [patients, selectedMonth]);

  const filteredSessions = sessions.filter(
    (s) =>
      s.patientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.regNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.diagnosis.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleExportCsv = () => {
    const headers = ['Date', 'Reg No', 'Patient Name', 'Session Type', 'Diagnosis / Notes', 'Visit Mode', 'Fee (INR)'];
    const rows = filteredSessions.map((s) => [
      s.date,
      `"${s.regNo}"`,
      `"${s.patientName}"`,
      `"${s.type}"`,
      `"${s.diagnosis.replace(/"/g, '""')}"`,
      `"${s.visitType}"`,
      s.fee,
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    downloadCsv(csvContent, `Namana_Physio_Monthly_${selectedMonth}.csv`);
  };

  const handleDownloadPdf = () => {
    generatePdfMonthlyReport({
      selectedMonth,
      monthLabel: formatMonthLabel(selectedMonth),
      totalVisits: currentStat.totalVisits,
      newPatients: currentStat.newPatients,
      uniquePatients: currentStat.uniquePatients.size,
      totalFees: currentStat.totalFees,
      sessions: filteredSessions,
    });
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6 bg-slate-50 text-slate-800">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header with Month Selector & Export */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-3xl border border-sky-100 shadow-xs">
          <div>
            <h2 className="text-lg font-bold text-sky-950 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-sky-600" />
              <span>Monthly Clinical Performance</span>
            </h2>
            <p className="text-xs text-slate-500">
              Overview of patient registrations, follow-up rehabilitation visits, and revenue for the month.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            {/* Month Select */}
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="flex-1 sm:flex-none px-3.5 py-2 bg-white border border-sky-200 rounded-xl text-xs font-bold text-slate-800 outline-none cursor-pointer hover:border-sky-400 transition-colors shadow-2xs min-w-[130px]"
            >
              {monthKeys.map((k) => (
                <option key={k} value={k}>
                  {formatMonthLabel(k)}
                </option>
              ))}
            </select>

            <div className="flex items-center gap-2">
              <button
                onClick={handleExportCsv}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-2xs"
                title="Download Monthly Ledger CSV"
              >
                <Download className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <span>CSV</span>
              </button>

              <button
                onClick={handleDownloadPdf}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-xs whitespace-nowrap"
                title="Download Official Monthly Performance PDF Report"
              >
                <FileText className="w-3.5 h-3.5 text-white shrink-0" />
                <span>Download PDF</span>
              </button>
            </div>
          </div>
        </div>

        {/* 4 Summary Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* Total Visits */}
          <div className="bg-white p-5 rounded-3xl border border-sky-100 shadow-xs space-y-1">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-semibold">Total Sessions</span>
              <Activity className="w-4 h-4 text-sky-600" />
            </div>
            <p className="text-2xl font-black text-sky-950 font-mono">{currentStat.totalVisits}</p>
            <p className="text-[11px] text-slate-400">Clinical sessions logged</p>
          </div>

          {/* New Patients */}
          <div className="bg-white p-5 rounded-3xl border border-sky-100 shadow-xs space-y-1">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-semibold">New Patients</span>
              <Users className="w-4 h-4 text-emerald-600" />
            </div>
            <p className="text-2xl font-black text-emerald-700 font-mono">{currentStat.newPatients}</p>
            <p className="text-[11px] text-slate-400">New charts opened</p>
          </div>

          {/* Unique Patients */}
          <div className="bg-white p-5 rounded-3xl border border-sky-100 shadow-xs space-y-1">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-semibold">Unique Patients</span>
              <Users className="w-4 h-4 text-sky-600" />
            </div>
            <p className="text-2xl font-black text-sky-800 font-mono">{currentStat.uniquePatients.size}</p>
            <p className="text-[11px] text-slate-400">Treated this month</p>
          </div>

          {/* Revenue */}
          <div className="bg-white p-5 rounded-3xl border border-sky-100 shadow-xs space-y-1">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-semibold">Monthly Revenue</span>
              <IndianRupee className="w-4 h-4 text-emerald-600" />
            </div>
            <p className="text-2xl font-black text-emerald-700 font-mono">₹{currentStat.totalFees.toLocaleString()}</p>
            <p className="text-[11px] text-slate-400">Consultation & therapy fees</p>
          </div>
        </div>

        {/* Sessions Table for Selected Month */}
        <div className="bg-white rounded-3xl border border-sky-100 shadow-xs overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-sky-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-sky-950">
              Sessions for {formatMonthLabel(selectedMonth)} ({filteredSessions.length})
            </h3>

            <div className="relative max-w-xs w-full">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search month sessions..."
                className="w-full pl-8 pr-3 py-1.5 bg-white border border-sky-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 outline-none focus:border-sky-500 shadow-2xs"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-sky-50/60 text-[11px] font-bold text-sky-950 uppercase tracking-wider border-b border-sky-100">
                <tr>
                  <th className="p-3.5 pl-5">Date</th>
                  <th className="p-3.5">Reg No</th>
                  <th className="p-3.5">Patient Name</th>
                  <th className="p-3.5">Session Type</th>
                  <th className="p-3.5">Diagnosis / Progress</th>
                  <th className="p-3.5">Mode</th>
                  <th className="p-3.5 pr-5 text-right">Fee (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sky-50 font-medium">
                {filteredSessions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400 text-xs">
                      No clinical sessions recorded for {formatMonthLabel(selectedMonth)}.
                    </td>
                  </tr>
                ) : (
                  filteredSessions.map((item) => (
                    <tr
                      key={item.id}
                      onClick={() => onSelectPatient && onSelectPatient(item.patientId)}
                      className="hover:bg-sky-50/40 transition-colors cursor-pointer"
                    >
                      <td className="p-3.5 pl-5 font-mono text-[11px] text-slate-500">{item.date}</td>
                      <td className="p-3.5 font-mono font-bold text-sky-800">{item.regNo}</td>
                      <td className="p-3.5 font-bold text-slate-900">{item.patientName}</td>
                      <td className="p-3.5">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            item.type === 'Initial Session'
                              ? 'bg-sky-100 text-sky-900 border border-sky-200'
                              : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          }`}
                        >
                          {item.type}
                        </span>
                      </td>
                      <td className="p-3.5 max-w-xs truncate text-slate-700">{item.diagnosis}</td>
                      <td className="p-3.5 text-slate-500">{item.visitType}</td>
                      <td className="p-3.5 pr-5 text-right font-mono font-bold text-emerald-700">
                        ₹{item.fee}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
