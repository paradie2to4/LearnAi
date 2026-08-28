'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode } from 'react';
import clsx from 'clsx';
import { useAuth } from '../lib/auth-context';
import { Button } from './ui/button';

interface NavLink {
  href: string;
  label: string;
  roles?: Array<'STUDENT' | 'INSTRUCTOR' | 'ADMIN'>;
}

const NAV_LINKS: NavLink[] = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/courses', label: 'Courses' },
  { href: '/progress', label: 'Progress', roles: ['STUDENT'] },
  { href: '/recommendations', label: 'Recommendations', roles: ['STUDENT'] },
  { href: '/ai-assistant', label: 'AI Assistant', roles: ['STUDENT'] },
  { href: '/instructor', label: 'Instructor', roles: ['INSTRUCTOR', 'ADMIN'] },
  { href: '/admin', label: 'Admin', roles: ['ADMIN'] },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  const visibleLinks = NAV_LINKS.filter((link) => !link.roles || (user && link.roles.includes(user.role as any)));

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href="/dashboard" className="text-lg font-bold text-brand-700">
            LearnAI
          </Link>
          <nav className="hidden gap-1 md:flex" aria-label="Main navigation">
            {visibleLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={pathname.startsWith(link.href) ? 'page' : undefined}
                className={clsx(
                  'focus-ring rounded-md px-3 py-2 text-sm font-medium transition',
                  pathname.startsWith(link.href)
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-slate-600 hover:bg-slate-100',
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            {user && (
              <span className="hidden text-sm text-slate-500 sm:inline">
                {user.firstName} {user.lastName}
              </span>
            )}
            <Button variant="ghost" size="sm" onClick={() => logout()}>
              Log out
            </Button>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto border-t border-slate-100 px-4 py-2 md:hidden" aria-label="Main navigation">
          {visibleLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={clsx(
                'focus-ring whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium',
                pathname.startsWith(link.href) ? 'bg-brand-50 text-brand-700' : 'text-slate-600',
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
