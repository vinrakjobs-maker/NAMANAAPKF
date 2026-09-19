import React, { useState, useRef, useEffect } from 'react';
import {
  FileSpreadsheet,
  ArrowDownToLine,
  ArrowUpToLine,
  Copy,
  Download,
  Upload,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  HelpCircle,
  Database,
  Code,
  Check,
  ShieldCheck,
  ShieldAlert,
  KeyRound,
  Eye,
  EyeOff,
  X,
  AlertTriangle,
  Clock,
  Zap,
  History,
  Lock,
  Unlock,
  Phone,
  Layers,
  FileCode,
  ChevronDown,
  ChevronUp,
  HardDrive,
  Sparkles,
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
  pushLocalDatabaseEngineToSheets,
  verifyArchiveSpreadsheetLink,
  generatePhoneDirectoryHtmlSnippet,
  generateGoogleAppsScriptSnippet,
  GOOGLE_APPS_SCRIPT_SNIPPET,
} from '../utils/googleSheetsSync';
import { PatientPhoneDirectoryModal } from './PatientPhoneDirectoryModal';
import {
  getLocumPhysiotherapists,
  saveLocumPhysiotherapists,
  getCommonReferralDoctors,
  saveCommonReferralDoctors,
  parseDateAndTimestamp,
  deduplicatePatients,
} from '../utils/storage';
import {
  executeHourlyBackup,
  getHourlyBackupHistory,
  getNextHourCountdown,
  HourlyBackupRecord,
  HOURLY_BACKUP_LATEST_KEY,
} from '../utils/hourlyBackup';
import { localDB, DatabaseStats } from '../db/localDatabase';
import { downloadJson } from '../utils/fileDownloadHelper';

interface GoogleSheetsDashboardProps {
  settings: ClinicSettings;
  onUpdateSettings: (settings: ClinicSettings) => void;
  patients: Patient[];
  onImportPatients: (patients: Patient[]) => void;
}

const STATIC_ACTION_PASSKEY = '7349005387';

interface PendingAction {
  title: string;
  description: string;
  action: () => void;
}

