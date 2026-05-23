"use client"

import { useState, useOptimistic, useTransition, useEffect, useRef } from "react"
import { toggleReaction } from "@/app/actions/toggleReaction"
import { makeItRain } from "@/app/actions/makeItRain"
import { avatarColor } from "@/lib/avatarColor"
import Avatar from "@/app/components/ui/Avatar"
import type { Kudo, User, Reaction } from "@/app/generated/prisma/client"

// Mirrored from makeItRain.ts — kept here as plain constants so they never
// touch the "use server" file (non-function exports break that module).
const RAIN_STEP = 5
const RAIN_CAP  = 25

const REACTION_CHOICES = ["💧", "💛", "🙌", "🎉", "👏", "🔥", "💯", "🙏", "✨", "❤️"]

type RainRow = {
  userId: string
  amount: number
  user: Pick<User, "fullName" | "email" | "thumbnailUrl">
}

type KudoWithRelations = Omit<Kudo, "createdAt"> & {
  createdAt: string | Date
  from: Pick<User, "id" | "fullName" | "email" | "thumbnailUrl">
  to: Pick<User, "id" | "fullName" | "email" | "thumbnailUrl">
  reactions: (Reaction & { user: Pick<User, "id"> })[]
  rains: RainRow[]
}

type ReactionSummary = { emoji: string; count: number; reacted: boolean }[]

function timeAgo(date: string | Date): string {
  const secs = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (secs < 60) return "just now"
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  return `${Math.floor(secs / 86400)}d ago`
}

function summarize(reactions: KudoWithRelations["reactions"], currentUserId: string): ReactionSummary {
  const counts = new Map<string, number>()
  const mine = new Set(reactions.filter((r) => r.user.id === currentUserId).map((r) => r.emoji))
  for (const r of reactions) counts.set(r.emoji, (counts.get(r.emoji) ?? 0) + 1)
  return [...counts.entries()].map(([emoji, count]) => ({ emoji, count, reacted: mine.has(emoji) }))
}

function RainAvatar({ user }: { user: RainRow["user"] }) {
  const [failed, setFailed] = useState(false)
  const color = avatarColor(user.email ?? user.fullName)
  const initials = user.fullName.split(" ").filter(Boolean).map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()

  if (user.thumbnailUrl && !failed) {
    const src = user.thumbnailUrl.startsWith("https://lh3.googleusercontent.com/")
      ? `/api/avatar?url=${encodeURIComponent(user.thumbnailUrl)}`
      : user.thumbnailUrl
    return (
      <img
        src={src}
        alt={user.fullName}
        className={`rain-avatar ${color}`}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        title={user.fullName}
      />
    )
  }
  return (
    <div className={`rain-avatar ${color}`} title={user.fullName}>
      {initials}
    </div>
  )
}

