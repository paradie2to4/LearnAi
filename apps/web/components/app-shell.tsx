'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode } from 'react';
import clsx from 'clsx';
import { useAuth } from '../lib/auth-context';
import { Button } from './ui/button';
import { Logo } from './logo';

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

function initials(firstName?: string, lastName?: string) {
  return `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase() || '?';
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  const visibleLinks = NAV_LINKS.filter((link) => !link.roles || (user && link.roles.includes(user.role as any)));

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/dashboard" className="focus-ring flex items-center gap-2 rounded-md">
            <Logo className="h-8 w-8" />
            <span className="text-lg font-bold tracking-tight text-slate-900">LearnAI</span>
          </Link>
          <nav className="hidden gap-1 md:flex" aria-label="Main navigation">
            {visibleLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={pathname.startsWith(link.href) ? 'page' : undefined}
                className={clsx(
                  'focus-ring rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  pathname.startsWith(link.href)
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            {user && (
              <div className="hidden items-center gap-2 sm:flex">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700 ring-1 ring-inset ring-brand-200">
                  {initials(user.firstName, user.lastName)}
                </span>
                <span className="text-sm font-medium text-slate-700">
                  {user.firstName} {user.lastName}
                </span>
              </div>
            )}
            <Button variant="ghost" size="sm" onClick={() => logout()}>
              Log out
            </Button>
          </div>
        </div>
        <nav
          className="scroll-thin flex gap-1 overflow-x-auto border-t border-slate-100 px-4 py-2 md:hidden"
          aria-label="Main navigation"
        >
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
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 animate-fade-in">{children}</main>
    </div>
  );
}
