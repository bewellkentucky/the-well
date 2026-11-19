// Fictional demo data for spotlight_dev. Every person here is made up.
// Two companies: "Harborlight Counseling" (a fictional company on a .test
// domain) and "LCED" with its real sign-in domains but invented staff.
// Idempotent: re-running updates company settings and skips existing rows.
import { db } from "@/lib/db"
import { scopedDb } from "@/lib/scopedDb"
import { LCED_THEME, itemSwatches, type Theme } from "@/lib/theme"
import { Prisma } from "@/app/generated/prisma/client"

type Person = {
  first: string
  last: string
  title: string
  role?: "admin" | "member"
  platformOwner?: boolean
  tester?: boolean // may sign in while the company is closed
  hire: string // YYYY-MM-DD
  birthday: string // MM-DD
  location?: string
  domain?: string
}

const day = (s: string) => {
  const [y, m, d] = s.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d, 12))
}
const bday = (md: string) => day(`1990-${md}`)
const rel = (days: number) => {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + days)
  return d
}
const mdFromToday = (days: number) => {
  const d = rel(days)
  return `${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`
}

const COMPANIES: {
  slug: string
  name: string
  shortName: string | null
  domains: string[]
  appUrl: string | null
  theme: Theme | null
  allowance: number
  people: Person[]
}[] = [
  {
    slug: "lced",
    name: "Louisville Center for Eating Disorders",
    shortName: "LCED",
    domains: ["lcedky.com", "bewellkentucky.com"],
    appUrl: "https://spotlight.louisvillecenterforeatingdisorders.com",
    theme: LCED_THEME,
    allowance: 100,
    people: [
      { first: "Morgan", last: "Reyes", title: "Operations Director", role: "admin", platformOwner: true, hire: "2019-03-11", birthday: mdFromToday(9), location: "Louisville" },
      { first: "Dana", last: "Whitfield", title: "Practice Administrator", role: "admin", hire: "2020-06-01", birthday: "02-14", location: "Louisville" },
      { first: "Priya", last: "Okafor", title: "Clinical Director", tester: true, hire: "2018-09-17", birthday: "07-22", location: "Louisville" },
      { first: "Sam", last: "Delgado", title: "Therapist", hire: "2022-01-10", birthday: mdFromToday(21), location: "Louisville" },
      { first: "Jordan", last: "Ellis", title: "Therapist", hire: "2023-04-03", birthday: "11-30", location: "Lexington" },
      { first: "Avery", last: "Kim", title: "Registered Dietitian Liaison", hire: "2021-08-23", birthday: "05-05", location: "Lexington" },
      { first: "Riley", last: "Chen", title: "Front Desk Coordinator", hire: day(rel(-14).toISOString().slice(0, 10)).toISOString().slice(0, 10), birthday: "09-12", location: "Louisville" },
      { first: "Casey", last: "Brooks", title: "Billing Specialist", hire: "2017-" + mdFromToday(5), birthday: "03-28", location: "Louisville", domain: "bewellkentucky.com" },
    ],
  },
  {
    slug: "harborlight",
    name: "Harborlight Counseling",
    shortName: "Harborlight",
    domains: ["harborlight.test"],
    appUrl: null,
    theme: null, // Spotlight default palette
    allowance: 150,
    people: [
      { first: "Theo", last: "Marsh", title: "Director", role: "admin", hire: "2016-02-01", birthday: "01-19" },
      { first: "Lena", last: "Park", title: "Counselor", hire: "2021-05-17", birthday: mdFromToday(3) },
      { first: "Omar", last: "Haddad", title: "Counselor", hire: "2022-10-03", birthday: "06-30" },
      { first: "Grace", last: "Liu", title: "Office Manager", hire: "2019-12-09", birthday: "12-02" },
      { first: "Noah", last: "Fischer", title: "Intake Coordinator", hire: "2024-07-15", birthday: "08-08" },
    ],
  },
]

const REWARDS = [
  { title: "Spotlight hoodie", description: "Heavyweight fleece with your team's logo on the chest.", cost: 1200, category: "Swag", icon: "🧥" },
  { title: "Tote bag", description: "Heavy canvas, fits a laptop and a notebook.", cost: 700, category: "Swag", icon: "👜" },
  { title: "$25 bookstore gift card", description: "Delivered to your inbox.", cost: 2500, category: "Gift Card", icon: "📚" },
  { title: "Half day off", description: "Four hours of bonus PTO. Use it whenever.", cost: 5000, category: "Time", icon: "🌤️" },
  { title: "Desk plant", description: "A low-maintenance pothos or snake plant for your space.", cost: 600, category: "Office", icon: "🪴" },
  { title: "Team outing", description: "Bowling or mini golf for your pod. You pick, we book.", cost: 4500, category: "Team", icon: "🎳", inventory: 3 },
  { title: "CEU stipend", description: "$100 toward an approved continuing education course.", cost: 10000, category: "Growth", icon: "🎓" },
]

