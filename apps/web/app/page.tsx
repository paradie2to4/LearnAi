import Link from 'next/link';
import { Logo } from '../components/logo';

const FEATURES = [
  {
    title: 'Knowledge gap detection',
    description:
      'Every quiz attempt updates your per-topic mastery. Fall below threshold on a topic and it surfaces automatically — ranked by severity, not guesswork.',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
      />
    ),
  },
  {
    title: 'AI-generated quizzes',
    description:
      'Instructors describe a topic and difficulty; the AI drafts questions for review. Nothing publishes to students until an instructor approves it.',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z"
      />
    ),
  },
  {
    title: 'Personalized study plans',
    description:
      'Weak topics feed a recommendation engine that sequences what to review next — with plain-language explanations, not just a percentage.',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25"
      />
    ),
  },
  {
    title: 'Progress you can see',
    description:
      'Streaks, course completion, and topic mastery in one dashboard — so both students and instructors know exactly where things stand.',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z"
      />
    ),
  },
];

const STEPS = [
  { label: 'Take a quiz', detail: 'Scored instantly, server-side.' },
  { label: 'Mastery updates', detail: 'Per-topic, weighted toward recent attempts.' },
  { label: 'Gaps surface', detail: 'Ranked by severity, not by last score.' },
  { label: 'Get a plan', detail: 'AI explains what to study and why.' },
];

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="border-b border-slate-200/70">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-2">
            <Logo className="h-8 w-8" />
            <span className="text-lg font-bold tracking-tight text-slate-900">LearnAI</span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="focus-ring rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition hover:text-slate-900"
            >
              Log in
            </Link>
            <Link
              href="/register"
              className="focus-ring rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-soft transition hover:bg-brand-700 hover:shadow-lifted"
            >
              Get started
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-grid-slate [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,black,transparent)]" />
          <div className="absolute -top-24 left-1/2 h-96 w-[36rem] -translate-x-1/2 rounded-full bg-brand-200/40 blur-3xl" />
          <div className="relative mx-auto flex max-w-4xl flex-col items-center gap-6 px-4 py-20 text-center sm:py-28">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 ring-1 ring-inset ring-brand-200">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
              AI-powered learning
            </span>
            <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-6xl">
              Know exactly what to <span className="text-brand-600">study next</span>
            </h1>
            <p className="max-w-2xl text-lg leading-relaxed text-slate-600">
              LearnAI continuously analyzes your quiz performance, finds the topics dragging you down, and
              turns that into a personalized, AI-explained study plan — not just another percentage score.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href="/register"
                className="focus-ring rounded-lg bg-brand-600 px-6 py-3 font-medium text-white shadow-soft transition hover:bg-brand-700 hover:shadow-lifted"
              >
                Create an account
              </Link>
              <Link
                href="/login"
                className="focus-ring rounded-lg border border-slate-300 bg-white px-6 py-3 font-medium text-slate-700 shadow-soft transition hover:border-slate-400"
              >
                Log in
              </Link>
            </div>
          </div>
        </section>

        <section className="border-t border-slate-200/70 bg-slate-50/60 py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map((feature) => (
                <div
                  key={feature.title}
                  className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-soft transition hover:-translate-y-0.5 hover:shadow-card"
                >
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5">
                      {feature.icon}
                    </svg>
                  </div>
                  <h3 className="text-sm font-semibold text-slate-900">{feature.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-16 sm:py-20">
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <h2 className="text-center text-2xl font-bold tracking-tight text-slate-900">
              From quiz attempt to study plan, automatically
            </h2>
            <div className="mt-10 grid gap-6 sm:grid-cols-4">
              {STEPS.map((step, i) => (
                <div key={step.label} className="relative flex flex-col items-center text-center">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white shadow-soft">
                    {i + 1}
                  </div>
                  <p className="mt-3 text-sm font-semibold text-slate-900">{step.label}</p>
                  <p className="mt-1 text-xs text-slate-500">{step.detail}</p>
                  {i < STEPS.length - 1 && (
                    <div className="absolute right-[-1.5rem] top-4 hidden h-px w-12 bg-slate-200 sm:block" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200/70 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-4 text-center text-sm text-slate-400 sm:px-6">
          <div className="flex items-center gap-2">
            <Logo className="h-5 w-5" />
            <span className="font-medium text-slate-500">LearnAI</span>
          </div>
          <p>A full-stack engineering sample — NestJS, Next.js, PostgreSQL, RabbitMQ, and Claude.</p>
        </div>
      </footer>
    </div>
  );
}
