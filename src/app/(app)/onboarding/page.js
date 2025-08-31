"use client";

import React, { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import TaskModal from "@/components/onboarding/TaskModal";
import ResetFiltersButton from "@/components/ui/reset-filter-button";

/* =========================================================================
   Utilities
   ========================================================================= */

const ROLES = { EMPLOYEE: "employee", MANAGER: "departmentmanager", HR: "companyhr" };
const TASK_TYPES = ["upload", "page", "link", "video", "course", "form"];
const UPLOAD_KINDS = ["signed_contract", "id_tax"];
const FORM_KINDS = ["personal_details", "bank_info"];
const DAY_MS = 86_400_000;

const stepsPath = (scopeKey) =>
  scopeKey === "base" ? ["onboarding", "base", "steps"] : ["onboarding", String(scopeKey), "steps"];

const toMillis = (v) => {
  if (!v) return null;
  if (typeof v === "number") return v;
  if (v?.toMillis) return v.toMillis();
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
};

const normalizeRole = (raw) => {
  if (!raw) return ROLES.EMPLOYEE;
  const r = String(raw).toLowerCase();
  if (["companyhr", "company-hr", "hr"].includes(r)) return ROLES.HR;
  if (["departmentmanager", "deptmanager", "manager"].includes(r)) return ROLES.MANAGER;
  return ROLES.EMPLOYEE;
};

const daysLeft = (dueAtMs) => {
  if (typeof dueAtMs !== "number" || Number.isNaN(dueAtMs)) return null;
  const d = Math.ceil((dueAtMs - Date.now()) / DAY_MS);
  return Number.isFinite(d) ? d : null;
};
const fmtDate = (ms) => (!ms ? "-" : new Date(ms).toLocaleDateString());

const slugify = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

const tailOfPath = (urlOrPath = "") => {
  try {
    if (/^https?:\/\//i.test(urlOrPath)) {
      const u = new URL(urlOrPath);
      const last = u.pathname.split("/").filter(Boolean).pop();
      return last || u.hostname.replace(/^www\./, "");
    }
  } catch {}
  const parts = String(urlOrPath).split("/").filter(Boolean);
  return parts.pop() || "";
};

const slugFromTask = (t) => {
  const target = t.target || t.route || t.url || t.videoUrl || t.courseId || "";
  if (t.type === "upload") return `upload-${slugify(t.kind || "file")}`;
  if (t.type === "form") return `form-${slugify(t.kind || "details")}`;
  if (t.type === "course") return `course-${slugify(t.courseId || target || t.label || "course")}`;
  if (["page", "link", "video"].includes(t.type)) {
    const tail = tailOfPath(target) || t.label || t.type;
    return `${slugify(t.type)}-${slugify(tail)}`;
  }
  return `${slugify(t.type || "task")}-${slugify(t.label || target || "item")}`;
};

const completionKeyForTask = (t, stepId, _index) => {
  if (!t) return null;
  if (t.completionKey) return String(t.completionKey);
  const sid = String(stepId || "step");
  return `${slugify(sid)}--${slugFromTask(t)}`;
};

const routeForTask = (t) => {
  if (!t) return null;

  const target = t.target || t.route || t.url || t.videoUrl || null;

  // Uploads/forms with defined kinds open a modal (no route)
  if (t.type === "upload" && UPLOAD_KINDS.includes(t.kind)) return null;
  if (t.type === "form" && FORM_KINDS.includes(t.kind)) return null;

  if (t.type === "course") {
    const courseSlug = t.target || t.courseId || "";
    return courseSlug ? `/onboarding/training/${courseSlug}` : null;
  }
  if (["page", "link", "video"].includes(t.type) && target) return target;
  return null;
};

const StatusBadge = ({ status }) => {
  const base =
    "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border whitespace-nowrap";
  const cls =
    status === "Done"
      ? "text-green-700 bg-green-50 border-green-200"
      : status === "In progress"
      ? "text-yellow-800 bg-yellow-50 border-yellow-200"
      : "text-red-700 bg-red-50 border-red-200";
  return <span className={`${base} ${cls}`}>{status}</span>;
};

/* =========================================================================
   Departments lookup (id ➜ name)
   ========================================================================= */

function useDepartments() {
  const [deptMap, setDeptMap] = useState({});
  const [deptList, setDeptList] = useState([]);

  useEffect(() => {
    (async () => {
      const snap = await getDocs(collection(db, "departments"));
      const map = {};
      const list = [];
      snap.docs.forEach((d) => {
        const data = d.data() || {};
        const name = data.name || d.id;
        map[d.id] = name;
        list.push({ id: d.id, name });
      });
      list.sort((a, b) => a.name.localeCompare(b.name));
      setDeptMap(map);
      setDeptList(list);
    })();
  }, []);

  return { deptMap, deptList };
}
const deptNameOf = (id, deptMap) => (id && deptMap[id] ? deptMap[id] : "—");

/* =========================================================================
   Manage Steps (HR / Manager)
   ========================================================================= */

const computeNextId = (steps, scopeKey) => {
  if (scopeKey === "base") {
    const maxN = steps.reduce((m, s) => {
      const mch = String(s.id || "").match(/s(\d+)$/i);
      return Math.max(m, mch ? parseInt(mch[1], 10) : 0);
    }, 0);
    return `s${maxN + 1}`;
  }
  const initials =
    String(scopeKey)
      .split(/[^a-z0-9]+/i)
      .filter(Boolean)
      .map((w) => w[0])
      .join("")
      .slice(0, 3)
      .toLowerCase() || "d";
  const maxN = steps.reduce((m, s) => {
    const mch = String(s.id || "").match(/(\d+)$/);
    return Math.max(m, mch ? parseInt(mch[1], 10) : 0);
  }, 0);
  return `${initials}-${maxN + 1}`;
};

const computeNextOrder = (steps) => (steps.length ? Math.max(...steps.map((s) => +s.order || 0)) + 1 : 1);

function ManageSteps({ scopeKey, scopeLabel }) {
  const [steps, setSteps] = useState([]);
  const [loading, setLoading] = useState(true);

  const [editingStep, setEditingStep] = useState(null);
  const [showTasksFor, setShowTasksFor] = useState(null);
  const [taskDrafts, setTaskDrafts] = useState([]);

  const [newStep, setNewStep] = useState({ title: "", summary: "", tasks: [] });

  // reorder state
  const [reorderMode, setReorderMode] = useState(false);
  const [draftSteps, setDraftSteps] = useState([]);

  const moveItem = (arr, from, to) => {
    const next = [...arr];
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m);
    return next;
  };

  const refresh = async () => {
    const snap = await getDocs(query(collection(db, ...stepsPath(scopeKey)), orderBy("order", "asc")));
    setSteps(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  };

  useEffect(() => {
    (async () => {
      if (!scopeKey) return;
      setLoading(true);
      try {
        await refresh();
      } finally {
        setLoading(false);
      }
    })();
  }, [scopeKey]);

  const saveOrder = async () => {
    const batch = writeBatch(db);
    draftSteps.forEach((s, i) => {
      batch.update(doc(db, ...stepsPath(scopeKey), s.id), { order: i + 1 });
    });
    await batch.commit();
    setSteps(draftSteps.map((s, i) => ({ ...s, order: i + 1 })));
    setReorderMode(false);
    setDraftSteps([]);
  };

  // CRUD
  const addStep = async () => {
    const id = computeNextId(steps, scopeKey);
    const order = computeNextOrder(steps);
    await setDoc(doc(db, ...stepsPath(scopeKey), id), {
      title: newStep.title || "",
      summary: newStep.summary || "",
      order,
      tasks: Array.isArray(newStep.tasks) ? newStep.tasks : [],
    });
    await refresh();
    setNewStep({ title: "", summary: "", tasks: [] });
  };

  const saveStep = async (payload) => {
    if (!payload.id) return console.warn("Step id is missing.");
    await setDoc(
      doc(db, ...stepsPath(scopeKey), payload.id),
      {
        title: payload.title || "",
        summary: payload.summary || "",
        order: Number(payload.order) || 0, // preserve order
        tasks: Array.isArray(payload.tasks) ? payload.tasks : [],
      },
      { merge: true }
    );
    await refresh();
    setEditingStep(null);
  };

  const deleteStep = async (stepId) => {
    if (!confirm("Delete this step?")) return;
    await deleteDoc(doc(db, ...stepsPath(scopeKey), stepId));
    setSteps((prev) => prev.filter((s) => s.id !== stepId));
  };

  const renameStep = async (oldId, newId, payload) => {
    if (oldId === newId) return saveStep(payload);
    if (!newId) return console.warn("New ID required.");
    await setDoc(doc(db, ...stepsPath(scopeKey), newId), {
      title: payload.title || "",
      summary: payload.summary || "",
      order: Number(payload.order) || 0,
      tasks: Array.isArray(payload.tasks) ? payload.tasks : [],
    });
    await deleteDoc(doc(db, ...stepsPath(scopeKey), oldId));
    await refresh();
    setEditingStep(null);
  };

  // tasks editing
  const openTasks = (step) => {
    setShowTasksFor(step.id);
    const prepared = Array.isArray(step.tasks)
      ? step.tasks.map((t) => ({
          label: t.label || "",
          type: t.type || "page",
          target: t.target || t.route || t.url || t.videoUrl || t.courseId || "",
          kind: t.kind || "",
          requiresEvidence: !!t.requiresEvidence,
          evidenceType: t.evidenceType || "",
        }))
      : [];
    setTaskDrafts(prepared);
  };

  const cleanTaskForSave = (t) => {
    const base = { label: t.label || "", type: t.type || "page" };
    if (t.type === "upload" || t.type === "form") {
      return {
        ...base,
        kind: String(t.kind || "").trim(),
        requiresEvidence: !!t.requiresEvidence,
        evidenceType: t.evidenceType || "",
      };
    }
    return {
      ...base,
      target: String(t.target || "").trim(),
      requiresEvidence: !!t.requiresEvidence,
      evidenceType: t.evidenceType || "",
    };
  };

  const saveTasks = async (step) => {
    const cleaned = taskDrafts.map(cleanTaskForSave);
    await updateDoc(doc(db, ...stepsPath(scopeKey), step.id), { tasks: cleaned });
    setSteps((prev) => prev.map((s) => (s.id === step.id ? { ...s, tasks: cleaned } : s)));
    setShowTasksFor(null);
    setTaskDrafts([]);
  };

  return (
    <section className="w-full bg-white">
      <div className="max-w-6xl mx-auto px-6 py-1 text-black">
        <h2 className="text-3xl font-bold mb-2 rounded-xl text-[#2b99ff]">
          {scopeKey === "base" ? "General Tasks" : "Department Tasks"}
        </h2>
        <p className="text-black/70 mb-6">Manage onboarding steps and tasks.</p>

        <div className="rounded-xl border overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
            <div className="font-semibold">{scopeKey === "base" ? "General Tasks" : scopeLabel}</div>
            <div className="flex items-center gap-2">
              {!reorderMode ? (
                <button
                  className="px-3 py-1.5 rounded-lg border"
                  onClick={() => {
                    setReorderMode(true);
                    setDraftSteps(steps);
                  }}
                >
                  Reorder
                </button>
              ) : (
                <>
                  <button className="px-3 py-1.5 rounded-lg bg-black text-white" onClick={saveOrder}>
                    Save order
                  </button>
                  <button
                    className="px-3 py-1.5 rounded-lg border"
                    onClick={() => {
                      setReorderMode(false);
                      setDraftSteps([]);
                    }}
                  >
                    Cancel
                  </button>
                </>
              )}
            </div>
          </div>

          {/* New step (auto id/order) */}
          <div className="px-4 py-3 border-b">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <input
                placeholder="title"
                className="rounded-lg border px-3 py-2 md:col-span-2"
                value={newStep.title}
                onChange={(e) => setNewStep((s) => ({ ...s, title: e.target.value }))}
              />
              <input
                placeholder="summary"
                className="rounded-lg border px-3 py-2 md:col-span-3"
                value={newStep.summary}
                onChange={(e) => setNewStep((s) => ({ ...s, summary: e.target.value }))}
              />
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button className="px-3 py-1.5 rounded-lg bg-black text-white" onClick={addStep}>
                Add Step
              </button>
              <button
                className="px-3 py-1.5 rounded-lg border"
                onClick={() => setNewStep({ title: "", summary: "", tasks: [] })}
              >
                Clear
              </button>
            </div>
          </div>

          {/* Header row */}
          <div className="grid grid-cols-12 gap-2 px-4 py-2 font-semibold bg-white border-b">
            <div className="col-span-1">ID</div>
            <div className="col-span-3">Title</div>
            <div className="col-span-5">Summary</div>
            <div className="col-span-3 text-right">Action</div>
          </div>

          {loading ? (
            <div className="px-4 py-8">Loading…</div>
          ) : steps.length === 0 ? (
            <div className="px-4 py-8 text-red-600">No steps yet.</div>
          ) : (
            (reorderMode ? draftSteps : steps).map((s, index) => {
              const isEditing = editingStep && editingStep._originalId === s.id;
              return (
                <div
                  key={s.id}
                  className={`grid grid-cols-12 gap-2 px-4 py-2 items-center border-b ${
                    reorderMode ? "cursor-grab bg-amber-50/10" : ""
                  }`}
                  draggable={reorderMode}
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", String(index));
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const from = Number(e.dataTransfer.getData("text/plain"));
                    if (Number.isNaN(from) || from === index) return;
                    setDraftSteps((prev) => moveItem(prev, from, index));
                  }}
                >
                  <div className="col-span-1">
                    {isEditing ? (
                      <input
                        className="rounded-lg border px-2 py-1 w-full"
                        defaultValue={s.id}
                        onChange={(e) => setEditingStep((prev) => ({ ...prev, id: e.target.value }))}
                      />
                    ) : (
                      <span className="font-mono">{s.id}</span>
                    )}
                  </div>

                  <div className="col-span-3">
                    {isEditing ? (
                      <input
                        className="rounded-lg border px-2 py-1 w-full"
                        defaultValue={s.title || ""}
                        onChange={(e) => setEditingStep((prev) => ({ ...prev, title: e.target.value }))}
                      />
                    ) : (
                      <span>{s.title || ""}</span>
                    )}
                  </div>

                  <div className="col-span-5">
                    {isEditing ? (
                      <input
                        className="rounded-lg border px-2 py-1 w-full"
                        defaultValue={s.summary || ""}
                        onChange={(e) => setEditingStep((prev) => ({ ...prev, summary: e.target.value }))}
                      />
                    ) : (
                      <span className="text-gray-600">{s.summary || ""}</span>
                    )}
                  </div>

                  <div className="col-span-3 flex justify-end gap-2">
                    {reorderMode ? (
                      <span className="text-sm text-gray-500">Drag row to reorder</span>
                    ) : isEditing ? (
                      <>
                        <button
                          className="px-3 py-1.5 rounded-lg bg-black text-white"
                          onClick={() => {
                            const payload = {
                              id: (editingStep.id ?? s.id).trim(),
                              title: editingStep.title ?? s.title ?? "",
                              summary: editingStep.summary ?? s.summary ?? "",
                              order: s.order ?? 0,
                              tasks: s.tasks || [],
                            };
                            if (payload.id !== s.id) renameStep(s.id, payload.id, payload);
                            else saveStep(payload);
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
                        <button
                          className="px-3 py-1.5 rounded-lg border text-red-600"
                          onClick={() => deleteStep(s.id)}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>

                  {/* Tasks editor */}
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

                        <div className="space-y-3">
                          {taskDrafts.map((t, idx) => (
                            <div
                              key={idx}
                              className="grid grid-cols-12 gap-2 items-start cursor-grab"
                              draggable
                              onDragStart={(e) => {
                                e.dataTransfer.setData("text/plain", String(idx));
                                e.dataTransfer.effectAllowed = "move";
                              }}
                              onDragOver={(e) => e.preventDefault()}
                              onDrop={(e) => {
                                e.preventDefault();
                                const from = Number(e.dataTransfer.getData("text/plain"));
                                if (Number.isNaN(from) || from === idx) return;
                                setTaskDrafts((prev) => moveItem(prev, from, idx));
                              }}
                            >
                              <select
                                className="col-span-2 rounded-lg border px-2 py-1"
                                value={t.type}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setTaskDrafts((a) =>
                                    a.map((x, i) => {
                                      if (i !== idx) return x;
                                      if (val === "upload" || val === "form") return { ...x, type: val, kind: "", target: "" };
                                      return { ...x, type: val, target: "", kind: "" };
                                    })
                                  );
                                }}
                              >
                                {TASK_TYPES.map((tp) => (
                                  <option key={tp} value={tp}>
                                    {tp}
                                  </option>
                                ))}
                              </select>

                              <input
                                className="col-span-4 rounded-lg border px-2 py-1"
                                placeholder="Task label"
                                value={t.label}
                                onChange={(e) =>
                                  setTaskDrafts((a) => a.map((x, i) => (i === idx ? { ...x, label: e.target.value } : x)))
                                }
                              />

                              {t.type === "upload" || t.type === "form" ? (
                                <select
                                  className="col-span-3 rounded-lg border px-2 py-1"
                                  value={t.kind}
                                  onChange={(e) =>
                                    setTaskDrafts((a) => a.map((x, i) => (i === idx ? { ...x, kind: e.target.value } : x)))
                                  }
                                >
                                  <option value="">— choose kind —</option>
                                  {(t.type === "upload" ? UPLOAD_KINDS : FORM_KINDS).map((k) => (
                                    <option key={k} value={k}>
                                      {k}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <input
                                  className="col-span-3 rounded-lg border px-2 py-1"
                                  placeholder={t.type === "page" ? "/onboarding/policies" : "https://... or courseId"}
                                  value={t.target}
                                  onChange={(e) =>
                                    setTaskDrafts((a) => a.map((x, i) => (i === idx ? { ...x, target: e.target.value } : x)))
                                  }
                                />
                              )}

                              <label className="col-span-2 inline-flex items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={!!t.requiresEvidence}
                                  onChange={(e) =>
                                    setTaskDrafts((a) =>
                                      a.map((x, i) => (i === idx ? { ...x, requiresEvidence: e.target.checked } : x))
                                    )
                                  }
                                />
                                <span>Requires evidence</span>
                              </label>

                              <select
                                className="col-span-1 rounded-lg border px-2 py-1"
                                value={t.evidenceType || ""}
                                onChange={(e) =>
                                  setTaskDrafts((a) => a.map((x, i) => (i === idx ? { ...x, evidenceType: e.target.value } : x)))
                                }
                              >
                                <option value="">—</option>
                                <option value="file">file</option>
                                <option value="form">form</option>
                                <option value="quiz">quiz</option>
                              </select>

                              <button
                                className="col-span-12 md:col-span-1 px-3 py-1.5 rounded-lg border text-red-600 md:justify-self-end"
                                onClick={() => setTaskDrafts((a) => a.filter((_, i) => i !== idx))}
                              >
                                Remove
                              </button>
                            </div>
                          ))}

                          <button className="px-3 py-1.5 rounded-lg border" onClick={() => setTaskDrafts((a) => [...a, { label: "", type: "page", target: "", kind: "", requiresEvidence: false, evidenceType: "" }])}>
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

/* =========================================================================
   Progress (HR / Manager)
   ========================================================================= */

const unique = (arr) => Array.from(new Set(arr));

async function expectedCompletionKeysForDept(deptId) {
  const general = (await getDocs(query(collection(db, ...stepsPath("base")), orderBy("order", "asc")))).docs.map((d) => ({
    id: d.id,
    ...d.data(),
  }));

  let dept = [];
  if (deptId) {
    dept = (await getDocs(query(collection(db, ...stepsPath(deptId)), orderBy("order", "asc")))).docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));
  }

  const keys = [];
  for (const s of [...general, ...dept]) {
    if (!Array.isArray(s.tasks)) continue;
    s.tasks.forEach((t, idx) => {
      const key = completionKeyForTask(t, s.id, idx);
      if (key) keys.push(key);
    });
  }
  return unique(keys);
}

function ProgressTab({ viewerRole, viewerDeptId, viewerUid, deptMap, deptList }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [qText, setQText] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [deptFilter, setDeptFilter] = useState("all");
  const hasActiveFilters =
    qText.trim() !== "" ||
    statusFilter !== "all" ||
    (viewerRole === ROLES.HR && deptFilter !== "all");
  const resetProgressFilters = () => {
      setQText("");
      setStatusFilter("all");
      setDeptFilter("all");
    };

    const initialFilterState = useMemo(
      () => ({ q: "", status: "all", dept: "all" }),
      []
    );

    const currentFilterState = useMemo(
      () => ({
        q: qText.trim(),
        status: statusFilter,
        dept: viewerRole === ROLES.HR ? deptFilter : "all",
      }),
      [qText, statusFilter, deptFilter, viewerRole]
    );

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        let userQ = collection(db, "users");
        if (viewerRole === ROLES.MANAGER && viewerDeptId) {
          userQ = query(userQ, where("departmentId", "==", viewerDeptId));
        }
        const usersSnap = await getDocs(userQ);

        const employees = usersSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((u) => {
            const raw = String(u.role || "").toLowerCase();
            if (raw === "applicant") return false;
            return normalizeRole(raw) === ROLES.EMPLOYEE && u.id !== viewerUid;
          });

        const results = [];
        for (const u of employees) {
          const expectedKeys = await expectedCompletionKeysForDept(u.departmentId);
          const tasksSnap = await getDocs(collection(db, "userOnboarding", u.id, "tasks"));
          const doneSet = new Set(tasksSnap.docs.filter((d) => (d.data() || {}).status === "done").map((d) => d.id));

          const total = expectedKeys.length;
          const done = expectedKeys.filter((k) => doneSet.has(k)).length;
          const pct = total ? Math.round((done / total) * 100) : 0;

          const lastUpdated = tasksSnap.docs.reduce((acc, d) => {
            const t = d.data() || {};
            const ts =
              typeof t.updatedAt === "number"
                ? t.updatedAt
                : t.updatedAt?.toMillis
                ? t.updatedAt.toMillis()
                : 0;
            return Math.max(acc, ts || 0);
          }, 0);

          const startMs = toMillis(u.startDate);
          const dueAt = toMillis(u.onboardingDueAt) ?? (startMs ? startMs + 14 * DAY_MS : null);

          let status = "Not started";
          if (done > 0 && done < total) status = "In progress";
          if (total > 0 && done === total) status = "Done";

          results.push({
            uid: u.id,
            name: u.name || u.email || "—",
            email: u.email || "—",
            departmentId: u.departmentId || "—",
            pct,
            done,
            total,
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
    })();
  }, [viewerRole, viewerDeptId, viewerUid]);

  const filtered = rows.filter((r) => {
    if (qText) {
      const q = qText.toLowerCase();
      if (!(`${r.name}`.toLowerCase().includes(q) || `${r.email}`.toLowerCase().includes(q))) return false;
    }
    if (viewerRole === ROLES.HR && deptFilter !== "all" && r.departmentId !== deptFilter) return false;
    if (statusFilter !== "all") {
      if (statusFilter === "not-started" && r.pct !== 0) return false;
      if (statusFilter === "in-progress" && !(r.pct > 0 && r.pct < 100)) return false;
      if (statusFilter === "done" && r.pct !== 100) return false;
    }
    return true;
  });

  const sorted = useMemo(() => {
    const toKey = (v) => (typeof v === "number" && !Number.isNaN(v) ? v : Number.POSITIVE_INFINITY);
    return [...filtered].sort((a, b) => {
      const ad = toKey(a.dueAt);
      const bd = toKey(b.dueAt);
      if (ad !== bd) return ad - bd;
      if (a.pct !== b.pct) return a.pct - b.pct;
      return (a.lastUpdated || 0) - (b.lastUpdated || 0);
    });
  }, [filtered]);

  return (
    <section className="w-full bg-white">
      <div className="max-w-6xl mx-auto px-6 py-1 text-black">
        <h2 className="text-3xl font-bold mb-2 rounded-xl text-[#2b99ff]">Onboarding Progress</h2>

        <div className="flex flex-wrap items-center gap-3 mb-4 py-1">
          <input
            className="border rounded-lg px-3 py-2 w-64"
            placeholder="Search name or email"
            value={qText}
            onChange={(e) => setQText(e.target.value)}
          />
          <select
            className="border rounded-lg px-3 py-2"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="not-started">Not started</option>
            <option value="in-progress">In progress</option>
            <option value="done">Done</option>
          </select>
          {viewerRole === ROLES.HR && (
            <select
              className="border rounded-lg px-3 py-2"
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
            >
              <option value="all">All departments</option>
              {deptList.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          )}
          <ResetFiltersButton
            onReset={resetProgressFilters}
            currentFilters={currentFilterState}
            initialFilters={initialFilterState}
            clearKeys={["q", "status", "dept"]} 
            className="ml-1"
          />
        </div>

        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3">Employee</th>
                <th className="text-left px-4 py-3">Email</th>
                <th className="text-left px-4 py-3">Department</th>
                <th className="text-left px-4 py-3">Progress</th>
                <th className="text-left px-4 py-3 whitespace-nowrap">Status</th>
                <th className="text-left px-4 py-3 whitespace-nowrap">Last activity</th>
                <th className="text-left px-4 py-3 whitespace-nowrap">Due</th>
                <th className="text-right px-4 py-3 whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="px-4 py-6" colSpan={8}>
                    Loading…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-red-600" colSpan={8}>
                    No employees match.
                  </td>
                </tr>
              ) : (
                sorted.map((r) => {
                  const dleft = daysLeft(r.dueAt);
                  const dueCell = r.dueAt ? (
                    dleft < 0 ? (
                      <span className="text-red-700 bg-red-50 border border-red-200 rounded px-2 py-0.5">
                        Overdue — {fmtDate(r.dueAt)}
                      </span>
                    ) : (
                      <span>{fmtDate(r.dueAt)}</span>
                    )
                  ) : (
                    <span className="text-gray-400">—</span>
                  );

                  return (
                    <tr key={r.uid} className="border-b">
                      <td className="px-4 py-3">{r.name}</td>
                      <td className="px-4 py-3">{r.email}</td>
                      <td className="px-4 py-3">{deptNameOf(r.departmentId, deptMap)}</td>
                      <td className="px-4 py-3">
                        <div className="w-40 bg-gray-100 rounded h-2 overflow-hidden">
                          <div className="bg-blue-500 h-2" style={{ width: `${r.pct}%` }} />
                        </div>
                        <div className="text-xs text-gray-600 mt-1">
                          {r.done}/{r.total} ({r.pct}%)
                        </div>
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                      <td className="px-4 py-3 whitespace-nowrap">{fmtDate(r.lastUpdated)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="whitespace-nowrap">{dueCell}</span>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <Link
                          href={`/onboarding/onboarding-documents/${r.uid}`}
                          className="text-blue-600 hover:underline inline-block"
                        >
                          View details
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

/* =========================================================================
   Employee view
   ========================================================================= */

function EmployeeSteps({ user, userDoc }) {
  const [steps, setSteps] = useState([]);
  const [doneSet, setDoneSet] = useState(new Set());
  const [openIdx, setOpenIdx] = useState(null);
  const [loading, setLoading] = useState(true);

  // modal
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTask, setModalTask] = useState(null);
  const [modalKey, setModalKey] = useState(null);

  useEffect(() => {
    (async () => {
      if (!user) return;
      setLoading(true);
      try {
        const deptKey = userDoc?.departmentId ?? null;

        const baseSteps = (
          await getDocs(query(collection(db, ...stepsPath("base")), orderBy("order", "asc")))
        ).docs.map((d) => ({ id: d.id, _scope: "base", ...d.data() }));

        let deptSteps = [];
        if (deptKey) {
          const snap = await getDocs(query(collection(db, ...stepsPath(deptKey)), orderBy("order", "asc")));
          deptSteps = snap.docs.map((d) => ({ id: d.id, _scope: "dept", ...d.data() }));
        }

        const sortedBase = [...baseSteps].sort((a, b) => (a.order || 0) - (b.order || 0));
        const sortedDept = [...deptSteps].sort((a, b) => (a.order || 0) - (b.order || 0));
        setSteps([...sortedBase, ...sortedDept]);

        const tasksSnap = await getDocs(collection(db, "userOnboarding", user.uid, "tasks"));
        const s = new Set();
        tasksSnap.forEach((ds) => {
          const data = ds.data() || {};
          if (data.status === "done") s.add(ds.id);
        });
        setDoneSet(s);
      } finally {
        setLoading(false);
      }
    })();
  }, [user, userDoc?.departmentId]);

  const startMs = toMillis(userDoc?.startDate);
  const dueMsFromField = toMillis(userDoc?.onboardingDueAt);
  const overallDueMs = dueMsFromField != null ? dueMsFromField : startMs ? startMs + 14 * DAY_MS : null;
  const dleft = daysLeft(overallDueMs);

  const openTaskModal = (task, key) => {
    setModalTask(task);
    setModalKey(key);
    setModalOpen(true);
  };
  const markLocalDone = (key) => setDoneSet((prev) => new Set(prev).add(key));
  const unmarkLocalDone = (key) => {
    setDoneSet((prev) => {
      const n = new Set(prev);
      n.delete(key);
      return n;
    });
  };

  const stepStats = useMemo(
    () =>
      steps.map((step, i) => {
        const stepTasks = Array.isArray(step.tasks) ? step.tasks : [];
        const keys = stepTasks
          .map((t, tIdx) => completionKeyForTask(t, step.id || (step._scope === "base" ? `base_${i}` : `dept_${i}`), tIdx))
          .filter(Boolean);
        const total = keys.length;
        const done = keys.filter((k) => doneSet.has(k)).length;
        return { keys, total, done };
      }),
    [steps, doneSet]
  );

  const firstIncompleteStepIdx = useMemo(() => {
    for (let i = 0; i < stepStats.length; i++) {
      const { total, done } = stepStats[i];
      if (total > 0 && done < total) return i;
    }
    return -1;
  }, [stepStats]);

  const Lock = ({ className = "w-4 h-4 text-gray-400 mr-2" }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2a5 5 0 00-5 5v3H6a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2v-8a2 2 0 00-2-2h-1V7a5 5 0 00-5-5zm-3 8V7a3 3 0 116 0v3H9z" />
    </svg>
  );

  return (
    <section className="w-full bg-white">
      <div className="max-w-3xl mx-auto px-6 pt-5 text-black">
        <p className="text-xl font-medium flex items-center gap-3">
          Complete the steps below to get started with your new role.
          {overallDueMs &&
            (dleft < 0 ? (
              <span className="text-red-700 bg-red-50 border border-red-200 rounded px-2 py-0.5 text-sm">Overdue</span>
            ) : (
              <span className="text-gray-700 bg-gray-50 border border-gray-200 rounded px-2 py-0.5 text-sm">
                {dleft} days left
              </span>
            ))}
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
              const stepTasks = Array.isArray(step.tasks) ? step.tasks : [];
              const { keys: stepKeys, total: stepTotal, done: stepDone } = stepStats[i] || { keys: [], total: 0, done: 0 };
              const stepComplete = stepTotal > 0 && stepDone === stepTotal;
              const stepLocked = firstIncompleteStepIdx !== -1 && i > firstIncompleteStepIdx;

              return (
                <Fragment key={step.id || `${step._scope}_${i}`}>
                  <li className="mb-10 ms-6" onMouseEnter={() => setOpenIdx(i)} onMouseLeave={() => setOpenIdx(null)}>
                    <div
                      className={`absolute w-3 h-3 rounded-full mt-1.5 -start-1.5 border border-white ${
                        stepComplete ? "bg-green-600" : "bg-black"
                      }`}
                    />

                    {step.summary && <div className="mb-1 text-sm text-gray-600">{step.summary}</div>}

                    <button
                      type="button"
                      onClick={() => setOpenIdx(isOpen ? null : i)}
                      className="text-lg font-semibold text-black hover:text-gray-700 transition text-left flex items-center gap-2"
                    >
                      <span>{step.title || `Step ${i + 1}`}</span>

                      {step._scope === "dept" && (
                        <span className="ml-2 text-xs font-medium px-2 py-0.5 rounded border bg-[#BDE0FE] text-[#0f172a] border-[#BDE0FE]">
                          Department
                        </span>
                      )}

                      {stepTotal > 0 && (
                        <span className="text-sm font-normal text-gray-500">({stepDone}/{stepTotal})</span>
                      )}

                      {stepComplete && (
                        <span className="ml-2 text-xs font-medium px-2 py-0.5 rounded border bg-green-50 text-green-700 border-green-200">
                          ✓ Done
                        </span>
                      )}
                    </button>

                    {stepTasks.length > 0 && (
                      <div
                        className={`overflow-hidden grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
                          isOpen ? "grid-rows-[1fr] opacity-100 mt-3" : "grid-rows-[0fr] opacity-0"
                        }`}
                      >
                        <div className="min-h-0">
                          <ul className="space-y-2">
                            {stepTasks.map((t, tIdx) => {
                              const key = stepKeys[tIdx];
                              const done = key ? doneSet.has(key) : false;

                              const isModalKind =
                                (t.type === "upload" && UPLOAD_KINDS.includes(t.kind)) ||
                                (t.type === "form" && FORM_KINDS.includes(t.kind));
                              const route = isModalKind ? null : routeForTask(t);

                              const locked = stepLocked && !done;

                              const base =
                                "flex items-center justify-between w-full rounded-lg border px-3 py-2 text-sm transition";
                              const unlockedColor = done
                                ? "border-green-300 bg-green-50 hover:bg-green-100 cursor-pointer"
                                : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50 cursor-pointer";
                              const lockedColor = "border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed";

                              const content = (
                                <>
                                  <span className="truncate flex items-center">
                                    {locked && <Lock />}
                                    {t.label || `Task ${tIdx + 1}`}
                                  </span>
                                  {done && <span className="ml-3 inline-flex items-center gap-1 text-green-600 font-medium">✓ Done</span>}
                                </>
                              );

                              return (
                                <li key={`${step.id || `${step._scope}_${i}`}-${tIdx}`}>
                                  {locked ? (
                                    <div className={`${base} ${lockedColor}`} title="Complete the previous step to unlock">
                                      {content}
                                    </div>
                                  ) : route ? (
                                    <Link href={route} className={`${base} ${unlockedColor}`}>
                                      {content}
                                    </Link>
                                  ) : (
                                    <button className={`${base} ${unlockedColor} w-full text-left`} onClick={() => openTaskModal(t, key)}>
                                      {content}
                                    </button>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      </div>
                    )}
                  </li>
                </Fragment>
              );
            })}
          </ol>
        )}
      </div>

      <TaskModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        userUid={user?.uid}
        task={modalTask}
        completionKey={modalKey}
        onSaved={() => markLocalDone(modalKey)}
        onDeleted={() => unmarkLocalDone(modalKey)}
      />
    </section>
  );
}

/* =========================================================================
   Main Page
   ========================================================================= */

export default function OnboardingPage() {
  const [user, setUser] = useState(null);
  const [userDoc, setUserDoc] = useState(undefined); // undefined = loading
  const [tab, setTab] = useState("progress"); // 'progress' | 'tasks'
  const { deptMap, deptList } = useDepartments();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u || null);
      if (!u) {
        setUserDoc(null);
        return;
      }
      try {
        const snap = await getDoc(doc(db, "users", u.uid));
        const data = snap.exists() ? snap.data() : null;
        if (data) data.role = normalizeRole(data.role);
        setUserDoc(data);
      } catch (e) {
        console.error("user doc load failed", e);
        setUserDoc(null);
      }
    });
    return () => unsub();
  }, []);

  if (userDoc === undefined) return <div className="max-w-6xl mx-auto px-6 py-10">Loading…</div>;
  if (!user) return <div className="max-w-6xl mx-auto px-6 py-10">Please sign in.</div>;

  const role = normalizeRole(userDoc?.role);
  const isEmployee = role === ROLES.EMPLOYEE;
  const isHR = role === ROLES.HR;
  const isMgr = role === ROLES.MANAGER;
  const showHero = isEmployee;

  return (
    <div className="fixed inset-0 top-[64px] w-screen min-h-[calc(100vh-64px)] overflow-y-auto">
      {showHero && (
        <section
          className="relative w-full min-h-[60vh] flex items-center justify-center bg-cover bg-center"
          style={{ backgroundImage: "url('/onboarding-bg.jpg')" }}
        >
          <div className="absolute inset-0 bg-black/50" />
          <h1 className="welcome-heading relative z-10 text-5xl md:text-6xl font-extrabold text-white text-center drop-shadow">
            {userDoc?.name ? `Welcome Onboard, ${userDoc.name}!` : "Welcome onboard!"}
          </h1>

          <style jsx>{`
            .welcome-heading {
              animation: welcomeEnter 1.4s cubic-bezier(0.22, 1, 0.36, 1) both,
                welcomeFloat 12s ease-in-out 900ms infinite;
              will-change: transform, opacity, filter;
            }
            @keyframes welcomeEnter {
              from {
                opacity: 0;
                transform: translateY(12px);
                filter: blur(4px);
              }
              to {
                opacity: 1;
                transform: translateY(0);
                filter: blur(0);
              }
            }
            @keyframes welcomeFloat {
              0% {
                transform: translateY(0);
              }
              50% {
                transform: translateY(-6px);
              }
              100% {
                transform: translateY(0);
              }
            }
          `}</style>
        </section>
      )}

      <div className="max-w-6xl mx-auto px-6 pt-8">
        {(isHR || isMgr) && (
          <div className="flex items-center gap-2 mb-6">
            <button
              onClick={() => setTab("progress")}
              className={`px-3 py-1.5 rounded-lg border ${tab === "progress" ? "bg-black text-white" : "bg-white"}`}
            >
              Progress
            </button>
            <button
              onClick={() => setTab("tasks")}
              className={`px-3 py-1.5 rounded-lg border ${tab === "tasks" ? "bg-black text-white" : "bg-white"}`}
            >
              {isHR ? "General Tasks" : "Department Tasks"}
            </button>
          </div>
        )}
      </div>

      {isEmployee ? (
        <EmployeeSteps user={user} userDoc={userDoc} />
      ) : tab === "progress" ? (
        <ProgressTab
          viewerRole={role}
          viewerDeptId={userDoc?.departmentId || null}
          viewerUid={user?.uid}
          deptMap={deptMap}
          deptList={deptList}
        />
      ) : (
        <ManageSteps
          scopeKey={isHR ? "base" : userDoc?.departmentId || "base"}
          scopeLabel={isHR ? "General" : deptNameOf(userDoc?.departmentId, deptMap)}
        />
      )}
    </div>
  );
}
