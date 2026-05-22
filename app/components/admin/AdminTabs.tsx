"use client"

import Link from "next/link"
import { ADMIN_TABS, type AdminTabId } from "@/lib/adminTabsConfig"

export default function AdminTabs({
  activeTab,
  pendingCount = 0,
}: {
  activeTab: AdminTabId
  pendingCount?: number
}) {
  return (
    <div className="admin-tabs">
      {ADMIN_TABS.map((tab) => (
        <Link
          key={tab.id}
          href={`/admin?tab=${tab.id}`}
          className={`admin-tab${activeTab === tab.id ? " active" : ""}`}
          scroll={false}
        >
          {tab.label}
          {tab.id === "approvals" && pendingCount > 0 && (
            <span className="admin-tab-badge">{pendingCount}</span>
          )}
        </Link>
      ))}
    </div>
  )
}
