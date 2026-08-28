import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gradient-to-b from-brand-50 to-white px-4 text-center">
      <h1 className="text-4xl font-bold tracking-tight text-brand-900 sm:text-5xl">LearnAI</h1>
      <p className="max-w-xl text-lg text-slate-600">
        AI-powered learning and assessment platform that identifies your knowledge gaps and tells you
        exactly what to study next.
      </p>
      <div className="flex gap-4">
        <Link
          href="/login"
          className="focus-ring rounded-lg bg-brand-600 px-6 py-3 font-medium text-white transition hover:bg-brand-700"
        >
          Log in
        </Link>
        <Link
          href="/register"
          className="focus-ring rounded-lg border border-brand-600 px-6 py-3 font-medium text-brand-700 transition hover:bg-brand-50"
        >
          Create an account
        </Link>
      </div>
    </main>
  );
}
