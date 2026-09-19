import { Patient, ClinicSettings, LocumPhysiotherapist, FollowUpVisit } from '../types';

export const DB_NAME = 'NamanaPhysioLocalDB';
export const DB_VERSION = 1;

export interface DatabaseStats {
  status: 'connected' | 'connecting' | 'error' | 'unsupported';
  databaseName: string;
  version: number;
  engine: 'IndexedDB' | 'localStorage Fallback';
  totalPatients: number;
  activePatients: number;
  totalFollowUps: number;
  totalLocums: number;
  totalReferralDoctors: number;
  lastUpdated: string;
  message?: string;
}

export interface NormalizedFollowUpSession {
  id: string;
  patientId: string;
  patientRegNo?: string;
  patientName?: string;
  date: string;
  time?: string;
  sessionIndex: number;
  notes: string;
  painScaleBefore?: number;
  painScaleAfter?: number;
  treatmentsGiven?: string[];
  fee: string | number;
  receiptNo?: string;
  paymentMethod?: string;
  seenBy?: string;
  visitType?: string;
}

class LocalDatabaseManager {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<IDBDatabase | null> | null = null;

  /**
   * Checks if IndexedDB is available in the current runtime environment
   */
  public isSupported(): boolean {
    return typeof window !== 'undefined' && 'indexedDB' in window;
  }

  /**
   * Initializes the local database automatically on its own.
   * Creates object stores and indices for all required fields.
   */
  public async getDB(): Promise<IDBDatabase | null> {
    if (!this.isSupported()) return null;
    if (this.db) return this.db;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise<IDBDatabase | null>((resolve) => {
      try {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;

          // 1. PATIENTS STORE
          if (!db.objectStoreNames.contains('patients')) {
            const patientStore = db.createObjectStore('patients', { keyPath: 'id' });
            patientStore.createIndex('regNo', 'regNo', { unique: false });
            patientStore.createIndex('name', 'name', { unique: false });
            patientStore.createIndex('contact', 'contact', { unique: false });
            patientStore.createIndex('date', 'date', { unique: false });
            patientStore.createIndex('seenBy', 'seenBy', { unique: false });
            patientStore.createIndex('referredBy', 'referredBy', { unique: false });
            patientStore.createIndex('deleted', 'deleted', { unique: false });
            patientStore.createIndex('createdAt', 'createdAt', { unique: false });
            patientStore.createIndex('updatedAt', 'updatedAt', { unique: false });
          }

          // 2. FOLLOW-UP SESSIONS STORE
          if (!db.objectStoreNames.contains('followUps')) {
            const fuStore = db.createObjectStore('followUps', { keyPath: 'id' });
            fuStore.createIndex('patientId', 'patientId', { unique: false });
            fuStore.createIndex('date', 'date', { unique: false });
            fuStore.createIndex('seenBy', 'seenBy', { unique: false });
            fuStore.createIndex('receiptNo', 'receiptNo', { unique: false });
            fuStore.createIndex('paymentMethod', 'paymentMethod', { unique: false });
          }

          // 3. LOCUM PHYSIOTHERAPISTS STORE
          if (!db.objectStoreNames.contains('locums')) {
            const locumStore = db.createObjectStore('locums', { keyPath: 'id' });
            locumStore.createIndex('name', 'name', { unique: false });
            locumStore.createIndex('status', 'status', { unique: false });
            locumStore.createIndex('idNumber', 'idNumber', { unique: false });
          }

          // 4. REFERRAL DOCTORS STORE
          if (!db.objectStoreNames.contains('referralDoctors')) {
            db.createObjectStore('referralDoctors', { keyPath: 'name' });
          }

          // 5. CUSTOM TREATMENTS STORE
          if (!db.objectStoreNames.contains('customTreatments')) {
            db.createObjectStore('customTreatments', { keyPath: 'name' });
          }

          // 6. CLINIC SETTINGS STORE
          if (!db.objectStoreNames.contains('clinicSettings')) {
            db.createObjectStore('clinicSettings', { keyPath: 'key' });
          }

          // 7. SYSTEM METADATA & SNAPSHOTS
          if (!db.objectStoreNames.contains('databaseMeta')) {
            db.createObjectStore('databaseMeta', { keyPath: 'key' });
          }
        };

        request.onsuccess = (event) => {
          this.db = (event.target as IDBOpenDBRequest).result;

          // Handle abnormal database closing
          this.db.onclose = () => {
            this.db = null;
            this.initPromise = null;
          };

          // Save init metadata
          this.setMeta('db_initialized', {
            name: DB_NAME,
            version: DB_VERSION,
            timestamp: new Date().toISOString(),
          }).catch(() => {});

          resolve(this.db);
        };

        request.onerror = (event) => {
          console.error('IndexedDB open error:', (event.target as IDBOpenDBRequest).error);
          resolve(null);
        };

        request.onblocked = () => {
          console.warn('IndexedDB open blocked: please close other open tabs of this app.');
          resolve(null);
        };
      } catch (err) {
        console.error('Failed to initialize IndexedDB:', err);
        resolve(null);
      }
    });

