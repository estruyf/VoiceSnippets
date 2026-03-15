import { useState, useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { getKeyName, formatKeyCombination, normalizeKey, validateShortcut } from '@/lib/keyboard-utils'
import { Button } from './ui/button'
import { RotateCcw } from 'lucide-react'

interface ShortcutInputProps {
  value: string
  onChange: (value: string) => void
  onError?: (error: string) => void
}

export function ShortcutInput({ value, onChange, onError }: ShortcutInputProps) {
  const [isRecording, setIsRecording] = useState(false)
  const [keyPressed, setKeyPressed] = useState<string[]>([])
  const [recordedKeys, setRecordedKeys] = useState<string[]>([])
  const [originalBinding, setOriginalBinding] = useState('')
  const shortcutRef = useRef<HTMLDivElement>(null)

  // Detect OS type
  const osType = navigator.userAgent.includes('Mac') ? 'Darwin' : 'Other'

  useEffect(() => {
    if (!isRecording) return

    let cleanup = false

    const handleKeyDown = async (e: KeyboardEvent) => {
      if (cleanup) return
      if (e.repeat) return

      if (e.key === 'Escape') {
        // Cancel recording and restore original
        if (originalBinding) {
          onChange(originalBinding)
        }
        setIsRecording(false)
        setKeyPressed([])
        setRecordedKeys([])
        setOriginalBinding('')
        return
      }

      e.preventDefault()

      const rawKey = getKeyName(e, osType)
      const key = normalizeKey(rawKey)

      if (!keyPressed.includes(key)) {
        setKeyPressed((prev) => [...prev, key])
        if (!recordedKeys.includes(key)) {
          setRecordedKeys((prev) => [...prev, key])
        }
      }
    }

    const handleKeyUp = async (e: KeyboardEvent) => {
      if (cleanup) return
      e.preventDefault()

      const rawKey = getKeyName(e, osType)
      const key = normalizeKey(rawKey)

      setKeyPressed((prev) => prev.filter((k) => k !== key))

      const updatedKeyPressed = keyPressed.filter((k) => k !== key)
      if (updatedKeyPressed.length === 0 && recordedKeys.length > 0) {
        // Create shortcut string
        const modifiers = ['ctrl', 'control', 'shift', 'alt', 'option', 'meta', 'command', 'cmd', 'super', 'win', 'windows']
        const sortedKeys = recordedKeys.sort((a, b) => {
          const aIsModifier = modifiers.includes(a.toLowerCase())
          const bIsModifier = modifiers.includes(b.toLowerCase())
          if (aIsModifier && !bIsModifier) return -1
          if (!aIsModifier && bIsModifier) return 1
          return 0
        })
        const newShortcut = sortedKeys.join('+')

        // Validate the shortcut
        const validation = validateShortcut(newShortcut)
        if (!validation.valid) {
          if (onError) {
            onError(validation.error || 'Invalid shortcut')
          }
          if (originalBinding) {
            onChange(originalBinding)
          }
        } else {
          try {
            // Try to update the hotkey
            await invoke('update_hotkey', { hotkey: newShortcut })
            onChange(newShortcut)
          } catch (error) {
            const errorMsg = String(error)
            if (onError) {
              onError(errorMsg)
            }
            // Restore original on error
            if (originalBinding) {
              onChange(originalBinding)
            }
          }
        }

        setIsRecording(false)
        setKeyPressed([])
        setRecordedKeys([])
        setOriginalBinding('')
      }
    }

    const handleClickOutside = (e: MouseEvent) => {
      if (cleanup) return
      if (shortcutRef.current && !shortcutRef.current.contains(e.target as Node)) {
        // Cancel recording
        if (originalBinding) {
          onChange(originalBinding)
        }
        setIsRecording(false)
        setKeyPressed([])
        setRecordedKeys([])
        setOriginalBinding('')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('click', handleClickOutside)

    return () => {
      cleanup = true
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('click', handleClickOutside)
    }
  }, [isRecording, keyPressed, recordedKeys, originalBinding, onChange, onError, osType])

  const startRecording = async () => {
    // Suspend the current shortcut
    try {
      await invoke('suspend_hotkey')
      setOriginalBinding(value)
      setIsRecording(true)
      setKeyPressed([])
      setRecordedKeys([])
    } catch (error) {
      console.error('Failed to suspend hotkey:', error)
      if (onError) {
        onError('Failed to start recording: ' + String(error))
      }
    }
  }

  const handleReset = async () => {
    const defaultHotkey = 'Alt+S'
    try {
      await invoke('update_hotkey', { hotkey: defaultHotkey })
      onChange(defaultHotkey)
    } catch (error) {
      if (onError) {
        onError('Failed to reset hotkey: ' + String(error))
      }
    }
  }

  const formatCurrentKeys = (): string => {
    if (recordedKeys.length === 0) return 'Press keys...';
    return formatKeyCombination(recordedKeys.join('+'), osType)
  }

  return (
    <div className="flex items-center gap-2">
      <div
        ref={shortcutRef}
        className={`px-3 py-2 min-w-[130px] text-sm font-medium rounded-md cursor-pointer transition-all ${isRecording
          ? 'border-2 border-primary bg-primary/10 ring-2 ring-primary/20 animate-pulse'
          : 'border border-border bg-secondary hover:bg-accent hover:border-accent-foreground/20'
          }`}
        onClick={startRecording}
      >
        <span className={isRecording ? 'text-primary font-semibold' : ''}>
          {isRecording ? formatCurrentKeys() : formatKeyCombination(value, osType)}
        </span>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={handleReset}
        title="Reset to default"
        className="h-8 w-8"
      >
        <RotateCcw className="h-4 w-4" />
      </Button>
    </div>
  )
}
