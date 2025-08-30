'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { auth, db, storage } from '@/lib/firebase';
import {
  collection,
  doc,
  getDocs,
  query,
  where,
  setDoc,
  serverTimestamp,
  deleteDoc,
} from 'firebase/firestore';
import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';

const LABELS = {
  personal_details: 'Submit personal details',
  signed_contract: 'Upload signed contract',
  bank_info: 'Upload bank info (payroll)',
  id_tax: 'Submit ID & tax docs',
};

function completionKey(kind) {
  return `upload_${kind}`;
}

export default function UploadTaskPage() {
  const { kind } = useParams();
  const router = useRouter();
  const [user, setUser] = useState(null);

  const [pickedFile, setPickedFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0); // upload progress %
  const [msg, setMsg] = useState('');

  const [uploads, setUploads] = useState([]); // [{id, path, url?, uploadedAt}]

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => setUser(u || null));
    return () => unsub();
  }, []);

  async function loadUploads(uid, k) {
    const qy = query(
      collection(db, 'userOnboarding', uid, 'uploads'),
      where('kind', '==', String(k))
    );
    const snap = await getDocs(qy);
    const rows = await Promise.all(
      snap.docs.map(async (d) => {
        const data = d.data();
        let url = '';
        try {
          url = await getDownloadURL(ref(storage, data.path));
        } catch {}
        return { id: d.id, ...data, url };
      })
    );
    rows.sort(
      (a, b) => (b.uploadedAt?.seconds || 0) - (a.uploadedAt?.seconds || 0)
    );
    setUploads(rows);
    return rows;
  }

  useEffect(() => {
    if (!user || !kind) return;
    loadUploads(user.uid, kind);
  }, [user, kind]);

  const title = LABELS[kind] || 'Upload document';

  async function submit() {
    if (!user || !pickedFile) return;
    setBusy(true);
    setProgress(0);
    setMsg('');

    try {
      if (
        pickedFile.type !== 'application/pdf' &&
        !pickedFile.name.toLowerCase().endsWith('.pdf')
      ) {
        setMsg('Please upload a PDF file.');
        setBusy(false);
        return;
      }

      const filename = `${Date.now()}_${pickedFile.name.replace(/\s+/g, '_')}`;
      const path = `onboarding/${user.uid}/${kind}/${filename}`;
      const fileRef = ref(storage, path);

      await new Promise((resolve, reject) => {
        const task = uploadBytesResumable(fileRef, pickedFile, {
          contentType: 'application/pdf',
        });
        task.on(
          'state_changed',
          (snap) => {
            const pct = Math.round(
              (snap.bytesTransferred / snap.totalBytes) * 100
            );
            setProgress(pct);
          },
          reject,
          resolve
        );
      });

      const uploadId = `${kind}_${Date.now()}`;
      await setDoc(doc(db, 'userOnboarding', user.uid, 'uploads', uploadId), {
        kind,
        path,
        uploadedAt: serverTimestamp(),
      });

      await setDoc(
        doc(db, 'userOnboarding', user.uid, 'tasks', completionKey(kind)),
        { status: 'done', updatedAt: serverTimestamp() },
        { merge: true }
      );

      setMsg('Uploaded ✓');
      router.push('/onboarding');
    } catch (e) {
      console.error(e);
      setMsg('Upload failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function removeUpload(u) {
    if (!user) return;
    if (!confirm('Delete this document?')) return;
    setBusy(true);
    setMsg('');

    try {
      try {
        await deleteObject(ref(storage, u.path));
      } catch (err) {
        console.warn('deleteObject:', err?.message);
      }

      await deleteDoc(doc(db, 'userOnboarding', user.uid, 'uploads', u.id));

      const remaining = await loadUploads(user.uid, kind);
      if (remaining.length === 0) {
        await deleteDoc(
          doc(db, 'userOnboarding', user.uid, 'tasks', completionKey(kind))
        );
      }

      setMsg('Deleted.');
    } catch (e) {
      console.error(e);
      setMsg('Delete failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 text-black">
      <h1 className="text-2xl font-bold mb-2">{title}</h1>
      <p className="text-black/70 mb-6">Please upload a single PDF file.</p>

      {/* pick file + indicator + submit */}
      <div className="space-y-3 mb-8">
        {/* custom choose file button */}
        <label className="inline-block px-4 py-2 bg-gray-200 rounded-lg cursor-pointer hover:bg-gray-300 text-sm font-medium">
          Choose File
          <input
            type="file"
            accept=".pdf,application/pdf"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0] || null;
              setPickedFile(f);
            }}
            className="hidden"
          />
        </label>

        {pickedFile && (
          <div className="text-sm flex items-center gap-3">
            <span className="px-2 py-0.5 rounded bg-gray-100 border">
              {pickedFile.name}
            </span>
            <button
              className="text-red-600 underline disabled:opacity-50"
              onClick={() => setPickedFile(null)}
              disabled={busy}
            >
              clear
            </button>
          </div>
        )}

        {busy && (
          <div className="w-full bg-gray-200 rounded h-2 overflow-hidden">
            <div
              className="bg-blue-500 h-2"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={submit}
            disabled={!pickedFile || busy}
            className="px-3 py-1.5 rounded bg-black text-white disabled:opacity-50"
          >
            {busy ? 'Uploading…' : 'Submit PDF'}
          </button>
          <button
            onClick={() => router.push('/onboarding')}
            className="px-3 py-1.5 rounded border"
            disabled={busy}
          >
            Back
          </button>
        </div>
        {msg && <p className="text-sm">{msg}</p>}
      </div>

      {/* previous uploads */}
      <div>
        <h2 className="font-semibold mb-2">Your uploaded file(s)</h2>
        {uploads.length === 0 ? (
          <p className="text-black/60 text-sm">No uploads yet.</p>
        ) : (
          <ul className="space-y-2">
            {uploads.map((u) => (
              <li
                key={u.id}
                className="flex items-center justify-between border rounded-lg px-3 py-2"
              >
                <a
                  href={u.url || '#'}
                  target="_blank"
                  className="text-blue-600 underline truncate"
                  rel="noreferrer"
                >
                  {u.path.split('/').slice(-1)[0]}
                </a>
                <button
                  className="text-red-600 underline disabled:opacity-50"
                  onClick={() => removeUpload(u)}
                  disabled={busy}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
