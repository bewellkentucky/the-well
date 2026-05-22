import { avatarColor } from "@/lib/avatarColor"
import type { Kudo, User, Reaction } from "@/app/generated/prisma/client"

type KudoWithRelations = Kudo & {
  from: Pick<User, "id" | "fullName" | "email">
  to: Pick<User, "id" | "fullName" | "email">
  reactions: (Reaction & { user: Pick<User, "id"> })[]
}

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

function timeAgo(date: Date): string {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000)
  if (secs < 60) return "just now"
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  return `${Math.floor(secs / 86400)}d ago`
}

function groupReactions(reactions: KudoWithRelations["reactions"]) {
  const map = new Map<string, number>()
  for (const r of reactions) map.set(r.emoji, (map.get(r.emoji) ?? 0) + 1)
  return map
}

export default function KudoCard({
  kudo,
  currentUserId,
}: {
  kudo: KudoWithRelations
  currentUserId: string
}) {
  const color = avatarColor(kudo.from.email)
  const reactionMap = groupReactions(kudo.reactions)
  const myReactions = new Set(
    kudo.reactions.filter((r) => r.user.id === currentUserId).map((r) => r.emoji)
  )

  return (
    <div className={`kudo${kudo.isPrivate ? " kudo-private" : ""}`}>
      <div className={`avatar ${color}`.trim()}>
        {initials(kudo.from.fullName)}
      </div>

      <div className="kudo-content">
        <div className="kudo-header">
          <span className="kudo-from">{kudo.from.fullName}</span>
          <span className="kudo-arrow">→</span>
          <span className="kudo-to">{kudo.to.fullName}</span>
          <span className="kudo-amount">+{kudo.amount}d</span>
          {kudo.isPrivate && (
            <span className="kudo-private-badge">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
              </svg>
              Private
            </span>
          )}
          <span className="kudo-time">{timeAgo(kudo.createdAt)}</span>
        </div>

        <p className="kudo-message">{kudo.message}</p>

        {kudo.values.length > 0 && (
          <div className="kudo-values">
            {kudo.values.map((v) => (
              <span key={v} className="kudo-value-pill">{v}</span>
            ))}
          </div>
        )}

        <div className="kudo-actions">
          {[...reactionMap.entries()].map(([emoji, count]) => (
            <button
              key={emoji}
              className={`react-btn${myReactions.has(emoji) ? " reacted" : ""}`}
              disabled
            >
              <span>{emoji}</span>
              <span className="count">{count}</span>
            </button>
          ))}
          <button className="react-btn" disabled title="Reactions coming soon">+</button>
        </div>
      </div>
    </div>
  )
}
