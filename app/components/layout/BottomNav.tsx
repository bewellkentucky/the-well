"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { NAV_TABS } from "./NavLinks"

export default function BottomNav() {
  const pathname = usePathname()
  return (
    <nav className="bottom-nav">
      <div className="bottom-nav-inner">
        {NAV_TABS.map((tab) => {
          const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href)
          return (
            <Link key={tab.href} href={tab.href} prefetch={false} className={`mnav-btn${active ? " active" : ""}`}>
              <div className="mnav-icon-wrap">
                <span className="mnav-icon">{tab.icon}</span>
              </div>
              {tab.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
