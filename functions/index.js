import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import * as logger from 'firebase-functions/logger';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { Resend } from 'resend';

initializeApp();
const db = getFirestore();
// Set RESEND_API_KEY in Functions env, and RESEND_FROM as sender
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM = process.env.RESEND_FROM || 'onboarding@resend.dev';
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

async function groupApplicationsSince(from) {
  const appsSnap = await db.collection('applications').where('createdAt', '>=', from).get();
  if (appsSnap.empty) return [];
  const countsByJobId = new Map();
  appsSnap.forEach(doc => {
    const a = doc.data();
    const jobId = a.jobId || 'unknown';
    countsByJobId.set(jobId, (countsByJobId.get(jobId) || 0) + 1);
  });
  const items = [];
  for (const [jobId, count] of countsByJobId.entries()) {
    const jobDoc = await db.collection('jobs').doc(jobId).get();
    const title = jobDoc.exists ? (jobDoc.data().title || jobId) : jobId;
    items.push({ jobId, title, count });
  }
  return items;
}

async function groupOnboardingSince(from) {
  // Requires you to set users.updatedAt when onboarding status changes
  const usersSnap = await db.collection('users')
    .where('status', 'in', ['completed', 'active'])
    .where('updatedAt', '>=', from)
    .get();
  if (usersSnap.empty) return [];
  const countsByDept = new Map();
  usersSnap.forEach(doc => {
    const u = doc.data();
    const deptId = u.departmentId || 'unknown';
    countsByDept.set(deptId, (countsByDept.get(deptId) || 0) + 1);
  });
  const items = [];
  for (const [deptId, count] of countsByDept.entries()) {
    const deptDoc = await db.collection('departments').doc(deptId).get();
    const name = deptDoc.exists ? (deptDoc.data().name || deptId) : deptId;
    items.push({ departmentId: deptId, title: name, count });
  }
  return items;
}

export const summarizeApplications = onSchedule({ schedule: 'every 30 minutes', timeZone: 'Etc/UTC', region: 'us-central1' }, async (event) => {
  const now = Date.now();
  const from = new Date(now - 30 * 60 * 1000);
  const items = await groupApplicationsSince(from);
  if (!items.length) return;
  const total = items.reduce((s, i) => s + i.count, 0);
  await db.collection('notifications').add({
    type: 'apps_summary',
    audienceRoles: ['companyHR', 'departmentManager'],
    title: `${total} New Applications Received`,
    items,
    createdAt: new Date(),
    readBy: [],
  });
  logger.info('summarizeApplications wrote', items.length, 'items');
});

export const summarizeOnboarding = onSchedule({ schedule: 'every 30 minutes', timeZone: 'Etc/UTC', region: 'us-central1' }, async (event) => {
  const now = Date.now();
  const from = new Date(now - 30 * 60 * 1000);
  const items = await groupOnboardingSince(from);
  if (!items.length) return;
  await db.collection('notifications').add({
    type: 'onboarding_summary',
    audienceRoles: ['companyHR', 'departmentManager'],
    title: 'Onboarding Completions',
    items,
    createdAt: new Date(),
    readBy: [],
  });
  logger.info('summarizeOnboarding wrote', items.length, 'items');
});

// Applicant status-change helper (HTTP callable optional)
// You can also write directly from the app on each status update.
export async function writeStatusChangeNotification({ userId, jobTitle, status }) {
  if (!userId) return;
  const messages = {
    reviewing: `Your application for ${jobTitle} was received and is under review.`,
    // pending: `Your application for ${jobTitle} is under review.`,
    scheduled: `Interview scheduled for ${jobTitle}. Please check your invite link.`,
    accepted: `Congratulations! You've been recruited for ${jobTitle}.`,
    rejected: `Thank you for applying to ${jobTitle}. Unfortunately, you were not selected.`,
  };
  const message = messages[status] || `Status updated to ${status} for ${jobTitle}`;
  await db.collection('notifications').add({
    type: 'status_change',
    userId,
    title: 'Application Update',
    message,
    createdAt: new Date(),
    readBy: [],
  });
}

