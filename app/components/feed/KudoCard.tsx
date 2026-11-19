"use client"

import { useState, useOptimistic, useTransition, useEffect, useRef } from "react"
import { toggleReaction } from "@/app/actions/toggleReaction"
import { pileOn } from "@/app/actions/pileOn"
import { avatarColor } from "@/lib/avatarColor"
import Avatar from "@/app/components/ui/Avatar"
import {
  REACTION_CHOICES,
  PILE_ON_STEP,
  PILE_ON_CAP,
  PILE_ON_MAX_TAPS,
  PILE_ON_LABEL,
  PILE_ON_BUTTON,
  STAR,
  formatStars,
} from "@/lib/brand"

type Person = { id: string; fullName: string; email: string; thumbnailUrl: string | null }
type PileRow = { userId: string; amount: number; user: { fullName: string; email: string; thumbnailUrl: string | null } }

export type FeedKudo = {
  id: string
  amount: number
  message: string
  values: string[]
  isPrivate: boolean
  createdAt: string
  from: Person
  to: Person
  reactions: { emoji: string; userId: string }[]
  /** One entry per person (summed). */
  pileOns: PileRow[]
}

type ReactionSummary = { emoji: string; count: number; reacted: boolean }[]

function timeAgo(date: string): string {
  const secs = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (secs < 60) return "just now"
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  return `${Math.floor(secs / 86400)}d ago`
}

function summarize(reactions: FeedKudo["reactions"], currentUserId: string): ReactionSummary {
  const counts = new Map<string, number>()
  const mine = new Set(reactions.filter((r) => r.userId === currentUserId).map((r) => r.emoji))
  for (const r of reactions) counts.set(r.emoji, (counts.get(r.emoji) ?? 0) + 1)
  return [...counts.entries()].map(([emoji, count]) => ({ emoji, count, reacted: mine.has(emoji) }))
}

function PileAvatar({ user }: { user: PileRow["user"] }) {
  const [failed, setFailed] = useState(false)
  const color = avatarColor(user.email ?? user.fullName)
  const initials = user.fullName.split(" ").filter(Boolean).map((n) => n[0]).join("").slice(0, 2).toUpperCase()
  if (user.thumbnailUrl && !failed) {
    const src = user.thumbnailUrl.startsWith("https://lh3.googleusercontent.com/")
      ? `/api/avatar?url=${encodeURIComponent(user.thumbnailUrl)}`
      : user.thumbnailUrl
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={user.fullName} className="pile-avatar" referrerPolicy="no-referrer" onError={() => setFailed(true)} title={user.fullName} />
    )
  }
  return <div className={`pile-avatar avatar ${color}`} title={user.fullName}>{initials}</div>
}

