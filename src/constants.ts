import { ClinicSettings, TreatmentModalities } from './types';

export const CLINIC_CONFIG: ClinicSettings = {
  clinicName: "Namana Physiotherapy Clinic",
  tagline: "Remove pain, Move Again",
  consultantName: "R. Chandrashekar",
  doctorName: "R. Chandrashekar",
  consultantEducation: "BPT, MIAP",
  consultant: "R. Chandrashekar, BPT, MIAP",
  consultantTitle: "Consultant Physiotherapist",
  phone: "9880517715",
  email: "csphysio23@gmail.com",
  address: {
    line1: "Ground floor, Rd btw Royal Oak Furniture and VRK comfort,",
    line2: "Chandralayout, 78, 1st Cross Rd, near Doctor’s community hall,",
    line3: "Alanahalli, Karnataka 570028",
    line4: "India",
    full: "Ground floor, Rd btw Royal Oak Furniture and VRK comfort, Chandralayout, 78, 1st Cross Rd, near Doctor’s community hall, Alanahalli, Karnataka 570028",
  },
  services: "PHYSIOTHERAPY | REHABILITATION",
  publicApiEndpoint: "https://dummyjson.com/users",
};

export interface ModalityItem {
  key: keyof Omit<TreatmentModalities, 'other' | 'otherText'>;
  label: string;
  category: 'Electrotherapy' | 'Thermotherapy' | 'Traction' | 'Exercise & Manual' | 'Specialized';
  description: string;
}

export const MODALITIES_LIST: ModalityItem[] = [
  { key: "moist", label: "Moist Therapy", category: "Thermotherapy", description: "Deep penetrating hydrocollator moist heat pack" },
  { key: "ust", label: "Ultrasound Therapy (UST)", category: "Electrotherapy", description: "Acoustic high-frequency soundwaves for deep tissue repair" },
  { key: "ift", label: "Interferential Therapy (IFT)", category: "Electrotherapy", description: "Medium-frequency electrostimulation for pain relief" },
  { key: "postural", label: "Postural Re-education", category: "Exercise & Manual", description: "Ergonomic alignment and spinal stabilization" },
  { key: "exercise", label: "Therapeutic Exercise", category: "Exercise & Manual", description: "Strengthening, ROM, and endurance rehabilitation" },
  { key: "pelvicTraction", label: "Intermittent Pelvic Traction", category: "Traction", description: "Lumbar disc decompression and nerve relief" },
  { key: "cervicalTraction", label: "Intermittent Cervical Traction", category: "Traction", description: "Neck decompression for cervical radiculopathy" },
  { key: "coldPack", label: "Cold Pack", category: "Thermotherapy", description: "Cryotherapy for acute inflammation & edema" },
  { key: "thermo", label: "Thermotherapy", category: "Thermotherapy", description: "Superficial thermal heat therapy" },
  { key: "nmes", label: "NMES", category: "Electrotherapy", description: "Neuromuscular Electrical Stimulation for muscle re-education" },
  { key: "paraffin", label: "Paraffin Wax Bath", category: "Thermotherapy", description: "Warm paraffin wax for joint stiffness in hands/feet" },
  { key: "manual", label: "Manual Therapy", category: "Exercise & Manual", description: "Joint mobilization, myofascial release, manipulation" },
  { key: "tens", label: "TENS", category: "Electrotherapy", description: "Transcutaneous Electrical Nerve Stimulation for analgesia" },
  { key: "rcs", label: "RCS: Russian Current Stimulation", category: "Specialized", description: "Russian current neuromuscular electrical stimulation for motor recruitment" },
  { key: "gait", label: "Gait Training", category: "Exercise & Manual", description: "Ambulatory and neurological walking pattern correction" },
];

export const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

export const HEIGHT_PRESETS = (() => {
  const arr: string[] = [];
  for (let ft = 3; ft <= 7; ft++) {
    for (let inc = 0; inc <= 11; inc++) {
      if (ft === 7 && inc > 0) break;
      arr.push(`${ft}'${inc}"`);
    }
  }
  return arr;
})();

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export const COMMON_DIAGNOSES = [
  "Cervical Spondylosis",
  "Lumbar Spondylolisthesis / Disc Bulge (L4-L5)",
  "Adhesive Capsulitis (Frozen Shoulder)",
  "Bilateral Knee Osteoarthritis (Grade 2)",
  "Sciatica / Lumbar Radiculopathy",
  "Post-Stroke Hemiparesis Rehabilitation",
  "Plantar Fasciitis",
  "Lateral Epicondylitis (Tennis Elbow)",
  "Rotator Cuff Tendinitis",
  "Ankle Inversion Sprain Rehabilitation",
  "Bell's Palsy / Facial Nerve Paresis",
  "Chronic Low Back Pain (Mechanical)",
  "Carpal Tunnel Syndrome"
];
