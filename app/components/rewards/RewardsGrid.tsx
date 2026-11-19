"use client"

import { useState, useTransition } from "react"
import { redeemReward } from "@/app/actions/redeemReward"

export type RewardItem = {
  id: string
  title: string
  description: string
  cost: number
  category: string
  inventory: number | null
  icon: string
  color: string
  imageUrl: string | null
}

// Purely presentational — no local state, no transition
function RewardCard({
  reward,
  balance,
  onRedeemClick,
}: {
  reward: RewardItem
  balance: number
  onRedeemClick: () => void
}) {
  const canAfford = balance >= reward.cost
  const outOfStock = reward.inventory !== null && reward.inventory <= 0
  const color = /^#[0-9a-fA-F]{6}$/.test(reward.color) ? reward.color : "#c2410c"

  return (
    <div className="reward-card">
      <div className="reward-image" style={{ background: `${color}1a` }}>
        <span className="reward-tag">{reward.category}</span>
        {reward.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="reward-photo" src={reward.imageUrl} alt="" />
        ) : (
          <div className="reward-icon-art" aria-hidden="true">{reward.icon}</div>
        )}
      </div>
      <div className="reward-body">
        <div className="reward-title">{reward.title}</div>
        <div className="reward-desc">{reward.description}</div>
      </div>
      <div className="reward-footer">
        <span className="reward-cost">
          {reward.cost.toLocaleString()}<em> ⭐</em>
        </span>
        {canAfford && !outOfStock ? (
          <button className="reward-btn" onClick={onRedeemClick}>
            Redeem
          </button>
        ) : (
          <span className="reward-btn-cant">
            {outOfStock
              ? "Unavailable"
              : `Need ${(reward.cost - balance).toLocaleString()} ⭐ more`}
          </span>
        )}
      </div>
    </div>
  )
}

export default function RewardsGrid({
  rewards,
  balance,
}: {
  rewards: RewardItem[]
  balance: number
}) {
  // Modal state lives here — outside the card DOM tree, so CSS transforms on
  // cards can't trap it and RSC prop updates to cards can't race with it.
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [actionError, setActionError] = useState<string | null>(null)

  const confirmingReward = rewards.find((r) => r.id === confirmingId) ?? null

  function openModal(id: string) {
    setConfirmingId(id)
    setActionError(null)
  }

  function closeModal() {
    setConfirmingId(null)
    setActionError(null)
  }

  function handleConfirm() {
    if (!confirmingId || isPending) return
    setActionError(null)
    startTransition(async () => {
      const result = await redeemReward(confirmingId)
      if (result.error) {
        setActionError(result.error)
      } else {
        setConfirmingId(null)
      }
    })
  }

  const color =
    confirmingReward && /^#[0-9a-fA-F]{6}$/.test(confirmingReward.color)
      ? confirmingReward.color
      : "#c2410c"

  return (
    <>
      <div className="dir-topbar" style={{ marginBottom: 20 }}>
        <div>
          <h1 className="page-title">Rewards</h1>
          <p className="page-subtitle">Spend what you've earned.</p>
        </div>
        <div className="balance-chip">
          <span className="balance-chip-label">Your stars</span>
          <span className="balance-chip-amount">{balance.toLocaleString()} ⭐</span>
          <span className="balance-chip-sublabel">Earned&nbsp;&middot;&nbsp;yours to spend</span>
        </div>
      </div>

      <div className="rewards-grid">
        {rewards.map((r) => (
          <RewardCard
            key={r.id}
            reward={r}
            balance={balance}
            onRedeemClick={() => openModal(r.id)}
          />
        ))}
      </div>

      {/* Modal rendered here — sibling of the grid, not inside any card.
          position:fixed works correctly from this level. */}
      {confirmingReward && (
        <div className="reward-modal-backdrop" onClick={closeModal}>
          <div className="reward-modal" onClick={(e) => e.stopPropagation()}>
            <div
              className="reward-modal-img"
              style={{ background: `${color}1a`, position: "relative" }}
            >
              <div className="reward-icon-art" aria-hidden="true">{confirmingReward.icon}</div>
            </div>
            <div className="reward-modal-body">
              <div className="reward-modal-title">{confirmingReward.title}</div>
              <p className="reward-modal-desc">{confirmingReward.description}</p>
              <div className="reward-modal-cost">
                <span>{confirmingReward.cost.toLocaleString()} ⭐</span>
                <span style={{ color: "var(--ink-soft)", fontSize: 13 }}>
                  &nbsp;from your {balance.toLocaleString()} ⭐ earned
                </span>
              </div>
              {actionError && (
                <p className="reward-error" style={{ margin: "0 0 12px" }}>
                  {actionError}
                </p>
              )}
              <div className="reward-modal-actions">
                <button
                  className="reward-btn reward-btn-confirm"
                  onClick={handleConfirm}
                  disabled={isPending}
                >
                  {isPending ? "Redeeming…" : "Confirm redemption"}
                </button>
                <button
                  className="reward-btn-cancel"
                  onClick={closeModal}
                  disabled={isPending}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
