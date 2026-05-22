// Avatar color classes by email — front-end only, matches prototype avatarStyles.
// Default (empty string) renders the honey→coral gradient.
const AVATAR_COLORS: Record<string, string> = {
  "justin.wallen@bewellkentucky.com":   "",
  "alecia.williams@bewellkentucky.com": "",
  "callie.ernspiker@bewellkentucky.com": "",
  "megan.abrams@bewellkentucky.com":   "",
  "brenda.bruckner@bewellkentucky.com": "",
  "melissa.gibson@bewellkentucky.com":  "plum",
  "hayley.meadows@bewellkentucky.com":  "olive",
  "tom.bivona@bewellkentucky.com":      "ink",
  "bryn.krivashei@bewellkentucky.com":  "olive",
  "emily.swartz@bewellkentucky.com":    "coral",
  "brenda.hall@bewellkentucky.com":     "plum",
}

const FALLBACK_COLORS = ["", "olive", "plum", "ink", "coral", "sage"] as const

function hashColor(email: string): string {
  let h = 0
  for (const c of email) h = (h * 31 + c.charCodeAt(0)) & 0xffff
  return FALLBACK_COLORS[h % FALLBACK_COLORS.length]
}

export function avatarColor(email: string): string {
  return email in AVATAR_COLORS ? AVATAR_COLORS[email] : hashColor(email)
}