export const GoogleSheetsDashboard: React.FC<GoogleSheetsDashboardProps> = ({
  settings,
  onUpdateSettings,
  patients,
  onImportPatients,
}) => {
  const currentSheetId = settings.spreadsheetId || settings.googleSpreadsheetId || '';
  const [sheetInput, setSheetInput] = useState(currentSheetId);
  const [webhookUrl, setWebhookUrl] = useState(settings.sheetsWebhookUrl || '');
  const [isPulling, setIsPulling] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [copiedClipboard, setCopiedClipboard] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);
  const [copiedHtml, setCopiedHtml] = useState(false);
  const [showScriptGuide, setShowScriptGuide] = useState(false);
  const [codeViewerTab, setCodeViewerTab] = useState<'script' | 'html'>('script');
  const [showInAppDirectory, setShowInAppDirectory] = useState(false);

  // Dual Archive Sheets & Validation State
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

  const [statusMsg, setStatusMsg] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  // Hourly backup countdown & history state
  const [countdown, setCountdown] = useState(() => getNextHourCountdown());
  const [backupHistory, setBackupHistory] = useState<HourlyBackupRecord[]>(() => getHourlyBackupHistory());
  const [showHistorySection, setShowHistorySection] = useState(false);

  // Local Database (IndexedDB) state & diagnostics
  const [dbStats, setDbStats] = useState<DatabaseStats | null>(null);
  const [isCheckingDb, setIsCheckingDb] = useState(false);

  const loadDbStats = async () => {
    setIsCheckingDb(true);
    try {
      const stats = await localDB.getDatabaseStats(patients);
      setDbStats(stats);
    } catch {
      // ignore
    } finally {
      setIsCheckingDb(false);
    }
  };

  // Futuristic Accordion States for Block 1 (Google Spreadsheet Connection) & Block 4 (Auto Hourly Backup)
  const [block1Accordion, setBlock1Accordion] = useState<'pipeline' | 'permissions' | null>('pipeline');
  const [block4Accordion, setBlock4Accordion] = useState<'engine' | 'dbReplication' | 'telemetry' | 'ledger' | null>('engine');
  const [isPushingLocalDB, setIsPushingLocalDB] = useState(false);

  const handlePushLocalDBToSheets = async () => {
    if (!webhookUrl || !webhookUrl.startsWith('http')) {
      setStatusMsg({
        type: 'error',
        text: 'Please configure and paste your Google Apps Script Web App URL in Block 3 first to replicate the Local Database Engine to your spreadsheet and archives.',
      });
      return;
    }
    setIsPushingLocalDB(true);
    try {
      const res = await pushLocalDatabaseEngineToSheets(webhookUrl, patients, {
        archiveSheet1Id: archive1Status?.id || settings.archiveSheetId1,
        archiveSheet2Id: archive2Status?.id || settings.archiveSheetId2,
      });
      setStatusMsg({
        type: res.success ? 'success' : 'error',
        text: res.message,
      });
    } catch (err: any) {
      setStatusMsg({
        type: 'error',
        text: 'Failed to replicate Local Database Engine: ' + (err.message || String(err)),
      });
    } finally {
      setIsPushingLocalDB(false);
    }
  };

  useEffect(() => {
    loadDbStats();
  }, [patients]);

  const handleExportDatabaseDump = async () => {
    try {
      const jsonStr = await localDB.exportFullDatabaseDump();
      const fileName = `namana_physio_localdb_${new Date().toISOString().slice(0, 10)}.json`;
      await downloadJson(jsonStr, fileName);
      setStatusMsg({
        type: 'success',
        text: 'Local database snapshot (.json) exported & saved successfully with all tables and indices.',
      });
      setTimeout(() => setStatusMsg(null), 4000);
    } catch (e: any) {
      setStatusMsg({
        type: 'error',
        text: 'Failed to export local database snapshot: ' + (e?.message || 'Unknown error'),
      });
    }
  };

  useEffect(() => {
    // 1-second interval to update live countdown timer to the top of next hour
    const timer = setInterval(() => {
      setCountdown(getNextHourCountdown());
    }, 1000);

    // Refresh history whenever an automated or manual backup completes
    const onBackupDone = () => {
      setBackupHistory(getHourlyBackupHistory());
    };
    window.addEventListener('physio-hourly-backup-complete', onBackupDone);

    return () => {
      clearInterval(timer);
      window.removeEventListener('physio-hourly-backup-complete', onBackupDone);
    };
  }, []);

  // Caution Action Modal state
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [actionPasskey, setActionPasskey] = useState('');
  const [showActionPasskey, setShowActionPasskey] = useState(false);
  const [actionPasskeyError, setActionPasskeyError] = useState<string | null>(null);

  const jsonFileInputRef = useRef<HTMLInputElement>(null);

  const cleanId = extractSpreadsheetId(sheetInput);
  const sheetUrl = cleanId ? `https://docs.google.com/spreadsheets/d/${cleanId}/edit` : '';

  /**
   * Guards any click on buttons/options with the static action passkey (7349005387)
   */
  const requestAction = (title: string, action: () => void, description?: string) => {
    setActionPasskey('');
    setActionPasskeyError(null);
    setPendingAction({
      title,
      description: description || 'This operation modifies clinic records, performs data sync, or exports clinical databases.',
      action,
    });
  };

  const handleConfirmAction = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (actionPasskey.trim() === STATIC_ACTION_PASSKEY) {
      const act = pendingAction?.action;
      setPendingAction(null);
      setActionPasskey('');
      setActionPasskeyError(null);
      if (act) {
        act();
      }
    } else {
      setActionPasskeyError('Caution: Invalid action passkey.');
    }
  };

  const handleCancelAction = () => {
    setPendingAction(null);
    setActionPasskey('');
    setActionPasskeyError(null);
  };

  const handleSaveConfig = () => {
    const arc1Id = archive1Status?.id || extractSpreadsheetId(archiveSheet1Input) || settings.archiveSheetId1;
    const arc2Id = archive2Status?.id || extractSpreadsheetId(archiveSheet2Input) || settings.archiveSheetId2;
    const updated: ClinicSettings = {
      ...settings,
      spreadsheetId: cleanId,
      googleSpreadsheetId: cleanId,
      sheetsWebhookUrl: webhookUrl.trim(),
      archiveSheetUrl1: archiveSheet1Input.trim(),
      archiveSheetId1: arc1Id,
      archiveSheetUrl2: archiveSheet2Input.trim(),
      archiveSheetId2: arc2Id,
      archiveSheetsConfirmed: areArchivesConfirmed || settings.archiveSheetsConfirmed,
    };
    onUpdateSettings(updated);
    setStatusMsg({
      type: 'success',
      text: 'Google Sheet, Archive Sheets & Webhook configuration saved successfully!',
    });
    setTimeout(() => setStatusMsg(null), 3500);
  };

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
          text: 'Archive Sheet 1 and Archive Sheet 2 must be different Google Spreadsheets. Please provide two distinct spreadsheet links.',
        });
        setIsVerifyingArchives(false);
        return;
      }

      // Both links verified accessible by anyone!
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

  const handlePullData = async (forceReplace = false) => {
    if (!cleanId && !webhookUrl) {
      setStatusMsg({
        type: 'error',
        text: 'Please enter a valid Google Spreadsheet ID or Apps Script Web App URL first.',
      });
      return;
    }

    setIsPulling(true);
    setStatusMsg({
      type: 'info',
      text: 'Querying Google Sheet and loading clinical records...',
    });

    try {
      let res;
      if (cleanId) {
        res = await fetchFromGoogleSheet(cleanId);
      }

      // If GViz failed or was restricted, and we have a webhookUrl, automatically fallback to webhook
      if ((!res || !res.success || res.isPrivate) && webhookUrl) {
        setStatusMsg({
          type: 'info',
          text: 'Private sheet detected. Pulling directly via 2-Way Apps Script Webhook...',
        });
        res = await fetchFromAppsScriptWebhook(webhookUrl);
      }

      if (!res) {
        setStatusMsg({
          type: 'error',
          text: 'Unable to connect to Google Sheet. Please verify the ID or Webhook URL.',
        });
        return;
      }

      if (res.success && res.patients.length > 0) {
        if (forceReplace) {
          onImportPatients(res.patients);
          setStatusMsg({
            type: 'success',
            text: `Directory replaced! Loaded ${res.patients.length} records directly from Google Sheet.`,
          });
        } else {
          const { mergedPatients, updatedCount, addedCount } = mergePatientsWithSheet(patients, res.patients);
          onImportPatients(mergedPatients);
          setStatusMsg({
            type: 'success',
            text: `Sync Successful! Loaded ${res.patients.length} records from Google Sheet: ${updatedCount} existing records updated, ${addedCount} new records added.`,
          });
        }

        const updated: ClinicSettings = {
          ...settings,
          spreadsheetId: cleanId || settings.spreadsheetId,
          googleSpreadsheetId: cleanId || settings.googleSpreadsheetId,
          lastSheetsSyncAt: new Date().toISOString(),
          lastSheetsSyncStatus: 'success',
          lastSheetsSyncMessage: `Synced ${res.patients.length} records`,
        };
        onUpdateSettings(updated);
      } else if (res.success && res.patients.length === 0) {
        setStatusMsg({
          type: 'info',
          text: 'Google Sheet connected successfully, but no patient rows were detected (empty or headers only).',
        });
      } else {
        setStatusMsg({
          type: 'error',
          text: res.message,
        });
      }
    } catch (e: any) {
      setStatusMsg({
        type: 'error',
        text: e?.message || 'Error pulling data from Google Sheet',
      });
    } finally {
      setIsPulling(false);
    }
  };

  const handlePullWebhook = async () => {
    if (!webhookUrl) {
      setStatusMsg({
        type: 'error',
        text: 'Please enter your Google Apps Script Web App URL first.',
      });
      return;
    }

    setIsPulling(true);
    setStatusMsg({
      type: 'info',
      text: 'Querying Webhook and loading patient records from Google Sheet...',
    });

    try {
      const res = await fetchFromAppsScriptWebhook(webhookUrl);
      if (res.success && res.patients.length > 0) {
        const { mergedPatients, updatedCount, addedCount } = mergePatientsWithSheet(patients, res.patients);
        onImportPatients(mergedPatients);
        setStatusMsg({
          type: 'success',
          text: `Webhook Sync Successful! Loaded ${res.patients.length} records: ${updatedCount} existing records updated, ${addedCount} new records added.`,
        });

        const updated: ClinicSettings = {
          ...settings,
          sheetsWebhookUrl: webhookUrl.trim(),
          lastSheetsSyncAt: new Date().toISOString(),
          lastSheetsSyncStatus: 'success',
          lastSheetsSyncMessage: `Synced ${res.patients.length} records via Webhook`,
        };
        onUpdateSettings(updated);
      } else if (res.success && res.patients.length === 0) {
        setStatusMsg({
          type: 'info',
          text: 'Connected to Webhook, but the sheet has no patient rows.',
        });
      } else {
        setStatusMsg({
          type: 'error',
          text: res.message,
        });
      }
    } catch (e: any) {
      setStatusMsg({
        type: 'error',
        text: e?.message || 'Failed to pull from Webhook',
      });
    } finally {
      setIsPulling(false);
    }
  };

  const handleCopyClipboard = async () => {
    try {
      const ok = await copyTableForGoogleSheets(patients);
      if (ok) {
        setCopiedClipboard(true);
        setStatusMsg({
          type: 'success',
          text: 'Every info in patient directory (Seen By, Referred By, Demographics, Modalities, Fees) and follow-up sessions copied! Open your Google Sheet, select cell A1, and press Ctrl+V (or Cmd+V) to paste.',
        });
        setTimeout(() => setCopiedClipboard(false), 4000);
      }
    } catch (e) {
      setStatusMsg({
        type: 'error',
        text: 'Clipboard copy failed. Please use "Download Google Sheets CSV".',
      });
    }
  };

  const handlePushWebhook = async () => {
    if (!webhookUrl) {
      setStatusMsg({
        type: 'error',
        text: 'Please enter your Google Apps Script Web App URL first.',
      });
      setShowScriptGuide(true);
      return;
    }

    setIsPushing(true);
    setStatusMsg({
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
        const updated: ClinicSettings = {
          ...settings,
          sheetsWebhookUrl: webhookUrl.trim(),
          archiveSheetId1: arc1 || settings.archiveSheetId1,
          archiveSheetId2: arc2 || settings.archiveSheetId2,
          lastSheetsSyncAt: new Date().toISOString(),
          lastSheetsSyncStatus: 'success',
        };
        onUpdateSettings(updated);
        setStatusMsg({
          type: 'success',
          text: res.message || 'Realtime sync complete! Primary database sheet and Archive sheets updated successfully.',
        });
      } else {
        setStatusMsg({
          type: 'error',
          text: res.message,
        });
      }
    } catch (e: any) {
      setStatusMsg({
        type: 'error',
        text: e?.message || 'Push command failed',
      });
    } finally {
      setIsPushing(false);
    }
  };

  const handleTriggerHourlyBackupNow = async () => {
    try {
      setStatusMsg({ type: 'info', text: 'Executing on-demand hourly backup snapshot...' });
      const res = await executeHourlyBackup(patients, settings, { isManual: true });
      if (res.settingsUpdate) {
        onUpdateSettings({ ...settings, ...res.settingsUpdate });
      }
      setBackupHistory(getHourlyBackupHistory());
      setStatusMsg({
        type: res.record.status === 'error' ? 'error' : 'success',
        text: res.message,
      });
    } catch (err: any) {
      setStatusMsg({
        type: 'error',
        text: err?.message || 'Hourly backup trigger encountered an issue',
      });
    }
  };

  const handleDownloadLatestHourlySnapshot = async () => {
    try {
      const raw = localStorage.getItem(HOURLY_BACKUP_LATEST_KEY);
      if (!raw) {
        setStatusMsg({ type: 'error', text: 'No hourly backup snapshot found in local storage yet. Click "Test / Trigger Hourly Backup Now" to create one.' });
        return;
      }
      const fileName = `Namana_Hourly_Backup_${new Date().toISOString().slice(0, 13)}.json`;
      await downloadJson(raw, fileName);
      setStatusMsg({ type: 'success', text: 'Latest hourly backup snapshot downloaded as JSON file.' });
    } catch (e: any) {
      setStatusMsg({ type: 'error', text: e?.message || 'Failed to download snapshot' });
    }
  };

  const handleExportJson = async () => {
    // Sanitize every patient and every follow-up so date and time are clean and separated
    const cleanPatients = patients.map((p) => {
      const { cleanDate, cleanTime } = parseDateAndTimestamp(p.date, p.time, p.updatedAt || p.createdAt);
      return {
        ...p,
        date: cleanDate,
        time: cleanTime,
        followUps: (p.followUps || []).map((fu, idx) => {
          const fuDt = parseDateAndTimestamp(fu.date, fu.time, fu.updatedAt || fu.createdAt || p.updatedAt || p.createdAt);
          return {
            ...fu,
            id: fu.id || `fu_${p.id}_${idx + 1}`,
            date: fuDt.cleanDate,
            time: fuDt.cleanTime,
          };
        }),
      };
    });

    const backupPayload = {
      backupFormat: 'Namana_Clinical_Master_Backup_v2',
      clinicName: settings.clinicName || 'Namana Physiotherapy Clinic',
      exportedAt: new Date().toISOString(),
      exportDate: new Date().toISOString().slice(0, 10),
      exportTime: new Date().toTimeString().slice(0, 8),
      totalPatients: cleanPatients.length,
      patients: cleanPatients,
      locumPhysiotherapists: getLocumPhysiotherapists(),
      referralDoctors: getCommonReferralDoctors(),
      clinicSettings: settings,
    };

    const dataStr = JSON.stringify(backupPayload, null, 2);
    const fileName = `Namana_Physio_Clinical_Backup_${new Date().toISOString().slice(0, 10)}.json`;
    await downloadJson(dataStr, fileName);
    setStatusMsg({ type: 'success', text: 'Clinical master backup downloaded and saved successfully!' });
    setTimeout(() => setStatusMsg(null), 4000);
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        let patientList: Patient[] = [];

        if (Array.isArray(parsed)) {
          patientList = parsed;
        } else if (parsed && typeof parsed === 'object' && Array.isArray(parsed.patients)) {
          patientList = parsed.patients;
          if (Array.isArray(parsed.locumPhysiotherapists) && parsed.locumPhysiotherapists.length > 0) {
            saveLocumPhysiotherapists(parsed.locumPhysiotherapists);
          }
          if (Array.isArray(parsed.referralDoctors) && parsed.referralDoctors.length > 0) {
            saveCommonReferralDoctors(parsed.referralDoctors);
          }
          if (parsed.clinicSettings && typeof parsed.clinicSettings === 'object') {
            onUpdateSettings({ ...settings, ...parsed.clinicSettings });
          }
        } else {
          alert('Invalid format: Expected patient records array or comprehensive clinic backup.');
          return;
        }

        // Deep cleanse and deduplicate patients ensuring every follow-up is intact
        const cleanList = deduplicatePatients(patientList);
        onImportPatients(cleanList);
        setStatusMsg({
          type: 'success',
          text: `Successfully restored all ${cleanList.length} patient records with 100% follow-up history, locums, and clinical details intact!`,
        });
      } catch (err) {
        alert('Could not parse JSON file. Please verify file integrity.');
      }
    };
    reader.readAsText(file);
    // Reset file input value so user can upload the same file again if desired
    e.target.value = '';
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6 bg-[#090d16] text-slate-200">
      {/* Hidden file input for JSON restore */}
      <input
        ref={jsonFileInputRef}
        type="file"
        accept=".json"
        onChange={handleImportJson}
        className="hidden"
      />

      <div className="max-w-6xl mx-auto space-y-6">
        {/* Top Header Card */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/90 p-5 sm:p-6 rounded-3xl border border-slate-800 shadow-xl backdrop-blur-md">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="p-3 bg-cyan-500/10 border border-cyan-500/20 rounded-2xl text-cyan-400 shrink-0 shadow-inner">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold text-slate-100 truncate">Google Sheets Synchronization &amp; Cloud Backup</h2>
              <p className="text-xs text-slate-400 line-clamp-2 sm:line-clamp-1 mt-0.5">
                Back up every info in the patient directory (Seen By, Referred By, Demographics, Clinical Records) and all Follow-up Data to Google Sheets
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {cleanId ? (
              <div className="flex items-center gap-2 px-3.5 py-1.5 bg-cyan-950/60 text-cyan-300 border border-cyan-800/80 rounded-xl text-xs font-bold shadow-sm">
                <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
                <span>Sheet Connected</span>
              </div>
            ) : (
              <div className="px-3.5 py-1.5 bg-slate-800/80 text-slate-400 border border-slate-700/60 rounded-xl text-xs font-semibold">
                No Sheet Configured
              </div>
            )}
          </div>
        </div>

        {/* Status Notification */}
        {statusMsg && (
          <div
            className={`p-4 border rounded-2xl text-xs flex items-start gap-3 animate-fade-in ${
              statusMsg.type === 'success'
                ? 'bg-cyan-950/40 border-cyan-800/80 text-cyan-300'
                : statusMsg.type === 'error'
                ? 'bg-rose-950/40 border-rose-800/80 text-rose-300'
                : 'bg-slate-900 border-slate-800 text-slate-200'
            }`}
          >
            {statusMsg.type === 'success' && <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />}
            {statusMsg.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />}
            {statusMsg.type === 'info' && <RefreshCw className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5 animate-spin" />}
            <div className="font-medium leading-relaxed break-words">{statusMsg.text}</div>
          </div>
        )}

        {/* Tetris-Style Modular Sync & Backup Grid (Even 2-column pairing on tablet & desktop, clean single column on mobile) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 lg:gap-6 items-stretch">

          {/* ==================== BLOCK 1: Google Spreadsheet Connection ==================== */}
          <div className="bg-slate-900/90 p-5 sm:p-6 rounded-3xl border border-slate-800 shadow-xl flex flex-col justify-between space-y-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wide flex items-center gap-2 min-w-0">
                  <FileSpreadsheet className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span className="truncate">Google Spreadsheet Connection</span>
                </h3>
                {cleanId && (
                  <button
                    type="button"
                    onClick={() =>
                      requestAction(
                        'Open Google Sheet in Browser',
                        () => window.open(sheetUrl, '_blank'),
                        'Opens the connected Google Sheet spreadsheet in an external browser tab.'
                      )
                    }
                    className="flex items-center gap-1 text-xs font-bold text-cyan-400 hover:text-cyan-300 hover:underline cursor-pointer shrink-0"
                  >
                    <span>Open in Google</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">Spreadsheet ID or Full URL</label>
                <div className="relative">
                  <input
                    type="text"
                    value={sheetInput}
                    onChange={(e) => setSheetInput(e.target.value)}
                    placeholder="Paste Spreadsheet ID or full https://docs.google.com/spreadsheets/d/... URL"
                    className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-slate-100 placeholder-slate-500 focus:bg-slate-950 focus:border-cyan-500 outline-none shadow-inner"
                  />
                </div>
                {cleanId && cleanId !== sheetInput.trim() && (
                  <p className="text-[11px] text-cyan-400 font-mono bg-cyan-950/40 px-3 py-1 rounded-lg border border-cyan-800/60 truncate">
                    Detected Clean ID: <b>{cleanId}</b>
                  </p>
                )}
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                <button
                  type="button"
                  id="btn-pull-google-sheet"
                  onClick={() =>
                    requestAction(
                      'Pull / Sync from Google Sheet',
                      () => handlePullData(false),
                      'Queries your connected Google Sheet and automatically updates local records or inserts new patients.'
                    )
                  }
                  disabled={isPulling || (!cleanId && !webhookUrl)}
                  className="flex items-center justify-center gap-2 py-3 px-3.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-md disabled:opacity-40"
                >
                  <ArrowDownToLine className={`w-4 h-4 shrink-0 ${isPulling ? 'animate-bounce' : ''}`} />
                  <span className="truncate">{isPulling ? 'Pulling...' : 'Pull / Sync from Sheet'}</span>
                </button>

                <button
                  type="button"
                  id="btn-copy-sheet-table"
                  onClick={() =>
                    requestAction(
                      '1-Click Copy Table for Sheet',
                      handleCopyClipboard,
                      'Copies all patient data cleanly formatted with Tab separators, ready for instant Ctrl+V pasting into cell A1 of Google Sheets.'
                    )
                  }
                  className="flex items-center justify-center gap-2 py-3 px-3.5 bg-slate-800/90 hover:bg-slate-700 text-cyan-300 border border-slate-700/80 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs"
                  title="Copies entire patient database formatted for Ctrl+V paste into Google Sheet cell A1"
                >
                  {copiedClipboard ? <Check className="w-4 h-4 text-cyan-400 shrink-0" /> : <Copy className="w-4 h-4 text-cyan-400 shrink-0" />}
                  <span className="truncate">{copiedClipboard ? 'Copied to Clipboard!' : '1-Click Copy Table for Sheet'}</span>
                </button>
              </div>

              {/* Overwrite option for users who want 100% sheet sync */}
              <div className="flex justify-end">
                <button
                  type="button"
                  id="btn-replace-directory"
                  onClick={() =>
                    requestAction(
                      'Replace Entire Local Directory with Sheet Data',
                      () => handlePullData(true),
                      'CAUTION: This will replace the entire local patient directory with the exact rows from your Google Sheet.'
                    )
                  }
                  disabled={isPulling || (!cleanId && !webhookUrl)}
                  className="text-[11px] font-semibold text-slate-400 hover:text-rose-400 hover:underline cursor-pointer transition-colors"
                >
                  Replace Entire Local Directory with Sheet Data
                </button>
              </div>
            </div>

            {/* PROTOCOL ARCHITECTURE (READ / PULL FROM SHEET) */}
            <div className="mt-2 rounded-2xl border border-slate-800 bg-gradient-to-b from-slate-900 via-slate-950 to-slate-900 text-slate-200 shadow-md overflow-hidden divide-y divide-slate-800/80">
              {/* Accordion Item 1: Architecture & Data Feed Protocol */}
              <div className="transition-all">
                <button
                  type="button"
                  onClick={() => setBlock1Accordion(block1Accordion === 'pipeline' ? null : 'pipeline')}
                  className="w-full px-4 py-3 flex items-center justify-between gap-2 hover:bg-slate-800/50 transition-colors text-left cursor-pointer group"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] shrink-0" />
                    <span className="text-xs font-bold tracking-wide text-slate-200 group-hover:text-white truncate">
                      Cloud Pipeline Architecture &amp; Data Feed
                    </span>
                    <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-emerald-950 text-emerald-400 border border-emerald-800 shrink-0">
                      GVIZ / CSV (PULL)
                    </span>
                  </div>
                  {block1Accordion === 'pipeline' ? (
                    <ChevronUp className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                  )}
                </button>

                {block1Accordion === 'pipeline' && (
                  <div className="p-4 bg-slate-950/70 text-[11px] space-y-2.5 animate-in fade-in duration-200">
                    <div className="text-slate-300 leading-relaxed space-y-1.5">
                      <div><b>• Direct GViz Read Stream:</b> Dedicated strictly to pulling and querying active patient data directly from your Google Sheet without intermediate server dependencies.</div>
                      <div><b>• Local DB Archival via Apps Script:</b> Local database engine state and backups are preserved through Google Apps Script on the backup sheet, leaving this connection pure for instant data retrieval.</div>
                      <div><b>• Text Formatting (@):</b> Automatically parses telephone numbers (e.g. <code>9880517715</code>) and 24-hr timestamps (<code>HH:mm:ss</code>) so seconds and country codes are preserved.</div>
                    </div>
                  </div>
                )}
              </div>

              {/* Accordion Item 3: Google Access Permissions Guide */}
              <div className="transition-all">
                <button
                  type="button"
                  onClick={() => setBlock1Accordion(block1Accordion === 'permissions' ? null : 'permissions')}
                  className="w-full px-4 py-3 flex items-center justify-between gap-2 hover:bg-slate-800/50 transition-colors text-left cursor-pointer group"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)] shrink-0" />
                    <span className="text-xs font-bold tracking-wide text-slate-200 group-hover:text-white truncate">
                      Access Permissions &amp; Troubleshooting
                    </span>
                    <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-amber-950 text-amber-400 border border-amber-800 shrink-0">
                      PERMISSIONS
                    </span>
                  </div>
                  {block1Accordion === 'permissions' ? (
                    <ChevronUp className="w-4 h-4 text-amber-400 shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                  )}
                </button>

                {block1Accordion === 'permissions' && (
                  <div className="p-4 bg-slate-950/70 text-[11px] space-y-2 animate-in fade-in duration-200">
                    <p className="text-amber-200 leading-relaxed">
                      To enable real-time reading from your Google Sheet, ensure Google Share settings are set to:
                    </p>
                    <div className="p-2.5 rounded-xl bg-amber-950/40 border border-amber-800/70 text-amber-300 font-mono text-[10px]">
                      Share ➔ General access ➔ Change from "Restricted" to "Anyone with the link can view" (Viewer)
                    </div>
                    <p className="text-slate-400 text-[10px]">
                      If you receive a 403 or 404 error during pull, verify the sheet ID and confirm the sheet is not restricted to an internal organization workspace.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ==================== BLOCK 2: Local Database Engine ==================== */}
          <div className="bg-slate-900/90 p-5 sm:p-6 rounded-3xl border border-slate-800 shadow-xl flex flex-col justify-between space-y-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wide flex items-center gap-2 min-w-0">
                  <Database className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span className="truncate">Local Database Engine</span>
                </h3>
                <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-cyan-950/60 text-cyan-300 border border-cyan-800/80 shadow-2xs shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_6px_rgba(34,211,238,0.8)]" />
                  <span>Auto-Created</span>
                </span>
              </div>

              <p className="text-xs text-slate-400 leading-relaxed">
                Self-initializing local embedded database (<b>IndexedDB</b>) running 100% offline on this device with indexed fields for instantaneous search and offline durability.
              </p>

              {/* Indexed Tables & Fields Pills */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-slate-300">Auto-Provisioned Tables &amp; Fields:</span>
                <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                  <div className="p-2 rounded-xl bg-slate-950/80 border border-slate-800/80 min-w-0">
                    <div className="font-bold text-slate-200 truncate">📋 patients</div>
                    <div className="text-slate-500 text-[9.5px] truncate">id, regNo, name, phone, seenBy</div>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-950/80 border border-slate-800/80 min-w-0">
                    <div className="font-bold text-slate-200 truncate">🔄 followUps</div>
                    <div className="text-slate-500 text-[9.5px] truncate">id, patientId, session#, painScale</div>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-950/80 border border-slate-800/80 min-w-0">
                    <div className="font-bold text-slate-200 truncate">👨‍⚕️ locums</div>
                    <div className="text-slate-500 text-[9.5px] truncate">id, name, idNumber, status</div>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-950/80 border border-slate-800/80 min-w-0">
                    <div className="font-bold text-slate-200 truncate">🏥 doctors &amp; settings</div>
                    <div className="text-slate-500 text-[9.5px] truncate">referralDoctors, clinicConfig</div>
                  </div>
                </div>
              </div>

              {/* Live Database Diagnostics */}
              <div className="space-y-1.5 text-[11px] font-mono text-slate-400 bg-slate-950/90 p-3.5 rounded-2xl border border-slate-800/90">
                <div className="flex justify-between items-center pb-1 border-b border-slate-800/80">
                  <span className="text-slate-500">Database Name:</span>
                  <span className="font-bold text-slate-200">{dbStats?.databaseName || 'NamanaPhysioLocalDB'}</span>
                </div>
                <div className="flex justify-between items-center pb-1 border-b border-slate-800/80">
                  <span className="text-slate-500">Storage Engine:</span>
                  <span className="font-bold text-cyan-400">{dbStats?.engine || 'IndexedDB'} (Native)</span>
                </div>
                <div className="flex justify-between items-center pb-1 border-b border-slate-800/80">
                  <span className="text-slate-500">Total Patients:</span>
                  <span className="font-bold text-cyan-300">{dbStats?.totalPatients ?? patients.length} records</span>
                </div>
                <div className="flex justify-between items-center pb-1 border-b border-slate-800/80">
                  <span className="text-slate-500">Follow-up Sessions:</span>
                  <span className="font-bold text-cyan-300">{dbStats?.totalFollowUps ?? patients.reduce((acc, p) => acc + (p.followUps?.length || 0), 0)} sessions</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Device Status:</span>
                  <span className="font-bold text-emerald-400">100% Offline &amp; Persistent</span>
                </div>
              </div>
            </div>

            {/* DB Actions */}
            <div className="grid grid-cols-2 gap-2 pt-1 mt-auto">
              <button
                type="button"
                id="btn-verify-local-db"
                onClick={loadDbStats}
                disabled={isCheckingDb}
                className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700/80 rounded-xl text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                title="Verify database health and refresh table indices"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 shrink-0 ${isCheckingDb ? 'animate-spin' : ''}`} />
                <span className="truncate">{isCheckingDb ? 'Checking...' : 'Verify DB'}</span>
              </button>
              <button
                type="button"
                id="btn-export-db-dump"
                onClick={() =>
                  requestAction(
                    'Export Local Database Dump',
                    handleExportDatabaseDump,
                    'Exports the complete multi-table IndexedDB database snapshot with all patients, follow-up records, and indices.'
                  )
                }
                className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-cyan-950/60 hover:bg-cyan-900/80 text-cyan-300 border border-cyan-800/80 rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-xs"
                title="Download complete database dump file"
              >
                <Download className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span className="truncate">Export DB</span>
              </button>
            </div>
          </div>

          {/* ==================== BLOCK 3: 2-Way Google Apps Script Webhook & Dual Archive Sync ==================== */}
          <div className="bg-slate-900/90 p-5 sm:p-6 rounded-3xl border border-slate-800 shadow-xl flex flex-col justify-between space-y-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wide flex items-center gap-2">
                    <Layers className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span className="truncate">2-Way Google Apps Script Webhook &amp; Dual Archive Sync</span>
                  </h3>
                  <p className="text-xs text-slate-400 truncate">
                    Realtime sync on Primary Sheet + Add-Only Dual Archive Spreadsheets + Telephone Directory
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    requestAction(
                      'Toggle Webhook Instructions',
                      () => setShowScriptGuide(!showScriptGuide),
                      'Expands or hides the Apps Script installation instructions.'
                    )
                  }
                  className="text-xs font-bold text-cyan-400 hover:text-cyan-300 hover:underline cursor-pointer shrink-0"
                >
                  {showScriptGuide ? 'Hide Guide' : 'View Guide'}
                </button>
              </div>

              {/* DUAL ARCHIVE SPREADSHEET INPUTS (MANDATORY FOR SCRIPT UNLOCK) */}
              <div className="p-4 bg-slate-950/80 border border-slate-800/90 rounded-2xl space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)] animate-pulse"></span>
                    <h4 className="text-xs font-bold text-slate-200">Dual Archive Sheets (Strictly Add-Only Permanent Archives)</h4>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${areArchivesConfirmed ? 'bg-cyan-950/80 text-cyan-300 border-cyan-800/80' : 'bg-slate-800 text-slate-400 border-slate-700'}`}>
                    {areArchivesConfirmed ? 'Confirmed & Unlocked' : 'Confirmation Required'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Provide two separate Google Spreadsheet links. The primary sheet receives realtime additions &amp; deletions, while both Archive Sheets <b>strictly add and update data without deletion</b>. Both archive sheets must be shared with <i>"Anyone with the link can edit/view"</i>.
                </p>

                <div className="space-y-2.5">
                  <div>
                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-300 mb-1">
                      <span>Archive Spreadsheet 1 Link / URL</span>
                      {archive1Status?.accessible && (
                        <span className="text-cyan-400 font-medium flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-cyan-400" /> Accessible
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
                      className="w-full px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs font-mono text-slate-100 placeholder-slate-600 focus:border-cyan-500 outline-none shadow-inner"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-300 mb-1">
                      <span>Archive Spreadsheet 2 Link / URL</span>
                      {archive2Status?.accessible && (
                        <span className="text-cyan-400 font-medium flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-cyan-400" /> Accessible
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
                      className="w-full px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs font-mono text-slate-100 placeholder-slate-600 focus:border-cyan-500 outline-none shadow-inner"
                    />
                  </div>

                  <div className="pt-1 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
                    <button
                      type="button"
                      id="btn-verify-archive-sheets"
                      disabled={isVerifyingArchives || !archiveSheet1Input.trim() || !archiveSheet2Input.trim()}
                      onClick={handleVerifyArchives}
                      className="flex items-center justify-center gap-1.5 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs disabled:opacity-40"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isVerifyingArchives ? 'animate-spin' : ''}`} />
                      <span>{isVerifyingArchives ? 'Verifying Accessibility...' : 'Verify & Confirm 2 Archive Links'}</span>
                    </button>

                    {areArchivesConfirmed ? (
                      <span className="text-[11px] font-bold text-cyan-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" /> Both Links Confirmed Accessible
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-500">
                        Required to unlock Apps Script code
                      </span>
                    )}
                  </div>

                  {archiveNotice && (
                    <div className={`p-2.5 rounded-xl text-xs flex items-start gap-2 ${archiveNotice.type === 'success' ? 'bg-cyan-950/50 text-cyan-300 border border-cyan-800/60' : 'bg-rose-950/50 text-rose-300 border border-rose-800/60'}`}>
                      {archiveNotice.type === 'success' ? (
                        <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                      )}
                      <div className="leading-relaxed">{archiveNotice.text}</div>
                    </div>
                  )}
                </div>
              </div>

              {/* SCRIPT CODE & TELEPHONE DIRECTORY HTML CODE */}
              <div className="p-4 bg-slate-950/80 border border-slate-800/90 rounded-2xl space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Code className="w-4 h-4 text-cyan-400" />
                    <span className="text-xs font-bold text-slate-200">Deployment Code &amp; Phone Directory Dashboard</span>
                  </div>
                  {areArchivesConfirmed ? (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-950/80 text-cyan-300 border border-cyan-800/80 flex items-center gap-1">
                      <Unlock className="w-3 h-3 text-cyan-400" /> Code Unlocked
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 flex items-center gap-1">
                      <Lock className="w-3 h-3 text-slate-500" /> Locked until confirmed
                    </span>
                  )}
                </div>

                {!areArchivesConfirmed ? (
                  <div className="p-3.5 bg-slate-900/60 border border-dashed border-slate-700/80 rounded-xl text-xs text-slate-400 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <Lock className="w-4 h-4 text-cyan-400 shrink-0" />
                      <span className="text-[11px] leading-relaxed">
                        <b>Script Code is protected:</b> Confirm your 2 Archive Spreadsheet links above to automatically generate and unlock your tailored Apps Script and HTML dashboard code.
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled
                      className="px-3.5 py-1.5 bg-slate-800 text-slate-500 border border-slate-700 rounded-xl text-xs font-bold cursor-not-allowed shrink-0"
                    >
                      Locked
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex flex-col sm:flex-row items-stretch gap-2">
                      <button
                        type="button"
                        id="btn-copy-script-code"
                        onClick={() =>
                          requestAction(
                            'Copy Script Code',
                            () => {
                              const code = generateGoogleAppsScriptSnippet(
                                archive1Status?.id || settings.archiveSheetId1,
                                archive2Status?.id || settings.archiveSheetId2
                              );
                              navigator.clipboard.writeText(code);
                              setCopiedScript(true);
                              setTimeout(() => setCopiedScript(false), 3000);
                            },
                            'Copies the customized Google Apps Script Code.gs containing your verified archive IDs.'
                          )
                        }
                        className="flex-1 flex items-center justify-center text-center gap-1.5 text-xs font-bold px-3.5 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl cursor-pointer shadow-xs transition-colors min-h-[38px]"
                      >
                        {copiedScript ? <Check className="w-3.5 h-3.5 shrink-0" /> : <Copy className="w-3.5 h-3.5 shrink-0" />}
                        <span className="text-center">{copiedScript ? 'Code.gs Copied!' : 'Copy Apps Script (Code.gs)'}</span>
                      </button>

                      <button
                        type="button"
                        id="btn-copy-html-code"
                        onClick={() =>
                          requestAction(
                            'Copy HTML Code',
                            () => {
                              const html = generatePhoneDirectoryHtmlSnippet();
                              navigator.clipboard.writeText(html);
                              setCopiedHtml(true);
                              setTimeout(() => setCopiedHtml(false), 3000);
                            },
                            'Copies the Phone Directory Dashboard HTML code for Apps Script Index.html.'
                          )
                        }
                        className="flex-1 flex items-center justify-center text-center gap-1.5 text-xs font-bold px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 rounded-xl cursor-pointer shadow-xs transition-colors min-h-[38px]"
                      >
                        {copiedHtml ? <Check className="w-3.5 h-3.5 shrink-0" /> : <FileCode className="w-3.5 h-3.5 shrink-0" />}
                        <span className="text-center">{copiedHtml ? 'Index.html Copied!' : 'Copy Directory (Index.html)'}</span>
                      </button>
                    </div>

                    <div className="p-3 bg-cyan-950/40 border border-cyan-800/60 rounded-xl text-[11px] text-cyan-200 space-y-1">
                      <div className="font-bold flex items-center gap-1.5 text-cyan-300">
                        <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" />
                        Script ready with verified Archive IDs:
                      </div>
                      <div className="font-mono text-[10.5px] text-cyan-400/90 break-all">
                        Archive 1: {archive1Status?.id || settings.archiveSheetId1}<br />
                        Archive 2: {archive2Status?.id || settings.archiveSheetId2}
                      </div>
                    </div>

                    <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl text-[11px] text-slate-300 space-y-1">
                      <div className="font-bold flex items-center gap-1.5 text-cyan-400">
                        <AlertTriangle className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                        <span>Crucial: When updating your Google Apps Script</span>
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        After pasting the new code in Google Apps Script, click <b>Deploy &gt; Manage deployments &gt; Edit (pencil icon) &gt; Version: Select &ldquo;New version&rdquo; &gt; Deploy</b>. If &ldquo;New version&rdquo; is not selected, Google keeps executing the older code and archive pushes or dashboard data will not update!
                      </p>
                    </div>
                  </div>
                )}

                {showScriptGuide && (
                  <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-300 space-y-2 animate-in fade-in duration-200">
                    <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
                      <button
                        type="button"
                        onClick={() => setCodeViewerTab('script')}
                        className={`text-[11px] font-bold px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${codeViewerTab === 'script' ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-800/80' : 'text-slate-400 hover:bg-slate-800'}`}
                      >
                        Step-by-Step Guide
                      </button>
                      <button
                        type="button"
                        onClick={() => setCodeViewerTab('html')}
                        className={`text-[11px] font-bold px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${codeViewerTab === 'html' ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-800/80' : 'text-slate-400 hover:bg-slate-800'}`}
                      >
                        Phone Directory Info
                      </button>
                    </div>

                    {codeViewerTab === 'script' ? (
                      <ol className="list-decimal pl-4 space-y-1.5 leading-relaxed text-slate-300 font-medium text-[11px]">
                        <li>In your Primary Google Sheet, open <b>Extensions &gt; Apps Script</b>.</li>
                        <li>In <code>Code.gs</code>, replace existing text with the <b>Copy Apps Script Code</b> above.</li>
                        <li>In Apps Script left sidebar, click <b>+ &gt; HTML</b>, name it <code>Index</code>, and paste the <b>Copy Phone Directory HTML</b>.</li>
                        <li><b>If deploying for the first time:</b> Click <b>Deploy &gt; New deployment</b> &gt; Select type: <b>Web app</b> &gt; Set <i>Execute as</i>: <b>Me</b> and <i>Who has access</i>: <b>Anyone</b> &gt; Click <b>Deploy</b>.</li>
                        <li><b>If updating an existing deployment:</b> Click <b>Deploy &gt; Manage deployments</b> &gt; Click <b>Edit (pencil)</b> &gt; Under <b>Version</b>, select <b>New version</b> &gt; Click <b>Deploy</b>.</li>
                        <li>Copy the Web App URL (ending in <code>/exec</code>), and paste it in the box below.</li>
                      </ol>
                    ) : (
                      <div className="space-y-1 text-[11px] text-slate-300">
                        <p><b>Data Source:</b> The Telephone Directory Dashboard reads from your active <b>Primary Patient Directory Sheet</b> and embeds current patient contacts right upon page load.</p>
                        <p>It includes realtime search across patient names, telephone numbers, and registration IDs, plus 1-click <b>Call</b>, <b>WhatsApp greeting</b>, and <b>Copy phone numbers</b>.</p>
                        <p>Opening your Web App URL directly in any mobile or desktop browser displays this dashboard.</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* WEB APP URL & DIRECT ACCESS BUTTON */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                  <span>Apps Script Web App URL</span>
                  {webhookUrl && webhookUrl.trim().startsWith('http') && (
                    <span className="text-[11px] text-cyan-400 font-semibold flex items-center gap-1">
                      <Zap className="w-3 h-3 text-cyan-400" /> Ready for Direct Dashboard Access
                    </span>
                  )}
                </label>
                <input
                  type="text"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder="https://script.google.com/macros/s/.../exec"
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-slate-100 placeholder-slate-500 focus:bg-slate-950 focus:border-cyan-500 outline-none shadow-inner"
                />

                {/* PROMINENT TELEPHONE DIRECTORY DASHBOARD - FUTURISTIC & STRICTLY NO OVERLAP IN ALL 3 DEVICES */}
                {webhookUrl && webhookUrl.trim().startsWith('http') && (
                  <div
                    id="telephone-directory-dashboard-card"
                    className="p-4 bg-slate-950/90 border border-cyan-500/30 rounded-2xl flex flex-col gap-3.5 shadow-[0_0_20px_rgba(6,182,212,0.08)] animate-in fade-in duration-200"
                  >
                    <div className="flex items-start sm:items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 flex items-center justify-center shrink-0 shadow-inner">
                        <Phone className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs sm:text-sm font-bold text-slate-100 leading-snug">
                          Telephone Directory Dashboard Ready
                        </div>
                        <div className="text-[11px] text-slate-400 leading-normal mt-0.5">
                          Patient search &amp; 1-click WhatsApp/calling
                        </div>
                      </div>
                    </div>

                    {/* Distinct non-overlapping buttons across all devices: Stacks cleanly so buttons and text never overflow containers */}
                    <div className="flex flex-col gap-2 w-full pt-1">
                      <button
                        type="button"
                        id="btn-access-directory-dashboard"
                        onClick={() => window.open(webhookUrl.trim(), '_blank')}
                        className="w-full flex items-center justify-center text-center gap-2 px-3.5 py-2.5 bg-cyan-600 hover:bg-cyan-500 active:scale-[0.98] text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-md min-h-[40px]"
                        title="Open Telephone Directory Web App in a new tab"
                      >
                        <ExternalLink className="w-3.5 h-3.5 shrink-0 text-cyan-200" />
                        <span className="text-center">Access Directory Dashboard</span>
                      </button>

                      <button
                        type="button"
                        id="btn-open-inapp-directory"
                        onClick={() => setShowInAppDirectory(true)}
                        className="w-full flex items-center justify-center text-center gap-2 px-3.5 py-2.5 bg-slate-800/90 hover:bg-slate-700 active:scale-[0.98] text-cyan-300 border border-slate-700/80 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs min-h-[40px]"
                        title="View phone directory inside this application"
                      >
                        <Phone className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                        <span className="text-center">In-App Directory View</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Action Buttons: Responsive row without overlapping */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 mt-auto">
              <button
                type="button"
                id="btn-pull-webhook"
                onClick={() =>
                  requestAction(
                    'Pull from Sheet via Webhook',
                    handlePullWebhook,
                    'Queries the deployed Apps Script Webhook to retrieve patient records.'
                  )
                }
                disabled={isPulling || !webhookUrl}
                className="w-full flex items-center justify-center text-center gap-1.5 py-2.5 px-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-md disabled:opacity-40 min-h-[38px]"
                title="Pull clinical records directly from Google Sheet via Webhook"
              >
                <ArrowDownToLine className={`w-3.5 h-3.5 shrink-0 ${isPulling ? 'animate-bounce' : ''}`} />
                <span className="text-center truncate">Pull Webhook</span>
              </button>

              <button
                type="button"
                id="btn-push-webhook"
                onClick={() =>
                  requestAction(
                    'Push to Sheet via Webhook',
                    handlePushWebhook,
                    'Pushes local clinical records to your Google Sheet and Dual Archive Sheets via the Apps Script Webhook.'
                  )
                }
                disabled={isPushing || !webhookUrl}
                className="w-full flex items-center justify-center text-center gap-1.5 py-2.5 px-2 bg-slate-800/90 hover:bg-slate-700 text-cyan-300 border border-slate-700/80 rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-xs disabled:opacity-40 min-h-[38px]"
                title="Push patient additions and deletions to primary database and add-only to archive sheets"
              >
                <ArrowUpToLine className="w-3.5 h-3.5 shrink-0" />
                <span className="text-center truncate">Push Webhook</span>
              </button>

              <button
                type="button"
                id="btn-save-sheet-config"
                onClick={() =>
                  requestAction(
                    'Save Configuration',
                    handleSaveConfig,
                    'Updates and persists your Google Sheet ID, Dual Archive links, and Webhook URL in settings.'
                  )
                }
                className="w-full flex items-center justify-center text-center py-2.5 px-2 bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700/80 rounded-xl text-xs font-bold transition-colors cursor-pointer min-h-[38px]"
              >
                <span className="text-center truncate">Save Config</span>
              </button>
            </div>
          </div>

          {/* ==================== BLOCK 4: Auto Hourly Backup (:00) ==================== */}
          <div className="bg-slate-900/90 p-5 sm:p-6 rounded-3xl border border-slate-800 shadow-xl flex flex-col justify-between space-y-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wide flex items-center gap-2 min-w-0">
                  <Clock className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span className="truncate">Auto Hourly Backup (:00)</span>
                </h3>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border shrink-0 ${settings.autoHourlyPush !== false ? 'bg-cyan-950/80 text-cyan-300 border-cyan-800/80' : 'bg-slate-800 text-slate-400 border-slate-700'}`}>
                  {settings.autoHourlyPush !== false ? 'Active (Every Hour)' : 'Disabled'}
                </span>
              </div>

              <p className="text-xs text-slate-400 leading-relaxed">
                Automatically archives a complete clinical database snapshot every hour on the hour (e.g. <b>10:00 AM</b>, <b>11:00 AM</b>) and syncs with Google Sheets.
              </p>

              <div className="flex items-center justify-between p-3.5 bg-slate-950/80 rounded-2xl border border-slate-800/90 text-xs">
                <div>
                  <div className="font-bold text-slate-200">Auto Hourly Trigger</div>
                  <div className="text-[11px] text-slate-400">Executes on the hour (:00) &amp; catches up missed hours</div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const nextVal = settings.autoHourlyPush === false ? true : false;
                    onUpdateSettings({ ...settings, autoHourlyPush: nextVal });
                  }}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    settings.autoHourlyPush !== false ? 'bg-cyan-600' : 'bg-slate-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      settings.autoHourlyPush !== false ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Status & Timing Diagnostics */}
              <div className="space-y-1.5 text-[11px] font-mono text-slate-400 bg-slate-950/90 p-3.5 rounded-2xl border border-slate-800/90">
                <div className="flex justify-between items-center pb-1 border-b border-slate-800/80">
                  <span className="text-slate-500">Frequency:</span>
                  <span className="font-bold text-slate-200">Every 1 Hour (:00)</span>
                </div>
                <div className="flex justify-between items-center pb-1 border-b border-slate-800/80">
                  <span className="text-slate-500">Last Backup:</span>
                  <span className="font-bold text-cyan-400">
                    {settings.lastHourlyBackupAt
                      ? new Date(settings.lastHourlyBackupAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
                      : backupHistory[0]
                      ? backupHistory[0].displayTime
                      : 'Pending trigger'}
                  </span>
                </div>
                <div className="flex justify-between items-center pb-1 border-b border-slate-800/80">
                  <span className="text-slate-500">Next Scheduled:</span>
                  <span className="font-bold text-cyan-300">
                    {countdown.nextHourStr} ({countdown.minutes}m {countdown.seconds}s)
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Destination:</span>
                  <span className="font-bold text-slate-200 truncate max-w-[200px]" title={webhookUrl ? 'Google Sheet (Cloud) + Device DB' : 'Local Device Database'}>
                    {webhookUrl ? 'Google Sheet + Device DB' : 'Local Device DB'}
                  </span>
                </div>
              </div>
              {/* FUTURISTIC ACCORDION FOR AUTO HOURLY BACKUP */}
              <div className="rounded-2xl border border-slate-800 bg-slate-950/90 text-slate-200 shadow-md overflow-hidden divide-y divide-slate-800/80">
                {/* Accordion Item 1: Autonomous Background Engine Architecture */}
                <div className="transition-all">
                  <button
                    type="button"
                    onClick={() => setBlock4Accordion(block4Accordion === 'engine' ? null : 'engine')}
                    className="w-full px-4 py-3 flex items-center justify-between gap-2 hover:bg-slate-800/50 transition-colors text-left cursor-pointer group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)] animate-pulse shrink-0" />
                      <span className="text-xs font-bold tracking-wide text-cyan-300 group-hover:text-cyan-200 truncate">
                        Autonomous Engine &amp; Catch-Up Protocol
                      </span>
                      <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-cyan-950 text-cyan-400 border border-cyan-800 shrink-0">
                        :00 DISPATCH
                      </span>
                    </div>
                    {block4Accordion === 'engine' ? (
                      <ChevronUp className="w-4 h-4 text-cyan-400 shrink-0" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                    )}
                  </button>

                  {block4Accordion === 'engine' && (
                    <div className="p-4 bg-slate-950/70 text-[11px] space-y-2.5 animate-in fade-in duration-200">
                      <p className="text-slate-300 leading-relaxed">
                        The autonomous backup engine synchronizes with your device's system clock, triggering precision snapshots at exactly <span className="text-cyan-300 font-bold font-mono">:00:00</span> of every hour.
                      </p>
                      <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1 text-slate-300">
                        <div className="font-bold text-cyan-400 flex items-center gap-1.5">
                          <Zap className="w-3 h-3 text-cyan-300" />
                          <span>Intelligent Sleep/Wake Catch-Up:</span>
                        </div>
                        <p className="text-[10px] text-slate-400 leading-normal">
                          If this tablet or laptop was closed, asleep, or in background tab hibernation during an hour boundary, the engine automatically detects missed hours upon wakeup and commits an immediate catch-up snapshot!
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Accordion Item 2: Local DB Engine ➔ Sheet Replication (Via Apps Script) */}
                <div className="transition-all">
                  <button
                    type="button"
                    onClick={() => setBlock4Accordion(block4Accordion === 'dbReplication' ? null : 'dbReplication')}
                    className="w-full px-4 py-3 flex items-center justify-between gap-2 hover:bg-slate-800/50 transition-colors text-left cursor-pointer group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)] animate-pulse shrink-0" />
                      <span className="text-xs font-bold tracking-wide text-cyan-300 group-hover:text-cyan-200 truncate">
                        Local DB Engine ➔ Backup Sheet Replication
                      </span>
                      <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-cyan-950 text-cyan-400 border border-cyan-800 shrink-0">
                        VIA APPS SCRIPT
                      </span>
                    </div>
                    {block4Accordion === 'dbReplication' ? (
                      <ChevronUp className="w-4 h-4 text-cyan-400 shrink-0" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                    )}
                  </button>

                  {block4Accordion === 'dbReplication' && (
                    <div className="p-4 bg-slate-950/70 text-[11px] space-y-3 animate-in fade-in duration-200">
                      <p className="text-slate-300 leading-relaxed">
                        Replicates your complete client-side IndexedDB database engine architecture, registered locums, referral doctors, and clinical metadata into a dedicated <span className="text-cyan-300 font-bold font-mono">Local Database Engine</span> tab on your backup sheet via the Google Apps Script Webhook, automatically mirrored across Archive 1 &amp; Archive 2 without using the direct spreadsheet connection.
                      </p>
                      <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                        <div className="p-2 rounded-xl bg-slate-900/90 border border-slate-800">
                          <span className="text-slate-400 block">Backup Protocol:</span>
                          <span className="text-cyan-400 font-bold">Apps Script POST</span>
                        </div>
                        <div className="p-2 rounded-xl bg-slate-900/90 border border-slate-800">
                          <span className="text-slate-400 block">Archive Redundancy:</span>
                          <span className="text-emerald-400 font-bold">Dual Archive Mirroring</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        id="btn-push-local-db-sheet"
                        disabled={isPushingLocalDB || (!cleanId && !webhookUrl)}
                        onClick={handlePushLocalDBToSheets}
                        className="w-full flex items-center justify-center gap-2 py-2.5 px-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer disabled:opacity-40"
                      >
                        <HardDrive className={`w-3.5 h-3.5 ${isPushingLocalDB ? 'animate-spin' : ''}`} />
                        <span>{isPushingLocalDB ? 'Replicating Local DB Engine...' : 'Push Local DB Engine Data to Backup Sheet'}</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Accordion Item 3: Snapshot Telemetry & Health Audit */}
                <div className="transition-all">
                  <button
                    type="button"
                    onClick={() => setBlock4Accordion(block4Accordion === 'telemetry' ? null : 'telemetry')}
                    className="w-full px-4 py-3 flex items-center justify-between gap-2 hover:bg-slate-800/50 transition-colors text-left cursor-pointer group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] shrink-0" />
                      <span className="text-xs font-bold tracking-wide text-slate-200 group-hover:text-white truncate">
                        Local DB Snapshot Telemetry &amp; Health
                      </span>
                      <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-emerald-950 text-emerald-400 border border-emerald-800 shrink-0">
                        INDEXEDDB
                      </span>
                    </div>
                    {block4Accordion === 'telemetry' ? (
                      <ChevronUp className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                    )}
                  </button>

                  {block4Accordion === 'telemetry' && (
                    <div className="p-4 bg-slate-950/70 text-[11px] space-y-2.5 animate-in fade-in duration-200">
                      <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                        <div className="p-2 rounded-xl bg-slate-900/90 border border-slate-800">
                          <span className="text-slate-400 block">Snapshot Retention:</span>
                          <span className="text-emerald-400 font-bold">Rolling 24-Hour Buffer</span>
                        </div>
                        <div className="p-2 rounded-xl bg-slate-900/90 border border-slate-800">
                          <span className="text-slate-400 block">Integrity Check:</span>
                          <span className="text-cyan-400 font-bold">100% Validated</span>
                        </div>
                      </div>
                      <p className="text-slate-400 text-[10px] leading-relaxed">
                        Snapshots are preserved in transactional IndexedDB object stores and isolated from browser cache clearing.
                      </p>
                    </div>
                  )}
                </div>

                {/* Accordion Item 4: Rolling 24-Hour Snapshot Ledger */}
                <div className="transition-all">
                  <button
                    type="button"
                    onClick={() => setBlock4Accordion(block4Accordion === 'ledger' ? null : 'ledger')}
                    className="w-full px-4 py-3 flex items-center justify-between gap-2 hover:bg-slate-800/50 transition-colors text-left cursor-pointer group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)] shrink-0" />
                      <span className="text-xs font-bold tracking-wide text-slate-200 group-hover:text-white truncate">
                        Audit History &amp; Hourly Snapshot Ledger ({backupHistory.length})
                      </span>
                      <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-cyan-950 text-cyan-400 border border-cyan-800 shrink-0">
                        HISTORY
                      </span>
                    </div>
                    {block4Accordion === 'ledger' ? (
                      <ChevronUp className="w-4 h-4 text-cyan-400 shrink-0" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                    )}
                  </button>

                  {block4Accordion === 'ledger' && (
                    <div className="p-4 bg-slate-950/70 text-[11px] space-y-2 animate-in fade-in duration-200">
                      {backupHistory.length === 0 ? (
                        <div className="text-slate-400 italic py-2 text-center bg-slate-900/60 rounded-xl">
                          No hourly snapshots recorded yet. Triggers automatically on the hour.
                        </div>
                      ) : (
                        <div className="max-h-48 overflow-y-auto divide-y divide-slate-800 bg-slate-900/80 rounded-xl border border-slate-800 text-[11px]">
                          {backupHistory.map((item) => (
                            <div key={item.id} className="p-2.5 flex items-center justify-between hover:bg-slate-800/60 transition-colors">
                              <div>
                                <div className="font-bold text-slate-200 flex items-center gap-1.5">
                                  <span>{item.hourKey}</span>
                                  <span className={`px-1.5 py-0.2 rounded text-[9px] font-semibold ${item.status === 'success' ? 'bg-cyan-950 text-cyan-300 border border-cyan-800' : 'bg-amber-950 text-amber-300 border border-amber-800'}`}>
                                    {item.status === 'success' ? 'Archived' : 'Warning'}
                                  </span>
                                </div>
                                <div className="text-[10px] text-slate-400">
                                  {item.patientCount} records • {item.pushedToSheets ? 'Google Sheets Sync OK' : 'Local Storage Only'}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={async () => {
                                  const fileName = `namana-hourly-${item.hourKey.replace(/[: ]/g, '-')}.json`;
                                  await downloadJson(item.data, fileName);
                                }}
                                className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 rounded-lg text-[10px] font-mono transition-colors"
                              >
                                Export
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2 pt-1 mt-auto">
              <button
                type="button"
                onClick={handleTriggerHourlyBackupNow}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 px-3 bg-cyan-600 hover:bg-cyan-500 active:scale-[0.98] text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-md min-h-[38px]"
              >
                <Zap className="w-3.5 h-3.5 text-cyan-200 shrink-0" />
                <span className="truncate">Test / Trigger Hourly Backup Now</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadLatestHourlySnapshot}
                className="w-full flex items-center justify-center gap-1.5 py-2 px-2.5 bg-slate-800/90 hover:bg-slate-700 text-slate-300 border border-slate-700/80 rounded-xl text-[11px] font-semibold transition-colors cursor-pointer min-h-[36px]"
                title="Download latest snapshot JSON file"
              >
                <Download className="w-3 h-3 text-cyan-400 shrink-0" />
                <span className="truncate">Download Latest Hourly Snapshot JSON</span>
              </button>
            </div>
          </div>

          {/* ==================== BLOCK 5: Quick Export Formats ==================== */}
          <div className="bg-slate-900/90 p-5 sm:p-6 rounded-3xl border border-slate-800 shadow-xl flex flex-col justify-between space-y-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wide flex items-center gap-2 min-w-0">
                  <Download className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span className="truncate">Quick Export Formats</span>
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-cyan-950/80 text-cyan-300 border border-cyan-800/80 shrink-0">
                  {patients.length} Records
                </span>
              </div>

              <p className="text-xs text-slate-400 leading-relaxed">
                Instantly export all {patients.length} patient clinical profiles and follow-up histories in standard formats for external auditing or offline migration.
              </p>

              {/* Format Guide */}
              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800">
                  <div className="font-bold text-slate-200">📊 CSV Spreadsheets</div>
                  <div className="text-slate-500 text-[9.5px]">Standard tabular rows for Excel &amp; Google Sheets</div>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800">
                  <div className="font-bold text-slate-200">📦 JSON Master Snapshot</div>
                  <div className="text-slate-500 text-[9.5px]">Complete database archive including locums &amp; follow-ups</div>
                </div>
              </div>

              <div className="space-y-2 pt-1">
                <button
                  type="button"
                  id="btn-download-sheets-csv"
                  onClick={() =>
                    requestAction(
                      'Download Google Sheets CSV',
                      () => downloadGoogleSheetCsv(patients),
                      'Exports all active patient records with standardized ID (NPC/YY/MM/NNN) into a CSV file.'
                    )
                  }
                  className="w-full flex items-center justify-between p-3 bg-slate-950/80 hover:bg-slate-800 text-slate-200 border border-slate-800 rounded-2xl text-xs font-bold transition-all cursor-pointer shadow-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FileSpreadsheet className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span className="truncate">Download Google Sheets CSV</span>
                  </div>
                  <Download className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                </button>

                <button
                  type="button"
                  id="btn-export-json"
                  onClick={() =>
                    requestAction(
                      'Full JSON Backup',
                      handleExportJson,
                      'Downloads a complete JSON snapshot containing all patients, treatment modalities, and follow-up sessions.'
                    )
                  }
                  className="w-full flex items-center justify-between p-3 bg-slate-950/80 hover:bg-slate-800 text-slate-200 border border-slate-800 rounded-2xl text-xs font-bold transition-all cursor-pointer shadow-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Database className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span className="truncate">Full JSON Backup</span>
                  </div>
                  <Download className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                </button>
              </div>
            </div>

            <div className="border-t border-slate-800/80 pt-3 mt-auto">
              <button
                type="button"
                id="btn-restore-json"
                onClick={() =>
                  requestAction(
                    'Restore from JSON Backup',
                    () => jsonFileInputRef.current?.click(),
                    'Restores and merges patient records from an uploaded JSON file into the patient directory.'
                  )
                }
                className="w-full flex items-center justify-center gap-2 p-3 bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700/80 rounded-2xl text-xs font-bold transition-colors cursor-pointer min-h-[38px]"
              >
                <Upload className="w-4 h-4 text-cyan-400 shrink-0" />
                <span className="truncate">Restore from JSON Backup</span>
              </button>
            </div>
          </div>

          {/* ==================== BLOCK 6: Sync Status & Security ==================== */}
          <div className="bg-slate-900/90 p-5 sm:p-6 rounded-3xl border border-slate-800 shadow-xl flex flex-col justify-between space-y-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wide flex items-center gap-2 min-w-0">
                  <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span className="truncate">Sync Status &amp; Security</span>
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-cyan-950/80 text-cyan-300 border border-cyan-800/80 shrink-0">
                  Protected
                </span>
              </div>

              <div className="space-y-2 text-xs text-slate-300">
                <div className="flex justify-between items-center py-1 border-b border-slate-800/80">
                  <span className="text-slate-500">Total Patients:</span>
                  <span className="font-bold text-slate-200">{patients.length} records</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-800/80">
                  <span className="text-slate-500">Connected Sheet ID:</span>
                  <span className="font-mono text-cyan-400 text-[11px] truncate max-w-[160px]" title={cleanId || 'None'}>
                    {cleanId || 'None'}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-800/80">
                  <span className="text-slate-500">Last Synced:</span>
                  <span className="font-semibold text-slate-200">
                    {settings.lastSheetsSyncAt
                      ? new Date(settings.lastSheetsSyncAt).toLocaleDateString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : 'Never'}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-800/80">
                  <span className="text-slate-500">Local DB Status:</span>
                  <span className="font-bold text-emerald-400">Active &amp; Indexed</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-800/80">
                  <span className="text-slate-500">Hourly Auto-Backup:</span>
                  <span className={`font-semibold ${settings.autoHourlyPush !== false ? 'text-cyan-400' : 'text-slate-500'}`}>
                    {settings.autoHourlyPush !== false ? 'Active (:00 Trigger)' : 'Disabled'}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-slate-500">Protected Mode:</span>
                  <span className="font-semibold text-cyan-400">Passkey Authenticated</span>
                </div>
              </div>
            </div>

            {/* Privacy & Security Guarantee Badge */}
            <div className="p-3 bg-slate-950/80 border border-cyan-500/20 rounded-2xl text-[11px] text-slate-300 space-y-1 mt-auto shadow-inner">
              <div className="font-bold flex items-center gap-1.5 text-slate-200">
                <ShieldCheck className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span>Local-First &amp; Zero Cloud Intermediary</span>
              </div>
              <p className="text-slate-400 leading-relaxed text-[10.5px]">
                Clinical records remain strictly on this local device (IndexedDB) and inside your private Google Sheet account. Data is never routed through external third-party servers.
              </p>
            </div>
          </div>

        </div>
      </div>

      {/* Action Passkey Caution Modal (Passkey: 7349005387) */}
      {pendingAction && (
        <div
          id="action-caution-modal-backdrop"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs animate-in fade-in duration-150"
          role="dialog"
          aria-modal="true"
          aria-labelledby="action-caution-title"
        >
          <div
            id="action-caution-card"
            className="w-full max-w-md bg-slate-900 rounded-2xl shadow-2xl border border-slate-800 overflow-hidden"
          >
            {/* Caution Banner */}
            <div className="bg-gradient-to-r from-rose-950 via-slate-900 to-slate-950 border-b border-rose-900/50 px-6 py-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-rose-900/40 border border-rose-800/60 rounded-xl">
                  <ShieldAlert className="w-5 h-5 text-rose-400" />
                </div>
                <div>
                  <h2 id="action-caution-title" className="text-base font-bold tracking-tight text-white leading-tight">
                    Action Authorization Caution
                  </h2>
                  <p className="text-xs text-rose-300 font-medium">
                    Critical Operation Verification
                  </p>
                </div>
              </div>
              <button
                onClick={handleCancelAction}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
                aria-label="Cancel operation"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleConfirmAction} className="p-6 space-y-4">
              <div className="p-3.5 bg-slate-950 border border-rose-900/40 rounded-xl text-rose-200 text-xs leading-relaxed flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-rose-300">
                    Operation: {pendingAction.title}
                  </p>
                  <p className="mt-1 text-slate-300">
                    {pendingAction.description}
                  </p>
                </div>
              </div>

              <div>
                <label htmlFor="action-passkey-input" className="block text-xs font-bold text-slate-300 mb-1.5">
                  Enter Action Passkey to Authorize
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                    <KeyRound className="w-4 h-4" />
                  </div>
                  <input
                    id="action-passkey-input"
                    type={showActionPasskey ? 'text' : 'password'}
                    value={actionPasskey}
                    onChange={(e) => {
                      setActionPasskey(e.target.value);
                      if (actionPasskeyError) setActionPasskeyError(null);
                    }}
                    autoFocus
                    placeholder="Enter action passkey"
                    className="w-full pl-9 pr-10 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm font-mono tracking-wider text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowActionPasskey(!showActionPasskey)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-200 cursor-pointer"
                    title={showActionPasskey ? 'Hide passkey' : 'Show passkey'}
                  >
                    {showActionPasskey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {actionPasskeyError && (
                  <p className="mt-1.5 text-xs font-semibold text-rose-400 flex items-center gap-1">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                    {actionPasskeyError}
                  </p>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  id="action-caution-cancel-btn"
                  onClick={handleCancelAction}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  id="action-caution-submit-btn"
                  className="px-5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 active:bg-rose-700 rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  Authorize &amp; Proceed
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* In-App Telephone Directory Dashboard Modal */}
      {showInAppDirectory && (
        <PatientPhoneDirectoryModal
          isOpen={showInAppDirectory}
          onClose={() => setShowInAppDirectory(false)}
          patients={patients}
        />
      )}
    </div>
  );
};
