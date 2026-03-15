"use client"

import { Trash2, GripVertical, Type, KeyboardIcon, Timer, ArrowUp, ArrowDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { InlineKeyboardShortcutSelector } from "@/components/InlineKeyboardShortcutSelector"
import { FUNCTION_KEYS, KeyboardShortcutSelector, SPECIAL_KEYS } from "./KeyboardShortcutSelector"
import { useState } from "react"

export interface WorkflowStep {
  step_type: "text" | "key" | "shortcut" | "delay"
  value: string
}

interface WorkflowEditorProps {
  steps: WorkflowStep[]
  onChange: (steps: WorkflowStep[]) => void
}

const DELAY_OPTIONS = [
  { value: "100", label: "100ms" },
  { value: "250", label: "250ms" },
  { value: "500", label: "500ms" },
  { value: "1000", label: "1s" },
  { value: "2000", label: "2s" },
]

function StepIcon({ type }: { type: string }) {
  switch (type) {
    case "text":
      return <Type className="h-3.5 w-3.5" />
    case "key":
      return <KeyboardIcon className="h-3.5 w-3.5" />
    case "shortcut":
      return <KeyboardIcon className="h-3.5 w-3.5" />
    case "delay":
      return <Timer className="h-3.5 w-3.5" />
    default:
      return <Type className="h-3.5 w-3.5" />
  }
}

function getStepLabel(type: string) {
  switch (type) {
    case "text":
      return "Type Text"
    case "key":
      return "Key Press"
    case "shortcut":
      return "Keyboard Shortcut"
    case "delay":
      return "Delay"
    default:
      return type
  }
}

export function WorkflowEditor({ steps, onChange }: WorkflowEditorProps) {
  const [isShortcutOpen, setIsShortcutOpen] = useState(false)
  const [shortcutStepIndex, setShortcutStepIndex] = useState<number | null>(null)

  const addStep = (step: WorkflowStep) => {
    onChange([...steps, step])
  }

  const removeStep = (index: number) => {
    onChange(steps.filter((_, i) => i !== index))
  }

  const updateStep = (index: number, updated: WorkflowStep) => {
    onChange(steps.map((s, i) => (i === index ? updated : s)))
  }

  const moveStep = (index: number, direction: "up" | "down") => {
    const newSteps = [...steps]
    const targetIndex = direction === "up" ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= newSteps.length) return
      ;[newSteps[index], newSteps[targetIndex]] = [newSteps[targetIndex], newSteps[index]]
    onChange(newSteps)
  }

  /** Build a human-readable summary of the workflow (used as the `expansion` field). */
  const getSummary = (): string => {
    return steps
      .map((s) => {
        switch (s.step_type) {
          case "text":
            return s.value
          case "key":
            return `<${s.value}>`
          case "shortcut":
            return `<${s.value}>`
          case "delay":
            return `<delay ${s.value}ms>`
          default:
            return s.value
        }
      })
      .join(" → ")
  }

  return (
    <div className="space-y-3">
      {/* Steps list */}
      {steps.length > 0 && (
        <div className="rounded-lg border border-border/50 overflow-hidden">
          {steps.map((step, index) => (
            <div
              key={index}
              className={`flex items-center gap-2 bg-card px-3 py-2.5 ${index < steps.length - 1 ? "border-b border-border/50" : ""
                }`}
            >
              {/* Step number & icon */}
              <div className="flex items-center gap-1.5 shrink-0 text-muted-foreground">
                <GripVertical className="h-3.5 w-3.5 opacity-40 hidden" />
                <span className="text-[10px] font-mono w-4 text-center">{index + 1}</span>
                <div className="flex h-6 w-6 items-center justify-center rounded bg-primary/10 text-primary">
                  <StepIcon type={step.step_type} />
                </div>
              </div>

              {/* Step content */}
              <div className="flex-1 min-w-0 flex items-center">
                {step.step_type === "text" ? (
                  <Input
                    value={step.value}
                    onChange={(e) => updateStep(index, { ...step, value: e.target.value })}
                    placeholder="Text to type..."
                    className="h-8 bg-secondary border-border font-mono text-sm focus-visible:ring-primary"
                  />
                ) : step.step_type === "key" ? (
                  <Select
                    value={step.value}
                    onValueChange={(v) => updateStep(index, { ...step, value: v })}
                  >
                    <SelectTrigger className="h-8 bg-secondary border-border text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[...SPECIAL_KEYS, ...FUNCTION_KEYS].map((k) => (
                        <SelectItem key={k.value} value={k.value}>
                          {k.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : step.step_type === "shortcut" ? (
                  <InlineKeyboardShortcutSelector
                    value={step.value}
                    onClick={() => {
                      setShortcutStepIndex(index)
                      setIsShortcutOpen(true)
                    }}
                  />
                ) : (
                  <Select
                    value={step.value}
                    onValueChange={(v) => updateStep(index, { ...step, value: v })}
                  >
                    <SelectTrigger className="h-8 bg-secondary border-border text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DELAY_OPTIONS.map((d) => (
                        <SelectItem key={d.value} value={d.value}>
                          {d.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Step type label */}
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0 font-medium">
                {getStepLabel(step.step_type)}
              </span>

              {/* Move up / down */}
              <div className="flex flex-col shrink-0">
                <button
                  onClick={() => moveStep(index, "up")}
                  disabled={index === 0}
                  className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-20 hover:cursor-pointer"
                >
                  <ArrowUp className="h-3 w-3" />
                </button>
                <button
                  onClick={() => moveStep(index, "down")}
                  disabled={index === steps.length - 1}
                  className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-20 hover:cursor-pointer"
                >
                  <ArrowDown className="h-3 w-3" />
                </button>
              </div>

              {/* Delete */}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                onClick={() => removeStep(index)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}

          {/* Keyboard Shortcut Modal */}
          {isShortcutOpen && shortcutStepIndex !== null && (
            <div className="px-3 pb-2.5">
              <KeyboardShortcutSelector
                value={steps[shortcutStepIndex]?.value || ""}
                onChange={(v) => {
                  if (shortcutStepIndex !== null) {
                    updateStep(shortcutStepIndex, { ...steps[shortcutStepIndex], value: v })
                  }
                }}
                onClose={() => setIsShortcutOpen(false)}
                isModal={true}
              />
            </div>
          )}
        </div>
      )}

      {steps.length === 0 && (
        <div className="rounded-lg border border-dashed border-border/70 bg-card/50 py-8 text-center">
          <p className="text-sm text-muted-foreground">No steps yet. Add steps to build your workflow.</p>
        </div>
      )}

      {/* Add step buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs border-primary/50 text-primary hover:bg-primary/10 hover:text-primary hover:cursor-pointer"
          onClick={() => addStep({ step_type: "text", value: "" })}
        >
          <Type className="h-3 w-3" />
          + Text
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs border-primary/50 text-primary hover:bg-primary/10 hover:text-primary hover:cursor-pointer"
          onClick={() => addStep({ step_type: "key", value: "enter" })}
        >
          <KeyboardIcon className="h-3 w-3" />
          + Key Press
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs border-primary/50 text-primary hover:bg-primary/10 hover:text-primary hover:cursor-pointer"
          onClick={() => addStep({ step_type: "shortcut", value: "" })}
        >
          <KeyboardIcon className="h-3 w-3" />
          + Keyboard Shortcut
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs border-primary/50 text-primary hover:bg-primary/10 hover:text-primary hover:cursor-pointer"
          onClick={() => addStep({ step_type: "delay", value: "500" })}
        >
          <Timer className="h-3 w-3" />
          + Delay
        </Button>
      </div>

      {/* Preview */}
      {steps.length > 0 && (
        <div className="rounded-md bg-secondary/50 border border-border/30 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Preview</p>
          <p className="text-xs font-mono text-foreground/80 break-all">{getSummary()}</p>
        </div>
      )}
    </div>
  )
}
