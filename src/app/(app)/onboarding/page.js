'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { auth, db } from '@/lib/firebase';
import {
  collection, doc, getDoc, getDocs, query, where, orderBy,
  setDoc, updateDoc, deleteDoc
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { vi } from 'zod/v4/locales/index.cjs';

/* -------------------- utils -------------------- */
const ROLES = {
  EMPLOYEE: 'employee',
  MANAGER: 'departmentmanager',
  HR: 'companyhr',
};

function toMillis(v) {
  if (!v) return null;
  if (typeof v === 'number') return v;
  if (typeof v.toMillis === 'function') return v.toMillis();
  const parsed = Date.parse(v);           // handles ISO strings
  return Number.isNaN(parsed) ? null : parsed;
}

function capitalize(w) {
  return w ? w[0].toUpperCase() + w.slice(1) : '';
}

function prettyDept(id) {
  if (!id || typeof id !== 'string') return '';
  let s = id.startsWith('dept_') ? id.slice(5) : id; // strip "dept_"
  return s.split('_').map(capitalize).join(' ');     // "dept_engineering" -> "Engineering"
}

function normalizeRole(raw) {
  if (!raw) return ROLES.EMPLOYEE;
  const r = String(raw).toLowerCase();
  if (['companyhr', 'company-hr', 'hr'].includes(r)) return ROLES.HR;
  if (['departmentmanager', 'deptmanager', 'manager'].includes(r)) return ROLES.MANAGER;
  return ROLES.EMPLOYEE;
}

function routeForTask(t) {
  if (t && t.type === 'course' && t.courseId) return `/onboarding/training/${t.courseId}`;
  if (t && t.type === 'page' && t.route) return t.route;
  return null;
}

function safeSlug(s) {
  return String(s)
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/[^a-zA-Z0-9/_-]+/g, '-')   // keep simple chars
    .replace(/\/+/g, '/')
    .replace(/[\/]/g, '_')
    .replace(/_+/g, '_')
    .toLowerCase();
}

function completionKeyForTask(t) {
  if (!t) return null;
  if (t.completionKey) return String(t.completionKey);

  // explicit types
  if (t.type === 'course' && t.courseId) return `training_${t.courseId}`;

  if (t.type === 'page' && t.route) {
    const slug = safeSlug(String(t.route).replace(/^\/+/, ''));
    // keep whole slug; don't slice off the first segment or you'll collide/lose info
    return `page_${slug}`;
  }

  if (t.type === 'video' && t.url) {
    return `video_${safeSlug(t.url)}`;
  }

  if (t.type === 'doc' && t.url) {
    return `doc_${safeSlug(t.url)}`;
  }

  // fallbacks so every task can still be counted
  if (t.id) return `task_${safeSlug(t.id)}`;
  if (t.label) return `task_${safeSlug(t.label)}`;

  return null;
}

function daysLeft(dueAtMs) {
  if (typeof dueAtMs !== 'number' || Number.isNaN(dueAtMs)) return null;
  const d = Math.ceil((dueAtMs - Date.now()) / 86400000);
  return Number.isFinite(d) ? d : null;
}

function StatusBadge({ status }) {
  const base = 'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border';
  const cls =
    status === 'Done'
      ? 'text-green-700 bg-green-50 border-green-200'
      : status === 'In progress'
      ? 'text-yellow-800 bg-yellow-50 border-yellow-200'
      : 'text-red-700 bg-red-50 border-red-200'; // Not started (default)
  return <span className={`${base} ${cls}`}>{status}</span>;
}

function fmtDate(ms) {
  if (!ms) return '-';
  try { return new Date(ms).toLocaleDateString(); } catch { return '-'; }
}

/* -------------------- Manage steps (HR/Manager) -------------------- */
/** HR: only "base" (General Tasks)
 *  Manager: only their department (departmentId)
 */
