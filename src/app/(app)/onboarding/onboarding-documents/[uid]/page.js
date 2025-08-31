'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { db } from '@/lib/firebase';
import { collection, doc, getDoc, getDocs, orderBy, query } from 'firebase/firestore';

/* ------------ constants (keep in sync with the rest of the app) ------------ */
const UPLOAD_KINDS = ['signed_contract', 'id_tax'];
const FORM_KINDS   = ['personal_details', 'bank_info'];

/* --------------------------------- utils ---------------------------------- */
function toMillis(v) {
  if (!v) return null;
  if (typeof v === 'number') return v;
  if (v && typeof v.toMillis === 'function') return v.toMillis();
  const parsed = Date.parse(v);
  return Number.isNaN(parsed) ? null : parsed;
}
function fmtDate(ms) { if (!ms) return '-'; try { return new Date(ms).toLocaleDateString(); } catch { return '-'; } }
function percent(done, total) { return total ? Math.round((done / total) * 100) : 0; }

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
function tailOfPath(urlOrPath='') {
  try {
    if (/^https?:\/\//i.test(urlOrPath)) {
      const u = new URL(urlOrPath);
      const last = u.pathname.split('/').filter(Boolean).pop();
      return last || u.hostname.replace(/^www\./, '');
    }
  } catch {}
  const parts = String(urlOrPath).split('/').filter(Boolean);
  return parts.pop() || '';
}
function slugFromTask(t) {
  const target = t.target || t.route || t.url || t.videoUrl || t.courseId || '';
  if (t.type === 'upload') return `upload-${slugify(t.kind || 'file')}`;
  if (t.type === 'form')   return `form-${slugify(t.kind || 'details')}`;
  if (t.type === 'course') return `course-${slugify(t.courseId || target || t.label || 'course')}`;
  if (['page', 'link', 'video'].includes(t.type)) {
    const tail = tailOfPath(target) || t.label || t.type;
    return `${slugify(t.type)}-${slugify(tail)}`;
  }
  return `${slugify(t.type || 'task')}-${slugify(t.label || target || 'item')}`;
}
function completionKeyForTask(t, stepId, index) {
  if (!t) return null;
  if (t.completionKey) return String(t.completionKey);
  const sid = String(stepId || 'step');
  return `${slugify(sid)}--${slugFromTask(t)}`;
}
function titleCaseKey(k) {
  return String(k)
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase());
}

