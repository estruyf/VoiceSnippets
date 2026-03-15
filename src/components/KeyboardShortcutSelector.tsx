import { useState, useCallback } from "react"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { formatKeyCombination } from "@/lib/keyboard-utils"

interface KeyboardShortcutSelectorProps {
  value: string
  onChange: (v: string) => void
  onError?: (error: string) => void
  onClose?: () => void
  isModal?: boolean
}

const MODIFIERS = ["Cmd", "Alt", "Shift", "Ctrl"]
export const SPECIAL_KEYS = [
  { value: "Enter", label: "Enter ↵" },
  { value: "Tab", label: "Tab ⇥" },
  { value: "Escape", label: "Escape ⎋" },
  { value: "Space", label: "Space ␣" },
  { value: "Backspace", label: "Backspace ⌫" },
  { value: "Delete", label: "Delete" },
  { value: "Insert", label: "Insert" },
  { value: "Home", label: "Home" },
  { value: "End", label: "End" },
  { value: "PageUp", label: "Page Up" },
  { value: "PageDown", label: "Page Down" },
  { value: "Up", label: "Arrow Up ↑" },
  { value: "Down", label: "Arrow Down ↓" },
  { value: "Left", label: "Arrow Left ←" },
  { value: "Right", label: "Arrow Right →" },
]

export const FUNCTION_KEYS = Array.from({ length: 12 }, (_, i) => ({
  value: `F${i + 1}`,
  label: `F${i + 1}`,
}))

export function KeyboardShortcutSelector({
  value,
  onChange,
  onError,
  onClose,
  isModal = false,
}: KeyboardShortcutSelectorProps) {
  const [selectedModifiers, setSelectedModifiers] = useState<Set<string>>(
    new Set(value.split("+").filter((k) => MODIFIERS.includes(k)))
  )
  const [mainKey, setMainKey] = useState<string>(
    value.split("+").filter((k) => !MODIFIERS.includes(k))[0] || ""
  )

  const osType = navigator.userAgent.includes("Mac") ? "Darwin" : "Other"

  const updateShortcut = useCallback(
    (modifiers: Set<string>, key: string) => {
      if (!key) {
        if (onError) onError("Please enter a main key")
        return
      }

      const parts = Array.from(modifiers).concat(key.toUpperCase())
      const newShortcut = parts.join("+")
      onChange(newShortcut)
    },
    [onChange, onError]
  )

  const toggleModifier = (modifier: string) => {
    const newModifiers = new Set(selectedModifiers)
    if (newModifiers.has(modifier)) {
      newModifiers.delete(modifier)
    } else {
      newModifiers.add(modifier)
    }
    setSelectedModifiers(newModifiers)
    updateShortcut(newModifiers, mainKey)
  }

  const handleKeyInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const key = e.target.value.toUpperCase()
    setMainKey(key)
    if (key) {
      updateShortcut(selectedModifiers, key)
    }
  }

  const handleSpecialKeySelect = (key: string) => {
    setMainKey(key)
    updateShortcut(selectedModifiers, key)
  }

  const clearShortcut = () => {
    setSelectedModifiers(new Set())
    setMainKey("")
    onChange("")
  }

  return (
    <div className="space-y-3">
      {/* Display selected shortcut */}
      <div className={`flex items-center rounded-md border px-3 py-2 min-h-10 ${value ? "border-primary bg-primary/5" : "border-border bg-secondary"
        }`}>
        {value ? (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-mono">{value}</span>
            <span className="text-xs text-muted-foreground">
              ({formatKeyCombination(value, osType)})
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-6 w-6 p-0"
              onClick={clearShortcut}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">
            Select modifiers and a key below
          </span>
        )}
      </div>

      {/* Modifier buttons */}
      <div>
        <p className="text-xs text-muted-foreground mb-2">Modifiers:</p>
        <div className="flex gap-2">
          {MODIFIERS.map((mod) => (
            <Button
              key={mod}
              variant={selectedModifiers.has(mod) ? "default" : "outline"}
              size="sm"
              onClick={() => toggleModifier(mod)}
              className="font-mono text-xs"
            >
              {mod}
            </Button>
          ))}
        </div>
      </div>

      {/* Main key input and special keys selector */}
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">Main Key:</p>
        <div className="flex gap-2">
          <Input
            value={mainKey}
            onChange={handleKeyInput}
            placeholder="Type a key (a-z, 0-9)"
            className="flex-1 bg-secondary border-border font-mono text-sm focus-visible:ring-primary uppercase"
            maxLength={3}
          />
          <Select value="" onValueChange={handleSpecialKeySelect}>
            <SelectTrigger className="w-32 bg-secondary border-border text-sm">
              <SelectValue placeholder="Special..." />
            </SelectTrigger>
            <SelectContent>
              {[...SPECIAL_KEYS, ...FUNCTION_KEYS].map((key) => (
                <SelectItem key={key.value} value={key.value}>
                  {key.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isModal && onClose && (
        <Button
          variant="outline"
          size="sm"
          onClick={onClose}
          className="w-full mt-4"
        >
          Done
        </Button>
      )}
    </div>
  )

  const content = (
    <div className="space-y-3">
      {/* Display selected shortcut */}
      <div
        className={`flex items-center rounded-md border px-3 py-2 min-h-10 ${value ? "border-primary bg-primary/5" : "border-border bg-secondary"
          }`}
      >
        {value ? (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-mono">{value}</span>
            <span className="text-xs text-muted-foreground">
              ({formatKeyCombination(value, osType)})
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-6 w-6 p-0"
              onClick={clearShortcut}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">
            Select modifiers and a key below
          </span>
        )}
      </div>

      {/* Modifier buttons */}
      <div>
        <p className="text-xs text-muted-foreground mb-2">Modifiers:</p>
        <div className="flex gap-2">
          {MODIFIERS.map((mod) => (
            <Button
              key={mod}
              variant={selectedModifiers.has(mod) ? "default" : "outline"}
              size="sm"
              onClick={() => toggleModifier(mod)}
              className="font-mono text-xs"
            >
              {mod}
            </Button>
          ))}
        </div>
      </div>

      {/* Main key input and special keys selector */}
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">Main Key:</p>
        <div className="flex gap-2">
          <Input
            value={mainKey}
            onChange={handleKeyInput}
            placeholder="Type a key (a-z, 0-9)"
            className="flex-1 bg-secondary border-border font-mono text-sm focus-visible:ring-primary uppercase"
            maxLength={3}
          />
          <Select value="" onValueChange={handleSpecialKeySelect}>
            <SelectTrigger className="w-32 bg-secondary border-border text-sm">
              <SelectValue placeholder="Special..." />
            </SelectTrigger>
            <SelectContent>
              {[...SPECIAL_KEYS, ...FUNCTION_KEYS].map((key) => (
                <SelectItem key={key.value} value={key.value}>
                  {key.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isModal && onClose && (
        <Button
          variant="outline"
          size="sm"
          onClick={onClose}
          className="w-full mt-4"
        >
          Done
        </Button>
      )}
    </div>
  )

  if (isModal) {
    return (
      <>
        <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
        <div
          data-keyboard-selector
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-background border border-border rounded-lg shadow-lg p-6 w-96 z-50 max-h-[90vh] overflow-y-auto"
        >
          {content}
        </div>
      </>
    )
  }

  return <div className="space-y-3">{content}</div>
}
