// Launch switch (Company.isOpen, lib/launch.ts). A closed company admits only
// platform owners, admins and testers; everyone else is refused, audited, and
// never gets a user row. Opening is a platform-owner action, audit-logged.
// BambooHR sync (read-only) still runs while closed; Chat and the allowance
// reset do not.
import { describe, it, expect, beforeEach, vi } from "vitest"
import { db } from "@/lib/db"
import { resolveGoogleSignIn } from "@/lib/signIn"
import { getActor } from "@/lib/tenant"
import { resetAllowances } from "@/lib/allowanceReset"
import { syncBambooHR } from "@/lib/syncBambooHR"
import { triggerBambooSync } from "@/app/actions/adminIntegrations"
import { GET as bambooCron } from "@/app/api/cron/sync-bamboo/route"
import { NextRequest } from "next/server"
import { getComingSoonBrand } from "@/lib/brandContext"
import { setCompanyOpen, setTester } from "@/app/actions/platform"
import { createKudo } from "@/app/actions/createKudo"
import { chatTarget } from "@/lib/chat/postKudo"
import { resetDb, setActor, makeCompany, makeUser } from "./helpers"

// Record what createKudo hands to the Chat poster, and where it would post.
const chatCalls: (string | null)[] = []
vi.mock("@/lib/chat/postKudo", async (orig) => {
  const real = await orig<typeof import("@/lib/chat/postKudo")>()
  return {
    ...real,
    postKudoToChat: vi.fn(async (p: Parameters<typeof real.postKudoToChat>[0]) => {
      chatCalls.push(real.chatTarget(p))
    }),
  }
})

beforeEach(resetDb)

const profile = (email: string, sub = `sub-${email}`) => ({
  sub,
  email,
  email_verified: true,
  hd: email.split("@")[1],
  name: email.split("@")[0],
})

async function closedLced() {
  const lced = await makeCompany("lced", ["lcedky.com", "bewellkentucky.com"], { isOpen: false })
  const owner = await makeUser(lced.id, { role: "admin", isPlatformOwner: true, email: "owner@lcedky.com" })
  const admin = await makeUser(lced.id, { role: "admin", email: "admin@lcedky.com" })
  const tester = await makeUser(lced.id, { isTester: true, email: "tester@lcedky.com" })
  const member = await makeUser(lced.id, { email: "member@lcedky.com" })
  return { lced, owner, admin, tester, member }
}

const refusals = (companyId: string) =>
  db.auditLog.findMany({ where: { companyId, action: "signin_refused_closed" }, orderBy: { createdAt: "asc" } })

describe("launch switch: sign-in while closed", () => {
  it("is closed by default for a new company", async () => {
    const c = await db.company.create({ data: { slug: "fresh", name: "Fresh" } })
    expect(c.isOpen).toBe(false)
  })

  it("refuses a normal member, audits it, and leaves their row untouched", async () => {
    const { lced, member } = await closedLced()
    expect(await resolveGoogleSignIn(db, profile("member@lcedky.com"))).toEqual({
      ok: false,
      reason: "closed",
      companySlug: "lced",
    })
    const after = await db.user.findUniqueOrThrow({ where: { id: member.id } })
    expect(after.googleId).toBeNull()
    expect(after.lastSignInAt).toBeNull()
    const logs = await refusals(lced.id)
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({ actorId: member.id, targetId: member.id })
    expect(logs[0].details).toContain("member@lcedky.com")
  })

  it("creates no user row for someone new, and still audits the refusal", async () => {
    const { lced } = await closedLced()
    const before = await db.user.count()
    for (const email of ["new.person@lcedky.com", "other.person@bewellkentucky.com", "new.person@lcedky.com"]) {
      expect(await resolveGoogleSignIn(db, profile(email))).toMatchObject({ ok: false, reason: "closed" })
    }
    expect(await db.user.count()).toBe(before)
    expect(await db.user.findUnique({ where: { email: "new.person@lcedky.com" } })).toBeNull()
    const logs = await refusals(lced.id)
    expect(logs).toHaveLength(3)
    expect(logs.every((l) => l.actorId === null && l.targetId === null)).toBe(true)
    expect(logs[1].details).toContain("other.person@bewellkentucky.com")
  })

  it("refuses a member who already signed in once (matched by Google id)", async () => {
    const { lced, member } = await closedLced()
    await db.user.update({ where: { id: member.id }, data: { googleId: "g-member" } })
    expect(await resolveGoogleSignIn(db, profile("member@lcedky.com", "g-member"))).toMatchObject({ ok: false, reason: "closed" })
    expect(await refusals(lced.id)).toHaveLength(1)
  })

  it("admits the platform owner, admins and testers", async () => {
    const { lced, owner, admin, tester } = await closedLced()
    for (const u of [owner, admin, tester]) {
      const res = await resolveGoogleSignIn(db, profile(u.email))
      expect(res).toEqual({ ok: true, userId: u.id, created: false })
      expect((await db.user.findUniqueOrThrow({ where: { id: u.id } })).lastSignInAt).toBeInstanceOf(Date)
      // Second sign-in goes through the Google-id path; still admitted.
      expect(await resolveGoogleSignIn(db, profile(u.email))).toMatchObject({ ok: true })
    }
    expect(await refusals(lced.id)).toHaveLength(0)
  })

  it("still refuses inactive people with the inactive reason, not closed", async () => {
    const { lced } = await closedLced()
    await makeUser(lced.id, { role: "admin", email: "gone@lcedky.com", active: false })
    expect(await resolveGoogleSignIn(db, profile("gone@lcedky.com"))).toEqual({ ok: false, reason: "inactive" })
  })
})

