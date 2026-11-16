// Sample services with their full procedure (A2), and the first owner login.
// Used by `npm run seed` and automatically on the first start of the server.
import bcrypt from 'bcryptjs';
import { User, Service, getSettings } from '../models.js';

const T_STD =
  'We fill and submit the application using the documents and details you give us. Please check that they are correct and clear: we are not responsible for delays or rejections caused by wrong or unclear information. Government or third-party fees are not part of our service charge unless listed under "Included".';

export const SAMPLE_SERVICES = [
  {
    name: 'Aadhaar Update Assistance',
    category: 'Identity',
    price: 150,
    description: 'Update your address, mobile number or other details on Aadhaar.',
    requiredDocs: ['Aadhaar card', 'Address proof'],
    detailFields: ['Aadhaar-linked mobile number', 'What to update'],
    processingTime: '1-2 days',
    processingDays: 2,
    steps: [
      'Upload your Aadhaar card and the proof for the change.',
      'We check the documents and call you if something is missing.',
      'We submit the update request on the official UIDAI portal.',
      'You get the URN (update request number) in the app to track it.',
    ],
    included: ['Form filling and online submission', 'URN / acknowledgement slip as PDF'],
    notIncluded: ['UIDAI update fee (Rs 50, paid separately if charged)', 'Biometric updates (need a visit to an Aadhaar Seva Kendra)'],
    notes: 'Keep your Aadhaar-linked mobile with you: an OTP is needed during submission.',
    terms: T_STD,
  },
  {
    name: 'PAN Card Application',
    category: 'Identity',
    price: 250,
    description: 'New PAN application, filled and submitted for you.',
    requiredDocs: ['Aadhaar card', 'Passport photo', 'Signature'],
    detailFields: ['Phone number', "Father's name"],
    processingTime: '5-7 days',
    processingDays: 7,
    steps: [
      'Upload your Aadhaar, a clear photo and your signature on white paper.',
      'We fill the NSDL / UTIITSL form and share the acknowledgement number.',
      'The PAN is emailed to you as an e-PAN; the card arrives by post.',
    ],
    included: ['Application form filling', 'Acknowledgement slip as PDF'],
    notIncluded: ['Government fee (about Rs 107, paid separately)'],
    notes: 'Name and date of birth must match your Aadhaar exactly.',
    terms: T_STD,
  },
  {
    name: 'PAN Correction',
    category: 'Identity',
    price: 150,
    description: 'Correct the name, date of birth or photo on your PAN.',
    requiredDocs: ['Current PAN card', 'Supporting proof'],
    detailFields: ['PAN number', 'What to correct'],
    processingTime: '5-7 days',
    processingDays: 7,
    steps: ['Upload your PAN and the proof of the correct details.', 'We submit the correction request.', 'You get the acknowledgement number in the app.'],
    included: ['Correction form filling', 'Acknowledgement slip as PDF'],
    notIncluded: ['Government fee (about Rs 107, paid separately)'],
    notes: '',
    terms: T_STD,
  },
  {
    name: 'Vehicle Insurance Renewal',
    category: 'Finance',
    price: 199,
    description: 'Compare plans and renew your two-wheeler or car insurance.',
    requiredDocs: ['RC book', 'Previous policy'],
    detailFields: ['Vehicle number', 'Phone number'],
    processingTime: 'Same day',
    processingDays: 1,
    steps: [
      'Upload your RC and last policy.',
      'We call you with 2-3 quotes from different insurers.',
      'You choose a plan and pay the premium directly to the insurer.',
      'We send you the new policy PDF in the app.',
    ],
    included: ['Comparing plans', 'Filling the proposal form', 'Policy PDF'],
    notIncluded: ['The insurance premium (paid directly to the insurer)'],
    notes: '',
    terms: T_STD,
  },
  {
    name: 'Health Insurance Enquiry',
    category: 'Finance',
    price: 0,
    description: 'Free help choosing a health insurance plan for your family.',
    requiredDocs: [],
    detailFields: ['Phone number', 'Number of members'],
    processingTime: 'Same day',
    processingDays: 1,
    steps: ['Tell us how many members and your phone number.', 'We call you to understand your needs and suggest plans.'],
    included: ['Advice and plan comparison'],
    notIncluded: ['The insurance premium'],
    notes: '',
    terms: 'Advice only. You decide and buy the plan directly from the insurer.',
  },
  {
    name: 'Passport Application Help',
    category: 'Applications',
    price: 250,
    description: 'Online form filling and appointment booking at the PSK.',
    requiredDocs: ['Aadhaar card', 'Birth proof', 'Passport photo'],
    detailFields: ['Phone number', 'Preferred PSK city'],
    processingTime: '1-2 days',
    processingDays: 2,
    steps: [
      'Upload your documents.',
      'We fill the Passport Seva form and book the earliest slot you agree to.',
      'You get the appointment slip (ARN) as PDF in the app.',
      'Visit the PSK on your date with original documents.',
    ],
    included: ['Form filling', 'Appointment booking', 'Appointment slip PDF'],
    notIncluded: ['Passport fee (Rs 1,500+ paid online to the government)', 'Police verification'],
    notes: '',
    terms: T_STD,
  },
  {
    name: 'Voter ID Application',
    category: 'Applications',
    price: 80,
    description: 'New voter ID or correction request on the NVSP portal.',
    requiredDocs: ['Aadhaar card', 'Passport photo'],
    detailFields: ['Phone number'],
    processingTime: '1-2 days',
    processingDays: 2,
    steps: ['Upload your Aadhaar and photo.', 'We submit Form 6 (new) or Form 8 (correction).', 'You get the reference number in the app.'],
    included: ['Form filling and submission', 'Reference slip PDF'],
    notIncluded: [],
    notes: '',
    terms: T_STD,
  },
  {
    name: 'Income / Caste Certificate',
    category: 'Applications',
    price: 120,
    description: 'Application through the state services portal (Nadakacheri).',
    requiredDocs: ['Aadhaar card', 'Ration card'],
    detailFields: ['Phone number', 'Purpose'],
    processingTime: '1-2 days',
    processingDays: 2,
    steps: ['Upload your Aadhaar and ration card.', 'We apply on the state portal.', 'You get the acknowledgement number; the certificate is issued by the government office.'],
    included: ['Application submission', 'Acknowledgement slip PDF'],
    notIncluded: ['Government fee, if any', 'Time taken by the government office to issue the certificate'],
    notes: '',
    terms: T_STD,
  },
  {
    name: 'Resume Typing',
    category: 'Printing',
    price: 150,
    description: 'We type and format your resume and send it as a PDF.',
    requiredDocs: ['Old resume or notes'],
    detailFields: ['Phone number', 'Job role'],
    processingTime: '1 day',
    processingDays: 1,
    steps: ['Upload your old resume or handwritten notes.', 'We type and format it in a clean layout.', 'Download the finished PDF from your order page.'],
    included: ['Typing and formatting', 'One round of changes', 'Final PDF'],
    notIncluded: ['Printouts (order them from Print services)'],
    notes: '',
    terms: 'We use only the information you give us. One round of changes is included.',
  },
  {
    name: 'Online Exam Form',
    category: 'Applications',
    price: 60,
    description: 'We fill exam or job application forms for you.',
    requiredDocs: ['Passport photo', 'Signature', 'Marks card'],
    detailFields: ['Exam or job name', 'Phone number'],
    processingTime: 'Same day',
    processingDays: 1,
    steps: ['Upload your photo, signature and marks card.', 'We fill the form and send you the confirmation page.'],
    included: ['Form filling', 'Confirmation page PDF'],
    notIncluded: ['Exam / application fee charged by the organiser'],
    notes: 'Tell us the last date for the form in the details so we prioritise it.',
    terms: T_STD,
  },
];

