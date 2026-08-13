/**
 * Inline rather than from an icon package: one glyph is not worth a dependency.
 * `currentColor` so the button's variant decides the colour.
 */
export function TrashIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 7h16" />
      <path d="M10 11v6M14 11v6" />
      <path d="M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12" />
      <path d="M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2" />
    </svg>
  )
}
