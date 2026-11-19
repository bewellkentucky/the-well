"use client"

import { usePathname } from "next/navigation"
import { useState, useEffect, useRef } from "react"
import { formatStars } from "@/lib/brand"

// Mobile only: the slot shows the wordmark on Home at the top, and the two
// balances everywhere else (or once you scroll Home). Hysteresis: switch to
// balances past 24px, back to the wordmark at 8px or less.
export default function NavWordmark({
  givingBalance,
  balance,
  companyName,
}: {
  givingBalance: number
  balance: number
  companyName: string
}) {
  const pathname = usePathname()
  const isHome = pathname === "/"
  const [atTop, setAtTop] = useState(true)
  const stateRef = useRef<"top" | "scrolled">("top")

  useEffect(() => {
    if (!isHome) return
    function onScroll() {
      const sy = window.scrollY
      if (stateRef.current === "top" && sy > 24) {
        stateRef.current = "scrolled"
        setAtTop(false)
      } else if (stateRef.current === "scrolled" && sy <= 8) {
        stateRef.current = "top"
        setAtTop(true)
      }
    }
    // Read the current position on entry, off the effect's synchronous path.
    const raf = requestAnimationFrame(() => {
      stateRef.current = window.scrollY > 24 ? "scrolled" : "top"
      setAtTop(stateRef.current === "top")
    })
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("scroll", onScroll)
    }
  }, [isHome])

  const showWordmark = isHome && atTop

  return (
    <div className="tnav-wm-slot">
      <div className={`tnav-wm-wordmark${showWordmark ? " visible" : ""}`}>
        <div className="tnav-name">Spotlight</div>
        {companyName && <div className="tnav-parent">{companyName}</div>}
      </div>
      <div className={`tnav-wm-balances${showWordmark ? "" : " visible"}`}>
        <span className="tnav-bal-num">{formatStars(givingBalance)}</span>
        <span className="tnav-bal-unit">give</span>
        <span className="tnav-bal-dot"> · </span>
        <span className="tnav-bal-num">{formatStars(balance)}</span>
        <span className="tnav-bal-unit">earned</span>
      </div>
    </div>
  )
}