export default function KudoCard({ kudo, currentUserId }: { kudo: FeedKudo; currentUserId: string }) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [isCommitPending, startCommitTransition] = useTransition()
  const pickerRef = useRef<HTMLDivElement>(null)

  const [optimistic, applyOptimistic] = useOptimistic(
    summarize(kudo.reactions, currentUserId),
    (prev: ReactionSummary, emoji: string) => {
      const existing = prev.find((r) => r.emoji === emoji)
      if (existing) {
        return prev
          .map((r) => (r.emoji === emoji ? { ...r, count: r.reacted ? r.count - 1 : r.count + 1, reacted: !r.reacted } : r))
          .filter((r) => r.count > 0)
      }
      return [...prev, { emoji, count: 1, reacted: true }]
    }
  )

  // Pile on: stage taps locally (no DB write), then commit once.
  const committed = kudo.pileOns.find((r) => r.userId === currentUserId)?.amount ?? 0
  const headroom = Math.max(0, PILE_ON_CAP - committed)
  const [staged, setStaged] = useState(0)
  const [pileError, setPileError] = useState<string | null>(null)
  const [tapKey, setTapKey] = useState(0)
  const [sentKey, setSentKey] = useState(0)

  useEffect(() => {
    if (!pickerOpen) return
    function onDown(e: MouseEvent | TouchEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setPickerOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("touchstart", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("touchstart", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [pickerOpen])

  function handleReact(emoji: string) {
    setPickerOpen(false)
    startTransition(async () => {
      applyOptimistic(emoji)
      await toggleReaction(kudo.id, emoji)
    })
  }

  // Not on private kudos, not on a kudo you received, not on your own kudo.
  const canPileOn = !kudo.isPrivate && kudo.from.id !== currentUserId && kudo.to.id !== currentUserId
  const atCap = staged >= headroom
  const tapsUsed = Math.round((committed + staged) / PILE_ON_STEP)

  function handleTap() {
    if (atCap || isCommitPending) return
    setTapKey((k) => k + 1)
    setStaged((s) => Math.min(s + PILE_ON_STEP, headroom))
    setPileError(null)
  }

  function handleCommit() {
    if (staged === 0 || isCommitPending) return
    const amount = staged
    startCommitTransition(async () => {
      const result = await pileOn(kudo.id, amount)
      if (result.error) {
        setPileError(result.error)
      } else {
        setStaged(0)
        setPileError(null)
        setSentKey((k) => k + 1)
      }
    })
  }

  const pileTotal = kudo.pileOns.reduce((s, r) => s + r.amount, 0)

  return (
    <div className={`kudo${kudo.isPrivate ? " kudo-private" : ""}`}>
      <Avatar name={kudo.from.fullName} email={kudo.from.email} thumbnailUrl={kudo.from.thumbnailUrl} />

      <div className="kudo-content">
        <div className="kudo-header">
          <div className="kudo-header-main">
            <span className="kudo-from">{kudo.from.fullName}</span>
            <span className="kudo-arrow">→</span>
            <span className="kudo-to">{kudo.to.fullName}</span>
            <span className="kudo-amount">+{formatStars(kudo.amount)}</span>
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

        {/* Reactions: small outlined chips. */}
        <div className="kudo-actions">
          {optimistic.map(({ emoji, count, reacted }) => (
            <button
              key={emoji}
              className={`react-btn${reacted ? " reacted" : ""}`}
              onClick={() => handleReact(emoji)}
              disabled={isPending}
              aria-pressed={reacted}
            >
              <span>{emoji}</span>
              <span className="count">{count}</span>
            </button>
          ))}
          <div className="reaction-picker-wrap" ref={pickerRef}>
            <button
              className="react-btn react-add"
              onClick={() => setPickerOpen((v) => !v)}
              aria-label="Add reaction"
              aria-expanded={pickerOpen}
              disabled={isPending}
            >
              +
            </button>
            {pickerOpen && (
              <div className="reaction-picker" role="menu">
                {REACTION_CHOICES.map((e) => (
                  <button key={e} className="reaction-choice" onClick={() => handleReact(e)} role="menuitem">
                    {e}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Pile on: a solid accent pill on its own row, never confused with the ⭐ reaction. */}
        {canPileOn && (
          <div className="pile-controls">
            <button
              className={`pile-btn${atCap ? " capped" : ""}`}
              onClick={handleTap}
              disabled={atCap || isCommitPending}
              title={
                atCap
                  ? `You've reached the ${formatStars(PILE_ON_CAP)} limit on this kudo`
                  : `Tap to add ${formatStars(PILE_ON_STEP)}, then send. Comes from your stars to give.`
              }
            >
              <span key={tapKey} className={tapKey > 0 ? "pile-pop" : ""}>{atCap && staged === 0 ? "Maxed" : PILE_ON_BUTTON}</span>
              <span className="pile-dots" aria-label={`${tapsUsed} of ${PILE_ON_MAX_TAPS} taps used`}>
                {Array.from({ length: PILE_ON_MAX_TAPS }, (_, i) => (
                  <span
                    key={i}
                    className={`pile-dot${i < committed / PILE_ON_STEP ? " sent" : i < tapsUsed ? " staged" : ""}`}
                  />
                ))}
              </span>
            </button>

            {staged > 0 && (
              <>
                <button className="pile-send-btn" onClick={handleCommit} disabled={isCommitPending}>
                  <span key={sentKey} className={sentKey > 0 ? "pile-sent-pop" : ""}>
                    {isCommitPending ? "Sending…" : `Send +${staged} ${STAR}`}
                  </span>
                </button>
                <button
                  className="pile-cancel-btn"
                  onClick={() => { setStaged(0); setPileError(null) }}
                  disabled={isCommitPending}
                >
                  Cancel
                </button>
              </>
            )}

            {pileError && <span className="pile-error" role="alert">{pileError}</span>}
          </div>
        )}

        {pileTotal > 0 && (
          <div className="pile-strip">
            <div className="pile-avatars">
              {kudo.pileOns.slice(0, 5).map((r) => (
                <PileAvatar key={r.userId} user={r.user} />
              ))}
            </div>
            <span>
              {PILE_ON_LABEL}: +{formatStars(pileTotal)} from {kudo.pileOns.length}{" "}
              {kudo.pileOns.length === 1 ? "person" : "people"}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