/* --------------------------- Modal (popup) --------------------------- */
function FormSubmissionModal({ open, onClose, title, submission }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  // Desired top-to-bottom order; anything else comes after.
  const orderSubmission = (sub) => {
    const PREFERRED = ['firstName', 'lastName', 'phone', 'address'];
    const out = [];
    // add preferred keys first (only if present)
    PREFERRED.forEach(k => { if (k in (sub || {})) out.push([k, sub[k]]); });
    // append any remaining keys (alphabetically)
    Object.keys(sub || {})
      .filter(k => !PREFERRED.includes(k))
      .sort()
      .forEach(k => out.push([k, sub[k]]));
    return out;
  };

  const ordered = orderSubmission(submission || {});

  const titleCaseKey = (k) =>
    String(k)
      .replace(/_/g, ' ')
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .toLowerCase()
      .replace(/\b\w/g, c => c.toUpperCase());

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog" aria-modal="true" aria-label={`${title} submission`}
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-[min(800px,92vw)] max-h-[85vh] overflow-auto rounded-xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            Close
          </button>
        </div>

        {ordered.length ? (
          <div className="space-y-3">
            {ordered.map(([k, v]) => (
              <div key={k} className="text-black/90">
                <span className="font-medium">{titleCaseKey(k)}:</span>{' '}
                {String(v ?? '')}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-black/60">No submission.</div>
        )}
      </div>
    </div>
  );
}

/* --------------------------------- page ----------------------------------- */
export default function UserOnboardingDetail({ params }) {
  const { uid } = params;

  const [user, setUser] = useState(null);
  const [deptName, setDeptName] = useState('—');
  const [steps, setSteps] = useState([]);
  const [taskDocs, setTaskDocs] = useState([]);
  const [loading, setLoading] = useState(true);

  // modal state
  const [formModal, setFormModal] = useState({ open: false, title: '', submission: null });

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      try {
        // user
        const uSnap = await getDoc(doc(db, 'users', uid));
        const u = uSnap.exists() ? uSnap.data() : null;

        // dept name (if any)
        let deptLabel = '—';
        if (u?.departmentId) {
          try {
            const dSnap = await getDoc(doc(db, 'departments', String(u.departmentId)));
            deptLabel = dSnap.exists() ? (dSnap.data()?.name || String(u.departmentId)) : String(u.departmentId);
          } catch {
            deptLabel = String(u.departmentId);
          }
        }

        // steps
        const baseQ = query(collection(db, 'onboarding', 'base', 'steps'), orderBy('order', 'asc'));
        const baseSteps = (await getDocs(baseQ)).docs.map(d => ({ id: d.id, _scope: 'base', ...d.data() }));
        let deptSteps = [];
        if (u?.departmentId) {
          const deptQ = query(collection(db, 'onboarding', String(u.departmentId), 'steps'), orderBy('order', 'asc'));
          const ds = await getDocs(deptQ);
          deptSteps = ds.docs.map(d => ({ id: d.id, _scope: 'dept', ...d.data() }));
        }

        // user task docs
        const tdSnap = await getDocs(collection(db, 'userOnboarding', uid, 'tasks'));

        if (!alive) return;
        setUser(u);
        setDeptName(deptLabel);
        setSteps([...baseSteps, ...deptSteps]);
        setTaskDocs(tdSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    return () => { alive = false; };
  }, [uid]);

  const taskDocMap = useMemo(() => {
    const m = new Map();
    taskDocs.forEach(d => m.set(d.id, d));
    return m;
  }, [taskDocs]);

  const stepRows = useMemo(() => {
    return steps.map((step, i) => {
      const list = [];
      const tasks = Array.isArray(step.tasks) ? step.tasks : [];
      const stepKey = step.id || (step._scope === 'base' ? `base_${i}` : `dept_${i}`);
      tasks.forEach((t, tIdx) => {
        const key = completionKeyForTask(t, stepKey, tIdx);
        const d = key ? taskDocMap.get(key) : null;
        list.push({
          key,
          def: t,
          status: d?.status === 'done' ? 'done' : 'pending',
          updatedAt: toMillis(d?.updatedAt),
          files: Array.isArray(d?.files) ? d.files : [],
          submission: d?.submission || null,
        });
      });
      return { step, items: list };
    });
  }, [steps, taskDocMap]);

  const overall = useMemo(() => {
    let total = 0, done = 0;
    stepRows.forEach(r => {
      total += r.items.length;
      done  += r.items.filter(x => x.status === 'done').length;
    });
    return { total, done, pct: percent(done, total) };
  }, [stepRows]);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-1">
        <Link href="/onboarding" className="text-blue-600 hover:underline">&larr; Back</Link>
        <p className="mt-6 text-black/70">Loading user…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-1">
        <Link href="/onboarding" className="text-blue-600 hover:underline">&larr; Back</Link>
        <p className="mt-6 text-red-600">User not found.</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-1 text-black">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/onboarding" className="text-blue-600 hover:underline">&larr; Back</Link>
      </div>

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-1">{user.name || user.email || 'Employee'}</h1>
        <div className="text-black/70">Email: {user.email}</div>
        <div className="text-black/70">Department: {deptName}</div>
      </div>

      {/* Overall progress */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <div className="font-medium">Overall progress</div>
          <div className="text-sm text-black/70">{overall.done}/{overall.total} ({overall.pct}%)</div>
        </div>
        <div className="w-full bg-gray-100 rounded h-2 overflow-hidden">
          <div className="bg-blue-500 h-2" style={{ width: `${overall.pct}%` }} />
        </div>
      </div>

      {/* Steps & items */}
      <div className="space-y-8">
        {stepRows.map((row, idx) => {
          const stepDone = row.items.filter(i => i.status === 'done').length;
          return (
            <section key={row.step.id || `${row.step._scope}_${idx}`}>
              <div className="mb-2 flex items-center gap-2">
                <h2 className="text-lg font-semibold">{row.step.title || `Step ${idx+1}`}</h2>
                <span className="text-sm text-black/60">({stepDone}/{row.items.length})</span>
                {row.step._scope === 'dept' && (
                  <span className="ml-2 text-xs font-medium px-2 py-0.5 rounded border bg-[#A2D2FF] text-[#0f172a] border-[#A2D2FF]">
                    Department
                  </span>
                )}
              </div>

              {row.items.length === 0 ? (
                <div className="text-sm text-black/50">No tasks in this step.</div>
              ) : (
                <div className="rounded-xl border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="text-left px-4 py-2">Task</th>
                        <th className="text-left px-4 py-2">Status</th>
                        <th className="text-left px-4 py-2">Last update</th>
                        <th className="text-left px-4 py-2">Submission / Files</th>
                      </tr>
                    </thead>
                    <tbody>
                      {row.items.map((it, i2) => {
                        const t = it.def;
                        const kind = t?.kind || '';
                        const isFormLike   = FORM_KINDS.includes(kind);
                        const isUploadLike = UPLOAD_KINDS.includes(kind);

                        return (
                          <tr key={it.key || i2} className="border-b">
                            <td className="px-4 py-2">{t.label || `Task ${i2+1}`}</td>

                            <td className="px-4 py-2">
                              {it.status === 'done' ? (
                                <span className="text-green-700 bg-green-50 border border-green-200 rounded px-2 py-0.5 text-xs">Done</span>
                              ) : (
                                <span className="text-red-700 bg-red-50 border border-red-200 rounded px-2 py-0.5 text-xs">Pending</span>
                              )}
                            </td>

                            <td className="px-4 py-2">{fmtDate(it.updatedAt)}</td>

                            <td className="px-4 py-2">
                              {isUploadLike ? (
                                it.files?.length ? (
                                  <ul className="list-disc pl-5 space-y-1">
                                    {it.files.map(f => (
                                      <li key={f.path}>
                                        <a
                                          className="text-blue-600 hover:underline"
                                          href={f.downloadURL}
                                          target="_blank"
                                          rel="noreferrer"
                                        >
                                          {f.name}
                                        </a>
                                      </li>
                                    ))}
                                  </ul>
                                ) : (
                                  <span className="text-black/50">No files</span>
                                )
                              ) : isFormLike ? (
                                it.submission ? (
                                  <button
                                    type="button"
                                    className="text-blue-600 underline hover:text-blue-700"
                                    onClick={() =>
                                      setFormModal({
                                        open: true,
                                        title: t.label || 'Submission',
                                        submission: it.submission || {},
                                      })
                                    }
                                  >
                                    View submission
                                  </button>
                                ) : (
                                  <span className="text-black/50">No submission</span>
                                )
                              ) : (
                                <span className="text-black/50">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          );
        })}
      </div>

      <FormSubmissionModal
        open={formModal.open}
        onClose={() => setFormModal({ open: false, title: '', submission: null })}
        title={formModal.title}
        submission={formModal.submission}
      />
    </div>
  );
}