// 1) Email on application status change & applicant notification
export const onApplicationStatusChange = onDocumentUpdated({ document: 'applications/{id}', region: 'us-central1' }, async (event) => {
  const before = event.data?.before?.data() || {};
  const after = event.data?.after?.data() || {};
  if (!after || before.status === after.status) return;

  // Applicant notification
  const jobDoc = after.jobId ? await db.collection('jobs').doc(after.jobId).get() : null;
  const jobTitle = jobDoc?.exists ? (jobDoc.data().title || after.jobId) : after.jobId;
  await writeStatusChangeNotification({ userId: after.applicantId, jobTitle, status: (after.status || '').toLowerCase() });

  // Email via SendGrid (optional)
  if (!resend) return;
  let to = undefined;
  if (after.applicantId) {
    const userDoc = await db.collection('users').doc(after.applicantId).get();
    to = userDoc.exists ? (userDoc.data().email || undefined) : undefined;
  }
  if (!to) return;
  const subjects = {
    reviewing: `Your application for ${jobTitle} has been received`,
    scheduled: `Interview scheduled for ${jobTitle}. Good Luck!`,
    // pending: `Your application for ${jobTitle} is under review`,
    accepted: `Congratulations! Welcome to AlpacaHire`,
    rejected: `Update on your application for ${jobTitle}`,
  };
  const messages = {
    reviewing: `Thank you for applying to ${jobTitle}. Your application is currently being reviewed, it may take up to 1 week to complete the review.`,
    scheduled: `Congratulations! You have successfully entered the next round for ${jobTitle}. Your interview has been scheduled, please check the portal for details and link.`,
    // pending: `Thank you for applying to ${jobTitle}. We have received your application.`,
    accepted: `Congratulations! You have been offered the position for ${jobTitle}. Our team will contact you soon with further steps.`,
    rejected: `Thank you for your interest in ${jobTitle}. We appreciate your time, but we will not be moving forward at this time due to insufficient fit.`,
  };
  const status = (after.status || 'reviewing').toLowerCase();
  const subject = subjects[status] || `Update on ${jobTitle}`;
  const text = messages[status] || `Your application status for ${jobTitle} is now ${status}.`;
  try {
    await resend.emails.send({ from: RESEND_FROM, to, subject, text });
  } catch (e) { logger.warn('resend error', e); }
});

// 2) Reminder emails for onboarding deadlines (3 days and 1 day left)
export const remindOnboardingDue = onSchedule({ schedule: 'every 24 hours', timeZone: 'Etc/UTC', region: 'us-central1' }, async () => {
  if (!resend) return;
  const now = Date.now();
  const MS_IN_DAY = 24 * 60 * 60 * 1000;
  const ONBOARDING_DAYS = 14; // client derives dueDate = startDate + 14 days

  // Pull users who are still onboarding (status in_progress). If you also use 'pending', add it to the array.
  const usersSnap = await db.collection('users')
    // .where('status', 'in', ['in_progress'])
    .get();
  if (usersSnap.empty) return;

  for (const docSnap of usersSnap.docs) {
    const user = docSnap.data();
    if (!user.startDate || !user.email) continue;
    const start = user.startDate.toDate ? user.startDate.toDate() : new Date(user.startDate);
    const due = new Date(start.getTime() + ONBOARDING_DAYS * MS_IN_DAY);
    const daysLeft = Math.ceil((due.getTime() - now) / MS_IN_DAY);
    const formattedDue = due.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "2-digit",
      year: "numeric"
    });    

    if (daysLeft === 3 || daysLeft === 1) {
      const subject = daysLeft === 3 ? 'Onboarding Tasks Reminder - 3 days left' : 'Onboarding Tasks Reminder - 1 day left';
      const text = `Here is a gentle reminder to complete your onboarding tasks by ${formattedDue}. Please reach out to your manager if you have any questions, thank you.`;
      try {
        await resend.emails.send({ from: RESEND_FROM, to: user.email, subject, text });
      } catch (e) { logger.warn('resend error', e); }
    }
  }
});


