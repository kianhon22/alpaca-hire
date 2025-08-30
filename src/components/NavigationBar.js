'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';

import * as NavMenu from '@radix-ui/react-navigation-menu';
import { ChevronDown } from 'lucide-react';

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
  // { key: 'about', label: 'About', href: '/about', roles: [...] } // handled as dropdown below
];

export default function NavigationBar() {
  const pathname = usePathname();
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
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
    if (loading || !role) return;
    const inVisibleTabs = visibleTabs.some(
      t => pathname === t.href || pathname?.startsWith(t.href + '/')
    ) || pathname?.startsWith('/about'); // allow About pages
    if (!inVisibleTabs && preferredLanding) {
      router.replace(preferredLanding);
    }
  }, [loading, pathname, visibleTabs, preferredLanding, router, role]);

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
    <header className="w-full border-b bg-white relative z-50">
      <div className="mx-auto max-w-7xl px-4">
        <div className="h-16 flex items-center justify-between gap-4">
          {/* Brand → preferred landing */}
          <Link href={preferredLanding} className="flex items-center gap-2">
            <Image src="/alpaca-hire-logo.png" alt="AlpacaHire" width={32} height={32} className="rounded" priority />
            <span className="text-xl font-semibold text-[#2b99ff]">AlpacaHire</span>
          </Link>

          {/* NAV (desktop) */}
          <NavMenu.Root className="hidden md:flex relative z-50">
            <NavMenu.List className="flex items-center gap-1">
              {visibleTabs.map(tab => (
                <NavMenu.Item key={tab.key}>
                  <NavMenu.Link asChild>
                    <Link
                      href={tab.href}
                      className={[
                        'px-3 py-2 rounded-md text-sm font-medium transition',
                        isActive(tab.href)
                          ? 'bg-[#e9f4ff] text-[#2b99ff]'
                          : 'text-gray-700 hover:bg-gray-100'
                      ].join(' ')}
                    >
                      {tab.label}
                    </Link>
                  </NavMenu.Link>
                </NavMenu.Item>
              ))}

                 {/* About */}
                <NavMenu.Item className="relative">
                  <NavMenu.Trigger className="group inline-flex items-center gap-1 px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-100 data-[state=open]:bg-[#e9f4ff] data-[state=open]:text-[#2b99ff]">
                    About
                    <svg className="size-4 transition-transform duration-200 group-data-[state=open]:rotate-180" viewBox="0 0 24 24">
                      <path d="M7 10l5 5 5-5" fill="currentColor" />
                    </svg>
                  </NavMenu.Trigger>

                  {/* This will now sit directly under the About trigger */}
                  <NavMenu.Content className="absolute top-full left-0 mt-2 rounded-lg border bg-white p-2 shadow-xl z-[60]">
                    <ul className="grid min-w-[220px] gap-1">
                      <li><NavMenu.Link asChild><Link className="block rounded-md px-3 py-2 text-sm hover:bg-gray-100" href="/about/background">Background</Link></NavMenu.Link></li>
                      <li><NavMenu.Link asChild><Link className="block rounded-md px-3 py-2 text-sm hover:bg-gray-100" href="/about/culture">Culture</Link></NavMenu.Link></li>
                      <li><NavMenu.Link asChild><Link className="block rounded-md px-3 py-2 text-sm hover:bg-gray-100" href="/about/department">Department</Link></NavMenu.Link></li>
                    </ul>
                  </NavMenu.Content>
                </NavMenu.Item>
              </NavMenu.List>
            </NavMenu.Root>

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

        {/* NAV (mobile) — simple stack incl. About links */}
        <nav className="md:hidden pb-3 flex flex-wrap items-center gap-2">
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
          <div className="flex flex-col gap-1 basis-full mt-1">
            <span className="px-3 py-2 text-sm font-medium text-gray-700">About</span>
            <div className="pl-2 flex gap-2">
              <Link href="/about/background" className="px-3 py-2 rounded-md text-sm text-gray-700 hover:bg-gray-100">
                Background
              </Link>
              <Link href="/about/culture" className="px-3 py-2 rounded-md text-sm text-gray-700 hover:bg-gray-100">
                Culture
              </Link>
              <Link href="/about/department" className="px-3 py-2 rounded-md text-sm text-gray-700 hover:bg-gray-100">
                Department
              </Link>
            </div>
          </div>
        </nav>
      </div>
    </header>
  );
}
