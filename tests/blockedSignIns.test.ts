// Blocked sign-in addresses (shared mailboxes, lib/blockedSignIns.ts). A
// blocked address is refused open or closed, sees coming-soon, never gets a
// user row, never resolves as an actor, and BambooHR sync skips it. Only the
// platform owner edits the list, and every change is audited.
import { describe, it, expect, beforeEach, vi } from "vitest"
import { db } from "@/lib/db"
import { resolveGoogleSignIn } from "@/lib/signIn"
import { getActor } from "@/lib/tenant"
import { getComingSoonBrand } from "@/lib/brandContext"
import { syncBambooHR } from "@/lib/syncBambooHR"
import { normalizeBlockedSignIns, isBlockedSignIn, LCED_BLOCKED_SIGN_INS } from "@/lib/blockedSignIns"
import { setBlockedSignIns } from "@/app/actions/platform"
import { resetDb, setActor, makeCompany, makeUser } from "./helpers"

beforeEach(resetDb)

const profile = (email: string) => ({
  sub: `sub-${email}`,
  email,
  email_verified: true,
  hd: email.split("@")[1],
  name: email.split("@")[0],
})

async function lced(isOpen: boolean) {
  const c = await makeCompany("lced", ["lcedky.com", "bewellkentucky.com"], { isOpen, blockedSignIns: LCED_BLOCKED_SIGN_INS })
  const owner = await makeUser(c.id, { role: "admin", isPlatformOwner: true, email: "owner@lcedky.com" })
  const admin = await makeUser(c.id, { role: "admin", email: "admin@lcedky.com" })
  return { c, owner, admin }
}

const blockedRefusals = (companyId: string) =>
  db.auditLog.findMany({ where: { companyId, action: "signin_refused_blocked" }, orderBy: { createdAt: "asc" } })

