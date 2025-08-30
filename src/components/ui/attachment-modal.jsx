'use client';

import { useEffect, useState } from 'react';
import { db, storage } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { ref as storageRef, getDownloadURL } from 'firebase/storage';

const LABELS = {
  personal_details: 'Personal details',
  signed_contract: 'Signed contract',
  bank_info: 'Bank info (payroll)',
  id_tax: 'ID & tax docs',
};

export default function AttachmentsModal({ uid, open, onClose }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  async function loadUploads() {
    if (!uid) return;
    setLoading(true);
    try {
      // userOnboarding/<uid>/uploads
      const snap = await getDocs(collection(db, 'userOnboarding', uid, 'uploads'));
      const list = await Promise.all(
        snap.docs.map(async d => {
          const data = d.data(); // { kind, path, uploadedAt }
          // path looks like: onboarding/<uid>/<kind>/<filename>.pdf
          let url = '';
          try { url = await getDownloadURL(storageRef(storage, data.path)); } catch {}
          return { id: d.id, ...data, url };
        })
      );
      list.sort((a, b) => (b.uploadedAt?.seconds || 0) - (a.uploadedAt?.seconds || 0));
      setRows(list);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open || !uid) return;
    loadUploads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, uid]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* dialog */}
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-3xl bg-white rounded-xl shadow-xl overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <h2 className="font-semibold">
              Attachments
            </h2>
            <button className="px-3 py-1.5 rounded-lg border" onClick={onClose}>
              Close
            </button>
          </div>

          <div className="p-4">
            <div className="rounded-xl border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3">Type</th>
                    <th className="text-left px-4 py-3">File</th>
                    <th className="text-left px-4 py-3">Uploaded</th>
                    <th className="text-right px-4 py-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td className="px-4 py-6" colSpan={4}>Loading…</td></tr>
                  ) : rows.length === 0 ? (
                    <tr><td className="px-4 py-6 text-red-600" colSpan={4}>No attachments.</td></tr>
                  ) : rows.map(r => (
                    <tr key={r.id} className="border-b">
                      <td className="px-4 py-3">{LABELS[r.kind] || r.kind}</td>
                      <td className="px-4 py-3 truncate">{r.path.split('/').slice(-1)[0]}</td>
                      <td className="px-4 py-3">
                        {r.uploadedAt?.seconds
                          ? new Date(r.uploadedAt.seconds * 1000).toLocaleString()
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {r.url
                          ? <a href={r.url} className="text-blue-600 underline" target="_blank" rel="noreferrer">Download</a>
                          : <span className="text-gray-400">Unavailable</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
