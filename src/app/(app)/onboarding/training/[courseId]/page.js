'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

export default function TrainingCoursePage() {
  const { courseId } = useParams();
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [course, setCourse] = useState(null);
  const [answers, setAnswers] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null); // {score, passed}

  // auth
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u || null));
    return () => unsub();
  }, []);

  // fetch course doc
  useEffect(() => {
    async function fetchCourse() {
      if (!courseId) return;
      const cRef = doc(db, 'onboarding', 'training', 'courses', courseId);
      const snap = await getDoc(cRef);
      if (snap.exists()) setCourse(snap.data());
    }
    fetchCourse();
  }, [courseId]);

  const questions = useMemo(() => course?.quiz?.questions ?? [], [course]);
  const passingScore = course?.quiz?.passingScore ?? 70;

  async function handleSubmit() {
    if (!user || !course) return;
    setSubmitting(true);
    try {
      let correct = 0;
      questions.forEach(q => {
        if (answers[q.id] === q.correctIndex) correct += 1;
      });
      const score = Math.round((correct / Math.max(1, questions.length)) * 100);
      const passed = score >= passingScore;
      setResult({ score, passed });

      // optional per-course progress
      const progressRef = doc(db, 'userOnboarding', user.uid, 'courses', courseId);
      await setDoc(progressRef, {
        bestScore: score,
        lastAttemptAt: serverTimestamp(),
        completedAt: passed ? serverTimestamp() : null,
      }, { merge: true });

      // only mark onboarding task as done if passed
      if (passed) {
        const taskRef = doc(db, 'userOnboarding', user.uid, 'tasks', `training_${courseId}`);
        await setDoc(taskRef, { status: 'done', score, updatedAt: serverTimestamp() }, { merge: true });
      }
    } catch (e) {
      console.error(e);
      alert('Failed to submit quiz. See console.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!course) {
    return <main className="min-h-screen p-6 flex items-center justify-center">Loading course…</main>;
  }

  return (
    <main className="min-h-screen w-full p-6 flex items-center justify-center bg-white overflow-x-hidden">
      <div className="w-full max-w-3xl border rounded-2xl p-6">
        <h1 className="text-2xl font-bold">{course.title}</h1>
        <p className="text-gray-600 mb-6">{course.description}</p>

        {/* Notes */}
        {Array.isArray(course.content) && course.content.length > 0 && (
          <div className="space-y-4 mb-8">
            {course.content.map(sec => (
              <section key={sec.id} className="border rounded-lg p-4 bg-gray-50">
                <h2 className="font-semibold mb-1">{sec.heading}</h2>
                <p className="whitespace-pre-line text-gray-700">{sec.body}</p>
              </section>
            ))}
          </div>
        )}

        {/* Quiz */}
        {questions.length > 0 && (
          <div className="border rounded-xl p-4">
            <h3 className="font-semibold mb-2">Quick Quiz (pass ≥ {passingScore}%)</h3>
            <div className="space-y-4">
              {questions.map((q, idx) => (
                <div key={q.id}>
                  <p className="font-medium mb-1">{idx + 1}. {q.text}</p>
                  <div className="space-y-1">
                    {q.options.map((opt, i) => (
                      <label key={i} className="flex items-center gap-2">
                        <input
                          type="radio"
                          name={q.id}
                          checked={answers[q.id] === i}
                          onChange={() => setAnswers(a => ({ ...a, [q.id]: i }))}
                        />
                        <span>{opt}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={handleSubmit}
                disabled={submitting || !user}
                className="px-5 py-2 rounded-lg bg-black text-white hover:opacity-90 disabled:opacity-50"
              >
                {submitting ? 'Submitting…' : 'Submit Quiz'}
              </button>
              <button onClick={() => router.back()} className="px-4 py-2 rounded-lg border">Back</button>
            </div>

            {result && (
              <div className={`mt-4 font-medium ${result.passed ? 'text-green-600' : 'text-red-600'}`}>
                Score: {result.score}% — {result.passed ? 'Passed ✅ (task marked complete)' : 'Try again ❌'}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
