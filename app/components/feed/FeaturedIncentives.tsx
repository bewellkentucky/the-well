"use client"

import { useState } from "react"
import IncentiveClaimModal from "@/app/components/earn/IncentiveClaimModal"
import type { ModalIncentive } from "@/app/components/earn/IncentiveClaimModal"

type ClaimStatus = {
  incentiveId: string
  status: string
}

export default function FeaturedIncentives({
  incentives,
  claims,
}: {
  incentives: ModalIncentive[]
  claims: ClaimStatus[]
}) {
  const [selected, setSelected] = useState<ModalIncentive | null>(null)

  if (incentives.length === 0) return null

  const claimMap = new Map(claims.map((c) => [c.incentiveId, c.status]))

  return (
    <>
      <div className="featured-incentives-strip">
        {incentives.map((inc) => {
          const status = claimMap.get(inc.id)
          const badge =
            status === "credited" ? "Credited"
            : status === "pending" ? "Pending"
            : null

          return (
            <button
              key={inc.id}
              className="featured-incentive"
              style={
                {
                  "--fi-accent":      inc.color,
                  "--fi-accent-soft": inc.color + "18",
                } as React.CSSProperties
              }
              onClick={() => setSelected(inc)}
            >
              <div className="featured-incentive-icon">{inc.icon}</div>
              <div className="featured-incentive-body">
                <div className="featured-incentive-eyebrow">
                  {badge ?? "Earn drops"}
                </div>
                <div className="featured-incentive-title">{inc.title}</div>
              </div>
              <div className="featured-incentive-reward">+{inc.reward}đ</div>
            </button>
          )
        })}
      </div>

      {selected && (
        <IncentiveClaimModal incentive={selected} onClose={() => setSelected(null)} />
      )}
    </>
  )
}
