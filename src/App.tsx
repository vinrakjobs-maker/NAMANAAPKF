import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronRight, Users, Plus } from 'lucide-react';
import { Header, MainView } from './components/Header';
import { PatientDirectory } from './components/PatientDirectory';
import { PatientCaseSheet } from './components/PatientCaseSheet';
import { MonthlyReport } from './components/MonthlyReport';
import { FeeReport } from './components/FeeReport';
import { ITReturnReport } from './components/ITReturnReport';
import { SearchFilterModal } from './components/SearchFilterModal';
import { ReceiptModal } from './components/ReceiptModal';
import { CloudSyncModal } from './components/CloudSyncModal';
import { GoogleSheetsDashboard } from './components/GoogleSheetsDashboard';
import { NewPatientModal } from './components/NewPatientModal';
import { BackupEntryPasskeyModal } from './components/BackupEntryPasskeyModal';
import { LocumTenensManager } from './components/LocumTenensManager';
import { LoadingScreen } from './components/LoadingScreen';

import { Patient, SearchFilter, ReceiptData, ClinicSettings } from './types';
import { CLINIC_CONFIG } from './constants';
import {
  loadPatients,
  savePatients,
  loadSettings,
  saveSettings,
  createNewPatient,
  deduplicatePatients,
  parseDateAndTimestamp,
  getLocumPhysiotherapists,
  getCommonReferralDoctors,
  localDB,
} from './utils/storage';
import { pushToGoogleAppsScript } from './utils/googleSheetsSync';
import { playAddPatientPing } from './utils/audioNotification';
import {
  isHourlyBackupDue,
  executeHourlyBackup,
  getMsUntilNextHour,
} from './utils/hourlyBackup';

