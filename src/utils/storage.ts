import { Patient, ClinicSettings, TreatmentModalities, LocumPhysiotherapist } from '../types';
import { CLINIC_CONFIG } from '../constants';
import { localDB } from '../db/localDatabase';

export { localDB };

const PATIENTS_INDEX_KEY = 'physio_patients_index';
const PATIENT_PREFIX_KEY = 'physio_patient_';
const CLINIC_SETTINGS_KEY = 'physio_clinic_settings';
const LOCUM_PHYSIO_KEY = 'physio_locum_tenens';
const REFERRAL_DOCTORS_KEY = 'physio_referral_doctors';

export function defaultTreatmentModalities(): TreatmentModalities {
  return {
    moist: false,
    ust: false,
    ift: false,
    postural: false,
    exercise: false,
    pelvicTraction: false,
    cervicalTraction: false,
    coldPack: false,
    thermo: false,
    nmes: false,
    paraffin: false,
    manual: false,
    tens: false,
    rcs: false,
    rse: false,
    gait: false,
    other: false,
    otherText: '',
  };
}

/**
 * Extracts 2-digit year (YY) and 2-digit month (MM) from a date string (YYYY-MM-DD or ISO)
 */
export function getYearMonthFromDate(dateStr?: string): { yearYY: string; monthMM: string; fullYear: number; monthIndex: number } {
  if (!dateStr || typeof dateStr !== 'string') {
    const now = new Date();
    return {
      yearYY: String(now.getFullYear()).slice(-2),
      monthMM: String(now.getMonth() + 1).padStart(2, '0'),
      fullYear: now.getFullYear(),
      monthIndex: now.getMonth(),
    };
  }

  const match = dateStr.match(/^(\d{4})-(\d{2})/);
  if (match) {
    return {
      yearYY: match[1].slice(-2),
      monthMM: match[2],
      fullYear: parseInt(match[1], 10),
      monthIndex: parseInt(match[2], 10) - 1,
    };
  }

  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) {
    return {
      yearYY: String(d.getFullYear()).slice(-2),
      monthMM: String(d.getMonth() + 1).padStart(2, '0'),
      fullYear: d.getFullYear(),
      monthIndex: d.getMonth(),
    };
  }

  const now = new Date();
  return {
    yearYY: String(now.getFullYear()).slice(-2),
    monthMM: String(now.getMonth() + 1).padStart(2, '0'),
    fullYear: now.getFullYear(),
    monthIndex: now.getMonth(),
  };
}

/**
 * Formats Patient ID strictly as NPC/YY/MM/NNN
 * e.g., for 2026 September, patient 1: NPC/26/09/001
 */
export function formatPatientId(dateStr?: string, monthlySeq?: number): string {
  const { yearYY, monthMM } = getYearMonthFromDate(dateStr);
  const seqPad = String(Math.max(1, monthlySeq || 1)).padStart(3, '0');
  return `NPC/${yearYY}/${monthMM}/${seqPad}`;
}

/**
 * Parses Patient ID (supports NPC/26/09/001 and legacy formats)
 */
export function parsePatientId(patientId?: string): { yearYY: string; monthMM: string; seq: number } | null {
  if (!patientId || typeof patientId !== 'string') return null;

  // Modern target format: NPC/26/09/001
  const matchNew = patientId.match(/^NPC\/(\d{2})\/(\d{2})\/(\d+)$/i);
  if (matchNew) {
    return {
      yearYY: matchNew[1],
      monthMM: matchNew[2],
      seq: parseInt(matchNew[3], 10),
    };
  }

  // Format with full year: NPC/2026/09/001
  const matchFullYearWithMonth = patientId.match(/^NPC\/\d{2}(\d{2})\/(\d{2})\/(\d+)$/i);
  if (matchFullYearWithMonth) {
    return {
      yearYY: matchFullYearWithMonth[1],
      monthMM: matchFullYearWithMonth[2],
      seq: parseInt(matchFullYearWithMonth[3], 10),
    };
  }

  // Legacy format: NPC/2026/101 or NPC/26/101 (without month)
  const matchLegacy = patientId.match(/^NPC\/(?:\d{2})?(\d{2})\/(\d+)$/i);
  if (matchLegacy) {
    return {
      yearYY: matchLegacy[1],
      monthMM: '',
      seq: parseInt(matchLegacy[2], 10),
    };
  }

  return null;
}