describe("blocked sign-in addresses: the list", () => {
  it("LCED's seed list is the three shared mailboxes on both domains", () => {
    expect(LCED_BLOCKED_SIGN_INS).toEqual([
      "intake@bewellkentucky.com", "intake@lcedky.com",
      "reception@bewellkentucky.com", "reception@lcedky.com",
      "support@bewellkentucky.com", "support@lcedky.com",
    ])
  })

  it("normalizes, dedupes and sorts; refuses partial addresses and other companies' domains", () => {
    const d = ["lcedky.com", "bewellkentucky.com"]
    expect(normalizeBlockedSignIns(" Support@LCEDKY.com\nintake@lcedky.com, support@lcedky.com ", d)).toEqual([
      "intake@lcedky.com", "support@lcedky.com",
    ])
    expect(normalizeBlockedSignIns("", d)).toEqual([])
    expect(() => normalizeBlockedSignIns("intake", d)).toThrow(/not a full email address/)
    expect(() => normalizeBlockedSignIns("intake@gmail.com", d)).toThrow(/not on one of this company's sign-in domains/)
    expect(isBlockedSignIn({ blockedSignIns: ["intake@lcedky.com"] }, " INTAKE@lcedky.com ")).toBe(true)
    expect(isBlockedSignIn({ blockedSignIns: ["intake@lcedky.com"] }, "intake2@lcedky.com")).toBe(false)
  })
})

describe("blocked sign-in addresses: Google sign-in", () => {
  for (const isOpen of [true, false]) {
    it(`refuses every blocked address with no user row (company ${isOpen ? "open" : "closed"})`, async () => {
      const { c } = await lced(isOpen)
      const before = await db.user.count()
      for (const email of LCED_BLOCKED_SIGN_INS) {
        expect(await resolveGoogleSignIn(db, profile(email))).toEqual({ ok: false, reason: "blocked", companySlug: "lced" })
      }
      // Case doesn't matter.
      expect(await resolveGoogleSignIn(db, profile("Intake@LCEDKY.com"))).toMatchObject({ ok: false, reason: "blocked" })
      expect(await db.user.count()).toBe(before)
      const logs = await blockedRefusals(c.id)
      expect(logs).toHaveLength(LCED_BLOCKED_SIGN_INS.length + 1)
      expect(logs.every((l) => l.actorId === null)).toBe(true)
      // Closed-company refusals are a different thing and aren't logged here.
      expect(await db.auditLog.count({ where: { action: "signin_refused_closed" } })).toBe(0)
    })
  }

  it("an open company still admits a normal person next to the blocked ones", async () => {
    await lced(true)
    expect(await resolveGoogleSignIn(db, profile("sam.lee@lcedky.com"))).toMatchObject({ ok: true, created: true })
  })

  it("blocks even an admin, a tester or a platform owner on a blocked address", async () => {
    const { c } = await lced(false)
    await makeUser(c.id, { role: "admin", isTester: true, email: "reception@lcedky.com" })
    expect(await resolveGoogleSignIn(db, profile("reception@lcedky.com"))).toMatchObject({ ok: false, reason: "blocked" })
  })

  it("an existing row for a blocked address is left untouched (no Google link, no sign-in time)", async () => {
    const { c } = await lced(true)
    const shared = await makeUser(c.id, { email: "support@lcedky.com" })
    expect(await resolveGoogleSignIn(db, profile("support@lcedky.com"))).toMatchObject({ ok: false, reason: "blocked" })
    const after = await db.user.findUniqueOrThrow({ where: { id: shared.id } })
    expect(after).toMatchObject({ googleId: null, lastSignInAt: null, active: true })
    expect((await blockedRefusals(c.id))[0].actorId).toBe(shared.id)
  })

  it("blocks a Google account that was already linked, by its current email", async () => {
    const { c } = await lced(true)
    const shared = await makeUser(c.id, { email: "intake@lcedky.com", googleId: "sub-intake@lcedky.com" })
    expect(await resolveGoogleSignIn(db, profile("intake@lcedky.com"))).toMatchObject({ ok: false, reason: "blocked" })
    expect((await db.user.findUniqueOrThrow({ where: { id: shared.id } })).lastSignInAt).toBeNull()
  })

  it("another company's list doesn't affect it", async () => {
    await lced(true)
    const harbor = await makeCompany("harbor", ["harbor.test"])
    expect(await resolveGoogleSignIn(db, profile("intake@harbor.test"))).toMatchObject({ ok: true, created: true })
    expect((await db.user.findUniqueOrThrow({ where: { email: "intake@harbor.test" } })).companyId).toBe(harbor.id)
  })
})

describe("blocked sign-in addresses: sessions and coming-soon", () => {
  it("an old session for a blocked address gets no actor, open or closed", async () => {
    const { c } = await lced(true)
    const shared = await makeUser(c.id, { role: "admin", email: "support@bewellkentucky.com" })
    setActor(shared.id)
    expect(await getActor()).toBeNull()
    expect((await getComingSoonBrand(undefined))?.name).toBe("LCED")
  })

  it("coming-soon branding resolves for an open company only on a blocked refusal", async () => {
    await lced(true)
    setActor(null)
    expect((await getComingSoonBrand("lced", "blocked"))?.name).toBe("LCED")
    expect(await getComingSoonBrand("lced", "closed")).toBeNull()
  })
})

describe("blocked sign-in addresses: BambooHR sync", () => {
  it("never pre-creates or enriches a blocked address", async () => {
    const { c } = await lced(false)
    await db.company.update({ where: { id: c.id }, data: { bambooEnabled: true, bambooSubdomain: "lced" } })
    const prev = process.env.BAMBOOHR_API_KEY_LCED
    process.env.BAMBOOHR_API_KEY_LCED = "fake-test-key"
    const employees: Record<string, object> = {
      "1": { id: "1", workEmail: "intake@lcedky.com", firstName: "Intake", lastName: "Desk" },
      "2": { id: "2", workEmail: "nia.park@lcedky.com", firstName: "Nia", lastName: "Park" },
    }
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const path = new URL(String(input)).pathname
      const body = path.endsWith("/employees/directory") ? { employees: [{ id: 1 }, { id: 2 }] } : employees[path.split("/").pop() ?? ""] ?? {}
      return new Response(JSON.stringify(body), { status: 200 })
    })
    try {
      expect(await syncBambooHR(c.id)).toMatchObject({ created: 1, skipped: 1 })
    } finally {
      spy.mockRestore()
      if (prev === undefined) delete process.env.BAMBOOHR_API_KEY_LCED
      else process.env.BAMBOOHR_API_KEY_LCED = prev
    }
    expect(await db.user.findUnique({ where: { email: "intake@lcedky.com" } })).toBeNull()
    expect(await db.user.findUnique({ where: { email: "nia.park@lcedky.com" } })).not.toBeNull()
  })
})

describe("blocked sign-in addresses: editing in /platform", () => {
  it("only the platform owner can edit; changes are validated and audited", async () => {
    const { c, owner, admin } = await lced(true)
    setActor(admin.id)
    expect((await setBlockedSignIns(c.id, "frontdesk@lcedky.com")).error).toBe("Platform owner only.")

    setActor(owner.id)
    expect((await setBlockedSignIns(c.id, "frontdesk@gmail.com")).error).toMatch(/not on one of this company's sign-in domains/)
    const next = [...LCED_BLOCKED_SIGN_INS.filter((e) => e !== "support@lcedky.com"), "frontdesk@lcedky.com"].join("\n")
    expect(await setBlockedSignIns(c.id, next)).toEqual({})
    const saved = (await db.company.findUniqueOrThrow({ where: { id: c.id } })).blockedSignIns
    expect(saved).toContain("frontdesk@lcedky.com")
    expect(saved).not.toContain("support@lcedky.com")
    const log = await db.auditLog.findFirstOrThrow({ where: { companyId: c.id, action: "set_blocked_signins" } })
    expect(log.actorId).toBe(owner.id)
    expect(log.details).toBe("Blocked: frontdesk@lcedky.com. Unblocked: support@lcedky.com")
    // Takes effect at once, both ways.
    expect(await resolveGoogleSignIn(db, profile("frontdesk@lcedky.com"))).toMatchObject({ ok: false, reason: "blocked" })
    expect(await resolveGoogleSignIn(db, profile("support@lcedky.com"))).toMatchObject({ ok: true })
    // Saving the same list again is a no-op, not another audit row.
    await setBlockedSignIns(c.id, next)
    expect(await db.auditLog.count({ where: { action: "set_blocked_signins" } })).toBe(1)
  })
})
