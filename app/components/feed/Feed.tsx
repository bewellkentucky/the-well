import { requireActor } from "@/lib/tenant"
import KudoCard, { type FeedKudo } from "./KudoCard"

export default async function Feed() {
  const actor = await requireActor()

  const kudos = await actor.db.kudo.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    where: {
      OR: [{ isPrivate: false }, { fromId: actor.userId }, { toId: actor.userId }],
    },
    include: {
      from: { select: { id: true, fullName: true, email: true, thumbnailUrl: true } },
      to: { select: { id: true, fullName: true, email: true, thumbnailUrl: true } },
      reactions: { select: { emoji: true, userId: true } },
      pileOns: {
        select: { userId: true, amount: true, user: { select: { fullName: true, email: true, thumbnailUrl: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  })

  // Collapse per-commit pile-on rows into one entry per person.
  const shaped: FeedKudo[] = kudos.map((k) => {
    const byUser = new Map<string, { userId: string; amount: number; user: (typeof k.pileOns)[number]["user"] }>()
    for (const p of k.pileOns) {
      const cur = byUser.get(p.userId)
      if (cur) cur.amount += p.amount
      else byUser.set(p.userId, { userId: p.userId, amount: p.amount, user: p.user })
    }
    return {
      id: k.id,
      amount: k.amount,
      message: k.message,
      values: k.values,
      isPrivate: k.isPrivate,
      createdAt: k.createdAt.toISOString(),
      from: k.from,
      to: k.to,
      reactions: k.reactions,
      pileOns: [...byUser.values()],
    }
  })

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">Recent recognition</h2>
      </div>
      {shaped.length === 0 ? (
        <p style={{ fontSize: 14, color: "var(--text-muted)", textAlign: "center", padding: "32px 0" }}>
          No kudos yet. Be the first to recognize someone.
        </p>
      ) : (
        <div>
          {shaped.map((kudo) => (
            <KudoCard key={kudo.id} kudo={kudo} currentUserId={actor.userId} />
          ))}
        </div>
      )}
    </div>
  )
}