/**
 * Calculates the next sequential number resetting to 1 at the start of every month
 */
export function getNextMonthlySerial(dateStr: string, existingPatients: Patient[]): number {
  const { yearYY, monthMM } = getYearMonthFromDate(dateStr);
  let maxSeq = 0;

  for (const p of existingPatients) {
    if (!p) continue;
    // 1. Check if patient has a parsed regNo with matching year and month
    if (p.regNo) {
      const parsed = parsePatientId(p.regNo);
      if (parsed && parsed.yearYY === yearYY && parsed.monthMM === monthMM) {
        if (parsed.seq > maxSeq) maxSeq = parsed.seq;
        continue;
      }
    }

    // 2. Check patient registration date
    const pYM = getYearMonthFromDate(p.date);
    if (pYM.yearYY === yearYY && pYM.monthMM === monthMM) {
      // If legacy serial was e.g. 1, 2, 3...
      if (p.serial && p.serial < 100 && p.serial > maxSeq) {
        maxSeq = p.serial;
      }
    }
  }

  return maxSeq + 1;
}

export function createNewPatient(nextSerial: number, existingPatients: Patient[] = []): Patient {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const monthlySeq = getNextMonthlySerial(today, existingPatients);
  const regNo = formatPatientId(today, monthlySeq);

  return {
    id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    serial: monthlySeq,
    regNo,
    date: today,
    time: formatTime24Hour(now),
    name: '',
    age: '',
    sex: 'Male',
    height: "5'6\"",
    weight: '65',
    bloodGroup: 'O+',
    referredBy: '',
    address: 'Mysuru, Karnataka',
    contact: '',
    diagnosis: '',
    history: '',
    comorbid: {
      diabetes: false,
      bp: false,
      thyroid: false,
      other: false,
      otherText: '',
    },
    treatment: defaultTreatmentModalities(),
    treatmentFee: '500',
    visitType: 'Clinic',
    followUps: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/**
 * Formats any Date, timestamp number, or time string into strict 24-hour format HH:MM:SS.
 * Accurately parses 12-hour strings (e.g. "02:30 PM" or "10:00 AM"), HH:MM strings,
 * or millisecond timestamps.
 */
export function formatTime24Hour(input?: Date | string | number): string {
  if (!input) {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  }

  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) {
      return formatTime24Hour();
    }

    // 12-hour format with AM/PM (e.g. "02:30:15 PM" or "10:00 AM")
    const ampmMatch = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)$/i);
    if (ampmMatch) {
      let hours = parseInt(ampmMatch[1], 10);
      const minutes = ampmMatch[2];
      const seconds = ampmMatch[3] || '00';
      const meridian = ampmMatch[4].toUpperCase();
      if (meridian === 'PM' && hours < 12) hours += 12;
      if (meridian === 'AM' && hours === 12) hours = 0;
      return `${String(hours).padStart(2, '0')}:${minutes}:${seconds}`;
    }

    // Strict 24-hour HH:MM:SS
    if (/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(trimmed)) {
      return trimmed;
    }

    // 24-hour HH:MM -> append :00
    if (/^([01]\d|2[0-3]):[0-5]\d$/.test(trimmed)) {
      return `${trimmed}:00`;
    }

    // ISO string with T (e.g. 2026-09-18T14:35:20.000Z)
    if (trimmed.includes('T')) {
      const timePart = trimmed.split('T')[1].replace(/Z$/i, '').split('.')[0];
      if (/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(timePart)) {
        return timePart;
      }
    }

    // Try parsing as date string
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime()) && parsed.getFullYear() > 2000) {
      const hh = String(parsed.getHours()).padStart(2, '0');
      const mm = String(parsed.getMinutes()).padStart(2, '0');
      const ss = String(parsed.getSeconds()).padStart(2, '0');
      return `${hh}:${mm}:${ss}`;
    }
  }

  if (typeof input === 'number') {
    const parsed = new Date(input);
    if (!isNaN(parsed.getTime())) {
      const hh = String(parsed.getHours()).padStart(2, '0');
      const mm = String(parsed.getMinutes()).padStart(2, '0');
      const ss = String(parsed.getSeconds()).padStart(2, '0');
      return `${hh}:${mm}:${ss}`;
    }
  }

  if (input instanceof Date && !isNaN(input.getTime())) {
    const hh = String(input.getHours()).padStart(2, '0');
    const mm = String(input.getMinutes()).padStart(2, '0');
    const ss = String(input.getSeconds()).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  }

  const fallback = new Date();
  return `${String(fallback.getHours()).padStart(2, '0')}:${String(fallback.getMinutes()).padStart(2, '0')}:${String(fallback.getSeconds()).padStart(2, '0')}`;
}

