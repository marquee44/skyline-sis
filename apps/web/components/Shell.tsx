'use client';

import { usePathname, useRouter } from 'next/navigation';
import { setToken } from '@/lib/api';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: '◳' },
  { href: '/pipeline', label: 'Pipeline', icon: '⤜' },
  { href: '/students', label: 'Students', icon: '👥' },
  { href: '/applicants', label: 'Applicants', icon: '✎' },
  { href: '/reports', label: 'Reports', icon: '📊' },
  { href: '/catalog', label: 'Catalog', icon: '📚' },
  { href: '/advisors', label: 'Advisors', icon: '🗓' },
  { href: '/account', label: 'Account', icon: '⚙' },
];

/**
 * Shared dark app shell — a fixed sidebar + topbar wrapping every staff page so
 * the whole admin feels like one product. Pages render their content as children.
 */
export function Shell({ title, subtitle, actions, children }: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const isActive = (href: string) => pathname === href || (href !== '/dashboard' && pathname.startsWith(href));

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-56 flex-col border-r border-slate-800/80 bg-slate-900/70 p-4 md:flex">
        <a href="/dashboard" className="mb-6 flex items-center gap-2 px-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-purple-500 to-indigo-600 text-sm font-bold">S</span>
          <span className="text-lg font-semibold">Skyline</span>
        </a>
        <nav className="flex-1 space-y-1">
          {NAV.map((n) => (
            <a
              key={n.href}
              href={n.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                isActive(n.href) ? 'bg-purple-600/20 font-medium text-white' : 'text-slate-400 hover:bg-slate-800/70 hover:text-white'
              }`}
            >
              <span className="w-5 text-center text-base">{n.icon}</span>
              {n.label}
            </a>
          ))}
        </nav>
        <button onClick={() => { setToken(null); router.push('/login'); }} className="rounded-lg px-3 py-2 text-left text-sm text-slate-500 hover:bg-slate-800/70 hover:text-white">
          ⏻ Sign out
        </button>
      </aside>

      {/* Main */}
      <div className="md:pl-56">
        <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 bg-slate-950/80 px-6 py-4 backdrop-blur">
          <div>
            <h1 className="text-xl font-bold">{title}</h1>
            {subtitle && <p className="text-sm text-slate-400">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-3">
            {actions}
            {/* compact nav for small screens */}
            <nav className="flex gap-3 text-xs text-slate-400 md:hidden">
              <a href="/dashboard" className="hover:text-white">Dash</a>
              <a href="/students" className="hover:text-white">Students</a>
              <a href="/applicants" className="hover:text-white">Applicants</a>
            </nav>
          </div>
        </header>
        <main className="px-6 py-6">{children}</main>
      </div>
    </div>
  );
}

/** A dark card used across the app. */
export function Card({ title, action, children, className = '' }: { title?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-slate-800 bg-slate-900/60 p-4 ${className}`}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between">
          {title && <h2 className="text-sm font-semibold text-slate-200">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

// Shared input/button classes for dark forms.
export const dInput = 'rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-purple-500 focus:outline-none';
export const dBtn = 'rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white hover:bg-purple-500 disabled:opacity-50';
export const dBtnGhost = 'rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800';
export const pill = (cls: string) => `rounded-full px-2 py-0.5 text-xs font-medium ${cls}`;
