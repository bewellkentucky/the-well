// Per-company color palette. Plain module (server and client).
//
// A company's palette is 14 neutral-named colors stored as JSON on
// Company.theme (null = Spotlight default). themeCss() turns a validated
// palette into CSS variables; nothing unvalidated ever reaches the <style>.
// Every save is checked against WCAG AA for the text and button pairs the
// app actually uses (themeContrastProblems), and a failing palette is refused.

export const THEME_KEYS = [
  "primary",       // buttons, hero panels, nav bar, Pile on
  "primaryStrong", // darkest text and surfaces, button hover
  "heading",       // headlines, names, navigation text
  "subtle",        // subheads, icons, private/pending/admin states
  "mutedOnDark",   // secondary text on primary surfaces
  "tint",          // tinted panels, chips, selected states
  "accent",        // at most one call to action per screen (Send kudos)
  "accentStrong",  // small labels on light backgrounds, CTA hover
  "accentSoft",    // accent text on primary surfaces, hover tints
  "page",          // page background
  "card",          // cards, and text on primary surfaces
  "text",          // body text
  "textMuted",     // captions, meta
  "line",          // dividers
] as const

export type ThemeKey = (typeof THEME_KEYS)[number]
export type Theme = Record<ThemeKey, string>

export const THEME_LABELS: Record<ThemeKey, string> = {
  primary: "Primary (buttons, nav, panels)",
  primaryStrong: "Primary strong (darkest text and surfaces)",
  heading: "Headings and navigation",
  subtle: "Subheads and icons",
  mutedOnDark: "Muted text on primary",
  tint: "Tinted panels",
  accent: "Accent (one call to action)",
  accentStrong: "Accent strong (small labels)",
  accentSoft: "Accent soft (accent text on primary)",
  page: "Page background",
  card: "Cards, text on primary",
  text: "Body text",
  textMuted: "Captions",
  line: "Dividers",
}

/** Spotlight's own look: deep teal, neutral grays, no second hue. */
export const DEFAULT_THEME: Theme = {
  primary: "#0f766e",
  primaryStrong: "#134e4a",
  heading: "#111827",
  subtle: "#4b5563",
  mutedOnDark: "#e6f2f0",
  tint: "#f1f3f5",
  accent: "#0f766e",
  accentStrong: "#115e59",
  accentSoft: "#ccfbf1",
  page: "#f8f9fa",
  card: "#ffffff",
  text: "#374151",
  textMuted: "#5f6672",
  line: "#e3e6ea",
}

/**
 * LCED: navy first, mauve accent only. Values are LCED's brand palette except
 * textMuted, darkened from Slate Light #6B7785 so captions pass AA on Mist and
 * Warm Paper (see reports/2026-11-19-spotlight-overnight.md).
 */
export const LCED_THEME: Theme = {
  primary: "#14304d",       // Anchor Navy
  primaryStrong: "#0b1b2d", // Ink
  heading: "#1f4368",       // Steady Navy
  subtle: "#3e6792",        // Quiet Steel
  mutedOnDark: "#7c9bbb",   // Fog
  tint: "#dce6f0",          // Mist
  accent: "#b97aa3",        // Logo Mauve
  accentStrong: "#8e4f76",  // Deep Mauve
  accentSoft: "#e0c4d6",    // Whisper
  page: "#f6f2ec",          // Warm Paper
  card: "#faf7f1",          // Cream
  text: "#3a4654",          // Slate
  textMuted: "#5a6573",     // Slate Light, darkened for AA
  line: "#c5ccd3",          // Line
}

// Status colors are fixed (not part of a company palette) and checked too.
export const STATUS = { danger: "#b42318", success: "#15803d" } as const

const HEX = /^#[0-9a-f]{6}$/

/** Validates a palette from the platform form. null/empty = Spotlight default. */
export function normalizeTheme(input: unknown): Theme | null {
  if (input === null || input === undefined || input === "") return null
  if (typeof input !== "object" || Array.isArray(input)) throw new Error("Theme must be a set of colors.")
  const raw = input as Record<string, unknown>
  const extra = Object.keys(raw).filter((k) => !(THEME_KEYS as readonly string[]).includes(k))
  if (extra.length) throw new Error(`Unknown theme color: ${extra.join(", ")}`)
  const out = {} as Theme
  for (const k of THEME_KEYS) {
    const v = typeof raw[k] === "string" ? (raw[k] as string).trim().toLowerCase() : ""
    if (!HEX.test(v)) throw new Error(`${THEME_LABELS[k]} must look like #1a2b3c.`)
    out[k] = v
  }
  return out
}

