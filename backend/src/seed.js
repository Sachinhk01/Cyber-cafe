import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { User, Service, getSettings } from './models.js';

const services = [
  { name: 'Aadhaar Update Assistance', price: 100, description: 'Help with address or mobile update requests on the official portal.', requiredDocs: ['Aadhaar card', 'Address proof'], detailFields: ['Aadhaar-linked mobile number'] },
  { name: 'PAN Card Application', price: 150, description: 'New PAN application filled and submitted for you.', requiredDocs: ['Aadhaar card', 'Passport photo', 'Signature'], detailFields: ['Phone number', "Father's name"] },
  { name: 'PAN Correction', price: 120, description: 'Name, date of birth or photo correction on PAN.', requiredDocs: ['Current PAN card', 'Supporting proof'], detailFields: ['PAN number', 'What to correct'] },
  { name: 'Vehicle Insurance Renewal', price: 50, description: 'We compare and renew your two-wheeler or car insurance. Premium paid separately.', requiredDocs: ['RC book', 'Previous policy'], detailFields: ['Vehicle number', 'Phone number'] },
  { name: 'Health Insurance Enquiry', price: 0, description: 'Free help choosing a health insurance plan.', requiredDocs: [], detailFields: ['Phone number', 'Number of members'] },
  { name: 'Passport Application Help', price: 250, description: 'Online form filling and appointment booking.', requiredDocs: ['Aadhaar card', 'Birth proof', 'Passport photo'], detailFields: ['Phone number', 'Preferred PSK city'] },
  { name: 'Voter ID Application', price: 80, description: 'New voter ID or correction request.', requiredDocs: ['Aadhaar card', 'Passport photo'], detailFields: ['Phone number'] },
  { name: 'Income / Caste Certificate', price: 100, description: 'Application through the state services portal.', requiredDocs: ['Aadhaar card', 'Ration card'], detailFields: ['Phone number', 'Purpose'] },
  { name: 'Resume Typing', price: 150, description: 'We type and format your resume. Delivered as PDF.', requiredDocs: ['Old resume or notes'], detailFields: ['Phone number', 'Job role'] },
  { name: 'Online Exam Form', price: 60, description: 'Fill exam or job application forms for you.', requiredDocs: ['Passport photo', 'Signature', 'Marks card'], detailFields: ['Exam or job name', 'Phone number'] },
];

await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/cyber_cafe');

const email = (process.env.ADMIN_EMAIL || 'owner@cybercafe.local').toLowerCase();
if (!(await User.exists({ email, role: 'owner' }))) {
  await User.create({
    name: process.env.ADMIN_NAME || 'Cafe Owner',
    email,
    role: 'owner',
    passwordHash: await bcrypt.hash(process.env.ADMIN_PASSWORD || 'ChangeMe@123', 10),
  });
  console.log(`Owner login created: ${email}`);
} else console.log(`Owner ${email} already exists`);

if ((await Service.countDocuments()) === 0) {
  await Service.insertMany(services);
  console.log(`Added ${services.length} services`);
} else console.log('Services already exist, skipped');

await getSettings();
console.log('Seed done');
await mongoose.disconnect();