/**
 * Splits and sanitizes date strings that may contain raw ISO timestamps (e.g. 2026-09-03T18:30:00.000Z)
 * into a clean YYYY-MM-DD date and a separate 24-hour HH:MM:SS time string.
 * Strictly avoids static "10:00:00" defaults, producing real-world 24-hour HH:MM:SS timestamps.
 */
export function parseDateAndTimestamp(
  dateStr?: string,
  timeStr?: string,
  fallbackTimestamp?: Date | number | string,
  recordId?: string
): { cleanDate: string; cleanTime: string } {
  let cleanDate = dateStr && typeof dateStr === 'string' ? dateStr.trim() : new Date().toISOString().slice(0, 10);
  let extractedTime = timeStr ? String(timeStr).trim() : '';

  if (cleanDate.includes('T')) {
    const parts = cleanDate.split('T');
    cleanDate = parts[0];
    if (!extractedTime && parts[1]) {
      extractedTime = parts[1].replace(/Z$/i, '').split('.')[0];
    }
  }

  if (cleanDate.includes(' ')) {
    const parts = cleanDate.split(' ');
    cleanDate = parts[0];
    if (!extractedTime && parts[1]) {
      extractedTime = parts[1];
    }
  }

  // Check if extracted time is empty or legacy dummy placeholder "10:00" / "10:00:00"
  const isDummy10 = (
    !extractedTime ||
    extractedTime === '10:00:00' ||
    extractedTime === '10:00' ||
    extractedTime === '10:00 AM' ||
    extractedTime === '10:00:00 AM' ||
    extractedTime === '10:00:00 am' ||
    extractedTime === '10:00 am'
  );

  if (isDummy10) {
    let resolvedTime = '';
    // 1. Try to extract from fallbackTimestamp if it's a real timestamp and not dummy 10:00
    if (fallbackTimestamp) {
      const fbStr = formatTime24Hour(fallbackTimestamp);
      if (fbStr !== '10:00:00' && fbStr !== '10:00') {
        resolvedTime = fbStr;
      }
    }
    // 2. Try to extract epoch millisecond timestamp from recordId (e.g. p_1726668123456_abc or fu_1726668123456)
    if (!resolvedTime && recordId) {
      const match = recordId.match(/(?:p_|fu_)?(\d{13})/);
      if (match) {
        resolvedTime = formatTime24Hour(parseInt(match[1], 10));
      }
    }
    // 3. Fallback to fallbackTimestamp or stable default (prevents timestamp drift on subsequent sync cycles)
    extractedTime = resolvedTime || (fallbackTimestamp ? formatTime24Hour(fallbackTimestamp) : '10:00:00');
  } else {
    extractedTime = formatTime24Hour(extractedTime);
  }

  return { cleanDate, cleanTime: extractedTime };
}

export function loadClinicSettings(): ClinicSettings {
  try {
    const raw = localStorage.getItem(CLINIC_SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...CLINIC_CONFIG,
        ...parsed,
        consultantName: 'R. Chandrashekar',
        consultantEducation: 'BPT, MIAP',
        address: {
          ...CLINIC_CONFIG.address,
        },
      };
    }
  } catch (err) {
    console.warn('Failed to load clinic settings from localStorage', err);
  }
  return CLINIC_CONFIG;
}

