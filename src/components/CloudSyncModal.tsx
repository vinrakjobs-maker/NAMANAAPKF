import React, { useState } from 'react';
import {
  Cloud,
  X,
  Check,
  Download,
  Upload,
  RefreshCw,
  Database,
  FileSpreadsheet,
  ExternalLink,
  Copy,
  AlertCircle,
  HelpCircle,
  ArrowDownToLine,
  ArrowUpToLine,
  Code,
  CheckCircle2,
  Lock,
  Unlock,
  Phone,
  Layers,
  FileCode,
  Zap,
} from 'lucide-react';
import { ClinicSettings, Patient } from '../types';
import {
  extractSpreadsheetId,
  fetchFromGoogleSheet,
  fetchFromAppsScriptWebhook,
  mergePatientsWithSheet,
  copyTableForGoogleSheets,
  downloadGoogleSheetCsv,
  pushToGoogleAppsScript,
  verifyArchiveSpreadsheetLink,
  generateGoogleAppsScriptSnippet,
  generatePhoneDirectoryHtmlSnippet,
  GOOGLE_APPS_SCRIPT_SNIPPET,
} from '../utils/googleSheetsSync';
import { downloadJson } from '../utils/fileDownloadHelper';

interface CloudSyncModalProps {
  settings: ClinicSettings;
  onUpdateSettings: (settings: ClinicSettings) => void;
  patients: Patient[];
  onImportPatients: (patients: Patient[]) => void;
  onClose: () => void;
}

