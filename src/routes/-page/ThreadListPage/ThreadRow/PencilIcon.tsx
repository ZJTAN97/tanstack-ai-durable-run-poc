/**
 * Inline rather than from an icon package: one glyph is not worth a dependency.
 * `currentColor` so the button's variant decides the colour.
 */
export function PencilIcon() {
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
      <path d="M4 20h4l10-10a2.83 2.83 0 10-4-4L4 16v4z" />
      <path d="M13.5 6.5l4 4" />
    </svg>
  )
}
