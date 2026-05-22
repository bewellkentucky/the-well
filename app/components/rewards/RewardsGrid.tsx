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
}

const REWARD_COLORS: Record<string, string> = {
  "reward-1": "#7a9b7e",
  "reward-2": "#e8e2d6",
  "reward-3": "#c97b5c",
  "reward-4": "#5a7d5e",
  "reward-5": "#a8b89a",
  "reward-6": "#6b5b73",
  "reward-7": "#c97b5c",
  "reward-8": "#e8c4b3",
  "reward-9": "#2a3441",
}

function buildSvg(id: string, c: string): string {
  const svgs: Record<string, string> = {
    "reward-1": `<svg class="reward-svg" viewBox="0 0 200 160" xmlns="http://www.w3.org/2000/svg"><path d="M40 60 L40 130 L80 130 L80 80 L120 80 L120 130 L160 130 L160 60 L100 30 Z" fill="${c}" opacity="0.4"/><circle cx="100" cy="65" r="6" fill="#1a1410"/><text x="100" y="135" text-anchor="middle" font-family="serif" font-size="14" font-style="italic" fill="#1a1410">The Well</text></svg>`,
    "reward-2": `<svg class="reward-svg" viewBox="0 0 200 160" xmlns="http://www.w3.org/2000/svg"><rect x="60" y="50" width="60" height="80" rx="4" fill="#1a1410"/><rect x="60" y="50" width="60" height="20" fill="${c}"/><path d="M120 70 Q140 70 140 90 Q140 110 120 110" stroke="#1a1410" stroke-width="4" fill="none"/><ellipse cx="90" cy="48" rx="22" ry="4" fill="#fffbf2" opacity="0.3"/></svg>`,
    "reward-3": `<svg class="reward-svg" viewBox="0 0 200 160" xmlns="http://www.w3.org/2000/svg"><rect x="40" y="50" width="120" height="70" rx="8" fill="${c}"/><rect x="40" y="68" width="120" height="14" fill="#1a1410"/><text x="100" y="108" text-anchor="middle" font-family="monospace" font-size="10" fill="#fffbf2">$25.00</text></svg>`,
    "reward-4": `<svg class="reward-svg" viewBox="0 0 200 160" xmlns="http://www.w3.org/2000/svg"><circle cx="100" cy="80" r="45" fill="none" stroke="${c}" stroke-width="3"/><line x1="100" y1="80" x2="100" y2="50" stroke="#1a1410" stroke-width="3" stroke-linecap="round"/><line x1="100" y1="80" x2="125" y2="80" stroke="#1a1410" stroke-width="3" stroke-linecap="round"/><circle cx="100" cy="80" r="4" fill="#1a1410"/></svg>`,
    "reward-5": `<svg class="reward-svg" viewBox="0 0 200 160" xmlns="http://www.w3.org/2000/svg"><path d="M85 130 L85 90 Q85 60 100 50 Q115 60 115 90 L115 130 Z" fill="${c}"/><path d="M100 50 Q80 30 70 50" stroke="${c}" stroke-width="6" fill="none" stroke-linecap="round"/><path d="M100 60 Q120 40 130 60" stroke="${c}" stroke-width="6" fill="none" stroke-linecap="round"/><rect x="75" y="125" width="50" height="15" fill="#1a1410"/></svg>`,
    "reward-6": `<svg class="reward-svg" viewBox="0 0 200 160" xmlns="http://www.w3.org/2000/svg"><path d="M70 60 L70 120 Q70 130 80 130 L120 130 Q130 130 130 120 L130 60 Z" fill="${c}"/><circle cx="100" cy="50" r="8" fill="#1a1410"/><path d="M85 30 Q85 20 95 20" stroke="#fffbf2" stroke-width="2" fill="none" opacity="0.5"/><path d="M100 25 Q100 15 110 15" stroke="#fffbf2" stroke-width="2" fill="none" opacity="0.5"/></svg>`,
    "reward-7": `<svg class="reward-svg" viewBox="0 0 200 160" xmlns="http://www.w3.org/2000/svg"><ellipse cx="100" cy="100" rx="60" ry="10" fill="#1a1410"/><circle cx="80" cy="90" r="10" fill="${c}"/><circle cx="100" cy="85" r="12" fill="${c}"/><circle cx="120" cy="92" r="9" fill="${c}"/><path d="M70 75 L75 60 L85 65" stroke="#1a1410" stroke-width="2" fill="none"/></svg>`,
    "reward-8": `<svg class="reward-svg" viewBox="0 0 200 160" xmlns="http://www.w3.org/2000/svg"><path d="M60 70 L60 130 L140 130 L140 70 Z" fill="${c}"/><path d="M75 70 L75 55 Q75 45 100 45 Q125 45 125 55 L125 70" stroke="#1a1410" stroke-width="3" fill="none"/></svg>`,
    "reward-9": `<svg class="reward-svg" viewBox="0 0 200 160" xmlns="http://www.w3.org/2000/svg"><rect x="50" y="60" width="100" height="70" fill="${c}"/><rect x="50" y="60" width="100" height="10" fill="#e8a838"/><line x1="65" y1="85" x2="135" y2="85" stroke="#fffbf2" stroke-width="2"/><line x1="65" y1="95" x2="135" y2="95" stroke="#fffbf2" stroke-width="2"/><line x1="65" y1="105" x2="115" y2="105" stroke="#fffbf2" stroke-width="2"/></svg>`,
  }
  return svgs[id] ?? ""
}

