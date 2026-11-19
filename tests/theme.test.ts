// Per-company palettes: both shipped palettes pass WCAG AA for every text and
// button pair, the CSS defaults match DEFAULT_THEME, mauve is only the CTA,
// and the platform refuses an unreadable palette.
import { describe, it, expect, beforeEach } from "vitest"
import { readFileSync } from "node:fs"
import { db } from "@/lib/db"
import {
  DEFAULT_THEME, LCED_THEME, THEME_KEYS, contrast, onColor, themeContrastPairs, themeContrastProblems, itemSwatches,
} from "@/lib/theme"
import { createCompany, updateCompany } from "@/app/actions/platform"
import { resetDb, makeCompany, makeUser, setActor } from "./helpers"

const CSS = readFileSync("app/globals.css", "utf8")
const ROOT = CSS.slice(CSS.indexOf(":root {"), CSS.indexOf("}", CSS.indexOf(":root {")))
const kebab = (k: string) => "--" + k.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase())

describe("palettes", () => {
  it.each([["Spotlight default", DEFAULT_THEME], ["LCED", LCED_THEME]])("%s passes AA on every pair", (_n, t) => {
    expect(themeContrastProblems(t)).toEqual([])
    expect(themeContrastPairs(t).length).toBeGreaterThanOrEqual(25)
  })

  it("LCED's original Slate Light would fail, which is why it was darkened", () => {
    expect(themeContrastProblems({ ...LCED_THEME, textMuted: "#6b7785" }).map((p) => p.use)).toEqual([
      "Captions on page", "Captions on card", "Captions on tinted panel",
    ])
  })

  it("light text on Logo Mauve fails, so the CTA uses Ink; Deep Mauve takes Cream", () => {
    expect(contrast("#faf7f1", LCED_THEME.accent)).toBeLessThan(4.5)
    expect(contrast("#ffffff", LCED_THEME.accent)).toBeLessThan(4.5)
    expect(onColor(LCED_THEME.accent, LCED_THEME)).toBe(LCED_THEME.primaryStrong)
    expect(onColor(LCED_THEME.accentStrong, LCED_THEME)).toBe(LCED_THEME.card)
  })

  it("globals.css defaults are exactly DEFAULT_THEME", () => {
    for (const k of THEME_KEYS) expect(ROOT).toMatch(new RegExp(`${kebab(k)}:\\s*${DEFAULT_THEME[k]};`))
  })

  it("the default palette has no second hue: accent is the primary teal", () => {
    expect(DEFAULT_THEME.accent).toBe(DEFAULT_THEME.primary)
  })

  it("accent appears only on the CTA and accent-word rules, never as a panel or body text", () => {
    const uses = CSS.split("\n").filter((l) => /var\(--accent(-strong|-soft)?\)/.test(l))
    expect(uses.length).toBeLessThanOrEqual(4)
    for (const l of uses) expect(l).toMatch(/btn-cta|accent word|background: var\(--accent\);|--on-accent/)
    expect(CSS).not.toMatch(/var\(--(ink|ink-soft|canvas|canvas-2|paper|coral|violet|moss|fern|accent-deep)\)/)
  })

  it("no text is faded with opacity (that would undo the AA check); decorative glyphs excepted", () => {
    const allowed = new Set([".tnav-bal-dot", ".quick-action-arrow", ".mnav-icon"])
    const faded: string[] = []
    for (const m of CSS.matchAll(/^([^\n{}@]+)\{([^}]*)\}/gm)) {
      const sel = m[1].trim(), body = m[2]
      if (/(^|\s|;)color:/.test(body) && /opacity:\s*0?\.\d/.test(body) &&
          !/disabled|capped|:hover|pop|fade|skeleton/.test(sel) && !allowed.has(sel)) faded.push(sel)
    }
    expect(faded).toEqual([])
  })

  it("item swatches never include the accent", () => {
    const values = itemSwatches(LCED_THEME).map((s) => s.value)
    expect(values).not.toContain(LCED_THEME.accent)
    expect(values).not.toContain(LCED_THEME.accentStrong)
    expect(values[0]).toBe(LCED_THEME.primary)
  })
})

describe("platform palette editing", () => {
  beforeEach(resetDb)

  it("saves a valid palette, refuses an unreadable one, and null means default", async () => {
    const home = await makeCompany("home", ["home.test"])
    const owner = await makeUser(home.id, { role: "admin", isPlatformOwner: true })
    setActor(owner.id)
    const base = { name: "Northwind", shortName: null, slug: "northwind", domains: "northwind.test", appUrl: null, logoUrl: null, bambooEnabled: false, bambooSubdomain: null, chatSpace: null, active: true }

    const created = await createCompany({ ...base, theme: LCED_THEME })
    expect(created.error).toBeUndefined()
    expect((await db.company.findUniqueOrThrow({ where: { id: created.id! } })).theme).toEqual(LCED_THEME)

    const bad = await updateCompany(created.id!, { ...base, theme: { ...LCED_THEME, text: "#c5ccd3" } })
    expect(bad.error).toMatch(/too hard to read/)
    expect((await db.company.findUniqueOrThrow({ where: { id: created.id! } })).theme).toEqual(LCED_THEME)

    expect((await updateCompany(created.id!, { ...base, theme: null })).error).toBeUndefined()
    expect((await db.company.findUniqueOrThrow({ where: { id: created.id! } })).theme).toBeNull()
  })

  it("company admins can't set a palette (platform owner only)", async () => {
    const home = await makeCompany("home", ["home.test"])
    const admin = await makeUser(home.id, { role: "admin" })
    setActor(admin.id)
    const res = await updateCompany(home.id, { name: "Home", shortName: null, slug: "home", domains: "home.test", appUrl: null, logoUrl: null, theme: LCED_THEME, bambooEnabled: false, bambooSubdomain: null, chatSpace: null, active: true })
    expect(res.error).toBe("Platform owner only.")
  })
})
