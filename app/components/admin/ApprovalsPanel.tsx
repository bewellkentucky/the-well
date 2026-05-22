"use client"

import { useState, useTransition } from "react"
import Avatar from "@/app/components/ui/Avatar"
import {
  approveIncentiveClaim,
  declineIncentiveClaim,
  approveRedemption,
  declineRedemption,
} from "@/app/actions/adminApprovals"

// ── Types ─────────────────────────────────────────────────────

export type ApprovalClaim = {
  id: string
  user: { fullName: string; email: string; thumbnailUrl: string | null }
  incentive: { title: string; reward: number; icon: string; color: string }
  note: string | null
  proofLink: string | null
  createdAt: string
}

export type ApprovalRedemption = {
  id: string
  user: { fullName: string; email: string; thumbnailUrl: string | null }
  reward: { title: string }
  cost: number
  notes: string | null
  createdAt: string
}

export type DecidedClaim = {
  id: string
  user: { fullName: string; email: string; thumbnailUrl: string | null }
  incentive: { title: string; reward: number }
  status: string
  decidedAt: string | null
}

// ── Helpers ───────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1) return "just now"
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

// ── Pending claim row ─────────────────────────────────────────

function ClaimRow({ claim }: { claim: ApprovalClaim }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function act(action: (id: string) => Promise<{ error?: string }>) {
    setError(null)
    startTransition(async () => {
      const res = await action(claim.id)
      if (res.error) setError(res.error)
    })
  }

  return (
    <div className="approval-row">
      <Avatar name={claim.user.fullName} email={claim.user.email} thumbnailUrl={claim.user.thumbnailUrl} size="sm" />
      <div className="approval-info">
        <div className="approval-who">
          <span className="approval-name">{claim.user.fullName}</span>
          <span className="approval-arrow">claimed</span>
          <span className="approval-item">
            <span style={{ marginRight: 4 }}>{claim.incentive.icon}</span>
            {claim.incentive.title}
          </span>
        </div>
        {(claim.note || claim.proofLink) && (
          <div className="approval-detail">
            {claim.proofLink && (
              <span>
                Proof:{" "}
                <a href={claim.proofLink} target="_blank" rel="noopener noreferrer" className="approval-link">
                  {claim.proofLink}
                </a>
              </span>
            )}
            {claim.note && <span>{claim.proofLink ? " — " : ""}{claim.note}</span>}
          </div>
        )}
        {error && <div className="approval-error">{error}</div>}
        <div className="approval-meta">{timeAgo(claim.createdAt)}</div>
      </div>
      <div className="approval-right">
        <div className="approval-amount">{claim.incentive.reward}đ</div>
        <div className="approval-actions">
          <button
            className="approval-btn approve"
            disabled={isPending}
            onClick={() => act(approveIncentiveClaim)}
          >
            Approve
          </button>
          <button
            className="approval-btn decline"
            disabled={isPending}
            onClick={() => act(declineIncentiveClaim)}
          >
            Decline
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Pending redemption row ────────────────────────────────────

function RedemptionRow({ redemption }: { redemption: ApprovalRedemption }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function act(action: (id: string) => Promise<{ error?: string }>) {
    setError(null)
    startTransition(async () => {
      const res = await action(redemption.id)
      if (res.error) setError(res.error)
    })
  }

  return (
    <div className="approval-row">
      <Avatar name={redemption.user.fullName} email={redemption.user.email} thumbnailUrl={redemption.user.thumbnailUrl} size="sm" />
      <div className="approval-info">
        <div className="approval-who">
          <span className="approval-name">{redemption.user.fullName}</span>
          <span className="approval-arrow">redeemed</span>
          <span className="approval-item">{redemption.reward.title}</span>
        </div>
        {redemption.notes && <div className="approval-detail">{redemption.notes}</div>}
        {error && <div className="approval-error">{error}</div>}
        <div className="approval-meta">{timeAgo(redemption.createdAt)}</div>
      </div>
      <div className="approval-right">
        <div className="approval-amount">{redemption.cost}đ</div>
        <div className="approval-actions">
          <button
            className="approval-btn approve"
            disabled={isPending}
            onClick={() => act(approveRedemption)}
          >
            Approve
          </button>
          <button
            className="approval-btn decline"
            disabled={isPending}
            onClick={() => act(declineRedemption)}
          >
            Decline
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────

export default function ApprovalsPanel({
  pendingClaims,
  pendingRedemptions,
  recentDecisions,
}: {
  pendingClaims: ApprovalClaim[]
  pendingRedemptions: ApprovalRedemption[]
  recentDecisions: DecidedClaim[]
}) {
  const totalPending = pendingClaims.length + pendingRedemptions.length
  const hasRecent = recentDecisions.length > 0

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Pending */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Pending approvals</h2>
          {totalPending > 0 && (
            <span className="admin-tab-badge">{totalPending}</span>
          )}
        </div>
        <p style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 16, lineHeight: 1.5 }}>
          Incentive claims and reward redemptions that need admin sign-off before drops are credited or fulfillment begins.
        </p>

        {totalPending === 0 ? (
          <p style={{ fontSize: 14, color: "var(--ink-soft)", opacity: 0.7, padding: "8px 0 4px" }}>
            Nothing pending. All caught up.
          </p>
        ) : (
          <div>
            {pendingClaims.map((c) => <ClaimRow key={c.id} claim={c} />)}
            {pendingRedemptions.map((r) => <RedemptionRow key={r.id} redemption={r} />)}
          </div>
        )}
      </div>

      {/* Recently decided */}
      {hasRecent && (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Recently decided</h2>
          </div>
          <div>
            {recentDecisions.map((d) => (
              <div key={d.id} className="approval-row decided">
                <Avatar name={d.user.fullName} email={d.user.email} thumbnailUrl={d.user.thumbnailUrl} size="sm" />
                <div className="approval-info">
                  <div className="approval-who">
                    <span className="approval-name">{d.user.fullName}</span>
                    <span className="approval-arrow">·</span>
                    <span className="approval-item">{d.incentive.title}</span>
                  </div>
                  {d.decidedAt && (
                    <div className="approval-meta">{timeAgo(d.decidedAt)}</div>
                  )}
                </div>
                <div className="approval-right">
                  <div className="approval-amount" style={{ opacity: 0.6 }}>{d.incentive.reward}đ</div>
                  <span className={`claim-status ${d.status === "credited" ? "status-credited" : "status-declined"}`}>
                    {d.status === "credited" ? "Credited" : "Declined"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