/** The stored JSON, or the default if missing or invalid. Never throws. */
export function themeOrDefault(stored: unknown): Theme {
  try {
    return normalizeTheme(stored) ?? DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

// ── Contrast (WCAG 2.x relative luminance) ──────────────────────────────────
function channel(c: number): number {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}
export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16)
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
}
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

/** Text color for an accent button: card if it passes AA, else the darkest. */
export function onColor(bg: string, t: Theme): string {
  return contrast(t.card, bg) >= 4.5 ? t.card : t.primaryStrong
}

export type ContrastPair = { fg: string; bg: string; use: string; ratio: number; ok: boolean }

/** Every text and button pair the app draws, checked at AA (4.5:1). */
export function themeContrastPairs(t: Theme): ContrastPair[] {
  const pairs: [string, string, string][] = [
    [t.text, t.page, "Body text on page"],
    [t.text, t.card, "Body text on card"],
    [t.text, t.tint, "Body text on tinted panel"],
    [t.textMuted, t.page, "Captions on page"],
    [t.textMuted, t.card, "Captions on card"],
    [t.textMuted, t.tint, "Captions on tinted panel"],
    [t.heading, t.page, "Headings on page"],
    [t.heading, t.card, "Headings on card"],
    [t.heading, t.tint, "Headings on tinted panel"],
    [t.subtle, t.card, "Subheads and states on card"],
    [t.subtle, t.tint, "Subheads and states on tinted panel"],
    [t.primary, t.card, "Primary links and labels on card"],
    [t.primary, t.tint, "Primary text on tinted chip"],
    [t.primaryStrong, t.page, "Strongest text on page"],
    [t.accentStrong, t.card, "Accent labels on card"],
    [t.accentStrong, t.page, "Accent labels on page"],
    [t.card, t.primary, "Primary button / Pile on / nav text"],
    [t.card, t.primaryStrong, "Primary button hover, sign-in page text"],
    [t.card, t.subtle, "Avatar initials, private toggle"],
    [t.mutedOnDark, t.primary, "Muted text on primary"],
    [t.mutedOnDark, t.primaryStrong, "Muted text on darkest surface"],
    [t.accentSoft, t.primary, "Accent text on primary"],
    [onColor(t.accent, t), t.accent, "Call to action (Send kudos)"],
    [onColor(t.accentStrong, t), t.accentStrong, "Call to action hover"],
    [STATUS.danger, t.card, "Errors on card"],
    [STATUS.danger, t.page, "Errors on page"],
    [t.card, STATUS.danger, "Badge text on danger"],
    [STATUS.success, t.card, "Success on card"],
  ]
  return pairs.map(([fg, bg, use]) => {
    const ratio = Math.round(contrast(fg, bg) * 100) / 100
    return { fg, bg, use, ratio, ok: ratio >= 4.5 }
  })
}

export function themeContrastProblems(t: Theme): ContrastPair[] {
  return themeContrastPairs(t).filter((p) => !p.ok)
}

const CSS_NAME: Record<ThemeKey, string> = {
  primary: "--primary",
  primaryStrong: "--primary-strong",
  heading: "--heading",
  subtle: "--subtle",
  mutedOnDark: "--muted-on-dark",
  tint: "--tint",
  accent: "--accent",
  accentStrong: "--accent-strong",
  accentSoft: "--accent-soft",
  page: "--page",
  card: "--card",
  text: "--text",
  textMuted: "--text-muted",
  line: "--line",
}

/** CSS variables for a palette. Input is re-validated; invalid -> default. */
export function themeCss(stored: unknown): string {
  const t = themeOrDefault(stored)
  const vars = THEME_KEYS.map((k) => `${CSS_NAME[k]}:${t[k]}`)
  vars.push(`--on-accent:${onColor(t.accent, t)}`, `--on-accent-strong:${onColor(t.accentStrong, t)}`)
  return `html:root{${vars.join(";")};}`
}

/**
 * Colors admins can pick for rewards and incentives (tints behind the emoji
 * and their labels). From the palette's primary family only: never the
 * accent, which is reserved for one call to action per screen.
 */
export function itemSwatches(stored: unknown): { label: string; value: string }[] {
  const t = themeOrDefault(stored)
  const all = [
    { label: "Primary", value: t.primary },
    { label: "Headings", value: t.heading },
    { label: "Subheads", value: t.subtle },
    { label: "Darkest", value: t.primaryStrong },
  ]
  return all.filter((s, i) => all.findIndex((o) => o.value === s.value) === i)
}