describe("launch switch: sessions and app access while closed", () => {
  it("gives a member no actor, but owners, admins and testers keep theirs", async () => {
    const { owner, admin, tester, member } = await closedLced()
    setActor(member.id)
    expect(await getActor()).toBeNull()
    for (const u of [owner, admin, tester]) {
      setActor(u.id)
      expect((await getActor())?.userId).toBe(u.id)
    }
  })

  it("a member can't act through an old session", async () => {
    const { member, admin } = await closedLced()
    setActor(member.id)
    const res = await createKudo({ toId: admin.id, amount: 10, message: "Thanks for the help", values: ["Compassion"], isPrivate: false })
    expect(res?.error).toBeTruthy()
    expect(await db.kudo.count()).toBe(0)
  })

  it("coming-soon branding resolves only for a closed, active company", async () => {
    const { member } = await closedLced()
    await makeCompany("harbor", ["harbor.test"])
    setActor(null)
    expect((await getComingSoonBrand("lced"))?.name).toBe("LCED")
    expect(await getComingSoonBrand("harbor")).toBeNull()
    expect(await getComingSoonBrand("nope")).toBeNull()
    expect(await getComingSoonBrand("../x")).toBeNull()
    setActor(member.id)
    expect((await getComingSoonBrand(undefined))?.name).toBe("LCED")
  })
})

describe("launch switch: opening", () => {
  it("only the platform owner can open, and opening is audited", async () => {
    const { lced, admin, owner } = await closedLced()
    setActor(admin.id)
    expect((await setCompanyOpen(lced.id, true)).error).toBe("Platform owner only.")
    expect((await db.company.findUniqueOrThrow({ where: { id: lced.id } })).isOpen).toBe(false)

    setActor(owner.id)
    expect(await setCompanyOpen(lced.id, true)).toEqual({})
    expect((await db.company.findUniqueOrThrow({ where: { id: lced.id } })).isOpen).toBe(true)
    const log = await db.auditLog.findFirstOrThrow({ where: { companyId: lced.id, action: "open_company" } })
    expect(log.actorId).toBe(owner.id)
    // Opening twice is a no-op, not a second audit row.
    await setCompanyOpen(lced.id, true)
    expect(await db.auditLog.count({ where: { action: "open_company" } })).toBe(1)
  })

  it("after opening, everyone gets in, including brand new people", async () => {
    const { lced, owner, member } = await closedLced()
    setActor(owner.id)
    await setCompanyOpen(lced.id, true)
    expect(await resolveGoogleSignIn(db, profile("member@lcedky.com"))).toEqual({ ok: true, userId: member.id, created: false })
    const res = await resolveGoogleSignIn(db, profile("brand.new@lcedky.com"))
    expect(res).toMatchObject({ ok: true, created: true })
    expect((await db.user.findUniqueOrThrow({ where: { email: "brand.new@lcedky.com" } })).companyId).toBe(lced.id)
    setActor(member.id)
    expect((await getActor())?.userId).toBe(member.id)
  })

  it("a second, open company is unaffected while another is closed", async () => {
    const { lced } = await closedLced()
    const harbor = await makeCompany("harbor", ["harbor.test"])
    const h1 = await makeUser(harbor.id, { email: "casey@harbor.test" })
    expect(await resolveGoogleSignIn(db, profile("casey@harbor.test"))).toEqual({ ok: true, userId: h1.id, created: false })
    expect(await resolveGoogleSignIn(db, profile("new@harbor.test"))).toMatchObject({ ok: true, created: true })
    setActor(h1.id)
    expect((await getActor())?.companyId).toBe(harbor.id)
    expect(await refusals(harbor.id)).toHaveLength(0)
    expect(await refusals(lced.id)).toHaveLength(0)
  })
})

