'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

const COMPLETION_KEY = 'orientation_welcome-video';
const THIS_ROUTE = '/onboarding/orientation/welcome-video';

function toEmbed(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    // youtube watch → embed
    if ((u.hostname.includes('youtube.com') || u.hostname.includes('youtu.be'))) {
      // youtu.be/<id>
      if (u.hostname === 'youtu.be' && u.pathname.length > 1) {
        return `https://www.youtube.com/embed/${u.pathname.slice(1)}`;
      }
      // youtube.com/watch?v=<id>
      const id = u.searchParams.get('v');
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
    return url; // non-youtube or already embed
  } catch {
    return url;
  }
}

export default function WelcomeVideoPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [saving, setSaving] = useState(false);
  const [alreadyDone, setAlreadyDone] = useState(false);
  const [videoUrl, setVideoUrl] = useState('');
  const [loading, setLoading] = useState(true);

  // auth + task done?
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u || null);
      if (u) {
        const tRef = doc(db, 'userOnboarding', u.uid, 'tasks', COMPLETION_KEY);
        const snap = await getDoc(tRef);
        setAlreadyDone(snap.exists() && snap.data()?.status === 'done');
      }
    });
    return () => unsub();
  }, []);

  // fetch video url from Firestore
  useEffect(() => {
    async function fetchVideo() {
      try {
        const stepRef = doc(db, 'onboarding', 'base', 'steps', 's2');
        const stepSnap = await getDoc(stepRef);
        if (stepSnap.exists()) {
          const data = stepSnap.data();
          const tasks = Array.isArray(data.tasks) ? data.tasks : [];
          const t =
            tasks.find(x => x?.id === 't5') ||
            tasks.find(x => x?.route === THIS_ROUTE) ||
            null;
          const url = t?.videoUrl || t?.url || '';
          setVideoUrl(toEmbed(url));
        }
      } catch (e) {
        console.error('Failed to load welcome video URL:', e);
      } finally {
        setLoading(false);
      }
    }
    fetchVideo();
  }, []);

  async function markDone() {
    if (!user) return;
    setSaving(true);
    try {
      const tRef = doc(db, 'userOnboarding', user.uid, 'tasks', COMPLETION_KEY);
      await setDoc(
        tRef,
        { status: 'done', updatedAt: serverTimestamp() },
        { merge: true }
      );
      setAlreadyDone(true);
      router.push('/onboarding');
    } catch (e) {
      console.error(e);
      alert('Failed to save. See console.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="fixed inset-0 top-[64px] overflow-y-auto bg-white">
      <div className="mx-auto max-w-3xl p-6">
        <div className="w-full border rounded-2xl p-6">
          <h1 className="text-2xl font-bold mb-4">Watch Welcome Video</h1>
          <p className="text-gray-600 mb-4">
            Please watch the welcome video below, then click “Mark as Done”.
          </p>

          {/* Video */}
          <div className="aspect-video w-full mb-6">
            {loading ? (
              <div className="w-full h-full rounded-lg border bg-gray-50 flex items-center justify-center">
                Loading video…
              </div>
            ) : videoUrl ? (
              <iframe
                src={videoUrl}
                className="w-full h-full rounded-lg border"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                title="Welcome Video"
              />
            ) : (
              <div className="w-full h-full rounded-lg border bg-gray-50 flex items-center justify-center">
                <span className="text-gray-500">No video URL set in Firestore.</span>
              </div>
            )}
          </div>

          {!alreadyDone ? (
            <button
              onClick={markDone}
              disabled={!user || saving}
              className="px-5 py-2 rounded-lg bg-black text-white hover:opacity-90 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Mark as Done'}
            </button>
          ) : (
            <div className="text-green-600 font-medium">Already completed ✅</div>
          )}

          <button
            onClick={() => router.back()}
            className="ml-3 inline-flex px-4 py-2 rounded-lg border mt-4"
          >
            Back
          </button>
        </div>
      </div>
    </main>
  );
}
