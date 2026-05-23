"use client"

import { usePathname } from "next/navigation"
import { useState, useEffect, useRef } from "react"

export default function NavWordmark({
  givingBalance,
  balance,
}: {
  givingBalance: number
  balance: number
}) {
  const pathname = usePathname()
  const isHome = pathname === "/"
  const [showWordmark, setShowWordmark] = useState(isHome)
  const stateRef = useRef<"wordmark" | "balances">(isHome ? "wordmark" : "balances")

  useEffect(() => {
    if (!isHome) {
      setShowWordmark(false)
      stateRef.current = "balances"
      return
    }

    // Check current scroll immediately on home entry
    const atTop = window.scrollY <= 8
    setShowWordmark(atTop)
    stateRef.current = atTop ? "wordmark" : "balances"

    function onScroll() {
      const sy = window.scrollY
      const cur = stateRef.current
      if (cur === "wordmark" && sy > 24) {
        stateRef.current = "balances"
        setShowWordmark(false)
      } else if (cur === "balances" && sy <= 8) {
        stateRef.current = "wordmark"
        setShowWordmark(true)
      }
    }

    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [isHome])

  return (
    <div className="tnav-wm-slot">
      <div className={`tnav-wm-wordmark${showWordmark ? " visible" : ""}`}>
        <div className="tnav-name">The Well</div>
        <div className="tnav-parent">by Be Well Kentucky</div>
      </div>
      <div className={`tnav-wm-balances${showWordmark ? "" : " visible"}`}>
        <span className="tnav-bal-num">{givingBalance}</span>
        <span className="tnav-bal-unit">đ give</span>
        <span className="tnav-bal-dot"> · </span>
        <span className="tnav-bal-num">{balance}</span>
        <span className="tnav-bal-unit">đ earned</span>
      </div>
    </div>
  )
}
