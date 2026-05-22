"use client"

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
  return (
    <div className="emoji-picker">
      <div className="emoji-presets">
        {presets.map((emoji) => (
          <button
            key={emoji}
            type="button"
            className={`emoji-btn${value === emoji ? " selected" : ""}`}
            onClick={() => onChange(emoji)}
          >
            {emoji}
          </button>
        ))}
      </div>
      <div className="emoji-custom">
        <span className="emoji-custom-or">or</span>
        <input
          className="adj-input emoji-custom-input"
          value={value}
          onChange={(e) => onChange(e.target.value.slice(0, 4))}
          placeholder="type custom"
          maxLength={4}
        />
      </div>
    </div>
  )
}
