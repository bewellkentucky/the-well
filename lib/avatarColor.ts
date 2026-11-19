// Avatar fallback color class, derived from a stable hash of the email (or
// name). Front-end only. No per-person table: Spotlight holds no hard-coded
// staff data.
const COLORS = ["", "moss", "violet", "ink", "coral", "fern"] as const

export function avatarColor(key: string): string {
  let h = 0
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) & 0xffff
  return COLORS[h % COLORS.length]
}
