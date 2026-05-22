"use client"

import { useState, useOptimistic, useTransition, useEffect, useRef } from "react"
import { toggleReaction } from "@/app/actions/toggleReaction"
import Avatar from "@/app/components/ui/Avatar"
import type { Kudo, User, Reaction } from "@/app/generated/prisma/client"

const REACTION_CHOICES = ["💧", "💛", "🙌", "🎉", "👏", "🔥", "💯", "🙏", "✨", "❤️"]

type KudoWithRelations = Omit<Kudo, "createdAt"> & {
  createdAt: string | Date
  from: Pick<User, "id" | "fullName" | "email" | "thumbnailUrl">
  to: Pick<User, "id" | "fullName" | "email" | "thumbnailUrl">
  reactions: (Reaction & { user: Pick<User, "id"> })[]
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

export default function KudoCard({
  kudo,
  currentUserId,
}: {
  kudo: KudoWithRelations
  currentUserId: string
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const pickerRef = useRef<HTMLDivElement>(null)

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

  return (
    <div className={`kudo${kudo.isPrivate ? " kudo-private" : ""}`}>
      <Avatar
        name={kudo.from.fullName}
        email={kudo.from.email}
        thumbnailUrl={kudo.from.thumbnailUrl}
      />

      <div className="kudo-content">
        <div className="kudo-header">
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
      </div>
    </div>
  )
}
