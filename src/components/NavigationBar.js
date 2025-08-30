'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

/** Canonical role ids (keep these all lowercase) */
const ROLES = {
  EMPLOYEE: 'employee',
  MANAGER: 'departmentmanager',
  HR: 'companyhr',
  APPLICANT: 'applicant',
};

/** Make any Firestore role string consistent with our constants */
function normalizeRole(raw) {
  if (!raw) return ROLES.EMPLOYEE;
  const r = String(raw).toLowerCase().trim();
  if (r === 'companyhr' || r === 'company-hr' || r === 'hr') return ROLES.HR;
  if (r === 'departmentmanager' || r === 'deptmanager' || r === 'manager') return ROLES.MANAGER;
  if (r === 'applicant' || r === 'candidate') return ROLES.APPLICANT;
  if (r === 'employee') return ROLES.EMPLOYEE;
  return ROLES.EMPLOYEE;
}

const tabs = [
  { key: 'dashboard',  label: 'Dashboard',  href: '/dashboard',  roles: [ROLES.MANAGER, ROLES.HR] },
  { key: 'talent',     label: 'Talent',     href: '/talent',     roles: [ROLES.MANAGER, ROLES.HR] },
  { key: 'onboarding', label: 'Onboarding', href: '/onboarding', roles: [ROLES.EMPLOYEE, ROLES.MANAGER, ROLES.HR] },
  { key: 'applicantDashboard',       label: 'Dashboard',       href: '/applicantDashboard',       roles: [ROLES.APPLICANT] },
  { key: 'jobs',       label: 'Job Search',       href: '/jobs',       roles: [ROLES.APPLICANT] },
];

export default function NavigationBar() {
  const pathname = usePathname();
  const router = useRouter();

  const [user, setUser]   = useState(null);
  const [role, setRole]   = useState(null);
  const [loading, setLoading] = useState(true);

  // Load auth + role from Firestore
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (!u) {
        setRole(null);
        setLoading(false);
        router.push('/login');
        return;
      }
      try {
        const snap = await getDoc(doc(db, 'users', u.uid));
        const data = snap.exists() ? snap.data() : {};
        setRole(normalizeRole(data.role));
        console.log('Loaded role from Firestore:', data.role, '→', normalizeRole(data.role));
      } catch (e) {
        console.error('Role load error:', e);
        setRole(ROLES.EMPLOYEE);
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, [router]);

  // Visible tabs given the role
  const visibleTabs = useMemo(() => {
    if (!role) return [];
    return tabs.filter(t => t.roles.includes(role));
  }, [role]);

  // Preferred landing: HR/Manager -> /dashboard, Employee -> /onboarding, Applicant -> applicantDashboard
  let preferredLanding = '/dashboard';
  if (role === ROLES.EMPLOYEE) preferredLanding = '/onboarding';
  if (role === ROLES.APPLICANT) preferredLanding = '/applicantDashboard';

  const isActive = (href) =>
    pathname && (pathname === href || pathname.startsWith(href + '/'));

  // Soft-guard: if current path is not in visible tabs, push to preferred landing
  useEffect(() => {
    if (loading) return;

    const inVisibleTabs = visibleTabs.some(
      t => pathname === t.href || pathname?.startsWith(t.href + '/')
    );

    if (!inVisibleTabs && preferredLanding) {
      router.replace(preferredLanding);
    }
  }, [loading, pathname, visibleTabs, preferredLanding, router]);

  const handleSignOut = async () => {
    await signOut(auth);
    router.push('/login');
  };

  if (loading || !user) {
    return (
      <div className="w-full border-b bg-white">
        <div className="mx-auto max-w-7xl px-4 h-16 flex items-center justify-between">
          <div className="h-7 w-28 bg-gray-200 rounded" />
          <div className="h-8 w-24 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  return (
    <header className="w-full border-b bg-white">
      <div className="mx-auto max-w-7xl px-4">
        <div className="h-16 flex items-center justify-between gap-4">
          {/* Brand → preferred landing */}
          <Link href={preferredLanding} className="flex items-center gap-2">
            <Image src="/alpaca-hire-logo.png" alt="AlpacaHire" width={32} height={32} className="rounded" priority />
            <span className="text-xl font-semibold text-[#2b99ff]">AlpacaHire</span>
          </Link>

          {/* Tabs (desktop) */}
          <nav className="hidden md:flex items-center gap-2">
            {visibleTabs.map(tab => (
              <Link
                key={tab.key}
                href={tab.href}
                className={[
                  'px-3 py-2 rounded-md text-sm font-medium',
                  isActive(tab.href) ? 'bg-[#e9f4ff] text-[#2b99ff]' : 'text-gray-700 hover:bg-gray-100'
                ].join(' ')}
              >
                {tab.label}
              </Link>
            ))}
          </nav>

          {/* User box */}
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-sm font-medium text-gray-900">{user.email}</div>
              <div className="text-xs text-gray-500">{role}</div>
            </div>
            <button
              onClick={handleSignOut}
              className="inline-flex items-center px-3 py-2 text-sm font-medium rounded-md bg-red-600 text-white hover:bg-red-700"
            >
              Sign Out
            </button>
          </div>
        </div>

        {/* Tabs (mobile) */}
        <nav className="md:hidden pb-3 flex items-center gap-2">
          {visibleTabs.map(tab => (
            <Link
              key={tab.key}
              href={tab.href}
              className={[
                'px-3 py-2 rounded-md text-sm font-medium',
                isActive(tab.href) ? 'bg-[#e9f4ff] text-[#2b99ff]' : 'text-gray-700 hover:bg-gray-100'
              ].join(' ')}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