function ManageSteps({ scopeKey, scopeLabel }) {
  const [steps, setSteps] = useState([]);
  const [loading, setLoading] = useState(true);

  // inline edit
  const [editingStep, setEditingStep] = useState(null);
  const [showTasksFor, setShowTasksFor] = useState(null); // stepId
  const [taskDrafts, setTaskDrafts] = useState([]);

  // new step
  const [newStep, setNewStep] = useState({ id: '', title: '', summary: '', order: 1, tasks: [] });

  useEffect(() => {
    async function load() {
      if (!scopeKey) return;
      setLoading(true);
      try {
        const basePath = scopeKey === 'base'
          ? ['onboarding', 'base', 'steps']
          : ['onboarding', scopeKey, 'steps'];
        const qy = query(collection(db, ...basePath), orderBy('order', 'asc'));
        const snap = await getDocs(qy);
        const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setSteps(rows);
        setNewStep(s => ({ ...s, order: (rows?.length || 0) + 1 }));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [scopeKey]);

  async function refresh() {
    const baseCol = scopeKey === 'base'
      ? ['onboarding', 'base', 'steps']
      : ['onboarding', scopeKey, 'steps'];
    const snap = await getDocs(query(collection(db, ...baseCol), orderBy('order', 'asc')));
    setSteps(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }

  async function saveStep(s) {
    if (!s.id) { alert('Please provide a step id (e.g., s7).'); return; }
    const basePath = scopeKey === 'base'
      ? ['onboarding', 'base', 'steps', s.id]
      : ['onboarding', scopeKey, 'steps', s.id];

    await setDoc(doc(db, ...basePath), {
      title: s.title || '',
      summary: s.summary || '',
      order: s.order || 0,
      tasks: Array.isArray(s.tasks) ? s.tasks : [],
    }, { merge: true });

    await refresh();
    setEditingStep(null);
    setNewStep({ id: '', title: '', summary: '', order: (steps.length || 0) + 1, tasks: [] });
  }

  async function deleteStep(stepId) {
    if (!confirm('Delete this step?')) return;
    const basePath = scopeKey === 'base'
      ? ['onboarding', 'base', 'steps', stepId]
      : ['onboarding', scopeKey, 'steps', stepId];
    await deleteDoc(doc(db, ...basePath));
    setSteps(prev => prev.filter(s => s.id !== stepId));
  }

  async function renameStep(oldId, newId, payload) {
    if (oldId === newId) return saveStep(payload);
    if (!newId) { alert('New ID required.'); return; }
    const baseCol = scopeKey === 'base'
      ? ['onboarding', 'base', 'steps']
      : ['onboarding', scopeKey, 'steps'];

    await setDoc(doc(db, ...baseCol, newId), {
      title: payload.title || '',
      summary: payload.summary || '',
      order: payload.order || 0,
      tasks: Array.isArray(payload.tasks) ? payload.tasks : [],
    });
    await deleteDoc(doc(db, ...baseCol, oldId));
    await refresh();
    setEditingStep(null);
  }

  function openTasks(step) {
    setShowTasksFor(step.id);
    setTaskDrafts(Array.isArray(step.tasks) ? step.tasks.map(t => ({ ...t })) : []);
  }
  async function saveTasks(step) {
    const basePath = scopeKey === 'base'
      ? ['onboarding', 'base', 'steps', step.id]
      : ['onboarding', scopeKey, 'steps', step.id];

    await updateDoc(doc(db, ...basePath), { tasks: taskDrafts });
    setSteps(prev => prev.map(s => (s.id === step.id ? { ...s, tasks: taskDrafts } : s)));
    setShowTasksFor(null);
    setTaskDrafts([]);
  }

  return (
    <section className="w-full bg-white">
      <div className="max-w-6xl mx-auto px-6 py-8 text-black">
        <h2 className="text-2xl font-bold mb-2">{scopeKey === 'base' ? 'General Tasks' : `Department Tasks — ${scopeLabel}`}</h2>
        <p className="text-black/70 mb-6">Manage onboarding steps and tasks.</p>

        <div className="rounded-xl border overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
            <div className="font-semibold">{scopeKey === 'base' ? 'General Tasks' : `Department Tasks — ${scopeLabel}`}</div>
          </div>

          {/* New step form */}
          <div className="px-4 py-3 border-b">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <input placeholder="id (e.g. s7)" className="rounded-lg border px-3 py-2"
                     value={newStep.id} onChange={e => setNewStep(s => ({ ...s, id: e.target.value }))}/>
              <input placeholder="title" className="rounded-lg border px-3 py-2 md:col-span-2"
                     value={newStep.title} onChange={e => setNewStep(s => ({ ...s, title: e.target.value }))}/>
              <input placeholder="description" className="rounded-lg border px-3 py-2 md:col-span-2"
                     value={newStep.summary} onChange={e => setNewStep(s => ({ ...s, summary: e.target.value }))}/>
              <input type="number" placeholder="order" className="rounded-lg border px-3 py-2"
                     value={newStep.order || 0} onChange={e => setNewStep(s => ({ ...s, order: Number(e.target.value) }))}/>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button className="px-3 py-1.5 rounded-lg bg-black text-white" onClick={() => saveStep(newStep)}>Add Step</button>
              <button className="px-3 py-1.5 rounded-lg border"
                      onClick={() => setNewStep({ id: '', title: '', summary: '', order: (steps?.length || 0) + 1, tasks: [] })}>
                Clear
              </button>
            </div>
          </div>

          {/* header */}
          <div className="grid grid-cols-12 gap-2 px-4 py-2 font-semibold bg-white border-b">
            <div className="col-span-2">ID</div>
            <div className="col-span-3">Title</div>
            <div className="col-span-4">Description</div>
            <div className="col-span-1">Order</div>
            <div className="col-span-2 text-right">Actions</div>
          </div>

          {loading ? (
            <div className="px-4 py-8">Loading…</div>
          ) : steps.length === 0 ? (
            <div className="px-4 py-8 text-red-600">No steps yet.</div>
          ) : (
            steps.map(s => {
              const isEditing = editingStep && editingStep._originalId === s.id;
              return (
                <div key={s.id} className="grid grid-cols-12 gap-2 px-4 py-2 items-center border-b">
                  <div className="col-span-2">
                    {isEditing ? (
                      <input className="rounded-lg border px-2 py-1 w-full" defaultValue={s.id}
                             onChange={e => setEditingStep(prev => ({ ...prev, id: e.target.value }))}/>
                    ) : (<span className="font-mono">{s.id}</span>)}
                  </div>
                  <div className="col-span-3">
                    {isEditing ? (
                      <input className="rounded-lg border px-2 py-1 w-full" defaultValue={s.title}
                             onChange={e => setEditingStep(prev => ({ ...prev, title: e.target.value }))}/>
                    ) : (<span>{s.title}</span>)}
                  </div>
                  <div className="col-span-4">
                    {isEditing ? (
                      <input className="rounded-lg border px-2 py-1 w-full" defaultValue={s.summary}
                             onChange={e => setEditingStep(prev => ({ ...prev, summary: e.target.value }))}/>
                    ) : (<span className="text-gray-600">{s.summary}</span>)}
                  </div>
                  <div className="col-span-1">
                    {isEditing ? (
                      <input type="number" className="rounded-lg border px-2 py-1 w-full" defaultValue={s.order || 0}
                             onChange={e => setEditingStep(prev => ({ ...prev, order: Number(e.target.value) }))}/>
                    ) : (<span>{s.order || 0}</span>)}
                  </div>
                  <div className="col-span-2 flex justify-end gap-2">
                    {isEditing ? (
                      <>
                        <button className="px-3 py-1.5 rounded-lg bg-black text-white"
                                onClick={() => {
                                  const payload = {
                                    id: editingStep.id, title: editingStep.title, summary: editingStep.summary,
                                    order: editingStep.order, tasks: s.tasks || [],
                                  };
                                  if (editingStep.id !== s.id) { renameStep(s.id, editingStep.id, payload); }
                                  else { saveStep(payload); }
                                }}>
                          Save
                        </button>
                        <button className="px-3 py-1.5 rounded-lg border" onClick={() => setEditingStep(null)}>Cancel</button>
                      </>
                    ) : (
                      <>
                        <button className="px-3 py-1.5 rounded-lg border"
                                onClick={() => setEditingStep({ _originalId: s.id, ...s })}>Edit</button>
                        <button className="px-3 py-1.5 rounded-lg border" onClick={() => openTasks(s)}>Tasks</button>
                        <button className="px-3 py-1.5 rounded-lg border text-red-600"
                                onClick={() => deleteStep(s.id)}>Delete</button>
                      </>
                    )}
                  </div>

                  {/* tasks editor */}
                  {showTasksFor === s.id && (
                    <div className="col-span-12 mt-3">
                      <div className="rounded-lg border p-3 bg-gray-50">
                        <div className="flex items-center justify-between mb-2">
                          <div className="font-semibold">Tasks for {s.id}</div>
                          <div className="flex items-center gap-2">
                            <button className="px-3 py-1.5 rounded-lg bg-black text-white" onClick={() => saveTasks(s)}>
                              Save Tasks
                            </button>
                            <button className="px-3 py-1.5 rounded-lg border"
                                    onClick={() => { setShowTasksFor(null); setTaskDrafts([]); }}>Close</button>
                          </div>
                        </div>

                        <div className="space-y-2">
                          {taskDrafts.map((t, idx) => (
                            <div key={idx} className="grid grid-cols-12 gap-2">
                              <input className="col-span-2 rounded-lg border px-2 py-1" placeholder="id (e.g. t1)"
                                     value={t.id || ''} onChange={e => setTaskDrafts(a => a.map((x,i)=> i===idx?{...x,id:e.target.value}:x))}/>
                              <input className="col-span-3 rounded-lg border px-2 py-1" placeholder="label"
                                     value={t.label || ''} onChange={e => setTaskDrafts(a => a.map((x,i)=> i===idx?{...x,label:e.target.value}:x))}/>
                              <select className="col-span-2 rounded-lg border px-2 py-1" value={t.type || 'page'}
                                      onChange={e => setTaskDrafts(a => a.map((x,i)=> i===idx?{...x,type:e.target.value}:x))}>
                                <option value="page">page</option>
                                <option value="course">course</option>
                                <option value="doc">doc</option>
                                <option value="video">video</option>
                              </select>
                              {(t.type === 'page' || t.type === 'video' || t.type === 'doc') ? (
                                <input className="col-span-3 rounded-lg border px-2 py-1" placeholder="route or url"
                                       value={t.route || t.url || ''} onChange={e => {
                                         const v = e.target.value;
                                         setTaskDrafts(a => a.map((x,i)=> i===idx
                                           ? { ...x, route: t.type==='page'?v:undefined, url: t.type!=='page'?v:undefined }
                                           : x));
                                       }}/>
                              ) : (
                                <input className="col-span-3 rounded-lg border px-2 py-1" placeholder="courseId"
                                       value={t.courseId || ''} onChange={e => setTaskDrafts(a => a.map((x,i)=> i===idx?{...x,courseId:e.target.value}:x))}/>
                              )}
                              <input className="col-span-2 rounded-lg border px-2 py-1" placeholder="completionKey (optional)"
                                     value={t.completionKey || ''} onChange={e => setTaskDrafts(a => a.map((x,i)=> i===idx?{...x,completionKey:e.target.value}:x))}/>
                              <button className="col-span-12 md:col-span-0 px-3 py-1.5 rounded-lg border text-red-600"
                                      onClick={() => setTaskDrafts(a => a.filter((_,i)=> i!==idx))}>Remove</button>
                            </div>
                          ))}
                          <button className="px-3 py-1.5 rounded-lg border"
                                  onClick={() => setTaskDrafts(a => [...a, { id: '', label: '', type: 'page' }])}>+ Add Task</button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}

/* -------------------- Progress tab (HR / Manager) -------------------- */
function unique(arr) { return Array.from(new Set(arr)); }

async function expectedCompletionKeysForDept(deptId) {
  // base steps
  const baseQ = query(collection(db, 'onboarding', 'base', 'steps'), orderBy('order', 'asc'));
  const base = (await getDocs(baseQ)).docs.map(d => ({ id: d.id, ...d.data() }));

  // dept steps (optional)
  let dept = [];
  if (deptId) {
    const deptQ = query(collection(db, 'onboarding', deptId, 'steps'), orderBy('order', 'asc'));
    dept = (await getDocs(deptQ)).docs.map(d => ({ id: d.id, ...d.data() }));
  }

  // flatten tasks -> completion keys
  const allSteps = [...base, ...dept];
  const keys = [];
  for (const s of allSteps) {
    if (!Array.isArray(s.tasks)) continue;
    s.tasks.forEach((t, idx) => {
      const task = typeof t === 'string' ? { id: `t${idx}`, label: t, type: 'page' } : t;
      const key = completionKeyForTask(task);
      if (key) keys.push(key);
    });
  }
  return unique(keys);
}

function ProgressTab({ viewerRole, viewerDeptId, viewerUid }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [qText, setQText] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // all | not-started | in-progress | done
  const [deptFilter, setDeptFilter] = useState('all');
  const [depts, setDepts] = useState([]);

  useEffect(() => {
    async function run() {
      setLoading(true);
      try {
        // 1) Load visible users
        let userQ = collection(db, 'users');
        if (viewerRole === ROLES.MANAGER && viewerDeptId) {
          userQ = query(userQ, where('departmentId', '==', viewerDeptId));
        }
        const usersSnap = await getDocs(userQ);
        const users = usersSnap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(u => u.role !== 'applicant' && u.id !== viewerUid); 

        // gather unique departments (for HR filter)
        const deptSet = new Set(users.map(u => u.departmentId).filter(Boolean));
        setDepts(Array.from(deptSet));

        // 2) For each user, load their task ledger & compute progress
        const results = [];
        for (const u of users) {
          // 1) expected keys from Steps (base + this user's dept)
          const expectedKeys = await expectedCompletionKeysForDept(u.departmentId);

          // 2) user's ledger (done set)
          const tasksSnap = await getDocs(collection(db, 'userOnboarding', u.id, 'tasks'));
          const doneSet = new Set(
            tasksSnap.docs
              .filter(d => (d.data()?.status === 'done'))
              .map(d => d.id) // we store completion keys as doc IDs already
          );

          // 3) compute progress against expected tasks
          const total = expectedKeys.length;
          const done = expectedKeys.filter(k => doneSet.has(k)).length;
          const pct = total ? Math.round((done / total) * 100) : 0;

          const lastUpdated = tasksSnap.docs.reduce((acc, d) => {
            const t = d.data();
            const ts = typeof t.updatedAt === 'number' ? t.updatedAt : (t.updatedAt?.toMillis?.() ?? 0);
            return Math.max(acc, ts || 0);
          }, 0);

          const startMs = toMillis(u.startDate);
          const dueAt =
            toMillis(u.onboardingDueAt) ??
            (startMs ? startMs + 14 * 86400000 : null);

          let status = 'Not started';
          if (done > 0 && done < total) status = 'In progress';
          if (total > 0 && done === total) status = 'Done';

          results.push({
            uid: u.id,
            name: u.name || u.email || '—',
            email: u.email || '—',
            departmentId: u.departmentId || '—',
            pct, done, total,
            status,
            lastUpdated,
            dueAt,
            startMs,
          });
        }
        setRows(results);
      } finally {
        setLoading(false);
      }
    }
    run();
  }, [viewerRole, viewerDeptId, viewerUid]);

  const filtered = rows.filter(r => {
    if (qText) {
      const q = qText.toLowerCase();
      if (!(`${r.name}`.toLowerCase().includes(q) || `${r.email}`.toLowerCase().includes(q))) return false;
    }
    if (viewerRole === ROLES.HR && deptFilter !== 'all' && r.departmentId !== deptFilter) return false;
    if (statusFilter !== 'all') {
      if (statusFilter === 'not-started' && r.pct !== 0) return false;
      if (statusFilter === 'in-progress' && !(r.pct > 0 && r.pct < 100)) return false;
      if (statusFilter === 'done' && r.pct !== 100) return false;
    }
    return true;
  });

  return (
    <section className="w-full bg-white">
      <div className="max-w-6xl mx-auto px-6 py-8 text-black">
        <h2 className="text-2xl font-bold mb-2">Onboarding Progress</h2>
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <input className="border rounded-lg px-3 py-2 w-64" placeholder="Search name or email"
                 value={qText} onChange={e => setQText(e.target.value)} />
          <select className="border rounded-lg px-3 py-2"
                  value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="all">All statuses</option>
            <option value="not-started">Not started</option>
            <option value="in-progress">In progress</option>
            <option value="done">Done</option>
          </select>
          {viewerRole === ROLES.HR && (
            <select className="border rounded-lg px-3 py-2"
                    value={deptFilter} onChange={e => setDeptFilter(e.target.value)}>
              <option value="all">All departments</option>
              {depts.map(d => <option key={d} value={d}>{prettyDept(d) || d}</option>)}
            </select>
          )}
        </div>

        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3">Employee</th>
                <th className="text-left px-4 py-3">Email</th>
                <th className="text-left px-4 py-3">Department</th>
                <th className="text-left px-4 py-3">Progress</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Last activity</th>
                <th className="text-left px-4 py-3">Due</th>
                <th className="text-right px-4 py-3">Attachments</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td className="px-4 py-6" colSpan={8}>Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td className="px-4 py-6 text-red-600" colSpan={8}>No employees match.</td></tr>
              ) : filtered.map(r => {
                const dleft = daysLeft(r.dueAt);
                // const dueBadge =
                //   r.dueAt
                //     ? (dleft < 0
                //         ? <span className="text-red-700 bg-red-50 border border-red-200 rounded px-2 py-0.5">Overdue</span>
                //         : <span className="text-gray-700 bg-gray-50 border border-gray-200 rounded px-2 py-0.5">{dleft}d left</span>)
                //     : <span className="text-gray-400">—</span>;
                const dueCell = r.dueAt
                  ? (dleft < 0
                      ? <span className="text-red-700 bg-red-50 border border-red-200 rounded px-2 py-0.5">
                          Overdue — {fmtDate(r.dueAt)}
                        </span>
                      : <span>{fmtDate(r.dueAt)}</span>)
                  : <span className="text-gray-400">—</span>;

                return (
                  <tr key={r.uid} className="border-b">
                    <td className="px-4 py-3">{r.name}</td>
                    <td className="px-4 py-3">{r.email}</td>
                    <td className="px-4 py-3">{prettyDept(r.departmentId) || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="w-40 bg-gray-100 rounded h-2 overflow-hidden">
                        <div className="bg-blue-500 h-2" style={{ width: `${r.pct}%` }} />
                      </div>
                      <div className="text-xs text-gray-600 mt-1">{r.done}/{r.total} ({r.pct}%)</div>
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                    <td className="px-4 py-3">{fmtDate(r.lastUpdated)}</td>
                    <td className="px-4 py-3">{dueCell}</td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/admin/attachments/${r.uid}`} className="text-blue-600 hover:underline">
                        View
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

/* -------------------- Employee view with due badges -------------------- */
function EmployeeSteps({ user, userDoc }) {
  const [steps, setSteps] = useState([]);
  const [doneSet, setDoneSet] = useState(new Set());
  const [openIdx, setOpenIdx] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function run() {
      if (!user) return;
      setLoading(true);
      try {
        const deptKey = userDoc?.departmentId || null;

        const baseQ = query(collection(db, 'onboarding', 'base', 'steps'), orderBy('order', 'asc'));
        const baseSteps = (await getDocs(baseQ)).docs.map(d => ({ id: d.id, ...d.data() }));

        let deptSteps = [];
        if (deptKey) {
          const deptQ = query(collection(db, 'onboarding', deptKey, 'steps'), orderBy('order', 'asc'));
          const snap = await getDocs(deptQ);
          deptSteps = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        }

        const merged = [...baseSteps, ...deptSteps].sort((a,b)=>(a.order||0)-(b.order||0));
        setSteps(merged);

        const tasksSnap = await getDocs(collection(db, 'userOnboarding', user.uid, 'tasks'));
        const s = new Set();
        tasksSnap.forEach(ds => { if (ds.data() && ds.data().status === 'done') s.add(ds.id); });
        setDoneSet(s);
      } finally {
        setLoading(false);
      }
    }
    run();
  }, [user, userDoc?.departmentId]);

  // due date for whole onboarding
  const startMs = toMillis(userDoc?.startDate);
  const dueMsFromField = toMillis(userDoc?.onboardingDueAt);
  const overallDueMs = dueMsFromField ?? (startMs ? startMs + 14 * 86400000 : null);

  const dleft = daysLeft(overallDueMs);  // returns null if overallDueMs is null/invalid

  return (
    <section className="w-full bg-white">
      <div className="max-w-3xl mx-auto px-6 pt-10 text-black">
        <p className="text-xl font-medium flex items-center gap-3">
          Complete the steps below to get started with your new role.
          {overallDueMs && (
            dleft < 0
              ? <span className="text-red-700 bg-red-50 border border-red-200 rounded px-2 py-0.5 text-sm">Overdue</span>
              : <span className="text-gray-700 bg-gray-50 border border-gray-200 rounded px-2 py-0.5 text-sm">{dleft} days left</span>
          )}
        </p>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-1 text-black">
        {loading ? (
          <div className="flex justify-center items-center py-12">
            <p className="text-black/70">Loading steps…</p>
          </div>
        ) : steps.length === 0 ? (
          <div className="flex justify-center items-center py-12">
            <p className="text-red-600 font-semibold">No onboarding steps found.</p>
          </div>
        ) : (
          <ol className="relative border-s border-black/70 mt-10">
            {steps.map((step, i) => {
              const isOpen = openIdx === i;
              return (
                <li key={step.id || i}
                    className="mb-10 ms-6"
                    onMouseEnter={() => setOpenIdx(i)}
                    onMouseLeave={() => setOpenIdx(null)}>
                  <div className="absolute w-3 h-3 bg-black rounded-full mt-1.5 -start-1.5 border border-white" />

                  {step.summary && (<div className="mb-1 text-sm text-gray-600">{step.summary}</div>)}
                  <button type="button" onClick={() => setOpenIdx(isOpen ? null : i)}
                          className="text-lg font-semibold text-black hover:text-gray-700 transition text-left">
                    {step.title || `Step ${i + 1}`}
                  </button>

                  {Array.isArray(step.tasks) && step.tasks.length > 0 && (
                    <div className={`overflow-hidden grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
                      isOpen ? 'grid-rows-[1fr] opacity-100 mt-3' : 'grid-rows-[0fr] opacity-0'}`}>
                      <div className="min-h-0">
                        <ul className="space-y-2">
                          {step.tasks.map((task, tIdx) => {
                            const t = typeof task === 'string' ? { id: `t${tIdx}`, label: task } : task;
                            const route = routeForTask(t);
                            const key = completionKeyForTask(t);
                            const done = key ? doneSet.has(key) : false;

                            const baseClasses = `flex items-center justify-between w-full rounded-lg border px-3 py-2 text-sm transition`;
                            const colorClasses = done
                              ? 'border-green-300 bg-green-50 hover:bg-green-100'
                              : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50';

                            return (
                              <li key={t.id || `t${tIdx}`}>
                                {route ? (
                                  <Link href={route} className={`${baseClasses} ${colorClasses}`}>
                                    <span className="truncate">{t.label || `Task ${tIdx + 1}`}</span>
                                    {done ? (
                                      <span className="ml-3 inline-flex items-center gap-1 text-green-600 font-medium">
                                        <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-7.25 7.25a1 1 0 01-1.414 0L3.293 9.957a1 1 0 111.414-1.414l3.043 3.043 6.543-6.543a1 1 0 011.414 0z" clipRule="evenodd" />
                                        </svg>
                                        Done
                                      </span>
                                    ) : (
                                      <span className="ml-3 text-gray-400">Open</span>
                                    )}
                                  </Link>
                                ) : (
                                  <div className={`${baseClasses} ${colorClasses}`}>
                                    <span className="truncate">{t.label || `Task ${tIdx + 1}`}</span>
                                    <span className="ml-3 text-gray-300">No page</span>
                                  </div>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}

/* -------------------- Main page (role-aware) -------------------- */
export default function OnboardingPage() {
  const [user, setUser] = useState(null);
  const [userDoc, setUserDoc] = useState(undefined); // undefined = loading

  // local tab: 'progress' | 'tasks'
  const [tab, setTab] = useState('progress');

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u || null);
      if (!u) { setUserDoc(null); return; }
      try {
        const snap = await getDoc(doc(db, 'users', u.uid));
        const data = snap.exists() ? snap.data() : null;
        if (data) data.role = normalizeRole(data.role);
        setUserDoc(data);
      } catch (e) {
        console.error('user doc load failed', e);
        setUserDoc(null);
      }
    });
    return () => unsub();
  }, []);

  if (userDoc === undefined) {
    return <div className="max-w-6xl mx-auto px-6 py-10">Loading…</div>;
  }
  if (!user) {
    return <div className="max-w-6xl mx-auto px-6 py-10">Please sign in.</div>;
  }

  const role = normalizeRole(userDoc?.role);
  const isEmployee = role === ROLES.EMPLOYEE;
  const isHR = role === ROLES.HR;
  const isMgr = role === ROLES.MANAGER;

  // Top hero for employees only
  const showHero = isEmployee;

  return (
    <div className="fixed inset-0 top-[64px] w-screen min-h-[calc(100vh-64px)] overflow-y-auto">
      {showHero && (
        <section
          className="relative w-full min-h-[60vh] flex items-center justify-center bg-cover bg-center"
          style={{ backgroundImage: "url('/onboarding-bg.jpg')" }}
        >
          <div className="absolute inset-0 bg-black/50" />
          <h1 className="relative z-10 text-5xl md:text-6xl font-extrabold text-white text-center drop-shadow">
            {userDoc?.name ? `Welcome onboard, ${userDoc.name}!` : 'Welcome onboard!'}
          </h1>
        </section>
      )}

      <div className="max-w-6xl mx-auto px-6 pt-8">
        {(isHR || isMgr) && (
          <div className="flex items-center gap-2 mb-6">
            <button
              onClick={() => setTab('progress')}
              className={`px-3 py-1.5 rounded-lg border ${tab==='progress' ? 'bg-black text-white' : 'bg-white'}`}
            >
              Progress
            </button>
            <button
              onClick={() => setTab('tasks')}
              className={`px-3 py-1.5 rounded-lg border ${tab==='tasks' ? 'bg-black text-white' : 'bg-white'}`}
            >
              {isHR ? 'General Tasks' : 'Department Tasks'}
            </button>
          </div>
        )}
      </div>

      {/* Content by tab/role */}
      {isEmployee ? (
        <EmployeeSteps user={user} userDoc={userDoc} />
      ) : tab === 'progress' ? (
        <ProgressTab
          viewerRole={role}
          viewerDeptId={userDoc?.departmentId || null}
          viewerUid={user?.uid}       
        />
      ) : (
        <ManageSteps
          scopeKey={isHR ? 'base' : (userDoc?.departmentId || 'base')}
          scopeLabel={isHR ? 'General' : (prettyDept(userDoc?.departmentId) || 'Department')}
        />
      )}
    </div>
  );
}
