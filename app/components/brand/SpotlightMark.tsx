// Spotlight's own mark: a white star on an accent disc. The disc uses
// currentColor, so it follows the company brand color via CSS (--accent).
export default function SpotlightMark({
  size = 34,
  className = "tnav-mark-svg",
  title = "Spotlight",
}: {
  size?: number
  className?: string
  title?: string
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label={title}
    >
      <circle cx="32" cy="32" r="30" fill="currentColor" />
      <polygon
        points="32.00,13.00 36.97,26.15 51.02,26.82 40.06,35.61 43.75,49.18 32.00,41.47 20.25,49.18 23.94,35.61 12.98,26.82 27.03,26.15"
        fill="#ffffff"
        stroke="#ffffff"
        strokeWidth="2.6"
        strokeLinejoin="round"
      />
    </svg>
  )
}