export default function KudoCard({
  kudo,
  currentUserId,
}: {
  kudo: KudoWithRelations
  currentUserId: string
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [isCommitPending, startCommitTransition] = useTransition()
  const pickerRef = useRef<HTMLDivElement>(null)

  // Reaction optimistic state — unchanged
  const [optimistic, applyOptimistic] = useOptimistic(
    summarize(kudo.reactions, currentUserId),
    (prev: ReactionSummary, emoji: string) => {
      const existing = prev.find((r) => r.emoji === emoji)
      if (existing) {
        return prev
          .map((r) =>
            r.emoji === emoji
              ? { ...r, count: r.reacted ? r.count - 1 : r.count + 1, reacted: !r.reacted }
              : r
          )
          .filter((r) => r.count > 0)
      }
      return [...prev, { emoji, count: 1, reacted: true }]
    }
  )

  // Rain — stage-then-commit model.
  // staged:   local drops queued but not yet sent (no DB write until commit).
  // committed: drops already sent on prior commits for this kudo (from server).
  const committed = kudo.rains.find((r) => r.userId === currentUserId)?.amount ?? 0
  const headroom  = RAIN_CAP - committed            // how much more can be staged
  const [staged, setStaged]           = useState(0)
  const [commitError, setCommitError] = useState<string | null>(null)
  const [rainAnimKey, setRainAnimKey]     = useState(0)  // small tap animation
  const [commitAnimKey, setCommitAnimKey] = useState(0)  // big commit animation

  useEffect(() => {
    if (!pickerOpen) return
    function handleClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [pickerOpen])

  function handleReact(emoji: string) {
    setPickerOpen(false)
    startTransition(async () => {
      applyOptimistic(emoji)
      await toggleReaction(kudo.id, emoji)
    })
  }

  const canRain =
    !kudo.isPrivate &&
    kudo.from.id !== currentUserId &&
    kudo.to.id !== currentUserId

  const canStageMore = staged < headroom && !isCommitPending

  function handleStage() {
    if (!canStageMore) return
    setRainAnimKey((k) => k + 1)
    setStaged((s) => Math.min(s + RAIN_STEP, headroom))
    setCommitError(null)
  }

  function handleClear() {
    setStaged(0)
    setCommitError(null)
  }

  function handleCommit() {
    if (staged === 0 || isCommitPending) return
    const toCommit = staged
    startCommitTransition(async () => {
      const result = await makeItRain(kudo.id, toCommit)
      if (result.error) {
        setCommitError(result.error)
      } else {
        setStaged(0)
        setCommitError(null)
        setCommitAnimKey((k) => k + 1)
      }
    })
  }

  const serverTotal = kudo.rains.reduce((s, r) => s + r.amount, 0)
  const showStrip   = serverTotal > 0
  const isStageCapped = staged >= headroom   // client-side cap guard

  return (
    <div className={`kudo${kudo.isPrivate ? " kudo-private" : ""}`}>
      <Avatar
        name={kudo.from.fullName}
        email={kudo.from.email}
        thumbnailUrl={kudo.from.thumbnailUrl}
      />

      <div className="kudo-content">
        <div className="kudo-header">
          <div className="kudo-header-main">
            <span className="kudo-from">{kudo.from.fullName}</span>
            <span className="kudo-arrow">→</span>
            <span className="kudo-to">{kudo.to.fullName}</span>
            <span className="kudo-amount">+{kudo.amount}đ</span>
            {kudo.isPrivate && (
              <span className="kudo-private-badge">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
                </svg>
                Private
              </span>
            )}
          </div>
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
          {optimistic.map(({ emoji, count, reacted }) => (
            <button
              key={emoji}
              className={`react-btn${reacted ? " reacted" : ""}`}
              onClick={() => handleReact(emoji)}
              disabled={isPending}
            >
              <span>{emoji}</span>
              <span className="count">{count}</span>
            </button>
          ))}
          <div className="reaction-picker-wrap" ref={pickerRef}>
            <button
              className="react-btn"
              onClick={() => setPickerOpen((v) => !v)}
              aria-label="Add reaction"
              disabled={isPending}
            >
              +
            </button>
            {pickerOpen && (
              <div className="reaction-picker">
                {REACTION_CHOICES.map((e) => (
                  <button key={e} className="reaction-choice" onClick={() => handleReact(e)}>
                    {e}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Rain staging controls — separated from emoji reactions */}
        {canRain && (
          <div className="kudo-rain-controls">
            <button
              className={`kudo-rain-btn${isStageCapped ? " capped" : ""}`}
              onClick={handleStage}
              disabled={!canStageMore}
              title={
                isStageCapped
                  ? `You've reached the ${RAIN_CAP}đ limit`
                  : staged > 0
                  ? `Add ${RAIN_STEP}đ more (${staged}đ to add)`
                  : `Stage ${RAIN_STEP}đ — commit to send`
              }
            >
              <span key={rainAnimKey} className={rainAnimKey > 0 ? "rain-pop" : ""}>💧</span>
              <span>{isStageCapped ? "Maxed" : `+${RAIN_STEP}đ`}</span>
              {staged > 0 && <span className="rain-staged-badge">{staged}đ to add</span>}
            </button>

            {staged > 0 && (
              <>
                <button
                  className="kudo-rain-commit-btn"
                  onClick={handleCommit}
                  disabled={isCommitPending}
                >
                  <span key={commitAnimKey} className={commitAnimKey > 0 ? "rain-commit-pop" : ""}>
                    {isCommitPending ? "Sending…" : `Send ${staged}đ`}
                  </span>
                </button>
                <button
                  className="kudo-rain-cancel-btn"
                  onClick={handleClear}
                  disabled={isCommitPending}
                >
                  Cancel
                </button>
              </>
            )}

            {commitError && (
              <span className="kudo-rain-error">{commitError}</span>
            )}
          </div>
        )}

        {showStrip && (
          <div className="kudo-rain-strip">
            <div className="kudo-rain-avatars">
              {kudo.rains.slice(0, 5).map((r) => (
                <RainAvatar key={r.userId} user={r.user} />
              ))}
            </div>
            <span>
              +{serverTotal}đ from {kudo.rains.length}{" "}
              {kudo.rains.length === 1 ? "person" : "people"}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
