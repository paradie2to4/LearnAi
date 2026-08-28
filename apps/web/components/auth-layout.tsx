import Link from 'next/link';
import { ReactNode } from 'react';
import { Logo } from './logo';

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
  maxWidthClassName = 'max-w-sm',
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
  maxWidthClassName?: string;
}) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-50 px-4 py-10">
      <div className="absolute inset-0 bg-grid-slate [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,black,transparent)]" />
      <div className="absolute -top-32 left-1/2 h-96 w-[36rem] -translate-x-1/2 rounded-full bg-brand-200/30 blur-3xl" />
      <div className={`relative w-full ${maxWidthClassName} animate-slide-up rounded-2xl border border-slate-200/80 bg-white p-8 shadow-card`}>
        <Link href="/" className="focus-ring mb-6 flex items-center justify-center gap-2 rounded-md">
          <Logo className="h-8 w-8" />
          <span className="text-lg font-bold tracking-tight text-slate-900">LearnAI</span>
        </Link>
        <h1 className="text-center text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
        <p className="mt-1 text-center text-sm text-slate-500">{subtitle}</p>
        <div className="mt-6">{children}</div>
        <div className="mt-6 text-center text-sm text-slate-500">{footer}</div>
      </div>
    </main>
  );
}

export const inputClassName =
  'focus-ring mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-soft transition placeholder:text-slate-400';
