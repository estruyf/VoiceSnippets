import { formatKeyCombination } from "@/lib/keyboard-utils"

interface InlineKeyboardShortcutSelectorProps {
  value: string
  onClick: () => void
}

export function InlineKeyboardShortcutSelector({
  value,
  onClick,
}: InlineKeyboardShortcutSelectorProps) {
  const osType = navigator.userAgent.includes("Mac") ? "Darwin" : "Other"

  return (
    <button
      onClick={onClick}
      className={`w-full px-2 py-1.5 h-8 text-xs rounded border transition-colors text-left flex items-center justify-between font-mono ${value
          ? "bg-primary/5 border-primary text-foreground"
          : "bg-secondary border-border text-muted-foreground"
        } hover:border-primary hover:bg-primary/10`}
    >
      <span className="truncate">
        {value
          ? `${value} (${formatKeyCombination(value, osType)})`
          : "Click to set shortcut"}
      </span>
    </button>
  )
}