export function App() {
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [patients, setPatients] = useState<Patient[]>(() => deduplicatePatients(loadPatients()));
  const [activePatientId, setActivePatientId] = useState<string | null>(() => {
    const loaded = deduplicatePatients(loadPatients());
    const active = loaded.find((p) => !p.deleted);
    return active ? active.id : loaded[0]?.id || null;
  });

  const [currentView, setCurrentView] = useState<MainView>('patients');
  const [clinicSettings, setClinicSettings] = useState<ClinicSettings>(() => loadSettings());

  // Modals state
  const [searchFilter, setSearchFilter] = useState<SearchFilter>({
    field: 'all',
    query: '',
    status: 'active',
    visitType: 'all',
  });
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [isNewPatientModalOpen, setIsNewPatientModalOpen] = useState(false);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [isCloudModalOpen, setIsCloudModalOpen] = useState(false);
  const [isBackupEntryModalOpen, setIsBackupEntryModalOpen] = useState(false);

  // Mobile sidebar toggle
  const [mobileShowDirectory, setMobileShowDirectory] = useState(false);
  // Desktop directory collapse toggle
  const [isDirectoryOpen, setIsDirectoryOpen] = useState(true);

  // Auto-bootstrap and auto-provision local database (IndexedDB) on app launch
  useEffect(() => {
    localDB
      .autoBootstrapAndMigrate(
        patients,
        getLocumPhysiotherapists(),
        getCommonReferralDoctors(),
        clinicSettings
      )
      .catch((err) => {
        console.warn('Local database auto-bootstrap notice:', err);
      })
      .finally(() => {
        setTimeout(() => {
          setIsInitialLoading(false);
        }, 500);
      });
  }, []);

  // Save patients whenever modified and auto-sync to Google Sheets in background if configured
  const autoPushTimerRef = useRef<any>(null);
  useEffect(() => {
    savePatients(patients);

    // Auto-sync on save to Google Sheets (ideal for Mobile APK & standalone usage)
    const webhook = clinicSettings.sheetsWebhookUrl || clinicSettings.googleAppsScriptWebhook;
    if (webhook && clinicSettings.autoSync !== false && patients.length > 0) {
      if (autoPushTimerRef.current) clearTimeout(autoPushTimerRef.current);
      autoPushTimerRef.current = setTimeout(async () => {
        try {
          await pushToGoogleAppsScript(webhook, patients, {
            archiveSheet1Id: clinicSettings.archiveSheetId1,
            archiveSheet2Id: clinicSettings.archiveSheetId2,
          });
        } catch (e) {
          console.warn('Background auto-sync on save failed (will retry on hourly backup):', e);
        }
      }, 3000);
    }

    return () => {
      if (autoPushTimerRef.current) clearTimeout(autoPushTimerRef.current);
    };
  }, [
    patients,
    clinicSettings.sheetsWebhookUrl,
    clinicSettings.googleAppsScriptWebhook,
    clinicSettings.autoSync,
    clinicSettings.archiveSheetId1,
    clinicSettings.archiveSheetId2,
  ]);

  // Save clinic settings whenever modified
  useEffect(() => {
    saveSettings(clinicSettings);
  }, [clinicSettings]);

  // References to keep async backup loop always updated with current data
  const patientsRef = useRef(patients);
  patientsRef.current = patients;
  const clinicSettingsRef = useRef(clinicSettings);
  clinicSettingsRef.current = clinicSettings;
  const isExecutingBackupRef = useRef(false);

  // Auto-Hourly Backup background engine: triggers every hour reliably, catches missed hours on wake/load
  useEffect(() => {
    let topOfHourTimeout: any = null;

    const scheduleNextHourlyTimeout = () => {
      if (topOfHourTimeout) clearTimeout(topOfHourTimeout);
      const ms = getMsUntilNextHour();
      // Add a 500ms safety buffer past :00.000 so the local clock has strictly rolled over to the new hour
      topOfHourTimeout = setTimeout(() => {
        triggerBackupIfDue();
      }, ms + 500);
    };

    const triggerBackupIfDue = async () => {
      // ALWAYS ensure next scheduled hour is primed immediately
      scheduleNextHourlyTimeout();

      if (isExecutingBackupRef.current) return;
      if (isHourlyBackupDue()) {
        try {
          isExecutingBackupRef.current = true;
          const res = await executeHourlyBackup(patientsRef.current, clinicSettingsRef.current);
          if (res.settingsUpdate) {
            setClinicSettings((prev) => ({ ...prev, ...res.settingsUpdate }));
          }
        } catch (err) {
          console.error('Auto hourly backup encountered error:', err);
        } finally {
          isExecutingBackupRef.current = false;
        }
      }
    };

    // 1. Check immediately on startup/mount (e.g. if opened at 10:00 AM or after missed backup)
    triggerBackupIfDue();

    // 2. Schedule exact top of the next hour
    scheduleNextHourlyTimeout();

    // 3. 10-second heartbeat interval (handles system wake, throttled background tabs, or time drift)
    const heartbeatInterval = setInterval(() => {
      if (isHourlyBackupDue()) {
        triggerBackupIfDue();
      }
    }, 10000);

    // 4. Window focus, visibility, and network reconnect listeners (catches tab switch or device unlock)
    const handleWakeOrFocus = () => {
      if (isHourlyBackupDue()) {
        triggerBackupIfDue();
      }
    };

    window.addEventListener('focus', handleWakeOrFocus);
    window.addEventListener('online', handleWakeOrFocus);
    document.addEventListener('visibilitychange', handleWakeOrFocus);

    // 5. Listen for Background Sync events from Service Worker (APK / WebView background sync)
    const handleSwMessage = (e: MessageEvent) => {
      if (e.data?.type === 'EXECUTE_HOURLY_BACKUP' || e.data?.type === 'EXECUTE_BACKGROUND_SYNC') {
        triggerBackupIfDue();
      }
    };

    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleSwMessage);
      // Attempt to register periodicSync if supported by Android/PWA
      navigator.serviceWorker.ready.then(async (reg) => {
        try {
          if ('periodicSync' in reg) {
            // @ts-ignore
            await reg.periodicSync.register('hourly-backup-sync', {
              minInterval: 60 * 60 * 1000,
            });
          }
        } catch {
          // Ignored if periodicSync permission not granted
        }
      }).catch(() => {});
    }

    return () => {
      if (topOfHourTimeout) clearTimeout(topOfHourTimeout);
      clearInterval(heartbeatInterval);
      window.removeEventListener('focus', handleWakeOrFocus);
      window.removeEventListener('online', handleWakeOrFocus);
      document.removeEventListener('visibilitychange', handleWakeOrFocus);
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleSwMessage);
      }
    };
  }, []);

  // Next patient serial calculation
  const nextPatientSerial = patients.length > 0 ? Math.max(...patients.map((p) => p.serial || 0)) + 1 : 101;

  // Open the registration modal - strictly does NOT create patient or demographics until details are entered fully
  const handleAddNewPatient = () => {
    setIsNewPatientModalOpen(true);
  };

  // Only called when user has entered patient details fully in the registration form
  const handleSaveNewPatient = (newPt: Patient) => {
    // Play pleasant musical ping chime upon successfully adding patient
    playAddPatientPing();

    const updatedPatients = deduplicatePatients([newPt, ...patients]);
    setPatients(updatedPatients);
    setActivePatientId(newPt.id);
    setIsNewPatientModalOpen(false);
    // Switch filter to show active patients and clear query
    setSearchFilter((prev) => ({ ...prev, status: 'active', query: '' }));
    setCurrentView('patients');
    setMobileShowDirectory(false);

    // Instant append to Google Apps Script Archives (strictly add-only, no overwriting, automatic local DB replication)
    if (autoPushTimerRef.current) {
      clearTimeout(autoPushTimerRef.current);
    }
    try {
      const webhookUrl = localStorage.getItem('namana_script_url') || clinicSettings.scriptUrl || '';
      if (webhookUrl && webhookUrl.trim().startsWith('http')) {
        const archiveConfig = {
          archiveSheet1Id: localStorage.getItem('namana_archive_sheet_1_id') || clinicSettings.archiveSheetId1 || undefined,
          archiveSheet2Id: localStorage.getItem('namana_archive_sheet_2_id') || clinicSettings.archiveSheetId2 || undefined,
        };
        pushToGoogleAppsScript(webhookUrl.trim(), updatedPatients, archiveConfig, 'addPatient', newPt)
          .then((res) => {
            console.log('Instant add patient archived via Apps Script:', res?.message);
          })
          .catch((err) => {
            console.warn('Instant add patient Apps Script archive push encountered non-fatal error:', err);
          });
      }
    } catch (e) {
      console.warn('Failed to dispatch instant add-patient webhook event:', e);
    }
  };

  // Update existing patient
  const handleUpdatePatient = (updated: Patient) => {
    setPatients((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  };

  // Soft delete patient (move to trash)
  const handleDeletePatient = (id: string) => {
    setPatients((prev) =>
      prev.map((p) => (p.id === id ? { ...p, deleted: true, updatedAt: Date.now() } : p))
    );
  };

  // Bulk soft delete patients (move to trash)
  const handleDeleteMultiplePatients = (ids: string[]) => {
    const idSet = new Set(ids);
    setPatients((prev) =>
      prev.map((p) => (idSet.has(p.id) ? { ...p, deleted: true, updatedAt: Date.now() } : p))
    );
  };

  // Restore patient from trash
  const handleRestorePatient = (id: string) => {
    setPatients((prev) =>
      prev.map((p) => (p.id === id ? { ...p, deleted: false, updatedAt: Date.now() } : p))
    );
  };

  // Bulk restore patients from trash
  const handleRestoreMultiplePatients = (ids: string[]) => {
    const idSet = new Set(ids);
    setPatients((prev) =>
      prev.map((p) => (idSet.has(p.id) ? { ...p, deleted: false, updatedAt: Date.now() } : p))
    );
  };

  // Permanently erase multiple patients from database and backup spreadsheet
  const handlePermanentDeleteMultiplePatients = (ids: string[]) => {
    const idSet = new Set(ids);
    const toDelete = patients.filter((p) => idSet.has(p.id));
    const deletedRegNos = toDelete.map((p) => p.regNo).filter(Boolean);

    const remaining = patients.filter((p) => !idSet.has(p.id));

    setPatients(remaining);
    savePatients(remaining);

    for (const id of ids) {
      try {
        localStorage.removeItem('physio_patient_' + id);
        localDB.deletePatient(id).catch(() => {});
      } catch {}
    }

    if (activePatientId && ids.includes(activePatientId)) {
      const nextActive = remaining.find((p) => !p.deleted) || remaining[0] || null;
      setActivePatientId(nextActive ? nextActive.id : null);
    }

    // Immediately notify Google Apps Script to purge these permanently deleted records from backup spreadsheet & archives
    const webhook = clinicSettings.sheetsWebhookUrl || clinicSettings.googleAppsScriptWebhook;
    if (webhook) {
      pushToGoogleAppsScript(
        webhook,
        remaining,
        {
          archiveSheet1Id: clinicSettings.archiveSheetId1,
          archiveSheet2Id: clinicSettings.archiveSheetId2,
        },
        'permanentDelete',
        { deletedPatientIds: ids, deletedRegNos }
      ).catch((e) => {
        console.warn('Failed to purge permanently deleted patients from Google Sheets:', e);
      });
    }
  };

  // Open Receipt Modal
  const handleOpenReceipt = (data: Partial<ReceiptData>) => {
    setReceiptData({
      open: true,
      name: data.name || '',
      serial: data.serial || 0,
      regNo: data.regNo || '',
      receiptNo: data.receiptNo || '',
      date: data.date || new Date().toISOString().slice(0, 10),
      age: data.age || '',
      address: data.address || CLINIC_CONFIG.address.full,
      therapyFor: data.therapyFor || 'Physiotherapy Rehabilitation',
      sessionFrom: data.sessionFrom || data.date || '',
      sessionTo: data.sessionTo || data.date || '',
      amount: data.amount || '500',
      visitType: data.visitType || 'Clinic',
      paymentMethod: data.paymentMethod || 'Cash',
    });
  };

  // Currently active patient object (null if deselect/no patient selected)
  const activePatient = activePatientId ? (patients.find((p) => p.id === activePatientId) || null) : null;

  if (isInitialLoading) {
    return (
      <LoadingScreen
        message={CLINIC_CONFIG.clinicName}
        subMessage="Loading clinical database & system records..."
      />
    );
  }

  return (
    <div className="flex flex-col h-screen h-[100dvh] w-screen overflow-hidden bg-slate-50 text-slate-800 font-sans">
      {/* Top Application Header */}
      <Header
        currentView={currentView}
        onSelectView={(v) => {
          setCurrentView(v);
          setMobileShowDirectory(false);
        }}
        clinicName={CLINIC_CONFIG.clinicName}
        totalPatientsCount={patients.length}
        activePatientsCount={patients.filter((p) => !p.deleted).length}
        deletedPatientsCount={patients.filter((p) => p.deleted).length}
        onSelectPatientStatus={(status) => {
          setSearchFilter((prev) => ({ ...prev, status }));
          const matching = patients.filter((p) => {
            if (status === 'active') return !p.deleted;
            if (status === 'deleted') return p.deleted;
            return true;
          });
          if (matching.length > 0) {
            setActivePatientId(matching[0].id);
          }
        }}
      />

      {/* Main Workspace Body */}
      <div className="flex-1 flex overflow-hidden relative">
        {currentView === 'patients' && (
          <>
            {/* Mobile Top Bar to open directory and create new patient */}
            <div className="md:hidden absolute top-0 left-0 right-0 z-20 px-3 py-2 bg-white/95 backdrop-blur-md border-b border-sky-100 flex items-center justify-between shadow-xs">
              <button
                onClick={() => setMobileShowDirectory(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-50 active:bg-sky-100 border border-sky-200 text-sky-950 rounded-xl text-xs font-bold cursor-pointer transition-colors shadow-2xs"
                title="Open Patient Directory"
              >
                <Users className="w-3.5 h-3.5 text-sky-600" />
                <span>Directory ({patients.length})</span>
              </button>

              <button
                onClick={handleAddNewPatient}
                className="flex items-center gap-1 px-3 py-1.5 bg-sky-600 active:bg-sky-700 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors shadow-2xs"
                title="Create New Patient Record"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Patient</span>
              </button>
            </div>

            {/* Mobile Drawer Backdrop */}
            {mobileShowDirectory && (
              <div
                onClick={() => setMobileShowDirectory(false)}
                className="md:hidden fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-40 transition-opacity animate-fade-in"
                aria-label="Close directory overlay"
              />
            )}

            {/* Mobile Directory Drawer - Safely Hidden & Inaccessible When Closed */}
            <div
              className={`md:hidden fixed inset-y-0 left-0 w-[88vw] max-w-sm bg-white z-50 shadow-2xl flex flex-col h-full h-[100dvh] overflow-hidden transition-all duration-300 ease-in-out ${
                mobileShowDirectory
                  ? 'translate-x-0 opacity-100 visible pointer-events-auto'
                  : '-translate-x-full opacity-0 invisible pointer-events-none'
              }`}
              aria-hidden={!mobileShowDirectory}
            >
              <PatientDirectory
                patients={patients}
                activePatientId={activePatientId}
                isMobileOpen={mobileShowDirectory}
                onSelectPatient={(id) => {
                  setActivePatientId(id);
                  setMobileShowDirectory(false);
                }}
                onAddNewPatient={() => {
                  handleAddNewPatient();
                  setMobileShowDirectory(false);
                }}
                searchFilter={searchFilter}
                onUpdateSearchFilter={setSearchFilter}
                onRestorePatient={handleRestorePatient}
                onDeletePatient={handleDeletePatient}
                onDeletePatients={handleDeleteMultiplePatients}
                onRestorePatients={handleRestoreMultiplePatients}
                onPermanentDeletePatients={handlePermanentDeleteMultiplePatients}
                onOpenSearchModal={() => setIsSearchModalOpen(true)}
                onOpenBackup={() => setIsBackupEntryModalOpen(true)}
                onCloseDirectory={() => setMobileShowDirectory(false)}
                onCloseMobile={() => setMobileShowDirectory(false)}
              />
            </div>

            {/* Desktop Directory Sidebar (Collapsible & Fixed) */}
            {isDirectoryOpen ? (
              <div className="hidden md:block h-full shrink-0">
                <PatientDirectory
                  patients={patients}
                  activePatientId={activePatientId}
                  onSelectPatient={(id) => setActivePatientId(id)}
                  onAddNewPatient={handleAddNewPatient}
                  searchFilter={searchFilter}
                  onUpdateSearchFilter={setSearchFilter}
                  onRestorePatient={handleRestorePatient}
                  onDeletePatient={handleDeletePatient}
                  onDeletePatients={handleDeleteMultiplePatients}
                  onRestorePatients={handleRestoreMultiplePatients}
                  onPermanentDeletePatients={handlePermanentDeleteMultiplePatients}
                  onOpenSearchModal={() => setIsSearchModalOpen(true)}
                  onOpenBackup={() => setIsBackupEntryModalOpen(true)}
                  onCloseDirectory={() => setIsDirectoryOpen(false)}
                />
              </div>
            ) : (
              /* Desktop Collapsed Rail to reopen directory */
              <div className="hidden md:flex flex-col justify-start p-2 border-r border-sky-100 bg-white/95 shrink-0 z-20">
                <button
                  onClick={() => setIsDirectoryOpen(true)}
                  className="p-2.5 rounded-2xl bg-sky-50 hover:bg-sky-100 text-sky-900 border border-sky-200 transition-all shadow-2xs flex flex-col items-center gap-2 cursor-pointer text-xs font-bold group"
                  title="Open Patient Directory"
                >
                  <Users className="w-4 h-4 text-sky-600 group-hover:scale-110 transition-transform" />
                  <span className="[writing-mode:vertical-lr] rotate-180 py-2 tracking-wider font-extrabold text-[11px] text-sky-950">
                    DIRECTORY ({patients.length})
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-sky-500" />
                </button>
              </div>
            )}

            {/* Patient Clinical Case Sheet */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden pt-12 md:pt-0 h-full">
              {activePatient ? (
                <PatientCaseSheet
                  patient={activePatient}
                  clinicName={CLINIC_CONFIG.clinicName}
                  onUpdatePatient={handleUpdatePatient}
                  onDeletePatient={handleDeletePatient}
                  onRestorePatient={handleRestorePatient}
                  onPermanentDeletePatient={(id) => handlePermanentDeleteMultiplePatients([id])}
                  onOpenReceipt={handleOpenReceipt}
                  onClosePatient={() => {
                    setActivePatientId(null);
                    setIsDirectoryOpen(true);
                  }}
                />
              ) : (
                <div
                  id="no-patient-selected-wrapper"
                  className="flex-1 flex flex-col items-center justify-center p-6 sm:p-8 bg-slate-50/70 text-center overflow-y-auto min-h-0"
                >
                  <div className="flex flex-col items-center space-y-5 max-w-md w-full animate-in fade-in duration-300">
                    {/* Rotating Clinic Logo above No Patient Selected container */}
                    <div className="relative flex items-center justify-center">
                      <img
                        src="/clinic_logo.png"
                        alt="Namana Physiotherapy Clinic Logo"
                        className="w-20 h-20 sm:w-24 sm:h-24 object-contain rounded-full animate-[spin_3.5s_linear_infinite] will-change-transform shadow-lg"
                        referrerPolicy="no-referrer"
                      />
                    </div>

                    {/* No Patient Selected Container */}
                    <div className="w-full bg-white border border-sky-100 rounded-3xl p-6 sm:p-8 space-y-4 shadow-xs">
                      <h3 className="text-lg sm:text-xl font-extrabold text-sky-950">
                        No Patient Selected
                      </h3>
                      <p className="text-xs text-slate-500 leading-relaxed max-w-xs mx-auto">
                        Select a patient record from the sidebar directory on the left or register a new patient chart to view clinical documentation.
                      </p>
                      <div className="flex flex-col sm:flex-row items-center gap-2 pt-2 justify-center">
                        <button
                          onClick={handleAddNewPatient}
                          className="w-full sm:w-auto px-5 py-2.5 bg-sky-600 hover:bg-sky-700 active:scale-[0.98] text-white rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>+ New Patient Record</span>
                        </button>
                        <button
                          onClick={() => {
                            setMobileShowDirectory(true);
                            setIsDirectoryOpen(true);
                          }}
                          className="md:hidden w-full sm:w-auto px-4 py-2.5 bg-sky-50 hover:bg-sky-100 text-sky-900 border border-sky-200 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          <Users className="w-3.5 h-3.5 text-sky-600" />
                          <span>Browse Directory ({patients.length})</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* Monthly Data View */}
        {currentView === 'monthly' && (
          <MonthlyReport
            patients={patients}
            onSelectPatient={(id) => {
              setActivePatientId(id);
              setCurrentView('patients');
            }}
          />
        )}

        {/* Fee Collected View */}
        {currentView === 'fees' && (
          <FeeReport
            patients={patients}
            onOpenReceipt={handleOpenReceipt}
            onSelectPatient={(id) => {
              setActivePatientId(id);
              setCurrentView('patients');
            }}
          />
        )}

        {/* IT Return & Annual Statement View */}
        {currentView === 'itreturn' && (
          <ITReturnReport
            patients={patients}
            onUpdateClinicSettings={setClinicSettings}
          />
        )}

        {/* Cloud Sync & Google Sheets View */}
        {currentView === 'backup' && (
          <GoogleSheetsDashboard
            settings={clinicSettings}
            onUpdateSettings={setClinicSettings}
            patients={patients}
            onImportPatients={(imported) => {
              const deduped = deduplicatePatients(imported);
              setPatients(deduped);
              savePatients(deduped);
              // Reset search and filters so newly imported records are visible immediately
              setSearchFilter({
                field: 'all',
                query: '',
                status: 'active',
                visitType: 'all',
              });
              if (deduped.length > 0) {
                const active = deduped.find((p) => !p.deleted) || deduped[0];
                setActivePatientId(active.id);
              }
            }}
          />
        )}

        {/* Locum Tenens View */}
        {currentView === 'locum' && (
          <LocumTenensManager />
        )}
      </div>

      {/* Global Modals */}

      {/* Backup Section Entry Passkey Modal (Passkey: 9880517715) */}
      <BackupEntryPasskeyModal
        isOpen={isBackupEntryModalOpen}
        onSuccess={() => {
          setIsBackupEntryModalOpen(false);
          setCurrentView('backup');
          setMobileShowDirectory(false);
        }}
        onClose={() => setIsBackupEntryModalOpen(false)}
      />

      {/* 1. Search & Filter Modal */}
      {isSearchModalOpen && (
        <SearchFilterModal
          filter={searchFilter}
          onApply={(f) => {
            setSearchFilter(f);
            setIsSearchModalOpen(false);
          }}
          onClose={() => setIsSearchModalOpen(false)}
        />
      )}

      {/* New Patient Registration Modal - validates that details are entered fully before creating */}
      {isNewPatientModalOpen && (
        <NewPatientModal
          nextSerial={nextPatientSerial}
          existingPatients={patients}
          onSave={handleSaveNewPatient}
          onClose={() => setIsNewPatientModalOpen(false)}
        />
      )}

      {/* 2. Official Clinical Receipt Modal */}
      {receiptData && receiptData.open && (
        <ReceiptModal receiptData={receiptData} onClose={() => setReceiptData(null)} />
      )}

      {/* 3. Cloud Sync & Backup Modal */}
      {isCloudModalOpen && (
        <CloudSyncModal
          settings={clinicSettings}
          onUpdateSettings={setClinicSettings}
          patients={patients}
          onImportPatients={(imported) => {
            const deduped = deduplicatePatients(imported);
            setPatients(deduped);
            savePatients(deduped);
            if (deduped.length > 0) {
              const active = deduped.find((p) => !p.deleted) || deduped[0];
              setActivePatientId(active.id);
            }
          }}
          onClose={() => setIsCloudModalOpen(false)}
        />
      )}
    </div>
  );
}

export default App;
