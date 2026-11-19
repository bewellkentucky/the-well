// Product-level names and labels. Plain constants (no "use server"), safe to
// import from server and client components.

export const PRODUCT_NAME = "Spotlight"
export const PRODUCT_TAGLINE = "Recognition for teams that care"

// Spotlight's own default look (used when a company has not set a brand color).
export const DEFAULT_BRAND_COLOR = "#c2410c"

// ── Currency ───────────────────────────────────────────────────────────────
export const STAR = "⭐"
export const CURRENCY_ONE = "star"
export const CURRENCY_MANY = "stars"

/** "25 ⭐". The only way the app should print an amount. */
export function formatStars(n: number): string {
  return `${n.toLocaleString("en-US")} ${STAR}`
}

/** "1 star" / "25 stars" for sentences. */
export function starsWord(n: number): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? CURRENCY_ONE : CURRENCY_MANY}`
}

// ── Pile on ────────────────────────────────────────────────────────────────
// The label lives here so it can be renamed in one place.
export const PILE_ON_LABEL = "Pile on"
export const PILE_ON_STEP = 5
export const PILE_ON_MAX_TAPS = 5
export const PILE_ON_CAP = PILE_ON_STEP * PILE_ON_MAX_TAPS // 25 per person per kudo
export const PILE_ON_BUTTON = `${PILE_ON_LABEL} +${PILE_ON_STEP} ${STAR}`

// ── Reactions ──────────────────────────────────────────────────────────────
// ⭐ leads. Pile on is a separate, visually distinct control.
export const REACTION_CHOICES = ["⭐", "💛", "🙌", "🎉", "👏", "🔥", "💯", "🙏", "✨", "❤️"] as const

// ── Composer ───────────────────────────────────────────────────────────────
export const PATIENT_NOTICE = "No patient names or details"

// ── Company values (exactly six, verbatim) ─────────────────────────────────
export const COMPANY_VALUES = [
  { label: "Compassion", emoji: "💛" },
  { label: "Ownership", emoji: "🛠️" },
  { label: "Curiosity", emoji: "🔍" },
  { label: "Team-First", emoji: "🤝" },
  { label: "Excellence", emoji: "✨" },
  { label: "Above & Beyond", emoji: "🌟" },
] as const
export const COMPANY_VALUE_NAMES: readonly string[] = COMPANY_VALUES.map((v) => v.label)
