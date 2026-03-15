"use client"

import { useState, useEffect } from "react"
import { invoke } from "@tauri-apps/api/core"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Trash2, Plus, AlertCircle } from "lucide-react"

interface CustomWordsTabProps {
  onSaveStatusChange: (status: "idle" | "saving" | "saved") => void
}

export function CustomWordsTab({ onSaveStatusChange }: CustomWordsTabProps) {
  const [customWords, setCustomWords] = useState<string[]>([])
  const [newWord, setNewWord] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Load custom words on mount
  useEffect(() => {
    const loadWords = async () => {
      try {
        setIsLoading(true)
        const words = await invoke<string[]>("get_custom_words")
        setCustomWords(words)
        setError(null)
      } catch (err) {
        console.error("Failed to load custom words:", err)
        setError("Failed to load custom words")
      } finally {
        setIsLoading(false)
      }
    }

    loadWords()
  }, [])

  const handleAddWord = async () => {
    const trimmedWord = newWord.trim()

    if (!trimmedWord) {
      setError("Please enter a word")
      return
    }

    if (customWords.some((w) => w.toLowerCase() === trimmedWord.toLowerCase())) {
      setError("This word is already in the list")
      return
    }

    try {
      onSaveStatusChange("saving")
      const added = await invoke<boolean>("add_custom_word", {
        word: trimmedWord,
      })

      if (added) {
        setCustomWords((prev) => [...prev, trimmedWord.toLowerCase()])
        setNewWord("")
        setError(null)
        onSaveStatusChange("saved")
        setTimeout(() => onSaveStatusChange("idle"), 1500)
      } else {
        setError("Word could not be added")
      }
    } catch (err) {
      console.error("Failed to add custom word:", err)
      setError("Failed to add word")
      onSaveStatusChange("idle")
    }
  }

  const handleRemoveWord = async (word: string) => {
    try {
      onSaveStatusChange("saving")
      const removed = await invoke<boolean>("remove_custom_word", {
        word: word,
      })

      if (removed) {
        setCustomWords((prev) => prev.filter((w) => w !== word))
        setError(null)
        onSaveStatusChange("saved")
        setTimeout(() => onSaveStatusChange("idle"), 1500)
      } else {
        setError("Word could not be removed")
        onSaveStatusChange("idle")
      }
    } catch (err) {
      console.error("Failed to remove custom word:", err)
      setError("Failed to remove word")
      onSaveStatusChange("idle")
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleAddWord()
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Custom Words</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Add words that are often misheard or misspelled during transcription. The system will automatically correct
          similar-sounding variants to match these words using fuzzy matching.
        </p>
      </div>

      {/* Add Word Section */}
      <section className="rounded-lg border border-border/50 overflow-hidden bg-card/50">
        <div className="px-4 py-3.5 border-b border-border">
          <h2 className="text-sm font-medium text-foreground flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Add a Custom Word
          </h2>
          <p className="text-xs text-muted-foreground mt-2">
            Example: if you often say "tauri" but it gets transcribed as "tori" or "tawry", add "tauri" here.
          </p>
        </div>

        <div className="px-4 py-3.5 space-y-3">
          <div className="flex gap-2">
            <Input
              type="text"
              placeholder="Enter a word..."
              value={newWord}
              onChange={(e) => setNewWord(e.target.value)}
              onKeyPress={handleKeyPress}
              className="flex-1 bg-secondary border-border"
            />
            <Button onClick={handleAddWord} className="gap-1.5">
              <Plus className="h-4 w-4" />
              Add
            </Button>
          </div>

          {error && (
            <div className="flex gap-2 items-start px-3 py-2 rounded-md bg-destructive/10 border border-destructive/20">
              <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-xs text-destructive">{error}</p>
            </div>
          )}
        </div>
      </section>

      {/* Words List Section */}
      <section className="rounded-lg border border-border/50 overflow-hidden">
        <div className="px-4 py-3.5 border-b border-border bg-card">
          <h2 className="text-sm font-medium text-foreground">
            Current Words ({customWords.length})
          </h2>
        </div>

        {isLoading ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-muted-foreground">Loading custom words...</p>
          </div>
        ) : customWords.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-muted-foreground">No custom words added yet</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {customWords.map((word) => (
              <div
                key={word}
                className="flex items-center justify-between px-4 py-3 bg-card hover:bg-card/90 transition-colors"
              >
                <span className="text-sm text-foreground font-mono">{word}</span>
                <button
                  onClick={() => handleRemoveWord(word)}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  title="Remove word"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Info Box */}
      <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 px-4 py-3">
        <p className="text-xs text-blue-900 dark:text-blue-100">
          <strong>How it works:</strong> When you speak, the transcribed text is checked against these words using fuzzy
          matching. Similar-sounding alternatives are automatically replaced with the word you added. This helps improve
          accuracy when the speech-to-text system tends to mishear specific terms.
        </p>
      </div>
    </div>
  )
}
