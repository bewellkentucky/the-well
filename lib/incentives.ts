// Incentive rules. ONE implementation, used by the claim server action, the
// Earn page, the Home featured strip and the tests. Before Spotlight these
// rules were copied in three places and drifted (Home and Earn disagreed on
// whether endsAt was inclusive, and cap logic was duplicated).
//
// Cap semantics:
//   unlimited -> never blocks; claim as often as you like
//   once      -> any non-declined claim, ever, blocks
//   monthly   -> a non-declined claim since the 1st of this UTC month blocks
//   quarterly -> a non-declined claim since the 1st of this UTC quarter blocks
// Declined claims never count, so a declined person can try again.

export const INCENTIVE_CAPS = ["once", "monthly", "quarterly", "unlimited"] as const
export type IncentiveCap = (typeof INCENTIVE_CAPS)[number]

export type ClaimLike = { incentiveId: string; status: string; createdAt: Date | string }
export type IncentiveLike = {
  id: string
  cap: string
  active?: boolean
  startsAt?: Date | string | null
  endsAt?: Date | string | null
}

/** Start of the cap period, or null when every past claim counts (once) or none do (unlimited). */
export function capPeriodStart(cap: string, now: Date): Date | null {
  if (cap === "monthly") return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  if (cap === "quarterly") {
    const q = Math.floor(now.getUTCMonth() / 3)
    return new Date(Date.UTC(now.getUTCFullYear(), q * 3, 1))
  }
  return null
}

/** Inclusive window: startsAt <= now <= endsAt (either bound optional). */
export function isInWindow(inc: IncentiveLike, now: Date): boolean {
  if (inc.startsAt && now < new Date(inc.startsAt)) return false
  if (inc.endsAt && now > new Date(inc.endsAt)) return false
  return true
}

/**
 * The claim that currently blocks a new claim, or null if the person may
 * claim. Pass this person's claims for this incentive (any order).
 */
export function blockingClaim<C extends ClaimLike>(cap: string, claims: C[], now: Date): C | null {
  if (cap === "unlimited") return null
  const live = claims
    .filter((c) => c.status !== "declined")
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  if (cap === "once") return live[0] ?? null
  const since = capPeriodStart(cap, now)
  if (!since) return live[0] ?? null // unknown cap: fail closed
  return live.find((c) => new Date(c.createdAt) >= since) ?? null
}

export type ClaimStatus = { incentiveId: string; status: string }

/** For UI badges: one blocking status per incentive (none for unlimited). */
export function buildClaimStatuses(incentives: IncentiveLike[], claims: ClaimLike[], now: Date): ClaimStatus[] {
  return incentives.flatMap((inc) => {
    const mine = claims.filter((c) => c.incentiveId === inc.id)
    const block = blockingClaim(inc.cap, mine, now)
    return block ? [{ incentiveId: inc.id, status: block.status }] : []
  })
}

/** Prisma `where` fragment for "active and inside its window" (inclusive end). */
export function activeIncentiveWhere(now: Date) {
  return {
    active: true,
    AND: [
      { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
      { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
    ],
  }
}

/** The one ordering used everywhere (admin list, Earn, Home featured). */
export const INCENTIVE_ORDER = [{ sortOrder: "asc" as const }, { title: "asc" as const }, { id: "asc" as const }]

export const INCENTIVE_PUBLIC_SELECT = {
  id: true,
  title: true,
  description: true,
  reward: true,
  verification: true,
  cap: true,
  icon: true,
  color: true,
  proofPrompt: true,
  startsAt: true,
  endsAt: true,
} as const