export function saveClinicSettings(settings: ClinicSettings): void {
  try {
    localStorage.setItem(CLINIC_SETTINGS_KEY, JSON.stringify(settings));
    localDB.saveClinicSettings(settings).catch(() => {});
  } catch (err) {
    console.warn('Failed to save clinic settings to localStorage', err);
  }
}

export const loadSettings = loadClinicSettings;
export const saveSettings = saveClinicSettings;

export function deduplicatePatients(list: Patient[]): Patient[] {
  if (!list || !Array.isArray(list)) return [];

  const seenIds = new Set<string>();
  const seenRegNos = new Set<string>();
  const result: Patient[] = [];

  // Group patients by month to properly assign sequential monthly numbers to legacy records without regNo
  const monthCounters = new Map<string, number>();

  for (const p of list) {
    if (!p || typeof p !== 'object' || !p.id) continue;

    // Check duplicate internal ID
    if (seenIds.has(p.id)) continue;

    // Ensure clean date and separated time stamp (no raw ISO timestamps in date)
    const { cleanDate, cleanTime } = parseDateAndTimestamp(
      p.date,
      p.time,
      p.createdAt || p.updatedAt,
      p.id
    );

    // Ensure a valid name is present
    let patientName = (p.name || '').trim();

    // Normalize regNo if it's missing or in legacy NPC/2026/xxx format
    let regNo = (p.regNo || '').trim();
    const parsed = parsePatientId(regNo);
    const dateStr = cleanDate;
    const { yearYY, monthMM } = getYearMonthFromDate(dateStr);
    const monthKey = `${yearYY}/${monthMM}`;

    if (!parsed || !parsed.monthMM) {
      // Legacy format (e.g. NPC/2026/101 or NPC/2026/001 without 2-digit month)
      const currentMonthCount = (monthCounters.get(monthKey) || 0) + 1;
      monthCounters.set(monthKey, currentMonthCount);
      const seq = (parsed && parsed.seq && parsed.seq < 100) ? parsed.seq : currentMonthCount;
      regNo = formatPatientId(dateStr, seq);
    } else {
      // Ensure it has 2-digit year and month: NPC/26/MM/NNN
      regNo = formatPatientId(dateStr, parsed.seq);
      const prevCount = monthCounters.get(monthKey) || 0;
      if (parsed.seq > prevCount) {
        monthCounters.set(monthKey, parsed.seq);
      }
    }

    // Fallback patient name if empty
    if (!patientName || patientName === 'Unnamed Patient') {
      patientName = `Patient (${regNo})`;
    }

    // Strict uniqueness check on Patient ID (regNo)
    if (seenRegNos.has(regNo)) {
      // If a patient record with the exact same regNo is already in this batch,
      // differentiate it with the next sequential number in that month
      const nextSeq = (monthCounters.get(monthKey) || 0) + 1;
      monthCounters.set(monthKey, nextSeq);
      regNo = formatPatientId(dateStr, nextSeq);
    }

    seenIds.add(p.id);
    seenRegNos.add(regNo);

    // Extract monthly sequence for serial
    const parsedFinal = parsePatientId(regNo);
    const monthlySerial = parsedFinal ? parsedFinal.seq : (typeof p.serial === 'number' && p.serial > 0 ? p.serial : 1);

    // Deep sanitize every follow-up visit preserving all fields
    const sanitizedFollowUps = (Array.isArray(p.followUps) ? p.followUps : []).map((fu, fuIdx) => {
      const fuId = fu.id || `fu_${p.id}_${fuIdx + 1}`;
      const fuDt = parseDateAndTimestamp(
        fu.date,
        fu.time,
        fu.createdAt || fu.updatedAt || p.createdAt || p.updatedAt,
        fuId
      );
      return {
        ...fu,
        id: fuId,
        date: fuDt.cleanDate,
        time: fuDt.cleanTime,
        notes: fu.notes || `Session #${fuIdx + 1}`,
        treatment: {
          ...defaultTreatmentModalities(),
          ...(fu.treatment || p.treatment || {}),
        },
        fee: fu.fee !== undefined && fu.fee !== null ? fu.fee : (p.treatmentFee || '500'),
        paymentMethod: fu.paymentMethod || p.paymentMethod || 'Cash',
        visitType: fu.visitType || p.visitType || 'Clinic',
      };
    });

    result.push({
      ...p,
      name: patientName,
      regNo,
      date: cleanDate,
      time: cleanTime,
      serial: monthlySerial,
      treatment: {
        ...defaultTreatmentModalities(),
        ...(p.treatment || {}),
        rcs: p.treatment?.rcs ?? p.treatment?.rse ?? false,
      },
      followUps: sanitizedFollowUps,
    });
  }

  return result;
}

