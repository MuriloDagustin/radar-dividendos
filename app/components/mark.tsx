/** The wordmark glyph: a radar sweep, drawn in the current text colour. */
export function Mark({ className }: { className?: string | undefined }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9.5" />
      <path d="M12 12 19.2 6.2" />
      <path d="M5 15.6a8 8 0 0 0 7 4.9" />
      <circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none" />
    </svg>
  );
}
