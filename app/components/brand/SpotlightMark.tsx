// Spotlight's mark: a light star on a dark disc with a thin ring, drawn from
// the company palette (CSS variables), so it matches the generated app icons
// (lib/iconSvg.ts). Same geometry as the icon.
import { MARK_STAR_POINTS } from "@/lib/iconSvg"

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
    <svg className={className} width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={title}>
      <circle cx="32" cy="32" r="30" style={{ fill: "var(--primary-strong)" }} />
      <circle cx="32" cy="32" r="27" style={{ fill: "none", stroke: "var(--muted-on-dark)", strokeWidth: 2 }} />
      <polygon
        points={MARK_STAR_POINTS}
        style={{ fill: "var(--card)", stroke: "var(--card)", strokeWidth: 2.6, strokeLinejoin: "round" }}
      />
    </svg>
  )
}
