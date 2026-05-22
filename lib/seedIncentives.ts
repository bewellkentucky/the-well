import { db } from "@/lib/db"

const now = new Date()
const thisYear = now.getFullYear()

// Flu season: Oct 1 – Dec 31 of the current year
const fluStart = new Date(Date.UTC(thisYear, 9, 1))
const fluEnd   = new Date(Date.UTC(thisYear, 11, 31, 23, 59, 59))

// Current quarter window
function quarterWindow(): { startsAt: Date; endsAt: Date } {
  const m = now.getUTCMonth()
  const q = Math.floor(m / 3)
  const startsAt = new Date(Date.UTC(thisYear, q * 3, 1))
  const endsAt   = new Date(Date.UTC(thisYear, q * 3 + 3, 0, 23, 59, 59))
  return { startsAt, endsAt }
}

// Survey campaign: runs until end of current month
const surveyEnd = new Date(Date.UTC(thisYear, now.getUTCMonth() + 1, 0, 23, 59, 59))

const INCENTIVES = [
  {
    id: "incentive-1",
    title: "Get a Google Review",
    description: "Invite a client to leave a Google Review for Be Well Kentucky or LCED. Share the link, and when the review posts, submit the URL as proof.",
    reward: 200,
    verification: "admin",
    cap: "unlimited",
    icon: "⭐",
    color: "#c97b5c",
    proofPrompt: "Paste the Google Review URL",
    sortOrder: 1,
  },
  {
    id: "incentive-2",
    title: "Get your flu shot",
    description: "Protect yourself and clients by getting vaccinated before flu season peaks. Upload or link a photo of your vaccination record.",
    reward: 500,
    verification: "self",
    cap: "once",
    icon: "💉",
    color: "#7a9b7e",
    proofPrompt: "Link to your vaccination record (optional)",
    sortOrder: 2,
    startsAt: fluStart,
    endsAt: fluEnd,
  },
  {
    id: "incentive-3",
    title: "Refer a new hire",
    description: "Know someone great? Refer them for an open position. If they're hired and make it past their 90-day mark, you earn the reward.",
    reward: 1000,
    verification: "admin",
    cap: "unlimited",
    icon: "🤝",
    color: "#5a7d5e",
    proofPrompt: "Name and email of the person you referred",
    sortOrder: 3,
  },
  {
    id: "incentive-4",
    title: "Quarterly safety training",
    description: "Complete this quarter's required safety training module. Self-attest once you finish. Admin may spot-check completion records.",
    reward: 100,
    verification: "self",
    cap: "quarterly",
    icon: "🛡️",
    color: "#6b5b73",
    sortOrder: 4,
    ...quarterWindow(),
  },
  {
    id: "incentive-5",
    title: "Engagement survey",
    description: "Your voice shapes how we work. Complete this month's anonymous engagement survey and let us know how things are going.",
    reward: 50,
    verification: "self",
    cap: "once",
    icon: "📋",
    color: "#a8b89a",
    sortOrder: 5,
    startsAt: new Date(Date.UTC(thisYear, now.getUTCMonth(), 1)),
    endsAt: surveyEnd,
  },
] as const

export async function seedIncentives() {
  for (const inc of INCENTIVES) {
    await db.incentive.upsert({
      where: { id: inc.id },
      create: { ...(inc as any) },
      update: {},
    })
  }
}