export async function ensureOwner() {
  const email = (process.env.ADMIN_EMAIL || 'owner@cybercafe.local').toLowerCase();
  if (await User.exists({ role: 'owner' })) return false;
  const password = process.env.ADMIN_PASSWORD || 'ChangeMe@123';
  await User.create({
    name: process.env.ADMIN_NAME || 'Cafe Owner',
    email,
    role: 'owner',
    passwordHash: await bcrypt.hash(password, 10),
    mustChangePassword: password === 'ChangeMe@123', // D5: forced to change it after first login
  });
  console.log(`Owner login created: ${email}`);
  return true;
}

export async function ensureServices({ force = false } = {}) {
  const settings = await getSettings();
  const count = await Service.countDocuments();
  // Only on a fresh database: if the owner later deletes every service, we don't bring them back
  if (count === 0 && (force || !settings.seededAt)) {
    await Service.insertMany(SAMPLE_SERVICES);
    console.log(`Added ${SAMPLE_SERVICES.length} sample services`);
  }
  if (!settings.seededAt) {
    settings.seededAt = new Date();
    await settings.save();
  }
}

// Older databases: fill the new procedure fields of the sample services that still have none
export async function upgradeSampleServices() {
  for (const s of SAMPLE_SERVICES) {
    await Service.updateOne(
      { name: s.name, $or: [{ steps: { $exists: false } }, { steps: { $size: 0 } }] },
      { $set: { category: s.category, steps: s.steps, processingTime: s.processingTime, processingDays: s.processingDays, included: s.included, notIncluded: s.notIncluded, notes: s.notes, terms: s.terms } }
    );
  }
}

export async function seedIfEmpty() {
  await ensureOwner();
  await ensureServices();
  await upgradeSampleServices();
}
