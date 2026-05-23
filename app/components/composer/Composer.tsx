"use client"

import { useState, useTransition, useRef, useEffect } from "react"
import { createKudo } from "@/app/actions/createKudo"
import Avatar from "@/app/components/ui/Avatar"

type User = {
  id: string
  fullName: string
  email: string
  title: string | null
  thumbnailUrl: string | null
}

const VALUES = [
  { label: "Compassion",     emoji: "💛" },
  { label: "Ownership",      emoji: "🛠️" },
  { label: "Curiosity",      emoji: "🔍" },
  { label: "Team-First",     emoji: "🤝" },
  { label: "Excellence",     emoji: "✨" },
  { label: "Above & Beyond", emoji: "🌟" },
] as const

export default function Composer({
  users,
  initialGivingBalance,
  currentUserId,
}: {
  users: User[]
  initialGivingBalance: number
  currentUserId: string
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [givingBalance, setGivingBalance] = useState(initialGivingBalance)

  const [query, setQuery] = useState("")
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const [amount, setAmount] = useState(25)
  const [message, setMessage] = useState("")
  const [selectedValues, setSelectedValues] = useState<Set<string>>(new Set())
  const [isPrivate, setIsPrivate] = useState(false)

  // Sync balance after server revalidation pushes new props
  useEffect(() => { setGivingBalance(initialGivingBalance) }, [initialGivingBalance])

  // Close suggestions on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const filtered = users.filter(
    (u) =>
      u.id !== currentUserId &&
      (query.trim() === "" ||
        u.fullName.toLowerCase().includes(query.toLowerCase()) ||
        u.email.toLowerCase().includes(query.toLowerCase()))
  )

  function selectUser(u: User) {
    setSelectedUser(u)
    setQuery(u.fullName)
    setShowSuggestions(false)
  }

  function toggleValue(v: string) {
    setSelectedValues((prev) => {
      const next = new Set(prev)
      next.has(v) ? next.delete(v) : next.add(v)
      return next
    })
  }

  function handleSubmit() {
    if (!selectedUser)          { setError("Pick a recipient first."); return }
    if (!message.trim())        { setError("Add a message — be specific!"); return }
    if (amount < 1)             { setError("Minimum 1 drop."); return }
    if (amount > givingBalance) { setError(`You only have ${givingBalance}đ to give.`); return }
    if (selectedValues.size === 0) { setError("Select at least one value."); return }

    setError(null)
    startTransition(async () => {
      const result = await createKudo({
        toId: selectedUser.id,
        amount,
        message: message.trim(),
        values: Array.from(selectedValues),
        isPrivate,
      })
      if (result?.error) {
        setError(result.error)
        return
      }
      // Optimistic balance update — confirmed by server on next render
      setGivingBalance((b) => b - amount)
      setQuery("")
      setSelectedUser(null)
      setAmount(25)
      setMessage("")
      setSelectedValues(new Set())
      setIsPrivate(false)
    })
  }

  return (
    <div className="composer">
      <div className="composer-glow" aria-hidden="true" />

      <div className="composer-header">
        <div className="composer-title">Give kudos to a teammate</div>
        <div className="composer-balance">
          <span className="composer-balance-amount">{givingBalance}đ</span>
          <span className="composer-balance-label">to give</span>
        </div>
      </div>

      <div className="composer-row">
        <div className="recipient-wrap" ref={wrapRef}>
          <input
            className="recipient-input"
            type="text"
            placeholder="@Who deserves it?"
            autoComplete="off"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSelectedUser(null)
              setShowSuggestions(true)
            }}
            onFocus={() => setShowSuggestions(true)}
          />
          {showSuggestions && filtered.length > 0 && (
            <div className="suggestions">
              {filtered.map((u) => (
                <div key={u.id} className="suggestion" onMouseDown={(e) => e.preventDefault()} onClick={() => selectUser(u)}>
                  <Avatar name={u.fullName} email={u.email} thumbnailUrl={u.thumbnailUrl} size="sm" />
                  <div className="suggestion-info">
                    <div className="suggestion-name">{u.fullName}</div>
                    {u.title && <div className="suggestion-title">{u.title}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <input
          className="amount-input"
          type="number"
          min={1}
          max={givingBalance}
          step={5}
          value={amount}
          onChange={(e) => {
            const v = parseInt(e.target.value)
            setAmount(isNaN(v) ? 1 : Math.max(1, v))
          }}
        />
      </div>

      <textarea
        className="message-input"
        placeholder={`What did they do? Be specific: "You stayed late to walk a patient through their first session" beats "great job!"`}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />

      <div className="values-row">
        {VALUES.map(({ label, emoji }) => (
          <button
            key={label}
            type="button"
            className={`value-tag${selectedValues.has(label) ? " selected" : ""}`}
            onClick={() => toggleValue(label)}
          >
            {emoji} {label}
          </button>
        ))}
      </div>

      <div className="composer-actions">
        <label className="privacy-switch">
          <input
            type="checkbox"
            style={{ position: "absolute", opacity: 0, width: 0, height: 0 }}
            checked={isPrivate}
            onChange={(e) => setIsPrivate(e.target.checked)}
          />
          <span className={`privacy-track${isPrivate ? " on" : ""}`}>
            <span className={`privacy-thumb${isPrivate ? " on" : ""}`} />
          </span>
          <span className="privacy-label">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
            </svg>
            Send privately
          </span>
        </label>

        <div className="composer-meta">
          {isPrivate ? (
            <>Only the recipient will see this · <strong>not posted to #kudos</strong></>
          ) : (
            <>Posts to <strong>#kudos</strong> · visible to everyone</>
          )}
        </div>

        <button
          type="button"
          className="btn btn-primary"
          disabled={isPending || givingBalance < 1}
          onClick={handleSubmit}
        >
          {isPending ? "Sending..." : isPrivate ? "Send privately →" : "Send kudos →"}
        </button>
      </div>

      {error && <p className="composer-error">{error}</p>}
    </div>
  )
}
