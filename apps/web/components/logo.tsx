export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="learnai-logo-gradient" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#6366f1" />
          <stop offset="1" stopColor="#4338ca" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#learnai-logo-gradient)" />
      <path
        d="M9 20.5V11a1 1 0 0 1 1-1h1.2a1 1 0 0 1 1 1v7.5H16a1 1 0 0 1 1 1V21a1 1 0 0 1-1 1h-6a1 1 0 0 1-1-1v-.5Z"
        fill="white"
      />
      <circle cx="21.5" cy="11.5" r="2.5" fill="#5eead4" />
    </svg>
  );
}
