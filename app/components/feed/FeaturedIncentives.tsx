import Link from "next/link"

export type FeaturedIncentiveItem = {
  id:     string
  title:  string
  reward: number
  icon:   string
  color:  string
}

export default function FeaturedIncentives({
  incentives,
}: {
  incentives: FeaturedIncentiveItem[]
}) {
  if (incentives.length === 0) return null

  return (
    <div className="featured-incentives-strip">
      {incentives.map((inc) => (
        <Link
          key={inc.id}
          href="/earn"
          className="featured-incentive"
          style={
            {
              "--fi-accent":      inc.color,
              "--fi-accent-soft": inc.color + "18",
            } as React.CSSProperties
          }
        >
          <div className="featured-incentive-icon">{inc.icon}</div>
          <div className="featured-incentive-body">
            <div className="featured-incentive-eyebrow">Earn drops</div>
            <div className="featured-incentive-title">{inc.title}</div>
          </div>
          <div className="featured-incentive-reward">+{inc.reward}đ</div>
        </Link>
      ))}
    </div>
  )
}