export function loadPatients(): Patient[] {
  try {
    const indexRaw = localStorage.getItem(PATIENTS_INDEX_KEY);
    if (indexRaw) {
      const ids: string[] = JSON.parse(indexRaw);
      const rawList: Patient[] = [];

      for (const id of ids) {
        if (!id) continue;
        const itemRaw = localStorage.getItem(PATIENT_PREFIX_KEY + id);
        if (itemRaw) {
          try {
            const parsed = JSON.parse(itemRaw);
            if (
              parsed &&
              typeof parsed === 'object' &&
              parsed.id &&
              parsed.name &&
              parsed.name.trim() !== '' &&
              parsed.name !== 'Unnamed Patient'
            ) {
              rawList.push(parsed);
            }
          } catch {
            // ignore corrupt entry
          }
        }
      }

      // Strictly deduplicate and normalize Patient IDs
      const uniqueList = deduplicatePatients(rawList);

      // Check if any self-healing is needed (e.g. migration from NPC/2026/ to NPC/26/MM/NNN or deduplication)
      let needsResave = uniqueList.length !== rawList.length;
      if (!needsResave) {
        for (let i = 0; i < uniqueList.length; i++) {
          if (uniqueList[i].regNo !== rawList[i]?.regNo) {
            needsResave = true;
            break;
          }
        }
      }

      if (needsResave) {
        saveAllPatients(uniqueList);
      }

      if (uniqueList.length > 0) {
        return uniqueList;
      }
    }
  } catch (err) {
    console.warn('Failed to load patients from localStorage', err);
  }
  return [];
}

export function savePatient(patient: Patient): void {
  try {
    if (!patient || !patient.id) return;
    localStorage.setItem(PATIENT_PREFIX_KEY + patient.id, JSON.stringify(patient));
    const indexRaw = localStorage.getItem(PATIENTS_INDEX_KEY);
    const ids: string[] = indexRaw ? JSON.parse(indexRaw) : [];
    const uniqueIds = Array.from(new Set([patient.id, ...ids]));
    localStorage.setItem(PATIENTS_INDEX_KEY, JSON.stringify(uniqueIds));
    localDB.savePatient(patient).catch(() => {});
  } catch (err) {
    console.warn('Failed to save single patient to localStorage', err);
  }
}

export function saveAllPatients(patients: Patient[]): void {
  try {
    const uniquePatients = deduplicatePatients(patients);
    const ids = uniquePatients.map((p) => p.id);
    localStorage.setItem(PATIENTS_INDEX_KEY, JSON.stringify(ids));
    for (const patient of uniquePatients) {
      localStorage.setItem(PATIENT_PREFIX_KEY + patient.id, JSON.stringify(patient));
    }
    localDB.saveAllPatients(uniquePatients).catch(() => {});
  } catch (err) {
    console.warn('Failed to save patients to localStorage', err);
  }
}

export const savePatients = saveAllPatients;

export function getNextSerial(patients: Patient[]): number {
  if (!patients || patients.length === 0) return 1;
  const today = new Date().toISOString().slice(0, 10);
  return getNextMonthlySerial(today, patients);
}

export function generateReceiptNumber(patient: Patient, sessionIndex?: number): string {
  const regNo = patient.regNo || formatPatientId(patient.date, patient.serial);
  // Transform NPC/26/09/001 -> NPC/26/09/R001
  const receiptBase = regNo.replace(/\/(\d+)$/, '/R$1');
  if (sessionIndex !== undefined && sessionIndex > 0) {
    return `${receiptBase}-${sessionIndex}`;
  }
  return receiptBase;
}