export const CloudSyncModal: React.FC<CloudSyncModalProps> = ({
  settings,
  onUpdateSettings,
  patients,
  onImportPatients,
  onClose,
}) => {
  const initialId = settings.spreadsheetId || settings.googleSpreadsheetId || '';
  const [spreadsheetInput, setSpreadsheetInput] = useState(initialId);
  const [autoSync, setAutoSync] = useState(settings.autoSync || false);
  const [webhookUrl, setWebhookUrl] = useState(settings.sheetsWebhookUrl || '');
  const [isPulling, setIsPulling] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [copiedClipboard, setCopiedClipboard] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);
  const [copiedHtml, setCopiedHtml] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);
  const [showScriptGuide, setShowScriptGuide] = useState(false);

  // Dual Archive Spreadsheets & Validation State
  const [archiveSheet1Input, setArchiveSheet1Input] = useState(
    settings.archiveSheetUrl1 || settings.archiveSheetId1 || ''
  );
  const [archiveSheet2Input, setArchiveSheet2Input] = useState(
    settings.archiveSheetUrl2 || settings.archiveSheetId2 || ''
  );
  const [archive1Status, setArchive1Status] = useState<{
    valid: boolean;
    accessible: boolean;
    id: string;
    message: string;
  } | null>(() => {
    if (settings.archiveSheetId1 && settings.archiveSheetsConfirmed) {
      return {
        valid: true,
        accessible: true,
        id: settings.archiveSheetId1,
        message: 'Verified accessible Archive Sheet 1.',
      };
    }
    return null;
  });
  const [archive2Status, setArchive2Status] = useState<{
    valid: boolean;
    accessible: boolean;
    id: string;
    message: string;
  } | null>(() => {
    if (settings.archiveSheetId2 && settings.archiveSheetsConfirmed) {
      return {
        valid: true,
        accessible: true,
        id: settings.archiveSheetId2,
        message: 'Verified accessible Archive Sheet 2.',
      };
    }
    return null;
  });
  const [isVerifyingArchives, setIsVerifyingArchives] = useState(false);
  const [archiveNotice, setArchiveNotice] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const areArchivesConfirmed = Boolean(
    archive1Status?.valid &&
    archive1Status?.accessible &&
    archive2Status?.valid &&
    archive2Status?.accessible &&
    archive1Status?.id &&
    archive2Status?.id
  );

  const cleanSpreadsheetId = extractSpreadsheetId(spreadsheetInput);
  const googleSheetUrl = cleanSpreadsheetId
    ? `https://docs.google.com/spreadsheets/d/${cleanSpreadsheetId}/edit`
    : '';

  // Save Settings
  const handleSaveSettings = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const arc1Id = archive1Status?.id || extractSpreadsheetId(archiveSheet1Input) || settings.archiveSheetId1;
    const arc2Id = archive2Status?.id || extractSpreadsheetId(archiveSheet2Input) || settings.archiveSheetId2;
    const updated: ClinicSettings = {
      ...settings,
      spreadsheetId: cleanSpreadsheetId,
      googleSpreadsheetId: cleanSpreadsheetId,
      autoSync,
      sheetsWebhookUrl: webhookUrl.trim(),
      archiveSheetUrl1: archiveSheet1Input.trim(),
      archiveSheetId1: arc1Id,
      archiveSheetUrl2: archiveSheet2Input.trim(),
      archiveSheetId2: arc2Id,
      archiveSheetsConfirmed: areArchivesConfirmed || settings.archiveSheetsConfirmed,
    };
    onUpdateSettings(updated);
    setStatusMessage({
      type: 'success',
      text: 'Cloud configuration & dual archive sheets saved successfully!',
    });
    setTimeout(() => setStatusMessage(null), 3500);
  };

  // Verify and Confirm 2 Archive Spreadsheet Links
  const handleVerifyArchives = async () => {
    setArchiveNotice(null);
    const link1 = archiveSheet1Input.trim();
    const link2 = archiveSheet2Input.trim();

    if (!link1 || !link2) {
      setArchiveNotice({
        type: 'error',
        text: 'Please enter both Archive Spreadsheet 1 and Archive Spreadsheet 2 links before verifying.',
      });
      return;
    }

    setIsVerifyingArchives(true);
    try {
      const [res1, res2] = await Promise.all([
        verifyArchiveSpreadsheetLink(link1),
        verifyArchiveSpreadsheetLink(link2),
      ]);

      setArchive1Status(res1);
      setArchive2Status(res2);

      if (!res1.valid || !res1.accessible) {
        setArchiveNotice({
          type: 'error',
          text: `Archive Sheet 1 Error: ${res1.message}`,
        });
        setIsVerifyingArchives(false);
        return;
      }

      if (!res2.valid || !res2.accessible) {
        setArchiveNotice({
          type: 'error',
          text: `Archive Sheet 2 Error: ${res2.message}`,
        });
        setIsVerifyingArchives(false);
        return;
      }

      if (res1.id === res2.id) {
        setArchiveNotice({
          type: 'error',
          text: 'Archive Sheet 1 and Archive Sheet 2 must be different Google Spreadsheets. Please enter two separate links.',
        });
        setIsVerifyingArchives(false);
        return;
      }

      // Both are verified and accessible
      const updated: ClinicSettings = {
        ...settings,
        archiveSheetUrl1: link1,
        archiveSheetId1: res1.id,
        archiveSheetUrl2: link2,
        archiveSheetId2: res2.id,
        archiveSheetsConfirmed: true,
      };
      onUpdateSettings(updated);

      setArchiveNotice({
        type: 'success',
        text: 'Both Archive Spreadsheet links verified and confirmed accessible! Your customized script and Phone Directory dashboard are now unlocked.',
      });
    } catch (e: any) {
      setArchiveNotice({
        type: 'error',
        text: e?.message || 'Failed to verify spreadsheet links.',
      });
    } finally {
      setIsVerifyingArchives(false);
    }
  };

  // Pull / Sync from Google Sheet
  const handlePullFromGoogleSheet = async () => {
    if (!cleanSpreadsheetId && !webhookUrl) {
      setStatusMessage({
        type: 'error',
        text: 'Please enter your Google Spreadsheet ID or Apps Script Web App URL first.',
      });
      return;
    }

    setIsPulling(true);
    setStatusMessage({
      type: 'info',
      text: 'Connecting to Google Sheet and synchronizing clinical records...',
    });

    try {
      let res;
      if (cleanSpreadsheetId) {
        res = await fetchFromGoogleSheet(cleanSpreadsheetId);
      }

      // If GViz failed or was restricted, and we have a webhookUrl, fallback to webhook
      if ((!res || !res.success || res.isPrivate) && webhookUrl) {
        setStatusMessage({
          type: 'info',
          text: 'Private sheet detected. Pulling directly via 2-Way Apps Script Webhook...',
        });
        res = await fetchFromAppsScriptWebhook(webhookUrl);
      }

      if (!res) {
        setStatusMessage({
          type: 'error',
          text: 'Unable to connect to Google Sheet. Please verify the ID or Webhook URL.',
        });
        return;
      }

      if (res.success && res.patients.length > 0) {
        const { mergedPatients, updatedCount, addedCount } = mergePatientsWithSheet(patients, res.patients);
        onImportPatients(mergedPatients);

        const updatedSettings: ClinicSettings = {
          ...settings,
          spreadsheetId: cleanSpreadsheetId || settings.spreadsheetId,
          googleSpreadsheetId: cleanSpreadsheetId || settings.googleSpreadsheetId,
          lastSheetsSyncAt: new Date().toISOString(),
          lastSheetsSyncStatus: 'success',
          lastSheetsSyncMessage: `Synced ${res.patients.length} records (${updatedCount} updated, ${addedCount} added)`,
        };
        onUpdateSettings(updatedSettings);

        setStatusMessage({
          type: 'success',
          text: `Sync Successful! Loaded ${res.patients.length} records from Google Sheet: ${updatedCount} existing records updated, ${addedCount} new records added.`,
        });
      } else if (res.success && res.patients.length === 0) {
        setStatusMessage({
          type: 'info',
          text: 'Connected to Google Sheet, but no patient data rows were detected (empty sheet or headers only).',
        });
      } else {
        setStatusMessage({
          type: 'error',
          text: res.message,
        });
      }
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err?.message || 'Failed to connect to Google Sheet.',
      });
    } finally {
      setIsPulling(false);
    }
  };

  // 1-Click Copy Table for Sheets
  const handleCopyTableForSheets = async () => {
    try {
      const success = await copyTableForGoogleSheets(patients);
      if (success) {
        setCopiedClipboard(true);
        setStatusMessage({
          type: 'success',
          text: 'All patient records copied! Open your Google Sheet, select cell A1, and press Ctrl+V (or Cmd+V) to paste.',
        });
        setTimeout(() => setCopiedClipboard(false), 4000);
      } else {
        setStatusMessage({
          type: 'error',
          text: 'Could not access clipboard. Please use the "Download CSV" option.',
        });
      }
    } catch (e) {
      setStatusMessage({
        type: 'error',
        text: 'Clipboard copy failed. Please use "Download CSV".',
      });
    }
  };

  // Push to Google Apps Script (Realtime primary sheet sync + Add-only dual archives)
  const handlePushToGoogleAppsScript = async () => {
    if (!webhookUrl) {
      setStatusMessage({
        type: 'error',
        text: 'Please configure your Google Apps Script Web App URL below to push data directly.',
      });
      setShowScriptGuide(true);
      return;
    }

    setIsPushing(true);
    setStatusMessage({
      type: 'info',
      text: 'Pushing clinical database to Primary Database Sheet and Dual Archive Sheets...',
    });

    try {
      const arc1 = archive1Status?.id || extractSpreadsheetId(archiveSheet1Input) || settings.archiveSheetId1;
      const arc2 = archive2Status?.id || extractSpreadsheetId(archiveSheet2Input) || settings.archiveSheetId2;

      const res = await pushToGoogleAppsScript(webhookUrl, patients, {
        archiveSheet1Id: arc1,
        archiveSheet2Id: arc2,
      });
      if (res.success) {
        const updatedSettings: ClinicSettings = {
          ...settings,
          sheetsWebhookUrl: webhookUrl.trim(),
          archiveSheetId1: arc1 || settings.archiveSheetId1,
          archiveSheetId2: arc2 || settings.archiveSheetId2,
          lastSheetsSyncAt: new Date().toISOString(),
          lastSheetsSyncStatus: 'success',
        };
        onUpdateSettings(updatedSettings);
        setStatusMessage({
          type: 'success',
          text: res.message || 'Realtime sync complete! Primary sheet and dual archives updated.',
        });
      } else {
        setStatusMessage({
          type: 'error',
          text: res.message,
        });
      }
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err?.message || 'Error executing Google Apps Script push.',
      });
    } finally {
      setIsPushing(false);
    }
  };

  // Copy Apps Script code
  const handleCopyAppsScript = () => {
    const code = generateGoogleAppsScriptSnippet(
      archive1Status?.id || settings.archiveSheetId1,
      archive2Status?.id || settings.archiveSheetId2
    );
    navigator.clipboard.writeText(code);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 3000);
  };

  // Copy Phone Directory HTML code
  const handleCopyPhoneDirectoryHtml = () => {
    const html = generatePhoneDirectoryHtmlSnippet();
    navigator.clipboard.writeText(html);
    setCopiedHtml(true);
    setTimeout(() => setCopiedHtml(false), 3000);
  };

  // Export JSON backup
  const handleExportJson = async () => {
    const dataStr = JSON.stringify(patients, null, 2);
    const fileName = `Namana_Physio_Backup_${new Date().toISOString().slice(0, 10)}.json`;
    await downloadJson(dataStr, fileName);
  };

  // Import JSON backup
  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (Array.isArray(parsed)) {
          onImportPatients(parsed);
          setStatusMessage({
            type: 'success',
            text: `Successfully restored ${parsed.length} patient records from backup!`,
          });
        } else {
          alert('Invalid JSON file format: Expected an array of patients');
        }
      } catch (err) {
        alert('Could not parse JSON file. Please verify format.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-xl w-full shadow-2xl border border-sky-100 overflow-hidden my-auto text-slate-800 flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-sky-100 flex items-center justify-between bg-sky-50/70 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-sky-100 rounded-xl text-sky-700">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-sky-950">Google Sheets Sync & Cloud Backup</h3>
              <p className="text-[11px] text-slate-500">Live bidirectional synchronization & spreadsheet export</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Status Message Notification */}
          {statusMessage && (
            <div
              className={`p-3.5 border rounded-2xl text-xs flex items-start gap-2.5 animate-fade-in ${
                statusMessage.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : statusMessage.type === 'error'
                  ? 'bg-rose-50 border-rose-200 text-rose-900'
                  : 'bg-sky-50 border-sky-200 text-sky-900'
              }`}
            >
              {statusMessage.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />}
              {statusMessage.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />}
              {statusMessage.type === 'info' && <RefreshCw className="w-4 h-4 text-sky-600 shrink-0 mt-0.5 animate-spin" />}
              <div className="leading-relaxed font-medium">{statusMessage.text}</div>
            </div>
          )}

          {/* Section 1: Google Sheet ID / URL */}
          <div className="bg-slate-50/80 p-4 rounded-2xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                <span>Google Spreadsheet ID or URL</span>
              </label>
              {cleanSpreadsheetId && (
                <a
                  href={googleSheetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[11px] font-bold text-sky-600 hover:text-sky-800 hover:underline"
                >
                  <span>Open Sheet</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>

            <div className="relative">
              <input
                type="text"
                value={spreadsheetInput}
                onChange={(e) => setSpreadsheetInput(e.target.value)}
                placeholder="Paste Spreadsheet ID or full https://docs.google.com/spreadsheets/d/... URL"
                className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-mono text-slate-800 placeholder-slate-400 focus:border-sky-500 focus:ring-1 focus:ring-sky-200 outline-none shadow-2xs"
              />
            </div>

            {cleanSpreadsheetId && cleanSpreadsheetId !== spreadsheetInput.trim() && (
              <p className="text-[10px] text-emerald-700 font-mono bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-100">
                Extracted Sheet ID: <b>{cleanSpreadsheetId}</b>
              </p>
            )}

            {/* Sync Action Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              {/* Pull from Google Sheet */}
              <button
                type="button"
                onClick={handlePullFromGoogleSheet}
                disabled={isPulling || !cleanSpreadsheetId}
                className="flex items-center justify-center gap-2 py-2.5 px-3 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs disabled:opacity-40"
              >
                <ArrowDownToLine className={`w-4 h-4 ${isPulling ? 'animate-bounce' : ''}`} />
                <span>{isPulling ? 'Pulling Data...' : 'Pull / Sync from Sheet'}</span>
              </button>

              {/* 1-Click Copy Table for Sheets */}
              <button
                type="button"
                onClick={handleCopyTableForSheets}
                className="flex items-center justify-center gap-2 py-2.5 px-3 bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs"
                title="Copies formatted table with all patient rows ready for Ctrl+V paste into cell A1"
              >
                {copiedClipboard ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-emerald-600" />}
                <span>{copiedClipboard ? 'Copied to Clipboard!' : 'Copy Table for Sheet'}</span>
              </button>
            </div>

            {/* Hint for Sharing Permission */}
            <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl text-[11px] text-amber-900 space-y-1">
              <p className="font-bold flex items-center gap-1.5 text-amber-950">
                <HelpCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>How to ensure your Google Sheet can be read:</span>
              </p>
              <p className="text-amber-800 leading-relaxed pl-5">
                In your Google Sheet, click <b>Share</b> (top right) → Change General access from <i>Restricted</i> to <b>Anyone with the link can view</b> (Viewer) → Click Done.
              </p>
            </div>
          </div>

          {/* Section 2: Export & CSV Utilities */}
          <div className="p-4 bg-slate-50/80 rounded-2xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-slate-800 uppercase tracking-wide">
              <span>Quick Formats for Google Sheets & Excel</span>
              <span className="text-[11px] font-semibold text-slate-500">{patients.length} Clinical Records</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => downloadGoogleSheetCsv(patients)}
                className="flex items-center justify-center gap-1.5 py-2 px-3 bg-white hover:bg-slate-100 text-slate-800 border border-slate-200 rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-2xs"
              >
                <Download className="w-3.5 h-3.5 text-slate-600" />
                <span>Download Sheets CSV</span>
              </button>

              <button
                type="button"
                onClick={handleExportJson}
                className="flex items-center justify-center gap-1.5 py-2 px-3 bg-white hover:bg-slate-100 text-slate-800 border border-slate-200 rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-2xs"
              >
                <Database className="w-3.5 h-3.5 text-slate-600" />
                <span>Export JSON Backup</span>
              </button>
            </div>
          </div>

          {/* Section 3: 2-Way Google Apps Script Webhook & Dual Archive Sync */}
          <div className="border border-sky-100 bg-sky-50/40 rounded-2xl p-4 space-y-3.5">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-sky-950 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-sky-600" />
                  <span>2-Way Google Apps Script Webhook &amp; Dual Archive Sync</span>
                </span>
                <p className="text-[10px] text-slate-500">Realtime sync on Primary Sheet + Add-Only Dual Archive Spreadsheets</p>
              </div>
              <button
                type="button"
                onClick={() => setShowScriptGuide(!showScriptGuide)}
                className="text-[11px] font-bold text-sky-600 hover:text-sky-800 hover:underline cursor-pointer"
              >
                {showScriptGuide ? 'Hide Guide' : 'Setup Guide'}
              </button>
            </div>

            {/* DUAL ARCHIVE SPREADSHEET INPUTS (MANDATORY FOR SCRIPT UNLOCK) */}
            <div className="p-3.5 bg-amber-50/60 border border-amber-200/80 rounded-xl space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                  Dual Archive Sheets (Strictly Add-Only Permanent Archives)
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${areArchivesConfirmed ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-amber-100 text-amber-800 border-amber-300'}`}>
                  {areArchivesConfirmed ? 'Confirmed' : 'Confirmation Required'}
                </span>
              </div>
              <p className="text-[10.5px] text-amber-900 leading-relaxed">
                Add two separate Google Spreadsheet links. The primary sheet receives realtime additions &amp; deletions, while both Archive Sheets <b>strictly add newly entered records without deletion</b>. Both archive sheets must be shared with <i>"Anyone with the link can edit/view"</i>.
              </p>

              <div className="space-y-2">
                <div>
                  <div className="flex items-center justify-between text-[10.5px] font-bold text-slate-700 mb-1">
                    <span>Archive Spreadsheet 1 Link / URL</span>
                    {archive1Status?.accessible && (
                      <span className="text-emerald-700 font-medium flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Accessible
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    value={archiveSheet1Input}
                    onChange={(e) => {
                      setArchiveSheet1Input(e.target.value);
                      setArchive1Status(null);
                    }}
                    placeholder="https://docs.google.com/spreadsheets/d/1A2B3C.../edit or Spreadsheet ID"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono text-slate-800 placeholder-slate-400 focus:border-amber-500 outline-none shadow-2xs"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between text-[10.5px] font-bold text-slate-700 mb-1">
                    <span>Archive Spreadsheet 2 Link / URL</span>
                    {archive2Status?.accessible && (
                      <span className="text-emerald-700 font-medium flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Accessible
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    value={archiveSheet2Input}
                    onChange={(e) => {
                      setArchiveSheet2Input(e.target.value);
                      setArchive2Status(null);
                    }}
                    placeholder="https://docs.google.com/spreadsheets/d/1X2Y3Z.../edit or Spreadsheet ID"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono text-slate-800 placeholder-slate-400 focus:border-amber-500 outline-none shadow-2xs"
                  />
                </div>

                <div className="pt-0.5 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    disabled={isVerifyingArchives || !archiveSheet1Input.trim() || !archiveSheet2Input.trim()}
                    onClick={handleVerifyArchives}
                    className="flex items-center justify-center gap-1.5 px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-xs disabled:opacity-40"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isVerifyingArchives ? 'animate-spin' : ''}`} />
                    <span>{isVerifyingArchives ? 'Verifying Accessibility...' : 'Verify & Confirm 2 Archive Links'}</span>
                  </button>

                  {areArchivesConfirmed && (
                    <span className="text-[10.5px] font-bold text-emerald-700 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Verified
                    </span>
                  )}
                </div>

                {archiveNotice && (
                  <div className={`p-2 rounded-xl text-xs flex items-start gap-1.5 ${archiveNotice.type === 'success' ? 'bg-emerald-50 text-emerald-900 border border-emerald-200' : 'bg-rose-50 text-rose-900 border border-rose-200'}`}>
                    {archiveNotice.type === 'success' ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                    )}
                    <span className="text-[11px] leading-relaxed">{archiveNotice.text}</span>
                  </div>
                )}
              </div>
            </div>

            {/* SCRIPT CODE & PHONE DIRECTORY HTML SECTION */}
            <div className="p-3.5 bg-white border border-slate-200 rounded-xl space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Code className="w-3.5 h-3.5 text-slate-600" />
                  <span>Deployment Code &amp; Phone Directory Dashboard</span>
                </span>
                {areArchivesConfirmed ? (
                  <span className="text-[10px] font-bold text-emerald-700 flex items-center gap-1">
                    <Unlock className="w-3 h-3 text-emerald-600" /> Unlocked
                  </span>
                ) : (
                  <span className="text-[10px] font-bold text-slate-500 flex items-center gap-1">
                    <Lock className="w-3 h-3 text-slate-400" /> Locked until confirmed
                  </span>
                )}
              </div>

              {!areArchivesConfirmed ? (
                <div className="p-2.5 bg-slate-50 border border-dashed border-slate-300 rounded-lg text-[11px] text-slate-600 flex items-center gap-2">
                  <Lock className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Confirm 2 Archive Spreadsheet links above to automatically unlock your customized script and dashboard code.</span>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyAppsScript}
                    className="flex items-center gap-1 text-[11px] font-bold px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg cursor-pointer transition-colors shadow-2xs"
                  >
                    {copiedScript ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedScript ? 'Code.gs Copied!' : 'Copy Apps Script (Code.gs)'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleCopyPhoneDirectoryHtml}
                    className="flex items-center gap-1 text-[11px] font-bold px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg cursor-pointer transition-colors shadow-2xs"
                  >
                    {copiedHtml ? <Check className="w-3.5 h-3.5" /> : <FileCode className="w-3.5 h-3.5" />}
                    <span>{copiedHtml ? 'Index.html Copied!' : 'Copy Phone Directory HTML (Index.html)'}</span>
                  </button>
                </div>
              )}

              {showScriptGuide && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-700 space-y-1.5">
                  <ol className="list-decimal pl-4 space-y-1 leading-relaxed text-slate-600">
                    <li>In your primary Google Sheet, open <b>Extensions &gt; Apps Script</b>.</li>
                    <li>Paste the <b>Apps Script Code</b> in <code>Code.gs</code>.</li>
                    <li>Click <b>+ &gt; HTML</b>, name it <code>Index</code>, and paste the <b>Phone Directory HTML</b>.</li>
                    <li>Click <b>Deploy &gt; New deployment</b> &gt; Web app &gt; Access: <b>Anyone</b>.</li>
                    <li>Click Deploy, approve permissions, and copy the Web App URL into the field below.</li>
                  </ol>
                </div>
              )}
            </div>

            {/* WEB APP URL & DIRECT ACCESS BUTTON */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wide flex items-center justify-between">
                <span>Apps Script Web App URL</span>
                {webhookUrl && webhookUrl.trim().startsWith('http') && (
                  <span className="text-[10px] text-emerald-700 font-semibold flex items-center gap-1">
                    <Zap className="w-3 h-3 text-emerald-600" /> Ready for Direct Access
                  </span>
                )}
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder="https://script.google.com/macros/s/.../exec"
                  className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono text-slate-800 placeholder-slate-400 focus:border-sky-500 outline-none shadow-2xs"
                />
                <button
                  type="button"
                  onClick={handlePushToGoogleAppsScript}
                  disabled={isPushing || !webhookUrl}
                  className="px-3.5 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-xs disabled:opacity-40 shrink-0"
                  title="Push clinical records to primary sheet and dual archives"
                >
                  <ArrowUpToLine className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* ACCESS TELEPHONE DIRECTORY DASHBOARD BUTTON */}
              {webhookUrl && webhookUrl.trim().startsWith('http') && (
                <div className="p-2.5 bg-gradient-to-r from-sky-50 to-emerald-50 border border-sky-200 rounded-xl flex items-center justify-between gap-2 shadow-2xs mt-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-sky-600 text-white flex items-center justify-center shrink-0">
                      <Phone className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[11px] font-bold text-sky-950 truncate">Telephone Directory Dashboard</div>
                      <div className="text-[10px] text-slate-500 truncate">Live contact directory with search &amp; WhatsApp</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => window.open(webhookUrl.trim(), '_blank')}
                    className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-xs shrink-0"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Access Dashboard</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Section 4: Local Database Restore */}
          <div className="border-t border-slate-100 pt-3 flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-slate-700">Restore from JSON Backup</span>
              <p className="text-[10px] text-slate-400">Upload a previously exported .json file</p>
            </div>
            <label className="flex items-center gap-1.5 py-1.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer">
              <Upload className="w-3.5 h-3.5 text-slate-500" />
              <span>Choose File</span>
              <input type="file" accept=".json" onChange={handleImportJson} className="hidden" />
            </label>
          </div>
        </div>

        {/* Modal Sticky Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between shrink-0">
          <div className="text-[11px] text-slate-500">
            {settings.lastSheetsSyncAt ? (
              <span>
                Last Synced:{' '}
                <b>{new Date(settings.lastSheetsSyncAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</b>
              </span>
            ) : (
              <span>Status: Ready</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={() => handleSaveSettings()}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-xs"
            >
              Save Configuration
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