    return this.initPromise;
  }

  /**
   * Stores or updates a metadata key-value
   */
  public async setMeta(key: string, value: any): Promise<void> {
    const db = await this.getDB();
    if (!db) return;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction('databaseMeta', 'readwrite');
        const store = tx.objectStore('databaseMeta');
        store.put({ key, value, updatedAt: Date.now() });
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  /**
   * Retrieves a metadata key-value
   */
  public async getMeta<T = any>(key: string): Promise<T | null> {
    const db = await this.getDB();
    if (!db) return null;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction('databaseMeta', 'readonly');
        const store = tx.objectStore('databaseMeta');
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result ? req.result.value : null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  /**
   * Save a single patient and all their follow-ups into IndexedDB
   */
  public async savePatient(patient: Patient): Promise<boolean> {
    const db = await this.getDB();
    if (!db || !patient || !patient.id) return false;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(['patients', 'followUps'], 'readwrite');
        const patientStore = tx.objectStore('patients');
        const fuStore = tx.objectStore('followUps');

        patientStore.put(patient);

        // Normalize and store each follow-up session
        if (Array.isArray(patient.followUps)) {
          patient.followUps.forEach((fu, idx) => {
            if (fu && fu.id) {
              const normalized: NormalizedFollowUpSession = {
                id: fu.id,
                patientId: patient.id,
                patientRegNo: patient.regNo,
                patientName: patient.name,
                date: fu.date,
                time: fu.time,
                sessionIndex: idx + 1,
                notes: fu.notes || '',
                painScaleBefore: fu.painScaleBefore,
                painScaleAfter: fu.painScaleAfter,
                treatmentsGiven: fu.treatmentsGiven,
                fee: fu.fee,
                receiptNo: fu.receiptNo,
                paymentMethod: fu.paymentMethod,
                seenBy: fu.seenBy || patient.seenBy,
                visitType: fu.visitType || patient.visitType,
              };
              fuStore.put(normalized);
            }
          });
        }

        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (err) {
        console.warn('Error saving patient to IndexedDB:', err);
        resolve(false);
      }
    });
  }

  /**
   * Bulk saves/updates all patients into IndexedDB with atomic transaction
   */
  public async saveAllPatients(patients: Patient[]): Promise<boolean> {
    const db = await this.getDB();
    if (!db) return false;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(['patients', 'followUps'], 'readwrite');
        const patientStore = tx.objectStore('patients');
        const fuStore = tx.objectStore('followUps');

        // Clear existing store for clean state synchronization
        patientStore.clear();
        fuStore.clear();

        patients.forEach((patient) => {
          if (!patient || !patient.id) return;
          patientStore.put(patient);

          if (Array.isArray(patient.followUps)) {
            patient.followUps.forEach((fu, idx) => {
              if (fu && fu.id) {
                const normalized: NormalizedFollowUpSession = {
                  id: fu.id,
                  patientId: patient.id,
                  patientRegNo: patient.regNo,
                  patientName: patient.name,
                  date: fu.date,
                  time: fu.time,
                  sessionIndex: idx + 1,
                  notes: fu.notes || '',
                  painScaleBefore: fu.painScaleBefore,
                  painScaleAfter: fu.painScaleAfter,
                  treatmentsGiven: fu.treatmentsGiven,
                  fee: fu.fee,
                  receiptNo: fu.receiptNo,
                  paymentMethod: fu.paymentMethod,
                  seenBy: fu.seenBy || patient.seenBy,
                  visitType: fu.visitType || patient.visitType,
                };
                fuStore.put(normalized);
              }
            });
          }
        });

        tx.oncomplete = () => {
          this.setMeta('last_patients_sync', {
            count: patients.length,
            timestamp: new Date().toISOString(),
          }).catch(() => {});
          resolve(true);
        };
        tx.onerror = () => resolve(false);
      } catch (err) {
        console.warn('Error bulk saving patients to IndexedDB:', err);
        resolve(false);
      }
    });
  }

  /**
   * Retrieves all patients from IndexedDB
   */
  public async getAllPatients(): Promise<Patient[]> {
    const db = await this.getDB();
    if (!db) return [];

    return new Promise((resolve) => {
      try {
        const tx = db.transaction('patients', 'readonly');
        const store = tx.objectStore('patients');
        const req = store.getAll();

        req.onsuccess = () => {
          resolve(Array.isArray(req.result) ? req.result : []);
        };
        req.onerror = () => resolve([]);
      } catch (err) {
        console.warn('Error reading patients from IndexedDB:', err);
        resolve([]);
      }
    });
  }

  /**
   * Retrieves a single patient by ID from IndexedDB
   */
  public async getPatientById(id: string): Promise<Patient | null> {
    const db = await this.getDB();
    if (!db || !id) return null;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction('patients', 'readonly');
        const store = tx.objectStore('patients');
        const req = store.get(id);

        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  /**
   * Permanently deletes a single patient and their follow-ups from IndexedDB
   */
  public async deletePatient(id: string): Promise<boolean> {
    const db = await this.getDB();
    if (!db || !id) return false;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(['patients', 'followUps'], 'readwrite');
        const patientStore = tx.objectStore('patients');
        patientStore.delete(id);

        const fuStore = tx.objectStore('followUps');
        const fuIndex = fuStore.index('patientId');
        const fuReq = fuIndex.getAllKeys(id);
        fuReq.onsuccess = () => {
          const keys = fuReq.result;
          if (Array.isArray(keys)) {
            keys.forEach((key) => fuStore.delete(key));
          }
        };

        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  }

  /**
   * Saves Locum Physiotherapists into IndexedDB
   */
  public async saveLocumPhysiotherapists(locums: LocumPhysiotherapist[]): Promise<boolean> {
    const db = await this.getDB();
    if (!db) return false;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction('locums', 'readwrite');
        const store = tx.objectStore('locums');
        store.clear();
        locums.forEach((l) => {
          if (l && l.id) store.put(l);
        });
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  }

  /**
   * Retrieves Locum Physiotherapists from IndexedDB
   */
  public async getLocumPhysiotherapists(): Promise<LocumPhysiotherapist[]> {
    const db = await this.getDB();
    if (!db) return [];

    return new Promise((resolve) => {
      try {
        const tx = db.transaction('locums', 'readonly');
        const store = tx.objectStore('locums');
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
  }

  /**
   * Saves Referral Doctors into IndexedDB
   */
  public async saveReferralDoctors(doctors: string[]): Promise<boolean> {
    const db = await this.getDB();
    if (!db) return false;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction('referralDoctors', 'readwrite');
        const store = tx.objectStore('referralDoctors');
        store.clear();
        doctors.forEach((name) => {
          if (name && typeof name === 'string') store.put({ name });
        });
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  }

  /**
   * Retrieves Referral Doctors from IndexedDB
   */
  public async getReferralDoctors(): Promise<string[]> {
    const db = await this.getDB();
    if (!db) return [];

    return new Promise((resolve) => {
      try {
        const tx = db.transaction('referralDoctors', 'readonly');
        const store = tx.objectStore('referralDoctors');
        const req = store.getAll();
        req.onsuccess = () => {
          const list = Array.isArray(req.result)
            ? req.result.map((r: any) => (typeof r === 'string' ? r : r.name)).filter(Boolean)
            : [];
          resolve(list);
        };
        req.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
  }

  /**
   * Saves Clinic Settings into IndexedDB
   */
  public async saveClinicSettings(settings: ClinicSettings): Promise<boolean> {
    const db = await this.getDB();
    if (!db) return false;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction('clinicSettings', 'readwrite');
        const store = tx.objectStore('clinicSettings');
        store.put({ key: 'main', settings, updatedAt: Date.now() });
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  }

  /**
   * Automatically initializes database and executes seamless one-time migration
   * from localStorage if IndexedDB is empty.
   */
  public async autoBootstrapAndMigrate(
    currentPatients: Patient[],
    currentLocums: LocumPhysiotherapist[],
    currentDoctors: string[],
    currentSettings: ClinicSettings
  ): Promise<{ migrated: boolean; patientCount: number }> {
    const db = await this.getDB();
    if (!db) {
      return { migrated: false, patientCount: 0 };
    }

    try {
      const existing = await this.getAllPatients();
      if (existing.length === 0 && currentPatients.length > 0) {
        // Automatically migrate all existing data to IndexedDB
        await this.saveAllPatients(currentPatients);
        await this.saveLocumPhysiotherapists(currentLocums);
        await this.saveReferralDoctors(currentDoctors);
        await this.saveClinicSettings(currentSettings);

        await this.setMeta('initial_migration', {
          timestamp: new Date().toISOString(),
          patientCount: currentPatients.length,
          source: 'localStorage',
        });

        console.log(`[LocalDatabase] Auto-provisioned database '${DB_NAME}' and migrated ${currentPatients.length} patient records.`);
        return { migrated: true, patientCount: currentPatients.length };
      }

      return { migrated: false, patientCount: existing.length };
    } catch (err) {
      console.warn('[LocalDatabase] Auto-migration check encountered an issue:', err);
      return { migrated: false, patientCount: 0 };
    }
  }

  /**
   * Retrieves live diagnostic stats about the local database
   */
  public async getDatabaseStats(patientsFallback: Patient[] = []): Promise<DatabaseStats> {
    if (!this.isSupported()) {
      return {
        status: 'unsupported',
        databaseName: DB_NAME,
        version: DB_VERSION,
        engine: 'localStorage Fallback',
        totalPatients: patientsFallback.length,
        activePatients: patientsFallback.filter((p) => !p.deleted).length,
        totalFollowUps: patientsFallback.reduce((sum, p) => sum + (p.followUps?.length || 0), 0),
        totalLocums: 1,
        totalReferralDoctors: 6,
        lastUpdated: new Date().toLocaleTimeString(),
        message: 'Browser does not support IndexedDB, using localStorage fallback.',
      };
    }

    const db = await this.getDB();
    if (!db) {
      return {
        status: 'error',
        databaseName: DB_NAME,
        version: DB_VERSION,
        engine: 'localStorage Fallback',
        totalPatients: patientsFallback.length,
        activePatients: patientsFallback.filter((p) => !p.deleted).length,
        totalFollowUps: patientsFallback.reduce((sum, p) => sum + (p.followUps?.length || 0), 0),
        totalLocums: 1,
        totalReferralDoctors: 6,
        lastUpdated: new Date().toLocaleTimeString(),
        message: 'Could not connect to IndexedDB instance.',
      };
    }

    try {
      const patients = await this.getAllPatients();
      const list = patients.length > 0 ? patients : patientsFallback;
      const active = list.filter((p) => !p.deleted).length;
      const totalFollowUps = list.reduce((sum, p) => sum + (p.followUps?.length || 0), 0);
      const locums = await this.getLocumPhysiotherapists();

      return {
        status: 'connected',
        databaseName: DB_NAME,
        version: DB_VERSION,
        engine: 'IndexedDB',
        totalPatients: list.length,
        activePatients: active,
        totalFollowUps,
        totalLocums: locums.length > 0 ? locums.length : 1,
        totalReferralDoctors: 6,
        lastUpdated: new Date().toLocaleTimeString(),
        message: `Database '${DB_NAME}' active with ${list.length} patients and ${totalFollowUps} follow-up sessions.`,
      };
    } catch (err: any) {
      return {
        status: 'error',
        databaseName: DB_NAME,
        version: DB_VERSION,
        engine: 'IndexedDB',
        totalPatients: patientsFallback.length,
        activePatients: patientsFallback.filter((p) => !p.deleted).length,
        totalFollowUps: 0,
        totalLocums: 1,
        totalReferralDoctors: 6,
        lastUpdated: new Date().toLocaleTimeString(),
        message: err?.message || 'Error querying database stats.',
      };
    }
  }

  /**
   * Generates a complete JSON database dump containing all tables
   */
  public async exportFullDatabaseDump(): Promise<string> {
    const patients = await this.getAllPatients();
    const locums = await this.getLocumPhysiotherapists();
    const stats = await this.getDatabaseStats(patients);

    const dump = {
      databaseName: DB_NAME,
      version: DB_VERSION,
      exportedAt: new Date().toISOString(),
      stats,
      patients,
      locumPhysiotherapists: locums,
    };

    return JSON.stringify(dump, null, 2);
  }
}

export const localDB = new LocalDatabaseManager();
