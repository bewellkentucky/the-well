"use client"

import { useState, useTransition } from "react"
import { claimIncentive } from "@/app/actions/claimIncentive"

export type ModalIncentive = {
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

export default function IncentiveClaimModal({
  incentive,
  onClose,
}: {
  incentive: ModalIncentive
  onClose: () => void
}) {
  const [note, setNote] = useState("")
  const [proofLink, setProofLink] = useState("")
  const [result, setResult] = useState<{ error?: string } | null>(null)
  const [isPending, startTransition] = useTransition()

  const success = result && !result.error

  function submit() {
    startTransition(async () => {
      const res = await claimIncentive(incentive.id, note || undefined, proofLink || undefined)
      setResult(res)
    })
  }

  return (
    <div className="reward-modal-backdrop" onClick={onClose}>
      <div className="reward-modal incentive-modal" onClick={(e) => e.stopPropagation()}>
        <div className="incentive-modal-header" style={{ background: incentive.color + "22" }}>
          <span className="incentive-modal-icon">{incentive.icon}</span>
        </div>
        <div className="reward-modal-body">
          {success ? (
            <div className="incentive-success">
              {incentive.verification === "self" ? (
                <>
                  <div className="incentive-success-icon">💧</div>
                  <div className="incentive-success-title">
                    {incentive.reward}đ added to your balance
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
              <button className="btn btn-primary" style={{ marginTop: 20, width: "100%" }} onClick={onClose}>
                Done
              </button>
            </div>
          ) : (
            <>
              <div className="reward-modal-title">{incentive.title}</div>
              <p className="reward-modal-desc">{incentive.description}</p>
              <div className="reward-modal-cost">
                <span>{incentive.reward}đ</span> reward
                {incentive.verification === "admin" && (
                  <span style={{ marginLeft: 12, fontSize: 12, color: "var(--ink-soft)", fontFamily: "var(--font-inter), sans-serif" }}>
                    pending admin review
                  </span>
                )}
              </div>

              {incentive.proofPrompt && (
                <div className="incentive-proof-field">
                  <label className="incentive-proof-label">{incentive.proofPrompt}</label>
                  <input
                    className="incentive-proof-input"
                    type="text"
                    placeholder="Link or description"
                    value={proofLink}
                    onChange={(e) => setProofLink(e.target.value)}
                  />
                  {incentive.verification === "admin" && (
                    <p className="incentive-proof-hint">Photo/screenshot upload coming soon.</p>
                  )}
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
                    : incentive.verification === "self"
                      ? `Claim ${incentive.reward}đ`
                      : "Submit for review"}
                </button>
                <button className="reward-btn-cancel" onClick={onClose}>Cancel</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
