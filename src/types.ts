export type VisitType = 'Clinic' | 'Home Visit';
export type PaymentMethod = 'Cash' | 'UPI' | 'Card' | 'Bank Transfer';

export interface ComorbidConditions {
  diabetes: boolean;
  bp: boolean;
  thyroid: boolean;
  other: boolean;
  otherText: string;
}

export interface TreatmentModalities {
  moist: boolean;
  ust: boolean;
  ift: boolean;
  postural: boolean;
  exercise: boolean;
  pelvicTraction: boolean;
  cervicalTraction: boolean;
  coldPack: boolean;
  thermo: boolean;
  nmes: boolean;
  paraffin: boolean;
  manual: boolean;
  tens: boolean;
  rcs: boolean;
  rse?: boolean;
  gait: boolean;
  other: boolean;
  otherText: string;
}

export interface FollowUpVisit {
  id: string;
  date: string; // YYYY-MM-DD
  time?: string; // HH:MM:SS
  notes: string;
  painScale?: number; // VAS 0 - 10
  painScaleBefore?: number; // VAS Before Treatment (0 - 10)
  painScaleAfter?: number; // VAS After Treatment (0 - 10)
  treatment: TreatmentModalities;
  treatmentsGiven?: string[]; // Custom list of treatments selected/given in this visit
  fee: string | number;
  receiptNo?: string;
  visitType?: VisitType;
  paymentMethod?: PaymentMethod;
  seenBy?: string;
  createdAt?: number;
  updatedAt?: number;
}

export interface VasChartDataPoint {
  sessionIndex: number;
  sessionLabel: string;
  date: string;
  time?: string;
  painBefore: number;
  painAfter?: number;
  reliefPoints?: number;
  reliefPercent?: number;
  notes?: string;
  treatments?: string[];
}

export interface Patient {
  id: string;
  serial: number;
  regNo?: string;
  date: string; // YYYY-MM-DD
  time?: string; // HH:MM:SS
  name: string;
  age: string | number;
  sex: 'Male' | 'Female' | 'Other' | '';
  gender?: string;
  height: string;
  weight: string;
  bloodGroup: string;
  referredBy: string;
  address: string;
  contact: string;
  diagnosis: string;
  history: string;
  painScaleBefore?: number; // Initial Assessment VAS Before Treatment (0 - 10)
  painScaleAfter?: number; // Initial Assessment VAS After Treatment (0 - 10)
  painScale?: number; // VAS 0 - 10 (legacy/convenience)
  seenBy?: string;
  comorbid: ComorbidConditions;
  treatment: TreatmentModalities;
  treatmentFee: string | number;
  paymentMethod?: PaymentMethod;
  visitType: VisitType;
  followUps: FollowUpVisit[];
  receiptNo?: string;
  createdAt: number;
  updatedAt?: number;
  deleted?: boolean;
  deletedAt?: number;
}

export interface LocumPhysiotherapist {
  id: string;
  name: string;
  phone: string;
  idType: 'IAP ID' | 'A&H Enrolment ID';
  idNumber: string;
  email: string;
  qualification?: string;
  status?: 'Active' | 'Inactive';
  createdAt?: string;
}

export interface ClinicSettings {
  clinicName: string;
  tagline: string;
  consultant: string;
  consultantName?: string;
  doctorName?: string;
  consultantEducation?: string;
  consultantTitle: string;
  phone: string;
  email: string;
  address: {
    line1: string;
    line2: string;
    line3: string;
    line4: string;
    full: string;
  };
  services: string;
  spreadsheetId?: string;
  googleSpreadsheetId?: string;
  googleSpreadsheetName?: string;
  autoSync?: boolean;
  autoHourlyPush?: boolean;
  sheetsWebhookUrl?: string;
  googleAppsScriptWebhook?: string;
  lastSheetsSyncAt?: string;
  lastSheetsSyncStatus?: 'success' | 'error' | 'idle';
  lastSheetsSyncMessage?: string;
  lastHourlyBackupAt?: string;
  lastHourlyBackupStatus?: 'success' | 'error' | 'idle';
  lastHourlyBackupMessage?: string;
  publicApiEndpoint?: string;
  lastApiSyncAt?: string;
  gstNumber?: string;
  showGstOnReceipt?: boolean;
  showGstOnPatientData?: boolean;
  archiveSheetUrl1?: string;
  archiveSheetId1?: string;
  archiveSheetUrl2?: string;
  archiveSheetId2?: string;
  archiveSheetsConfirmed?: boolean;
}

export interface SearchFilter {
  field: 'all' | 'name' | 'serial' | 'contact' | 'diagnosis' | 'referredBy';
  query: string;
  status?: 'all' | 'active' | 'deleted';
  visitType?: 'all' | 'Clinic' | 'Home Visit';
}

export interface ReceiptData {
  open?: boolean;
  name: string;
  serial: string | number;
  regNo?: string;
  receiptNo: string;
  date: string;
  amount: string | number;
  visitType: VisitType;
  address?: string;
  age?: string | number;
  therapyFor?: string;
  sessionFrom?: string;
  sessionTo?: string;
  paymentMethod?: PaymentMethod;
  gstNumber?: string;
  showGst?: boolean;
}

export interface BMICalculation {
  bmi: number;
  category: 'Underweight' | 'Normal' | 'Overweight' | 'Obese';
  color: string;
}
