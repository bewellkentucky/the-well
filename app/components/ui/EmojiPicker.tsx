"use client"

import { useState, useRef, useEffect } from "react"

const DEFAULT_PRESETS = [
  "⭐", "🎯", "💉", "🤝", "🎓", "📋", "📣", "🏆",
  "✅", "🔬", "💪", "📝", "🎉", "☕", "📅", "🩺",
]

export default function EmojiPicker({
  value,
  onChange,
  presets = DEFAULT_PRESETS,
}: {
  value:    string
  onChange: (emoji: string) => void
  presets?: string[]
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onMouseDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onMouseDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("mousedown", onMouseDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [open])

  function select(emoji: string) {
    onChange(emoji)
    setOpen(false)
  }

  return (
    <div className="emoji-picker-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`emoji-trigger-btn${open ? " open" : ""}`}
        onClick={() => setOpen((v) => !v)}
        title="Choose icon"
      >
        {value || "⭐"}
      </button>

      {open && (
        <div className="emoji-popup">
          <div className="emoji-presets">
            {presets.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className={`emoji-btn${value === emoji ? " selected" : ""}`}
                onClick={() => select(emoji)}
              >
                {emoji}
              </button>
            ))}
          </div>
          <div className="emoji-custom-row">
            <span className="emoji-custom-label">Custom</span>
            <input
              className="adj-input emoji-custom-input"
              value={value}
              onChange={(e) => onChange(e.target.value.slice(0, 4))}
              placeholder="type any emoji"
              maxLength={4}
            />
          </div>
        </div>
      )}
    </div>
  )
}
