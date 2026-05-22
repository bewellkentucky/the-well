"use client"

import { useState, useTransition } from "react"
import Avatar from "@/app/components/ui/Avatar"
import { changeRole, adjustBalance } from "@/app/actions/adminPeople"

export type PersonRow = {
  id: string
  fullName: string
  email: string
  thumbnailUrl: string | null
  role: string
  balance: number
  givingBalance: number
  employmentStatus: string | null
}

export type RecentAdjustment = {
  id: string
  userName: string
  actorName: string
  amount: number
  reason: string
  createdAt: string
}

const ROLES = ["owner", "admin", "member"] as const
type Role = typeof ROLES[number]

const ROLE_DESC: Record<Role, string> = {
  owner:  "Full access including billing",
  admin:  "Approvals and catalog management",
  member: "Give and receive kudos",
}

function isTerminated(p: PersonRow) {
  return p.employmentStatus?.toLowerCase().includes("terminat") ?? false
}

function timeAgo(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (secs < 60)    return "just now"
  if (secs < 3600)  return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  return `${Math.floor(secs / 86400)}d ago`
}

export default function PeoplePanel({
  people,
  actorId,
  actorRole,
  recentAdjustments,
}: {
  people: PersonRow[]
  actorId: string
  actorRole: string
  recentAdjustments: RecentAdjustment[]
}) {
  // ── Role change ───────────────────────────────────────────────
  const [roleModal, setRoleModal] = useState<{
    targetId: string
    targetName: string
    currentRole: string
    selectedRole: string
  } | null>(null)
  const [roleError, setRoleError] = useState<string | null>(null)
  const [isPendingRole, startRoleTransition] = useTransition()

  function openRoleModal(person: PersonRow) {
    setRoleModal({
      targetId:     person.id,
      targetName:   person.fullName,
      currentRole:  person.role,
      selectedRole: person.role,
    })
    setRoleError(null)
  }

  function closeRoleModal() {
    if (!isPendingRole) { setRoleModal(null); setRoleError(null) }
  }

  function confirmRoleChange() {
    if (!roleModal || isPendingRole) return
    if (roleModal.selectedRole === roleModal.currentRole) { closeRoleModal(); return }
    setRoleError(null)
    startRoleTransition(async () => {
      const result = await changeRole(roleModal.targetId, roleModal.selectedRole)
      if (result.error) setRoleError(result.error)
      else setRoleModal(null)
    })
  }

  // ── Balance adjustment ────────────────────────────────────────
  const [adjTargetId, setAdjTargetId] = useState(people[0]?.id ?? "")
  const [adjAmount, setAdjAmount]     = useState("")
  const [adjReason, setAdjReason]     = useState("")
  const [adjFormError, setAdjFormError] = useState<string | null>(null)
  const [adjSuccess, setAdjSuccess]   = useState<string | null>(null)
  const [confirmingAdj, setConfirmingAdj] = useState<{
    targetId: string
    targetName: string
    currentBalance: number
    amount: number
    reason: string
  } | null>(null)
  const [adjActionError, setAdjActionError] = useState<string | null>(null)
  const [isPendingAdj, startAdjTransition] = useTransition()

  function reviewAdjustment() {
    setAdjFormError(null)
    const parsed = parseInt(adjAmount, 10)
    if (!adjTargetId)                        { setAdjFormError("Select a person."); return }
    if (isNaN(parsed) || parsed === 0)       { setAdjFormError("Enter a non-zero integer amount."); return }
    if (Math.abs(parsed) > 10_000)           { setAdjFormError("Amount cannot exceed ±10,000."); return }
    if (adjReason.trim().length < 3)         { setAdjFormError("Reason is required."); return }
    const target = people.find((p) => p.id === adjTargetId)!
    setConfirmingAdj({
      targetId:       adjTargetId,
      targetName:     target.fullName,
      currentBalance: target.balance,
      amount:         parsed,
      reason:         adjReason.trim(),
    })
    setAdjActionError(null)
  }

  function closeAdjModal() {
    if (!isPendingAdj) { setConfirmingAdj(null); setAdjActionError(null) }
  }

  function confirmAdjustment() {
    if (!confirmingAdj || isPendingAdj) return
    setAdjActionError(null)
    startAdjTransition(async () => {
      const result = await adjustBalance(
        confirmingAdj.targetId,
        confirmingAdj.amount,
        confirmingAdj.reason
      )
      if (result.error) {
        setAdjActionError(result.error)
      } else {
        const sign = confirmingAdj.amount > 0 ? "+" : ""
        setAdjSuccess(`${sign}${confirmingAdj.amount}đ applied to ${confirmingAdj.targetName}.`)
        setConfirmingAdj(null)
        setAdjAmount("")
        setAdjReason("")
        setTimeout(() => setAdjSuccess(null), 5000)
      }
    })
  }

  const isOwner = actorRole === "owner"
  const ownerCount = people.filter((p) => p.role === "owner").length

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* ── Section 1: Roles & permissions ────────────────────── */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Roles & permissions</h2>
        </div>
        <p className="people-explainer">
          Owners can do everything including billing. Admins can approve redemptions and edit the catalog. Members can give and receive kudos.
        </p>

        <div className="people-list">
          {people.map((person) => {
            const terminated = isTerminated(person)
            return (
              <div
                key={person.id}
                className={`people-row${terminated ? " people-row-terminated" : ""}`}
              >
                <Avatar
                  name={person.fullName}
                  email={person.email}
                  thumbnailUrl={person.thumbnailUrl}
                  size="sm"
                />
                <div className="people-info">
                  <div className="people-name">
                    {person.fullName}
                    {person.id === actorId && (
                      <span className="people-you">you</span>
                    )}
                    {terminated && (
                      <span className="people-terminated-tag">Terminated</span>
                    )}
                  </div>
                  <div className="people-email">{person.email}</div>
                </div>
                <div className="people-role-col">
                  <span className={`role-badge role-badge-${person.role}`}>
                    {person.role}
                  </span>
                  {isOwner && (() => {
                    const lastOwner = person.role === "owner" && ownerCount <= 1
                    return (
                      <button
                        className="role-change-btn"
                        onClick={() => !lastOwner && openRoleModal(person)}
                        disabled={lastOwner}
                        title={lastOwner ? "Can't change the only owner's role" : undefined}
                      >
                        Change
                      </button>
                    )
                  })()}
                </div>
                <div className="people-balance-col">
                  <span className="people-bal-amount">
                    {person.balance.toLocaleString()}đ
                  </span>
                  <span className="people-bal-label">earned</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Section 2: Balance adjustment ─────────────────────── */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Adjust someone's balance</h2>
        </div>
        <p className="people-explainer">
          One-off grants or corrections to a staff member's earned drops. All adjustments are logged for the audit trail.
        </p>

        <div className="adj-form">
          <div className="adj-form-row">
            <div className="adj-field">
              <label className="adj-label">Person</label>
              <select
                className="adj-select"
                value={adjTargetId}
                onChange={(e) => setAdjTargetId(e.target.value)}
              >
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.fullName}{isTerminated(p) ? " (terminated)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="adj-field adj-field-amount">
              <label className="adj-label">Amount (đ)</label>
              <input
                className="adj-input"
                type="number"
                step="1"
                min="-10000"
                max="10000"
                placeholder="+50 or -20"
                value={adjAmount}
                onChange={(e) => setAdjAmount(e.target.value)}
              />
            </div>
          </div>
          <div className="adj-field" style={{ marginTop: 12 }}>
            <label className="adj-label">
              Reason <span className="adj-required">required</span>
            </label>
            <input
              className="adj-input"
              type="text"
              placeholder="e.g. Google review bonus, correction for duplicate claim"
              value={adjReason}
              onChange={(e) => setAdjReason(e.target.value)}
              maxLength={200}
            />
          </div>
          {adjFormError && <p className="adj-error">{adjFormError}</p>}
          {adjSuccess   && <p className="adj-success">{adjSuccess}</p>}
          <button
            className="btn btn-primary"
            style={{ marginTop: 16 }}
            onClick={reviewAdjustment}
          >
            Review adjustment
          </button>
        </div>

        {recentAdjustments.length > 0 && (
          <div className="adj-history">
            <div className="adj-history-title">Recent adjustments</div>
            {recentAdjustments.map((adj) => (
              <div key={adj.id} className="adj-history-row">
                <div className="adj-history-info">
                  <span className="adj-history-name">{adj.userName}</span>
                  <span className="adj-history-reason">{adj.reason}</span>
                  <span className="adj-history-meta">
                    by {adj.actorName} · {timeAgo(adj.createdAt)}
                  </span>
                </div>
                <div className={`adj-history-amount${adj.amount > 0 ? " positive" : " negative"}`}>
                  {adj.amount > 0 ? "+" : ""}{adj.amount}đ
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Role change modal ──────────────────────────────────── */}
      {roleModal && (
        <div className="reward-modal-backdrop" onClick={closeRoleModal}>
          <div
            className="reward-modal"
            style={{ maxWidth: 400 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="reward-modal-body">
              <div className="reward-modal-title">
                Change {roleModal.targetName}&rsquo;s role
              </div>
              <p className="reward-modal-desc" style={{ marginBottom: 16 }}>
                Current role:{" "}
                <span className={`role-badge role-badge-${roleModal.currentRole}`}>
                  {roleModal.currentRole}
                </span>
              </p>
              <div className="role-options">
                {ROLES.map((role) => (
                  <label
                    key={role}
                    className={`role-option${roleModal.selectedRole === role ? " selected" : ""}`}
                  >
                    <input
                      type="radio"
                      name="newRole"
                      value={role}
                      checked={roleModal.selectedRole === role}
                      onChange={() =>
                        setRoleModal({ ...roleModal, selectedRole: role })
                      }
                    />
                    <span className={`role-badge role-badge-${role}`}>{role}</span>
                    <span className="role-option-desc">{ROLE_DESC[role]}</span>
                  </label>
                ))}
              </div>
              {roleError && (
                <p className="adj-error" style={{ marginTop: 10 }}>{roleError}</p>
              )}
              <div className="reward-modal-actions" style={{ marginTop: 20 }}>
                <button
                  className="reward-btn reward-btn-confirm"
                  onClick={confirmRoleChange}
                  disabled={
                    isPendingRole ||
                    roleModal.selectedRole === roleModal.currentRole
                  }
                >
                  {isPendingRole ? "Saving..." : "Confirm change"}
                </button>
                <button
                  className="reward-btn-cancel"
                  onClick={closeRoleModal}
                  disabled={isPendingRole}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Balance adjustment confirmation modal ──────────────── */}
      {confirmingAdj && (
        <div className="reward-modal-backdrop" onClick={closeAdjModal}>
          <div
            className="reward-modal"
            style={{ maxWidth: 400 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="reward-modal-body">
              <div className="reward-modal-title">Confirm adjustment</div>
              <div className="adj-confirm-grid">
                <div className="adj-confirm-row">
                  <span className="adj-confirm-label">Person</span>
                  <span className="adj-confirm-value">{confirmingAdj.targetName}</span>
                </div>
                <div className="adj-confirm-row">
                  <span className="adj-confirm-label">Adjustment</span>
                  <span
                    className={`adj-confirm-amount${
                      confirmingAdj.amount > 0 ? " positive" : " negative"
                    }`}
                  >
                    {confirmingAdj.amount > 0 ? "+" : ""}
                    {confirmingAdj.amount}đ earned drops
                  </span>
                </div>
                <div className="adj-confirm-row">
                  <span className="adj-confirm-label">New balance</span>
                  <span className="adj-confirm-value">
                    {(confirmingAdj.currentBalance + confirmingAdj.amount).toLocaleString()}đ
                  </span>
                </div>
                <div className="adj-confirm-row">
                  <span className="adj-confirm-label">Reason</span>
                  <span className="adj-confirm-value">{confirmingAdj.reason}</span>
                </div>
              </div>
              {adjActionError && (
                <p className="adj-error" style={{ marginTop: 12 }}>
                  {adjActionError}
                </p>
              )}
              <div className="reward-modal-actions" style={{ marginTop: 20 }}>
                <button
                  className="reward-btn reward-btn-confirm"
                  onClick={confirmAdjustment}
                  disabled={isPendingAdj}
                >
                  {isPendingAdj ? "Applying..." : "Apply adjustment"}
                </button>
                <button
                  className="reward-btn-cancel"
                  onClick={closeAdjModal}
                  disabled={isPendingAdj}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
