"use client"

import { useState } from "react"
import IncentiveClaimModal from "./IncentiveClaimModal"
import type { ModalIncentive } from "./IncentiveClaimModal"

type ClaimStatus = {
  incentiveId: string
  status: string
}

type Props = {
  incentives: ModalIncentive[]
  claims: ClaimStatus[]
}

function capLabel(cap: string): string {
  if (cap === "once") return "Once"
  if (cap === "monthly") return "Monthly"
  if (cap === "quarterly") return "Quarterly"
  return "Unlimited"
}

function windowLabel(inc: ModalIncentive): string | null {
  if (!inc.endsAt) return null
  const end = new Date(inc.endsAt)
  return `Ends ${end.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
}

export default function IncentivesGrid({ incentives, claims }: Props) {
  const [selected, setSelected] = useState<ModalIncentive | null>(null)
  const claimMap = new Map(claims.map((c) => [c.incentiveId, c.status]))

  return (
    <>
      <div className="incentives-grid">
        {incentives.map((inc) => {
          const status = claimMap.get(inc.id)
          const badge =
            status === "credited" ? "Credited"
            : status === "pending" ? "Pending review"
            : null

          return (
            <div key={inc.id} className="incentive-card">
              <div className="incentive-icon" style={{ background: inc.color + "22", color: inc.color }}>
                {inc.icon}
              </div>
              <div className="incentive-body">
                <div className="incentive-title">{inc.title}</div>
                <div className="incentive-desc">{inc.description}</div>
                <div className="incentive-meta">
                  <span className="incentive-chip">{capLabel(inc.cap)}</span>
                  {inc.verification === "admin" && (
                    <span className="incentive-chip chip-admin">Admin review</span>
                  )}
                  {windowLabel(inc) && (
                    <span className="incentive-chip chip-window">{windowLabel(inc)}</span>
                  )}
                </div>
              </div>
              <div className="incentive-action">
                <div className="incentive-reward">{inc.reward}đ</div>
                {badge ? (
                  <span className={`claim-status ${status === "pending" ? "status-pending" : "status-credited"}`}>
                    {badge}
                  </span>
                ) : (
                  <button className="incentive-claim-btn" onClick={() => setSelected(inc)}>
                    Claim
                  </button>
                )}
              </div>
            </div>
          )
        })}

        {/* Suggest an incentive — UI only */}
        <div className="incentive-card incentive-card-suggest">
          <div className="incentive-icon" style={{ background: "var(--cream-2)", color: "var(--ink-soft)" }}>
            💡
          </div>
          <div className="incentive-body">
            <div className="incentive-title" style={{ color: "var(--ink-soft)" }}>Suggest an incentive</div>
            <div className="incentive-desc">
              Have an idea for a new way to earn drops? Let us know and we'll consider adding it.
            </div>
          </div>
          <div className="incentive-action">
            <button
              className="incentive-claim-btn"
              style={{ background: "var(--cream-2)", color: "var(--ink-soft)" }}
              disabled
            >
              Coming soon
            </button>
          </div>
        </div>
      </div>

      {selected && (
        <IncentiveClaimModal incentive={selected} onClose={() => setSelected(null)} />
      )}
    </>
  )
}