export function getLocumPhysiotherapists(): LocumPhysiotherapist[] {
  try {
    const raw = localStorage.getItem(LOCUM_PHYSIO_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Failed to load locum physiotherapists', e);
  }
  const defaultList: LocumPhysiotherapist[] = [
    {
      id: 'locum-chief-consultant',
      name: 'R. Chandrashekar',
      phone: CLINIC_CONFIG.phone,
      idType: 'IAP ID',
      idNumber: 'MIAP-4421',
      email: CLINIC_CONFIG.email,
      qualification: 'BPT, MIAP',
      status: 'Active',
      createdAt: '2026-01-01',
    },
  ];
  saveLocumPhysiotherapists(defaultList);
  return defaultList;
}

export function saveLocumPhysiotherapists(list: LocumPhysiotherapist[]): void {
  try {
    localStorage.setItem(LOCUM_PHYSIO_KEY, JSON.stringify(list));
    localDB.saveLocumPhysiotherapists(list).catch(() => {});
  } catch (e) {
    console.warn('Failed to save locum physiotherapists', e);
  }
}

export function getCommonReferralDoctors(): string[] {
  try {
    const raw = localStorage.getItem(REFERRAL_DOCTORS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Failed to load referral doctors', e);
  }
  const defaultDoctors = [
    'Self / Direct',
    'Dr. Suresh (Orthopedic)',
    'Dr. Ramesh (Neurologist)',
    'Dr. Priya (General Physician)',
    'Dr. Anand (Spine Specialist)',
    'Dr. Manjunath (Physician)',
  ];
  saveCommonReferralDoctors(defaultDoctors);
  return defaultDoctors;
}

export function saveCommonReferralDoctors(list: string[]): void {
  try {
    localStorage.setItem(REFERRAL_DOCTORS_KEY, JSON.stringify(list));
    localDB.saveReferralDoctors(list).catch(() => {});
  } catch (e) {
    console.warn('Failed to save referral doctors', e);
  }
}

export const CUSTOM_TREATMENTS_KEY = 'physio_custom_treatments_list';

export const DEFAULT_FOLLOW_UP_TREATMENTS: string[] = [
  'IFT',
  'Ultrasound (UST)',
  'TENS',
  'Cervical Traction',
  'Pelvic Traction',
  'Exercise Therapy',
  'Manual Therapy',
  'Hot Pack / Moist Heat',
  'Cold Pack / Cryotherapy',
  'Dry Needling',
  'Cupping Therapy',
  'Kinesio Taping',
  'Gait Training',
  'Joint Mobilization',
  'Laser Therapy',
];

export function getFollowUpTreatmentsList(): string[] {
  try {
    const raw = localStorage.getItem(CUSTOM_TREATMENTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Failed to load custom treatments', e);
  }
  saveFollowUpTreatmentsList(DEFAULT_FOLLOW_UP_TREATMENTS);
  return DEFAULT_FOLLOW_UP_TREATMENTS;
}

export function saveFollowUpTreatmentsList(list: string[]): void {
  try {
    localStorage.setItem(CUSTOM_TREATMENTS_KEY, JSON.stringify(list));
  } catch (e) {
    console.warn('Failed to save custom treatments', e);
  }
}

export function addCustomTreatment(name: string): string[] {
  const trimmed = name.trim();
  if (!trimmed) return getFollowUpTreatmentsList();
  const current = getFollowUpTreatmentsList();
  if (current.some((t) => t.toLowerCase() === trimmed.toLowerCase())) {
    return current;
  }
  const updated = [...current, trimmed];
  saveFollowUpTreatmentsList(updated);
  return updated;
}

export function deleteCustomTreatment(name: string): string[] {
  const current = getFollowUpTreatmentsList();
  const updated = current.filter((t) => t.toLowerCase() !== name.toLowerCase());
  saveFollowUpTreatmentsList(updated);
  return updated;
}

