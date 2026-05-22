"use client"

import { useState } from "react"

export type AuditLogEntry = {
  id:         string
  createdAt:  string
  actorName:  string
  targetName: string | null
  action:     string
  details:    string | null
  amount:     number | null
  reason:     string | null
}

type FilterTab = "all" | "approvals" | "grants" | "config"

const FILTER_ACTIONS: Record<FilterTab, string[] | null> = {
  all:       null,
  approvals: ["approve_claim", "decline_claim", "approve_redemption", "decline_redemption"],
  grants:    ["adjust_balance"],
  config:    ["change_role"],
}

const ACTION_LABELS: Record<string, string> = {
  approve_claim:      "approved a claim",
  decline_claim:      "declined a claim",
  approve_redemption: "approved a redemption",
  decline_redemption: "declined a redemption",
  adjust_balance:     "adjusted balance",
  change_role:        "changed role",
}

const ACTION_CATEGORY: Record<string, FilterTab> = {
  approve_claim:      "approvals",
  decline_claim:      "approvals",
  approve_redemption: "approvals",
  decline_redemption: "approvals",
  adjust_balance:     "grants",
  change_role:        "config",
}

function timeAgo(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (secs < 60)    return "just now"
  if (secs < 3600)  return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  return `${Math.floor(secs / 86400)}d ago`
}

const FILTER_TABS: { id: FilterTab; label: string }[] = [
  { id: "all",       label: "All" },
  { id: "approvals", label: "Approvals" },
  { id: "grants",    label: "Grants" },
  { id: "config",    label: "Config" },
]

export default function AuditPanel({ logs }: { logs: AuditLogEntry[] }) {
  const [activeFilter, setActiveFilter] = useState<FilterTab>("all")

  const allowedActions = FILTER_ACTIONS[activeFilter]
  const filtered = allowedActions
    ? logs.filter((l) => allowedActions.includes(l.action))
    : logs

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">Audit log</h2>
        <span className="report-period">Every admin action, recorded.</span>
      </div>

      <div className="audit-filter-tabs">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.id}
            className={`audit-filter-tab${activeFilter === tab.id ? " active" : ""}`}
            onClick={() => setActiveFilter(tab.id)}
          >
            {tab.label}
            {tab.id !== "all" && (
              <span className="audit-tab-count">
                {logs.filter((l) => FILTER_ACTIONS[tab.id]?.includes(l.action)).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="report-empty">
          No {activeFilter === "all" ? "" : activeFilter + " "}actions recorded yet.
        </p>
      ) : (
        <div className="audit-list">
          {filtered.map((log) => {
            const category = ACTION_CATEGORY[log.action] ?? "config"
            return (
              <div key={log.id} className="audit-row">
                <div className={`audit-dot audit-dot-${category}`} />
                <div className="audit-content">
                  <div className="audit-main">
                    <span className="audit-actor">{log.actorName}</span>
                    <span className="audit-verb">
                      {ACTION_LABELS[log.action] ?? log.action}
                    </span>
                    {log.targetName && (
                      <span className="audit-target">for {log.targetName}</span>
                    )}
                    {log.amount != null && (
                      <span className={`audit-amount${log.amount >= 0 ? " positive" : " negative"}`}>
                        {log.amount > 0 ? "+" : ""}{log.amount}đ
                      </span>
                    )}
                  </div>
                  {(log.details || log.reason) && (
                    <div className="audit-sub">
                      {log.details && <span>{log.details}</span>}
                      {log.reason && (
                        <span className="audit-reason">Reason: {log.reason}</span>
                      )}
                    </div>
                  )}
                </div>
                <span className="audit-time">{timeAgo(log.createdAt)}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