describe("launch switch: testers", () => {
  it("only the platform owner sets testers; it is audited and takes effect at once", async () => {
    const { lced, owner, admin, member } = await closedLced()
    setActor(admin.id)
    expect((await setTester(member.id, true)).error).toBe("Platform owner only.")
    setActor(owner.id)
    expect(await setTester(member.id, true)).toEqual({})
    expect(await db.auditLog.count({ where: { companyId: lced.id, action: "add_tester", targetId: member.id } })).toBe(1)
    expect(await resolveGoogleSignIn(db, profile("member@lcedky.com"))).toMatchObject({ ok: true })
    expect(await setTester(member.id, false)).toEqual({})
    expect(await resolveGoogleSignIn(db, profile("member@lcedky.com"))).toMatchObject({ ok: false, reason: "closed" })
  })
})

describe("launch switch: nothing runs for a closed company", () => {
  it("the allowance reset cron skips it and still resets open companies", async () => {
    const { lced, member } = await closedLced()
    await db.user.update({ where: { id: member.id }, data: { givingBalance: 7 } })
    const harbor = await makeCompany("harbor", ["harbor.test"], { allowanceAmount: 80 })
    const h1 = await makeUser(harbor.id, { givingBalance: 3 })
    const results = await resetAllowances()
    expect(results.map((r) => r.companyId)).toEqual([harbor.id])
    expect((await db.user.findUniqueOrThrow({ where: { id: member.id } })).givingBalance).toBe(7)
    expect((await db.user.findUniqueOrThrow({ where: { id: h1.id } })).givingBalance).toBe(80)
    expect(await db.allowanceReset.count({ where: { companyId: lced.id } })).toBe(0)
  })

  it("Chat and the allowance reset stay blocked even after a BambooHR sync", async () => {
    const { lced, admin, tester } = await closedLced()
    await db.company.update({ where: { id: lced.id }, data: { chatSpace: "spaces/AAAA1" } })
    await withFakeBamboo(lced.id, () => syncBambooHR(lced.id))
    chatCalls.length = 0
    setActor(admin.id)
    await createKudo({ toId: tester.id, amount: 10, message: "Thanks for testing", values: ["Compassion"], isPrivate: false })
    expect(chatCalls).toEqual([null])
    expect((await resetAllowances()).map((r) => r.companyId)).not.toContain(lced.id)
  })

  it("an admin's public kudo in a closed company never reaches Chat; once open it would", async () => {
    const { lced, admin, tester, owner } = await closedLced()
    await db.company.update({ where: { id: lced.id }, data: { chatSpace: "spaces/AAAA1" } })
    chatCalls.length = 0
    setActor(admin.id)
    const send = () => createKudo({ toId: tester.id, amount: 10, message: "Thanks for testing", values: ["Compassion"], isPrivate: false })
    expect(await send()).toBeUndefined()
    expect(await db.kudo.count()).toBe(1)
    expect(chatCalls).toEqual([null])
    setActor(owner.id)
    await setCompanyOpen(lced.id, true)
    setActor(admin.id)
    expect(await send()).toBeUndefined()
    expect(chatCalls).toEqual([null, "spaces/AAAA1"])
    expect(chatTarget({ companyOpen: false, isPrivate: false, chatSpace: "spaces/AAAA1" })).toBeNull()
  })
})

