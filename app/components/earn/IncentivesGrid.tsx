"use client"

import { useState, useTransition } from "react"
import { claimIncentive } from "@/app/actions/claimIncentive"

type Incentive = {
  id: string
  title: string
  description: string
  reward: number
  verification: string
  cap: string
  icon: string
  color: string
  proofPrompt: string | null
  startsAt: Date | null
  endsAt: Date | null
}

type ClaimStatus = {
  incentiveId: string
  status: string // "pending" | "credited" | "declined"
}

type Props = {
  incentives: Incentive[]
  claims: ClaimStatus[]
}

function capLabel(cap: string): string {
  if (cap === "once") return "Once"
  if (cap === "monthly") return "Monthly"
  if (cap === "quarterly") return "Quarterly"
  return "Unlimited"
}

function windowLabel(inc: Incentive): string | null {
  if (!inc.endsAt) return null
  const end = new Date(inc.endsAt)
  return `Ends ${end.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
}

export default function IncentivesGrid({ incentives, claims }: Props) {
  const [selected, setSelected] = useState<Incentive | null>(null)
  const [note, setNote] = useState("")
  const [proofLink, setProofLink] = useState("")
  const [result, setResult] = useState<{ error?: string } | null>(null)
  const [isPending, startTransition] = useTransition()

  const claimMap = new Map(claims.map((c) => [c.incentiveId, c.status]))

  function openModal(inc: Incentive) {
    setSelected(inc)
    setNote("")
    setProofLink("")
    setResult(null)
  }

  function closeModal() {
    setSelected(null)
    setResult(null)
  }

  function submit() {
    if (!selected) return
    startTransition(async () => {
      const res = await claimIncentive(selected.id, note || undefined, proofLink || undefined)
      setResult(res)
      if (!res.error) {
        // Keep modal open to show confirmation
      }
    })
  }

  const claimed = selected ? claimMap.get(selected.id) : undefined
  const success = result && !result.error

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
                <div className="incentive-reward">{inc.reward}d</div>
                {badge ? (
                  <span className={`claim-status ${status === "pending" ? "status-pending" : "status-credited"}`}>
                    {badge}
                  </span>
                ) : (
                  <button className="incentive-claim-btn" onClick={() => openModal(inc)}>
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
        <div className="reward-modal-backdrop" onClick={closeModal}>
          <div className="reward-modal incentive-modal" onClick={(e) => e.stopPropagation()}>
            <div className="incentive-modal-header" style={{ background: selected.color + "22" }}>
              <span className="incentive-modal-icon">{selected.icon}</span>
            </div>
            <div className="reward-modal-body">
              {success ? (
                <div className="incentive-success">
                  {selected.verification === "self" ? (
                    <>
                      <div className="incentive-success-icon">💧</div>
                      <div className="incentive-success-title">
                        {selected.reward}d added to your balance
                      </div>
                      <p className="incentive-success-sub">Nice work. Keep it up.</p>
                    </>
                  ) : (
                    <>
                      <div className="incentive-success-icon">📬</div>
                      <div className="incentive-success-title">Claim submitted</div>
                      <p className="incentive-success-sub">
                        An admin will review your submission and credit your balance once approved.
                      </p>
                    </>
                  )}
                  <button className="btn btn-primary" style={{ marginTop: 20, width: "100%" }} onClick={closeModal}>
                    Done
                  </button>
                </div>
              ) : (
                <>
                  <div className="reward-modal-title">{selected.title}</div>
                  <p className="reward-modal-desc">{selected.description}</p>
                  <div className="reward-modal-cost">
                    <span>{selected.reward}d</span> reward
                    {selected.verification === "admin" && (
                      <span style={{ marginLeft: 12, fontSize: 12, color: "var(--ink-soft)", fontFamily: "var(--font-inter), sans-serif" }}>
                        pending admin review
                      </span>
                    )}
                  </div>

                  {selected.proofPrompt && (
                    <div className="incentive-proof-field">
                      <label className="incentive-proof-label">{selected.proofPrompt}</label>
                      <input
                        className="incentive-proof-input"
                        type="text"
                        placeholder="Link or description"
                        value={proofLink}
                        onChange={(e) => setProofLink(e.target.value)}
                      />
                    </div>
                  )}

                  <div className="incentive-proof-field">
                    <label className="incentive-proof-label">Note (optional)</label>
                    <input
                      className="incentive-proof-input"
                      type="text"
                      placeholder="Anything else we should know"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                  </div>

                  {result?.error && (
                    <p className="reward-error" style={{ padding: "0 0 12px" }}>{result.error}</p>
                  )}

                  <div className="reward-modal-actions">
                    <button
                      className="btn btn-primary reward-btn-confirm"
                      onClick={submit}
                      disabled={isPending}
                    >
                      {isPending
                        ? "Submitting..."
                        : selected.verification === "self"
                          ? `Claim ${selected.reward}d`
                          : "Submit for review"}
                    </button>
                    <button className="reward-btn-cancel" onClick={closeModal}>Cancel</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
