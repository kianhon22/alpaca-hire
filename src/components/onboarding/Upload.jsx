'use client';

import { useEffect, useRef, useState } from 'react';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { getStorage, ref as sref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';

export default function Upload({
  open,
  onClose,
  userUid,
  task,               // { label, kind }
  completionKey,
  onSaved,
  onDeleted,
}) {
  const [saving, setSaving] = useState(false);
  const [loadingPrev, setLoadingPrev] = useState(false);

  const [files, setFiles] = useState([]);           // File[]
  const [prevFiles, setPrevFiles] = useState([]);   // [{name, path, downloadURL}]
  const [fileError, setFileError] = useState('');   // non-PDF warning

  const canChooseMultiple = task?.kind === 'id_tax';
  const fileInputRef = useRef(null);

  useEffect(() => {
    let alive = true;
    async function run() {
      if (!open || !userUid || !completionKey) return;
      setLoadingPrev(true);
      try {
        const snap = await getDoc(doc(db, 'userOnboarding', userUid, 'tasks', completionKey));
        if (!alive) return;
        const data = snap.exists() ? snap.data() : null;
        setPrevFiles(Array.isArray(data?.files) ? data.files : []);
      } finally {
        if (alive) setLoadingPrev(false);
      }
    }
    run();
    if (open) {
      setFiles([]);
      setFileError('');
    }
    return () => { alive = false; };
  }, [open, userUid, completionKey]);

  const isPdf = (f) =>
    f &&
    (f.type === 'application/pdf' || /\.pdf$/i.test(f.name || ''));

  function handlePick(e) {
    const picked = Array.from(e.target.files || []);
    const ok = picked.filter(isPdf);
    const bad = picked.filter((f) => !isPdf(f));

    setFiles(ok);
    setFileError(bad.length ? `${bad.length} file(s) were not PDF and were ignored.` : '');
  }

  async function uploadNewFiles() {
    if (!files.length) return [];
    const storage = getStorage();
    const uploaded = [];
    for (const f of files) {
      const path = `userOnboarding/${userUid}/${completionKey}/${f.name}`;
      const rf = sref(storage, path);
      await uploadBytes(rf, f);
      const url = await getDownloadURL(rf);
      uploaded.push({ name: f.name, path, downloadURL: url });
    }
    return uploaded;
  }

  async function handleRemovePrevFile(i) {
    const storage = getStorage();
    const toRemove = prevFiles[i];
    if (!toRemove) return;
    try { await deleteObject(sref(storage, toRemove.path)); } catch {}
    const remaining = prevFiles.filter((_, idx) => idx !== i);
    setPrevFiles(remaining);

    const payload = {
      files: remaining,
      status: remaining.length ? 'done' : 'pending',
      updatedAt: serverTimestamp(),
      kind: task?.kind || '',
    };
    await setDoc(doc(db, 'userOnboarding', userUid, 'tasks', completionKey), payload, { merge: true });
    if (!remaining.length) onDeleted?.();
  }

  async function handleDeleteSubmission() {
    const storage = getStorage();
    for (const f of prevFiles) {
      try { await deleteObject(sref(storage, f.path)); } catch {}
    }
    await deleteDoc(doc(db, 'userOnboarding', userUid, 'tasks', completionKey));
    setPrevFiles([]);
    setFiles([]);
    setFileError('');
    onDeleted?.();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!userUid || !completionKey) return;

    // nothing chosen? still allow resubmit to keep prev files
    setSaving(true);
    try {
      const uploaded = await uploadNewFiles();
      const payload = {
        status: 'done',
        updatedAt: serverTimestamp(),
        kind: task?.kind || '',
        files: uploaded.length ? [...prevFiles, ...uploaded] : prevFiles,
      };
      await setDoc(doc(db, 'userOnboarding', userUid, 'tasks', completionKey), payload, { merge: true });
      if (uploaded.length) setPrevFiles((prev) => [...prev, ...uploaded]);
      setFiles([]);
      setFileError('');
      onSaved?.();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;
  const title = task?.label || 'Task';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <form onSubmit={handleSubmit} className="relative z-10 w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{title}</h3>
          {/* top-right close removed */}
        </div>

        {/* Previously uploaded */}
        {loadingPrev ? (
          <div className="mb-3 text-sm text-gray-500">Loading previous submission…</div>
        ) : prevFiles.length > 0 && (
          <div className="mb-4">
            <label className="block text-sm text-gray-600 mb-1">Previously uploaded:</label>
            <div className="rounded-lg border px-3 py-2">
              {prevFiles.map((f, i) => (
                <span key={f.path} className="inline-flex items-center gap-2 mr-3">
                  <a className="underline truncate max-w-[260px]" href={f.downloadURL} target="_blank" rel="noreferrer">
                    {f.name}
                  </a>
                  <button
                    type="button"
                    className="text-red-600 hover:underline"
                    onClick={() => handleRemovePrevFile(i)}
                  >
                    Remove
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Uploader */}
        <div className="space-y-2">
          <label className="block text-sm text-gray-600">Choose File</label>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            multiple={canChooseMultiple}
            onChange={handlePick}
            className="hidden"
          />

          {/* Button to trigger file dialog */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center rounded-lg border px-3 py-2 hover:bg-gray-50"
          >
            {canChooseMultiple ? 'Choose Files' : 'Choose File'}
          </button>

          {/* Helper text */}
          <p className="text-xs text-gray-500">
            PDF files only{canChooseMultiple ? ' (you can select multiple)' : ''}.
          </p>

          {/* Selected files list */}
          {files.length > 0 && (
            <ul className="text-sm list-disc pl-5">
              {files.map((f) => <li key={f.name}>{f.name}</li>)}
            </ul>
          )}

          {/* Non-PDF warning */}
          {fileError && <p className="text-xs text-red-600">{fileError}</p>}
        </div>

        {/* Actions */}
        <div className="mt-6 flex items-center justify-between">
          {prevFiles.length > 0 && (
            <button
              type="button"
              className="px-3 py-1.5 rounded-lg border border-red-300 text-red-600"
              onClick={handleDeleteSubmission}
            >
              Delete submission
            </button>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-lg border">
              Close
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-3 py-1.5 rounded-lg bg-black text-white disabled:opacity-60"
            >
              {saving ? 'Submitting…' : (prevFiles.length ? 'Resubmit' : 'Submit')}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
