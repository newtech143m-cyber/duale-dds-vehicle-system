/** Neutral emblem (no official seal reproduced — replace with the Bureau's approved logo). */
export function Emblem({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden>
      <rect width="40" height="40" rx="10" fill="#0b1b36" />
      <path d="M9 24.5 12.5 16a3 3 0 0 1 2.8-1.9h9.4a3 3 0 0 1 2.8 1.9L31 24.5v4a1.5 1.5 0 0 1-1.5 1.5h-1.6a1.5 1.5 0 0 1-1.5-1.5V27H13.6v1.5a1.5 1.5 0 0 1-1.5 1.5h-1.6A1.5 1.5 0 0 1 9 28.5z" fill="#129a9a" />
      <circle cx="14" cy="23.2" r="1.6" fill="#fff" />
      <circle cx="26" cy="23.2" r="1.6" fill="#fff" />
      <path d="M14.2 20.5 15.8 17h8.4l1.6 3.5z" fill="#0b1b36" opacity=".55" />
    </svg>
  );
}
