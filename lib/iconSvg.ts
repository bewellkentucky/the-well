// App icon artwork from a company palette. Plain module. Colors come from a
// validated Theme only (lib/theme.ts), so nothing else reaches the SVG.
import type { Theme } from "@/lib/theme"

export const MARK_STAR_POINTS =
  "32.00,13.00 36.97,26.15 51.02,26.82 40.06,35.61 43.75,49.18 32.00,41.47 20.25,49.18 23.94,35.61 12.98,26.82 27.03,26.15"

/**
 * Square icon: primary background, darkest disc, thin muted ring, light star.
 * maskable = full-bleed with the mark inside the 80% safe zone.
 */
export function iconSvg(t: Theme, opts: { maskable?: boolean } = {}): string {
  const inner = opts.maskable
    ? `<g transform="translate(9.6 9.6) scale(0.7)">`
    : `<g transform="translate(4 4) scale(0.875)">`
  const radius = opts.maskable ? 0 : 14
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="512" height="512">`,
    `<rect width="64" height="64" rx="${radius}" fill="${t.primary}"/>`,
    inner,
    `<circle cx="32" cy="32" r="30" fill="${t.primaryStrong}"/>`,
    `<circle cx="32" cy="32" r="27" fill="none" stroke="${t.mutedOnDark}" stroke-width="2"/>`,
    `<polygon points="${MARK_STAR_POINTS}" fill="${t.card}" stroke="${t.card}" stroke-width="2.6" stroke-linejoin="round"/>`,
    `</g></svg>`,
  ].join("")
}