const REWARD_PROVIDERS: Record<string, { label: string; cls: string }> = {
  "reward-1": { label: "🧵 Printful",   cls: "printful" },
  "reward-2": { label: "🧵 Printful",   cls: "printful" },
  "reward-3": { label: "✉ Tremendous",  cls: "tremendous" },
  "reward-4": { label: "✦ The Well",    cls: "internal" },
  "reward-5": { label: "✦ The Well",    cls: "internal" },
  "reward-6": { label: "✉ Tremendous",  cls: "tremendous" },
  "reward-7": { label: "✉ Tremendous",  cls: "tremendous" },
  "reward-8": { label: "🧵 Printful",   cls: "printful" },
  "reward-9": { label: "✦ The Well",    cls: "internal" },
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
  const color = REWARD_COLORS[reward.id] ?? "#7a9b7e"
  const provider = REWARD_PROVIDERS[reward.id]
  const svgHtml = buildSvg(reward.id, color)

  return (
    <div className="reward-card">
      <div className="reward-image" style={{ background: `${color}1a` }}>
        <span className="reward-tag">{reward.category}</span>
        {provider && (
          <span className={`provider-badge provider-badge-${provider.cls}`}>
            {provider.label}
          </span>
        )}
        <div className="reward-svg-wrap" dangerouslySetInnerHTML={{ __html: svgHtml }} />
      </div>
      <div className="reward-body">
        <div className="reward-title">{reward.title}</div>
        <div className="reward-desc">{reward.description}</div>
      </div>
      <div className="reward-footer">
        <span className="reward-cost">
          {reward.cost.toLocaleString()}<em>d</em>
        </span>
        {canAfford && !outOfStock ? (
          <button className="reward-btn" onClick={onRedeemClick}>
            Redeem
          </button>
        ) : (
          <span className="reward-btn-cant">
            {outOfStock
              ? "Unavailable"
              : `Need ${(reward.cost - balance).toLocaleString()}d more`}
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

  const color = confirmingReward ? (REWARD_COLORS[confirmingReward.id] ?? "#7a9b7e") : "#7a9b7e"
  const svgHtml = confirmingReward ? buildSvg(confirmingReward.id, color) : ""

  return (
    <>
      <div className="dir-topbar" style={{ marginBottom: 20 }}>
        <div>
          <h1 className="page-title">Rewards</h1>
          <p className="page-subtitle">Spend what you've earned.</p>
        </div>
        <div className="balance-chip">
          <span className="balance-chip-label">Your drops</span>
          <span className="balance-chip-amount">{balance.toLocaleString()}d</span>
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
              <div
                className="reward-svg-wrap"
                dangerouslySetInnerHTML={{ __html: svgHtml }}
              />
            </div>
            <div className="reward-modal-body">
              <div className="reward-modal-title">{confirmingReward.title}</div>
              <p className="reward-modal-desc">{confirmingReward.description}</p>
              <div className="reward-modal-cost">
                <span>{confirmingReward.cost.toLocaleString()}d</span>
                <span style={{ color: "var(--ink-soft)", fontSize: 13 }}>
                  &nbsp;from your {balance.toLocaleString()}d earned drops
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
