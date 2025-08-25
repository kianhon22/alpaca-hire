'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { signInWithEmailAndPassword, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';

const ROLES = {
  EMPLOYEE: 'employee',
  MANAGER: 'departmentmanager',
  HR: 'companyhr',
};

function normalizeRole(raw) {
  if (!raw) return ROLES.EMPLOYEE;
  const r = String(raw).toLowerCase().trim();
  if (r === 'companyhr') return ROLES.HR;
  if (r === 'departmentmanager') return ROLES.MANAGER;
  if (r === 'employee') return ROLES.EMPLOYEE;
  return ROLES.EMPLOYEE;
}

// 🔧 Put your known emails here once.
// Anyone not listed falls back to "employee".
const ROLE_BY_EMAIL = {
  'hr@usm.com': 'companyHR',
  'manager@usm.com': 'departmentManager',
  // 'employee1@usm.com': 'employee',
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loadingBtn, setLoadingBtn] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) return;
      try {
        const userRef = doc(db, 'users', user.uid);
        const snap = await getDoc(userRef);

        if (!snap.exists()) {
          // 🔧 First time seen: create doc with mapped role (or default employee)
          const assignedRole = ROLE_BY_EMAIL[user.email?.toLowerCase()] || 'employee';

          await setDoc(userRef, {
            uid: user.uid,
            email: user.email,
            role: assignedRole,            // <- stored as "companyHR" | "departmentManager" | "employee"
            createdAt: new Date(),
            lastLogin: new Date(),
          });
        } else {
          // Seen before: just update lastLogin
          await setDoc(userRef, { lastLogin: new Date() }, { merge: true });
        }

        // Redirect by normalized role
        const data = (await getDoc(userRef)).data() || {};
        const role = normalizeRole(data.role);
        router.replace(role === ROLES.EMPLOYEE ? '/onboarding' : '/dashboard');
      } catch (e) {
        console.error('Post-login error:', e);
      }
    });
    return () => unsub();
  }, [router]);

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoadingBtn(true);
    setMessage('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      console.error('Auth error:', error);
      setMessage('Error: ' + error.message);
    } finally {
      setLoadingBtn(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-4 p-8 bg-white rounded-lg shadow-md">
        <div className="text-center">
          <Image src="/alpaca-hire-logo.png" alt="AlpacaHire Logo" width={120} height={120} className="mx-auto" priority />
          <h2 className="text-2xl font-bold text-[#2b99ff]">AlpacaHire</h2>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleAuth}>
          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">Company Email</label>
              <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                     className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm" />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">Password</label>
              <input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                     className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm" />
            </div>
          </div>

          {message && <div className="bg-blue-100 border border-blue-400 text-blue-700 px-4 py-3 rounded">{message}</div>}

          <div>
            <button type="submit" disabled={loadingBtn}
                    className="w-full py-2 px-4 rounded-md text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50">
              {loadingBtn ? 'Processing…' : 'Sign In'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
