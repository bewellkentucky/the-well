import { describe, it, expect, beforeEach } from "vitest"
import { db } from "@/lib/db"
import { resolveGoogleSignIn } from "@/lib/signIn"
import { resetDb, makeCompany, makeUser } from "./helpers"

beforeEach(resetDb)

const profile = (over: Record<string, unknown> = {}) => ({
  sub: "google-sub-1",
  email: "sam.lee@lcedky.com",
  email_verified: true,
  hd: "lcedky.com",
  name: "Sam Lee",
  ...over,
})

describe("Google sign-in resolver", () => {
  it("creates a new person in the company that owns the domain, with that company's allowance", async () => {
    const lced = await makeCompany("lced", ["lcedky.com", "bewellkentucky.com"], { allowanceAmount: 120 })
    const res = await resolveGoogleSignIn(db, profile())
    expect(res).toMatchObject({ ok: true, created: true })
    const u = await db.user.findUniqueOrThrow({ where: { email: "sam.lee@lcedky.com" } })
    expect(u.companyId).toBe(lced.id)
    expect(u.givingBalance).toBe(120)
    expect(u.role).toBe("member")
    expect(u.lastSignInAt).toBeInstanceOf(Date)
  })

  it("records the last sign-in time on every successful sign-in, not on refusals", async () => {
    const lced = await makeCompany("lced", ["lcedky.com", "bewellkentucky.com"])
    const pre = await makeUser(lced.id, { email: "sam.lee@lcedky.com" })
    expect(pre.lastSignInAt).toBeNull()
    await resolveGoogleSignIn(db, profile())
    const first = (await db.user.findUniqueOrThrow({ where: { id: pre.id } })).lastSignInAt!
    expect(first).toBeInstanceOf(Date)
    await new Promise((r) => setTimeout(r, 5))
    await resolveGoogleSignIn(db, profile())
    const second = (await db.user.findUniqueOrThrow({ where: { id: pre.id } })).lastSignInAt!
    expect(second.getTime()).toBeGreaterThan(first.getTime())
    await db.user.update({ where: { id: pre.id }, data: { active: false } })
    expect(await resolveGoogleSignIn(db, profile())).toEqual({ ok: false, reason: "inactive" })
    expect((await db.user.findUniqueOrThrow({ where: { id: pre.id } })).lastSignInAt!.getTime()).toBe(second.getTime())
  })

  it("accepts the alias domain for the same company", async () => {
    const lced = await makeCompany("lced", ["lcedky.com", "bewellkentucky.com"])
    const res = await resolveGoogleSignIn(db, profile({ email: "sam.lee@bewellkentucky.com", hd: "bewellkentucky.com" }))
    expect(res.ok).toBe(true)
    expect((await db.user.findUniqueOrThrow({ where: { email: "sam.lee@bewellkentucky.com" } })).companyId).toBe(lced.id)
  })

  it("refuses unknown domains, unverified emails and non-Workspace accounts", async () => {
    await makeCompany("lced", ["lcedky.com"])
    expect(await resolveGoogleSignIn(db, profile({ email: "x@gmail.com", hd: undefined }))).toEqual({ ok: false, reason: "not_workspace" })
    expect(await resolveGoogleSignIn(db, profile({ email: "x@other.org", hd: "other.org" }))).toEqual({ ok: false, reason: "unknown_domain" })
    expect(await resolveGoogleSignIn(db, profile({ email_verified: false }))).toEqual({ ok: false, reason: "email_unverified" })
    expect(await resolveGoogleSignIn(db, profile({ hd: undefined }))).toEqual({ ok: false, reason: "not_workspace" })
    expect(await resolveGoogleSignIn(db, null)).toEqual({ ok: false, reason: "missing_profile" })
    expect(await db.user.count()).toBe(0)
  })

  it("refuses a consumer-style account whose hd is a different org", async () => {
    await makeCompany("lced", ["lcedky.com"])
    await makeCompany("other", ["other.org"])
    expect(await resolveGoogleSignIn(db, profile({ hd: "other.org" }))).toEqual({ ok: false, reason: "domain_mismatch" })
  })

  it("keeps the same row (and balances) when a person's primary email moves to the new domain", async () => {
    const lced = await makeCompany("lced", ["lcedky.com", "bewellkentucky.com"])
    const old = await makeUser(lced.id, { email: "sam.lee@bewellkentucky.com", googleId: "google-sub-1", balance: 4200 })
    const res = await resolveGoogleSignIn(db, profile())
    expect(res).toEqual({ ok: true, userId: old.id, created: false })
    const after = await db.user.findUniqueOrThrow({ where: { id: old.id } })
    expect(after.email).toBe("sam.lee@lcedky.com")
    expect(after.balance).toBe(4200)
    expect(await db.user.count()).toBe(1)
  })

  it("never moves a person into another company by signing in with that company's domain", async () => {
    const a = await makeCompany("alpha", ["alpha.test"])
    await makeCompany("bravo", ["bravo.test"])
    await makeUser(a.id, { email: "kim@alpha.test", googleId: "sub-kim" })
    const res = await resolveGoogleSignIn(db, { sub: "sub-kim", email: "kim@bravo.test", email_verified: true, hd: "bravo.test" })
    expect(res).toEqual({ ok: false, reason: "domain_mismatch" })
    expect((await db.user.findFirstOrThrow({ where: { googleId: "sub-kim" } })).companyId).toBe(a.id)
  })

  it("links a pre-created (BambooHR) row on first sign-in", async () => {
    const lced = await makeCompany("lced", ["lcedky.com"])
    const pre = await makeUser(lced.id, { email: "sam.lee@lcedky.com" })
    const res = await resolveGoogleSignIn(db, profile())
    expect(res).toEqual({ ok: true, userId: pre.id, created: false })
    expect((await db.user.findUniqueOrThrow({ where: { id: pre.id } })).googleId).toBe("google-sub-1")
  })

  it("refuses inactive people and inactive companies", async () => {
    const lced = await makeCompany("lced", ["lcedky.com"])
    await makeUser(lced.id, { email: "sam.lee@lcedky.com", active: false })
    expect(await resolveGoogleSignIn(db, profile())).toEqual({ ok: false, reason: "inactive" })
    await db.company.update({ where: { id: lced.id }, data: { active: false } })
    expect(await resolveGoogleSignIn(db, profile({ sub: "s2", email: "new.person@lcedky.com" }))).toEqual({ ok: false, reason: "inactive" })
  })

  it("refuses when an email is already linked to a different Google account", async () => {
    const lced = await makeCompany("lced", ["lcedky.com"])
    await makeUser(lced.id, { email: "sam.lee@lcedky.com", googleId: "someone-else" })
    expect(await resolveGoogleSignIn(db, profile())).toEqual({ ok: false, reason: "account_conflict" })
  })
})
