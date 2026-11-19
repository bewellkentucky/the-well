import { describe, it, expect } from "vitest"
import { chatTarget } from "@/lib/chat/postKudo"
import { isAuthorizedCron } from "@/lib/cronAuth"
import { normalizeLogoUrl } from "@/lib/branding"
import { themeCss, normalizeTheme, DEFAULT_THEME } from "@/lib/theme"
import { devLoginEnabled } from "@/lib/devLogin"
import { employeeDomainAllowed, bambooKeyEnvName } from "@/lib/syncBambooHR"
import { normalizeDomains } from "@/lib/companies"

describe("Google Chat posting gate", () => {
  it("posts only public kudos, only to the company's own valid space", () => {
    expect(chatTarget({ isPrivate: false, chatSpace: "spaces/AAA1" })).toBe("spaces/AAA1")
    expect(chatTarget({ isPrivate: true, chatSpace: "spaces/AAA1" })).toBeNull()
    expect(chatTarget({ isPrivate: undefined as unknown as boolean, chatSpace: "spaces/AAA1" })).toBeNull()
    expect(chatTarget({ isPrivate: false, chatSpace: null })).toBeNull()
    expect(chatTarget({ isPrivate: false, chatSpace: "spaces/x/../../users/me" })).toBeNull()
  })
})

describe("cron auth", () => {
  it("requires the exact bearer secret, and a secret to exist", () => {
    expect(isAuthorizedCron("Bearer s3cret", "s3cret")).toBe(true)
    expect(isAuthorizedCron("Bearer wrong", "s3cret")).toBe(false)
    expect(isAuthorizedCron(null, "s3cret")).toBe(false)
    expect(isAuthorizedCron("Bearer undefined", undefined)).toBe(false)
    expect(isAuthorizedCron("Bearer ", "")).toBe(false)
  })
})

describe("branding", () => {
  it("only validated #rrggbb palette values ever reach the style tag", () => {
    const evil = { ...DEFAULT_THEME, primary: "red;}body{display:none" }
    expect(themeCss(evil)).toBe(themeCss(null)) // invalid -> whole default palette
    expect(themeCss(evil)).not.toContain("display")
    expect(themeCss({ ...DEFAULT_THEME, primary: "#123ABC" })).toContain("--primary:#123abc;")
    expect(() => normalizeTheme(evil)).toThrow(/must look like/)
    expect(() => normalizeTheme({ ...DEFAULT_THEME, extra: "#000000" })).toThrow(/Unknown theme color/)
    expect(() => normalizeTheme({ primary: "#000000" })).toThrow() // all 14 required
    expect(normalizeTheme("")).toBeNull()
  })
  it("logos must be https URLs", () => {
    expect(normalizeLogoUrl("https://cdn.example.com/logo.png")).toBe("https://cdn.example.com/logo.png")
    expect(() => normalizeLogoUrl("http://example.com/a.png")).toThrow()
    expect(() => normalizeLogoUrl("javascript:alert(1)")).toThrow()
  })
})

describe("dev login", () => {
  const base = { SPOTLIGHT_DEV_LOGIN: "1", NODE_ENV: "development", DATABASE_URL: "postgresql://localhost/spotlight_dev" }
  it("is on only for next dev against a local spotlight database, never on Vercel or in production", () => {
    expect(devLoginEnabled(base)).toBe(true)
    expect(devLoginEnabled({ ...base, NODE_ENV: "production" })).toBe(false)
    expect(devLoginEnabled({ ...base, VERCEL: "1" })).toBe(false)
    expect(devLoginEnabled({ ...base, SPOTLIGHT_DEV_LOGIN: undefined })).toBe(false)
    expect(devLoginEnabled({ ...base, DATABASE_URL: "postgresql://u:p@db.x.supabase.co/postgres" })).toBe(false)
  })
})

describe("BambooHR and domains", () => {
  it("only writes employees whose email domain belongs to the company", () => {
    expect(employeeDomainAllowed("a@lcedky.com", ["lcedky.com", "bewellkentucky.com"])).toBe(true)
    expect(employeeDomainAllowed("A@BeWellKentucky.com", ["lcedky.com", "bewellkentucky.com"])).toBe(true)
    expect(employeeDomainAllowed("a@other.org", ["lcedky.com"])).toBe(false)
    expect(employeeDomainAllowed("a@lcedky.com.evil.org", ["lcedky.com"])).toBe(false)
    expect(bambooKeyEnvName("lced")).toBe("BAMBOOHR_API_KEY_LCED")
    expect(bambooKeyEnvName("harbor-light")).toBe("BAMBOOHR_API_KEY_HARBOR_LIGHT")
  })
  it("normalizes and validates company domains", () => {
    expect(normalizeDomains("LCEDKY.com, @bewellkentucky.com lcedky.com")).toEqual(["lcedky.com", "bewellkentucky.com"])
    expect(() => normalizeDomains("not a domain")).toThrow()
    expect(() => normalizeDomains("")).toThrow()
  })
})
