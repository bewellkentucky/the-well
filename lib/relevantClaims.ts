type Incentive = {
  id: string
  cap: string
}

type RawClaim = {
  incentiveId: string
  status: string
  createdAt: Date
}

export type ClaimStatus = {
  incentiveId: string
  status: string
}

export function buildRelevantClaims(
  incentives: Incentive[],
  claims: RawClaim[],
  now: Date,
): ClaimStatus[] {
  return incentives.flatMap((inc) => {
    const incClaims = claims.filter((c) => c.incentiveId === inc.id)
    if (incClaims.length === 0) return []

    if (inc.cap === "monthly") {
      const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
      const recent = incClaims.find((c) => new Date(c.createdAt) >= since)
      return recent ? [{ incentiveId: inc.id, status: recent.status }] : []
    }
    if (inc.cap === "quarterly") {
      const q = Math.floor(now.getUTCMonth() / 3)
      const since = new Date(Date.UTC(now.getUTCFullYear(), q * 3, 1))
      const recent = incClaims.find((c) => new Date(c.createdAt) >= since)
      return recent ? [{ incentiveId: inc.id, status: recent.status }] : []
    }
    if (inc.cap === "unlimited") return []
    // "once" — any non-declined claim ever blocks it
    return [{ incentiveId: inc.id, status: incClaims[0].status }]
  })
}
