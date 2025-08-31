import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as logger from 'firebase-functions/logger';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

initializeApp();
const db = getFirestore();

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

export const summarizeApplications = onSchedule('every 30 minutes', async (event) => {
  const now = Date.now();
  const from = new Date(now - 30 * 60 * 1000);
  const items = await groupApplicationsSince(from);
  if (!items.length) return;
  await db.collection('notifications').add({
    type: 'apps_summary',
    audienceRoles: ['companyhr', 'departmentmanager'],
    items,
    createdAt: new Date(),
    readBy: [],
  });
  logger.info('summarizeApplications wrote', items.length, 'items');
});

export const summarizeOnboarding = onSchedule('every 30 minutes', async (event) => {
  const now = Date.now();
  const from = new Date(now - 30 * 60 * 1000);
  const items = await groupOnboardingSince(from);
  if (!items.length) return;
  await db.collection('notifications').add({
    type: 'onboarding_summary',
    audienceRoles: ['companyhr', 'departmentmanager'],
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
    pending: `Your application for ${jobTitle} was received and is pending review.`,
    reviewing: `Your application for ${jobTitle} is under review.`,
    scheduled: `Interview scheduled for ${jobTitle}. Please check your invite link.`,
    recruited: `Congratulations! You've been recruited for ${jobTitle}.`,
    rejected: `Thanks for applying to ${jobTitle}. You were not selected.`,
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


