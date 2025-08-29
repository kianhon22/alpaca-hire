'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { auth, db } from '@/lib/firebase';
import {
  collection, doc, getDoc, getDocs, query, orderBy,
  setDoc, updateDoc, deleteDoc
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

/* -------------------- shared utils -------------------- */
function routeForTask(t) {
  if (t && t.type === 'course' && t.courseId) return `/onboarding/training/${t.courseId}`;
  if (t && t.type === 'page' && t.route) return t.route;
  return null;
}

function completionKeyForTask(t) {
  if (!t) return null;
  if (t.completionKey) return t.completionKey;
  if (t.type === 'course' && t.courseId) return `training_${t.courseId}`;
  if (t.type === 'page' && t.route) {
    const slug = t.route.replace(/^\/+/, '').replace(/\//g, '_'); // onboarding_orientation_welcome-video
    return slug.split('_').slice(1).join('_'); // orientation_welcome-video
  }
  return null;
}

/* -------------------- Admin console -------------------- */

const DEPARTMENTS = [
  { key: 'dept_engineering', label: 'Engineering' },
  { key: 'dept_marketing', label: 'Marketing' },
];

function ManageSteps({ role }) {
  const [tab, setTab] = useState('base'); // 'base' | dept_engineering | dept_marketing
  const [steps, setSteps] = useState([]);
  const [loading, setLoading] = useState(true);

  // inline edit
  const [editingStep, setEditingStep] = useState(null);
  const [showTasksFor, setShowTasksFor] = useState(null); // stepId
  const [taskDrafts, setTaskDrafts] = useState([]);

  // new step
  const [newStep, setNewStep] = useState({
    id: '',
    title: '',
    summary: '',
    order: 1,
    tasks: [],
  });

  // load steps for active tab
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const basePath =
          tab === 'base'
            ? ['onboarding', 'base', 'steps']
            : ['onboarding', tab, 'steps'];

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
  }, [tab]);

  async function refresh() {
    const baseCol =
      tab === 'base' ? ['onboarding', 'base', 'steps'] : ['onboarding', tab, 'steps'];
    const snap = await getDocs(query(collection(db, ...baseCol), orderBy('order', 'asc')));
    setSteps(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }

  async function saveStep(s) {
    if (!s.id) {
      alert('Please provide a step id (e.g., s7).');
      return;
    }
    const basePath =
      tab === 'base'
        ? ['onboarding', 'base', 'steps', s.id]
        : ['onboarding', tab, 'steps', s.id];

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
    const basePath =
      tab === 'base'
        ? ['onboarding', 'base', 'steps', stepId]
        : ['onboarding', tab, 'steps', stepId];
    await deleteDoc(doc(db, ...basePath));
    setSteps(prev => prev.filter(s => s.id !== stepId));
  }

  async function renameStep(oldId, newId, payload) {
    if (oldId === newId) return saveStep(payload);
    if (!newId) {
      alert('New ID required.');
      return;
    }
    const baseCol =
      tab === 'base' ? ['onboarding', 'base', 'steps'] : ['onboarding', tab, 'steps'];

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
    const basePath =
      tab === 'base'
        ? ['onboarding', 'base', 'steps', step.id]
        : ['onboarding', tab, 'steps', step.id];

    await updateDoc(doc(db, ...basePath), { tasks: taskDrafts });
    setSteps(prev => prev.map(s => (s.id === step.id ? { ...s, tasks: taskDrafts } : s)));
    setShowTasksFor(null);
    setTaskDrafts([]);
  }

  const activeLabel = useMemo(() => {
    if (tab === 'base') return 'General (Base)';
    const d = DEPARTMENTS.find(d => d.key === tab);
    return d ? `Department – ${d.label}` : 'Department';
  }, [tab]);

  return (
    <section className="w-full bg-white">
      <div className="max-w-6xl mx-auto px-6 py-10 text-black">
        <h2 className="text-2xl font-bold mb-2">
          {role === 'companyHR' ? 'HR Onboarding Console' : 'Manager Onboarding Console'}
        </h2>
        <p className="text-black/70 mb-6">Manage onboarding steps and tasks.</p>

        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setTab('base')}
            className={`px-3 py-1.5 rounded-lg border ${tab === 'base' ? 'bg-black text-white' : 'bg-white'}`}
          >
            General (Base)
          </button>
          {DEPARTMENTS.map(d => (
            <button
              key={d.key}
              onClick={() => setTab(d.key)}
              className={`px-3 py-1.5 rounded-lg border ${tab === d.key ? 'bg-black text-white' : 'bg-white'}`}
            >
              {d.label}
            </button>
          ))}
        </div>

        <div className="rounded-xl border overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
            <div className="font-semibold">{activeLabel} — Steps</div>
            <button
              onClick={() => setNewStep({ id: '', title: '', summary: '', order: (steps?.length || 0) + 1, tasks: [] })}
              className="px-3 py-1.5 rounded-lg border"
            >
              New Step
            </button>
          </div>

          {/* New step form */}
          <div className="px-4 py-3 border-b">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <input
                placeholder="id (e.g. s7)"
                className="rounded-lg border px-3 py-2"
                value={newStep.id}
                onChange={e => setNewStep(s => ({ ...s, id: e.target.value }))}
              />
              <input
                placeholder="title"
                className="rounded-lg border px-3 py-2 md:col-span-2"
                value={newStep.title}
                onChange={e => setNewStep(s => ({ ...s, title: e.target.value }))}
              />
              <input
                placeholder="summary"
                className="rounded-lg border px-3 py-2 md:col-span-2"
                value={newStep.summary}
                onChange={e => setNewStep(s => ({ ...s, summary: e.target.value }))}
              />
              <input
                type="number"
                placeholder="order"
                className="rounded-lg border px-3 py-2"
                value={newStep.order || 0}
                onChange={e => setNewStep(s => ({ ...s, order: Number(e.target.value) }))}
              />
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button className="px-3 py-1.5 rounded-lg bg-black text-white" onClick={() => saveStep(newStep)}>
                Save Step
              </button>
              <button
                className="px-3 py-1.5 rounded-lg border"
                onClick={() => setNewStep({ id: '', title: '', summary: '', order: (steps?.length || 0) + 1, tasks: [] })}
              >
                Clear
              </button>
            </div>
          </div>

          {/* header row */}
          <div className="grid grid-cols-12 gap-2 px-4 py-2 font-semibold bg-white border-b">
            <div className="col-span-2">ID</div>
            <div className="col-span-3">Title</div>
            <div className="col-span-4">Summary</div>
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
                      <input
                        className="rounded-lg border px-2 py-1 w-full"
                        defaultValue={s.id}
                        onChange={e => setEditingStep(prev => ({ ...prev, id: e.target.value }))}
                      />
                    ) : (
                      <span className="font-mono">{s.id}</span>
                    )}
                  </div>
                  <div className="col-span-3">
                    {isEditing ? (
                      <input
                        className="rounded-lg border px-2 py-1 w-full"
                        defaultValue={s.title}
                        onChange={e => setEditingStep(prev => ({ ...prev, title: e.target.value }))}
                      />
                    ) : (
                      <span>{s.title}</span>
                    )}
                  </div>
                  <div className="col-span-4">
                    {isEditing ? (
                      <input
                        className="rounded-lg border px-2 py-1 w-full"
                        defaultValue={s.summary}
                        onChange={e => setEditingStep(prev => ({ ...prev, summary: e.target.value }))}
                      />
                    ) : (
                      <span className="text-gray-600">{s.summary}</span>
                    )}
                  </div>
                  <div className="col-span-1">
                    {isEditing ? (
                      <input
                        type="number"
                        className="rounded-lg border px-2 py-1 w-full"
                        defaultValue={s.order || 0}
                        onChange={e => setEditingStep(prev => ({ ...prev, order: Number(e.target.value) }))}
                      />
                    ) : (
                      <span>{s.order || 0}</span>
                    )}
                  </div>
                  <div className="col-span-2 flex justify-end gap-2">
                    {isEditing ? (
                      <>
                        <button
                          className="px-3 py-1.5 rounded-lg bg-black text-white"
                          onClick={() => {
                            const payload = {
                              id: editingStep.id,
                              title: editingStep.title,
                              summary: editingStep.summary,
                              order: editingStep.order,
                              tasks: s.tasks || [],
                            };
                            if (editingStep.id !== s.id) {
                              renameStep(s.id, editingStep.id, payload);
                            } else {
                              saveStep(payload);
                            }
                          }}
                        >
                          Save
                        </button>
                        <button className="px-3 py-1.5 rounded-lg border" onClick={() => setEditingStep(null)}>
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className="px-3 py-1.5 rounded-lg border"
                          onClick={() => setEditingStep({ _originalId: s.id, ...s })}
                        >
                          Edit
                        </button>
                        <button className="px-3 py-1.5 rounded-lg border" onClick={() => openTasks(s)}>
                          Tasks
                        </button>
                        <button className="px-3 py-1.5 rounded-lg border text-red-600" onClick={() => deleteStep(s.id)}>
                          Delete
                        </button>
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
                            <button
                              className="px-3 py-1.5 rounded-lg border"
                              onClick={() => {
                                setShowTasksFor(null);
                                setTaskDrafts([]);
                              }}
                            >
                              Close
                            </button>
                          </div>
                        </div>

                        <div className="space-y-2">
                          {taskDrafts.map((t, idx) => (
                            <div key={idx} className="grid grid-cols-12 gap-2">
                              <input
                                className="col-span-2 rounded-lg border px-2 py-1"
                                placeholder="id (e.g. t1)"
                                value={t.id || ''}
                                onChange={e =>
                                  setTaskDrafts(arr => arr.map((x, i) => (i === idx ? { ...x, id: e.target.value } : x)))
                                }
                              />
                              <input
                                className="col-span-3 rounded-lg border px-2 py-1"
                                placeholder="label"
                                value={t.label || ''}
                                onChange={e =>
                                  setTaskDrafts(arr => arr.map((x, i) => (i === idx ? { ...x, label: e.target.value } : x)))
                                }
                              />
                              <select
                                className="col-span-2 rounded-lg border px-2 py-1"
                                value={t.type || 'page'}
                                onChange={e =>
                                  setTaskDrafts(arr => arr.map((x, i) => (i === idx ? { ...x, type: e.target.value } : x)))
                                }
                              >
                                <option value="page">page</option>
                                <option value="course">course</option>
                                <option value="doc">doc</option>
                                <option value="video">video</option>
                              </select>
                              {(t.type === 'page' || t.type === 'video' || t.type === 'doc') ? (
                                <input
                                  className="col-span-3 rounded-lg border px-2 py-1"
                                  placeholder="route or url"
                                  value={t.route || t.url || ''}
                                  onChange={e => {
                                    const v = e.target.value;
                                    setTaskDrafts(arr =>
                                      arr.map((x, i) =>
                                        i === idx
                                          ? { ...x, route: t.type === 'page' ? v : undefined, url: t.type !== 'page' ? v : undefined }
                                          : x
                                      )
                                    );
                                  }}
                                />
                              ) : (
                                <input
                                  className="col-span-3 rounded-lg border px-2 py-1"
                                  placeholder="courseId (e.g. security-awareness)"
                                  value={t.courseId || ''}
                                  onChange={e =>
                                    setTaskDrafts(arr => arr.map((x, i) => (i === idx ? { ...x, courseId: e.target.value } : x)))
                                  }
                                />
                              )}
                              <input
                                className="col-span-2 rounded-lg border px-2 py-1"
                                placeholder="completionKey (optional)"
                                value={t.completionKey || ''}
                                onChange={e =>
                                  setTaskDrafts(arr => arr.map((x, i) => (i === idx ? { ...x, completionKey: e.target.value } : x)))
                                }
                              />
                              <button
                                className="col-span-12 md:col-span-0 px-3 py-1.5 rounded-lg border text-red-600"
                                onClick={() => setTaskDrafts(arr => arr.filter((_, i) => i !== idx))}
                              >
                                Remove
                              </button>
                            </div>
                          ))}

                          <button
                            className="px-3 py-1.5 rounded-lg border"
                            onClick={() => setTaskDrafts(arr => [...arr, { id: '', label: '', type: 'page' }])}
                          >
                            + Add Task
                          </button>
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

/* -------------------- Main page (role-aware) -------------------- */

export default function EmployeeOnboarding() {
  const [user, setUser] = useState(null);
  const [userDoc, setUserDoc] = useState(null);
  const [steps, setSteps] = useState([]);
  const [doneSet, setDoneSet] = useState(new Set());
  const [openIdx, setOpenIdx] = useState(null);
  const [loading, setLoading] = useState(true);

  // auth + user doc
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u || null);
      if (u) {
        const snap = await getDoc(doc(db, 'users', u.uid));
        setUserDoc(snap.exists() ? snap.data() : null);
      }
    });
    return () => unsub();
  }, []);

  // fetch steps + completion flags only for employees
  useEffect(() => {
    async function run() {
      if (!user) return;

      const role = (userDoc && userDoc.role) || 'employee';
      if (role !== 'employee') {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const deptKey = (userDoc && userDoc.departmentId) || null;

        const baseQ = query(collection(db, 'onboarding', 'base', 'steps'), orderBy('order', 'asc'));
        const baseSteps = (await getDocs(baseQ)).docs.map(d => ({ id: d.id, ...d.data() }));

        let deptSteps = [];
        if (deptKey) {
          const deptQ = query(collection(db, 'onboarding', deptKey, 'steps'), orderBy('order', 'asc'));
          const snap = await getDocs(deptQ);
          deptSteps = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        }

        const taggedBase = baseSteps.map(s => ({ ...s, _scope: 'base' }));
        const taggedDept = deptSteps.map(s => ({ ...s, _scope: 'dept' }));

        setSteps([...taggedBase, ...taggedDept]);

        const tasksSnap = await getDocs(collection(db, 'userOnboarding', user.uid, 'tasks'));
        const s = new Set();
        tasksSnap.forEach(ds => { if (ds.data() && ds.data().status === 'done') s.add(ds.id); });
        setDoneSet(s);
      } catch (e) {
        console.error('compose steps failed', e);
        setSteps([]); setDoneSet(new Set());
      } finally {
        setLoading(false);
      }
    }
    run();
  }, [user, userDoc && userDoc.departmentId, userDoc && userDoc.role]);

  const userName = (userDoc && userDoc.name) || null;
  const role = (userDoc && userDoc.role) || 'employee';
  const isEmployee = role === 'employee';

  return (
    <div className="fixed inset-0 top-[64px] w-screen min-h-[calc(100vh-64px)] overflow-y-auto">
      {/* HERO */}
      {isEmployee && (
        <section
          className="relative w-full min-h-[60vh] flex items-center justify-center bg-cover bg-center"
          style={{ backgroundImage: "url('/onboarding-bg.jpg')" }}
        >
          <div className="absolute inset-0 bg-black/50" />
          <h1 className="relative z-10 text-5xl md:text-6xl font-extrabold text-white text-center drop-shadow">
            {user ? `Welcome onboard${userName ? `, ${userName}` : ''}!` : 'Welcome onboard!'}
          </h1>
          {!isEmployee && (
            <p className="relative z-10 mt-4 text-white/90 text-lg">
              {role === 'companyHR' ? 'HR Console' : 'Manager Console'}
            </p>
          )}
        </section>
      )}

      {/* EMPLOYEE VIEW */}
      {isEmployee ? (
        <section className="w-full bg-white">
          <div className="max-w-3xl mx-auto px-6 pt-10 text-black">
            <p className="text-xl font-medium">
              Complete the steps below to get started with your new role.
            </p>
          </div>

          <div className="max-w-3xl mx-auto px-6 py-6 text-black">
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
                    <li
                      key={step.id || i}
                      className="mb-10 ms-6"
                      onMouseEnter={() => setOpenIdx(i)}
                      onMouseLeave={() => setOpenIdx(null)}
                    >
                      <div className="absolute w-3 h-3 bg-black rounded-full mt-1.5 -start-1.5 border border-white" />

                      {step.summary && (
                        <div className="mb-1 text-sm text-gray-600">{step.summary}</div>
                      )}

                      <button
                        type="button"
                        onClick={() => setOpenIdx(isOpen ? null : i)}
                        className="text-lg font-semibold text-black hover:text-gray-700 transition text-left"
                      >
                        {step.title || `Step ${i + 1}`}
                      </button>

                      {/* <button
                        type="button"
                        onClick={() => setOpenIdx(isOpen ? null : i)}
                        className="text-lg font-semibold text-black hover:text-gray-700 transition text-left inline-flex items-center gap-2"
                      >
                        <span>{step.title || `Step ${i + 1}`}</span>
                        {step._scope === 'dept' && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                            Department
                          </span>
                        )}
                      </button> */}

                      {Array.isArray(step.tasks) && step.tasks.length > 0 && (
                        <div
                          className={`overflow-hidden grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
                            isOpen ? 'grid-rows-[1fr] opacity-100 mt-3' : 'grid-rows-[0fr] opacity-0'
                          }`}
                        >
                          <div className="min-h-0">
                            <ul className="space-y-2">
                              {step.tasks.map((task, tIdx) => {
                                const t = typeof task === 'string'
                                  ? { id: `t${tIdx}`, label: task }
                                  : task;

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
      ) : (
        /* HR / Manager view */
        <ManageSteps role={role} />
      )}
    </div>
  );
}
