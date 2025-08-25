'use client';

import NavigationBar from '../../components/NavigationBar';

export default function AppLayout({ children }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <NavigationBar />
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