const INCENTIVES = [
  { title: "Share a Google review link", description: "Invite a client or family member to leave a Google review. Paste the review link once it posts.", reward: 200, verification: "admin", cap: "unlimited", icon: "⭐", proofPrompt: "Paste the Google review URL" },
  { title: "Refer a new hire", description: "Refer someone for an open role. Credited after they pass 90 days.", reward: 1000, verification: "admin", cap: "unlimited", icon: "🤝", proofPrompt: "Name and email of the person you referred" },
  { title: "Quarterly safety training", description: "Finish this quarter's safety module and self-attest.", reward: 100, verification: "self", cap: "quarterly", icon: "🛡️", proofPrompt: null },
  { title: "Annual compliance training", description: "Complete the yearly compliance course.", reward: 150, verification: "self", cap: "once", icon: "📋", proofPrompt: null },
  { title: "Monthly pulse survey", description: "Two minutes, anonymous. Tell us how things are going.", reward: 50, verification: "self", cap: "monthly", icon: "📣", proofPrompt: null },
]

const KUDOS: [number, number, number, string, string[], boolean][] = [
  // from, to, amount, message, values, private
  [1, 2, 25, "You rebuilt the intake checklist in an afternoon and it already saves us time every morning.", ["Ownership", "Excellence"], false],
  [2, 3, 15, "Thank you for covering my session notes review while I was out. It meant a lot.", ["Team-First"], false],
  [3, 4, 20, "Your training on de-escalation was clear, kind and practical. Everyone left with something.", ["Curiosity", "Compassion"], false],
  [4, 1, 10, "You stayed late so the team could finish the move. Above and beyond.", ["Above & Beyond"], false],
  [0, 5, 30, "Quietly fixing the scheduling mess before anyone noticed. Thank you.", ["Ownership"], true],
]

export async function seedDemoData() {
  const summary: Record<string, number> = {}
  for (const c of COMPANIES) {
    const company = await db.company.upsert({
      where: { slug: c.slug },
      // Seeded open so local dev works for everyone. Production LCED starts
      // closed (migration); try the launch switch in /platform.
      create: { slug: c.slug, name: c.name, shortName: c.shortName, appUrl: c.appUrl, theme: c.theme ?? Prisma.DbNull, allowanceAmount: c.allowance, isOpen: true },
      update: { name: c.name, shortName: c.shortName, appUrl: c.appUrl, theme: c.theme ?? Prisma.DbNull, allowanceAmount: c.allowance },
    })
    for (const domain of c.domains) {
      await db.companyDomain.upsert({ where: { domain }, create: { domain, companyId: company.id }, update: {} })
    }
    const sdb = scopedDb(company.id)
    // Item colors come from the company palette (never the accent).
    const swatches = itemSwatches(c.theme)
    const swatch = (i: number) => swatches[i % swatches.length].value

    const ids: string[] = []
    for (const p of c.people) {
      const email = `${p.first}.${p.last}@${p.domain ?? c.domains[0]}`.toLowerCase()
      const user = await sdb.user.upsert({
        where: { email },
        create: {
          companyId: company.id,
          email,
          fullName: `${p.first} ${p.last}`,
          title: p.title,
          role: p.role ?? "member",
          isPlatformOwner: p.platformOwner ?? false,
          isTester: p.tester ?? false,
          hireDate: day(p.hire),
          birthday: bday(p.birthday),
          location: p.location ?? null,
          givingBalance: c.allowance,
          balance: 300 + ids.length * 175,
        },
        update: {},
        select: { id: true },
      })
      ids.push(user.id)
    }

    if ((await sdb.reward.count()) === 0) {
      await sdb.reward.createMany({ data: REWARDS.map((r, i) => ({ companyId: company.id, ...r, color: swatch(i) })) })
    }
    if ((await sdb.incentive.count()) === 0) {
      await sdb.incentive.createMany({
        data: INCENTIVES.map((inc, i) => ({ companyId: company.id, ...inc, color: swatch(i), sortOrder: i })),
      })
    }
    if ((await sdb.kudo.count()) === 0) {
      for (const [f, t, amount, message, values, isPrivate] of KUDOS) {
        if (!ids[f] || !ids[t]) continue
        await sdb.kudo.create({
          data: { companyId: company.id, fromId: ids[f], toId: ids[t], amount, message, values, isPrivate },
        })
        await sdb.user.updateMany({ where: { id: ids[f] }, data: { givingBalance: { decrement: amount } } })
        await sdb.user.updateMany({ where: { id: ids[t] }, data: { balance: { increment: amount } } })
      }
    }
    summary[c.slug] = ids.length
  }
  return summary
}
