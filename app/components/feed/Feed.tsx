import { db } from "@/lib/db"
import KudoCard from "./KudoCard"

export default async function Feed({ currentUserId }: { currentUserId: string }) {
  const kudos = await db.kudo.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    where: {
      OR: [
        { isPrivate: false },
        { fromId: currentUserId },
        { toId: currentUserId },
      ],
    },
    include: {
      from: { select: { id: true, fullName: true, email: true, thumbnailUrl: true } },
      to:   { select: { id: true, fullName: true, email: true, thumbnailUrl: true } },
      reactions: { include: { user: { select: { id: true } } } },
      rains: {
        select: { userId: true, amount: true, user: { select: { fullName: true, email: true, thumbnailUrl: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  })

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">Recent recognition</h2>
      </div>
      {kudos.length === 0 ? (
        <p style={{ fontSize: 14, color: "var(--ink-soft)", textAlign: "center", padding: "32px 0" }}>
          No kudos yet. Be the first to recognize someone.
        </p>
      ) : (
        <div>
          {kudos.map((kudo) => (
            <KudoCard key={kudo.id} kudo={kudo} currentUserId={currentUserId} />
          ))}
        </div>
      )}
    </div>
  )
}