// Fake BambooHR: two employees, one new and one existing member. Records every
// request so tests can prove the sync only ever sends GETs to Bamboo.
const bambooRequests: { url: string; method: string }[] = []
async function withFakeBamboo<T>(companyId: string, run: () => Promise<T>): Promise<T> {
  await db.company.update({ where: { id: companyId }, data: { bambooEnabled: true, bambooSubdomain: "lced" } })
  const prevKey = process.env.BAMBOOHR_API_KEY_LCED
  process.env.BAMBOOHR_API_KEY_LCED = "fake-test-key"
  bambooRequests.length = 0
  const employees: Record<string, object> = {
    "1": { id: "1", workEmail: "nia.park@lcedky.com", firstName: "Nia", lastName: "Park", jobTitle: "Therapist" },
    "2": { id: "2", workEmail: "member@lcedky.com", firstName: "Mel", lastName: "Ember", jobTitle: "Dietitian" },
  }
  const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input)
    bambooRequests.push({ url, method: init?.method ?? "GET" })
    const path = new URL(url).pathname
    const body = path.endsWith("/employees/directory")
      ? { employees: [{ id: 1 }, { id: 2 }] }
      : employees[path.split("/").pop() ?? ""] ?? {}
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } })
  })
  try {
    return await run()
  } finally {
    spy.mockRestore()
    if (prevKey === undefined) delete process.env.BAMBOOHR_API_KEY_LCED
    else process.env.BAMBOOHR_API_KEY_LCED = prevKey
  }
}

describe("launch switch: BambooHR sync runs while closed (read-only)", () => {
  it("pre-loads and enriches people, sending only GETs to Bamboo, and none of them can sign in", async () => {
    const { lced, member } = await closedLced()
    const res = await withFakeBamboo(lced.id, () => syncBambooHR(lced.id))
    expect(res).toMatchObject({ created: 1, enriched: 1, errors: 0 })
    expect(bambooRequests.length).toBeGreaterThan(0)
    expect(bambooRequests.every((r) => r.method === "GET" && new URL(r.url).host === "api.bamboohr.com")).toBe(true)

    const nia = await db.user.findUniqueOrThrow({ where: { email: "nia.park@lcedky.com" } })
    expect(nia).toMatchObject({ companyId: lced.id, role: "member", isTester: false, isPlatformOwner: false, googleId: null })
    const mel = await db.user.findUniqueOrThrow({ where: { id: member.id } })
    expect(mel).toMatchObject({ title: "Dietitian", role: "member", isTester: false })

    for (const email of ["nia.park@lcedky.com", "member@lcedky.com"]) {
      expect(await resolveGoogleSignIn(db, profile(email))).toMatchObject({ ok: false, reason: "closed" })
    }
    setActor(nia.id)
    expect(await getActor()).toBeNull()
    expect((await db.user.findUniqueOrThrow({ where: { id: nia.id } })).googleId).toBeNull()
  })

  it("a sync doesn't change who is admitted: an enriched tester stays a tester", async () => {
    const { lced, tester } = await closedLced()
    // The tester is Bamboo employee 1, so the sync enriches their row.
    await db.user.update({ where: { id: tester.id }, data: { email: "nia.park@lcedky.com" } })
    const res = await withFakeBamboo(lced.id, () => syncBambooHR(lced.id))
    expect(res).toMatchObject({ created: 0, enriched: 2 })
    expect(await db.user.findUniqueOrThrow({ where: { id: tester.id } })).toMatchObject({ isTester: true, title: "Therapist" })
    expect(await resolveGoogleSignIn(db, profile("nia.park@lcedky.com"))).toMatchObject({ ok: true })
    expect(await resolveGoogleSignIn(db, profile("member@lcedky.com"))).toMatchObject({ ok: false, reason: "closed" })
  })

  it("the admin button works for a closed company and is audited", async () => {
    const { lced, admin } = await closedLced()
    setActor(admin.id)
    const res = await withFakeBamboo(lced.id, () => triggerBambooSync())
    expect(res).toMatchObject({ created: 1, enriched: 1 })
    expect(await db.auditLog.count({ where: { companyId: lced.id, action: "sync_bamboo" } })).toBe(1)
  })

  it("the cron includes closed companies", async () => {
    const { lced } = await closedLced()
    const prev = process.env.CRON_SECRET
    process.env.CRON_SECRET = "test-cron-secret"
    try {
      const req = new NextRequest("http://localhost/api/cron/sync-bamboo", {
        headers: { authorization: "Bearer test-cron-secret" },
      })
      const res = await withFakeBamboo(lced.id, () => bambooCron(req))
      const json = await res.json()
      expect(json.results.lced).toMatchObject({ created: 1, enriched: 1 })
      expect(await db.user.count({ where: { email: "nia.park@lcedky.com" } })).toBe(1)
    } finally {
      if (prev === undefined) delete process.env.CRON_SECRET
      else process.env.CRON_SECRET = prev
    }
  })
})
