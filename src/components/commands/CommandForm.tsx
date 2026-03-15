import { useState, type Dispatch, type SetStateAction } from "react"
import { X, Mic, Plus, Trash2 } from "lucide-react"
import { invoke } from "@tauri-apps/api/core"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { WorkflowEditor, type WorkflowStep } from "@/components/WorkflowEditor"
import { CommandTypeSelector } from "./CommandTypeSelector"
import { KeyboardShortcutSelector } from "@/components/KeyboardShortcutSelector"
import { AppSelector } from "@/components/AppSelector"
import { type AppFilter } from "@/models"

interface CommandFormProps {
  editingCommandId: string | null
  commandType: "text" | "keyboard" | "workflow" | "app"
  trigger: string
  expansion: string
  workflowSteps: WorkflowStep[]
  aliases: string[]
  appFilters: AppFilter[]
  validationError: string | null
  onTypeChange: (type: "text" | "keyboard" | "workflow" | "app") => void
  onTriggerChange: (trigger: string) => void
  onExpansionChange: (expansion: string) => void
  onWorkflowStepsChange: (steps: WorkflowStep[]) => void
  onAliasesChange: (aliases: string[]) => void
  onAppFiltersChange: Dispatch<SetStateAction<AppFilter[]>>
  onSave: () => void
  onCancel: () => void
}

export function CommandForm({
  editingCommandId,
  commandType,
  trigger,
  expansion,
  workflowSteps,
  aliases,
  appFilters,
  validationError,
  onTypeChange,
  onTriggerChange,
  onExpansionChange,
  onWorkflowStepsChange,
  onAliasesChange,
  onAppFiltersChange,
  onSave,
  onCancel,
}: CommandFormProps) {
  const [isRecording, setIsRecording] = useState(false)
  const isSaveDisabled = !trigger || (commandType === "workflow" ? workflowSteps.length === 0 : !expansion)

  const handleRecordTrigger = async () => {
    if (isRecording) {
      // Stop recording and get transcription
      try {
        const transcription = await invoke<string>("stop_trigger_recording")
        if (transcription && transcription.trim()) {
          onTriggerChange(transcription.trim())
        }
      } catch (error) {
        console.error("Failed to stop recording and transcribe:", error)
      } finally {
        setIsRecording(false)
      }
    } else {
      // Start recording
      try {
        setIsRecording(true)
        await invoke("start_trigger_recording")
      } catch (error) {
        console.error("Failed to start recording:", error)
        setIsRecording(false)
      }
    }
  }

  return (
    <div className="relative rounded-lg border border-primary/30 bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-primary">
          {editingCommandId ? "Edit Command" : "New Command"}
        </h3>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-foreground"
          onClick={onCancel}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Validation Error */}
      {validationError && (
        <div className="rounded-md bg-destructive/15 border border-destructive/30 px-3 py-2 text-sm text-destructive mb-4">
          {validationError}
        </div>
      )}

      {/* Type selector */}
      <CommandTypeSelector selectedType={commandType} onTypeChange={onTypeChange} />

      {/* Trigger */}
      <div className="mb-3">
        <label htmlFor="trigger-input" className="mb-1.5 block text-xs text-muted-foreground">
          {commandType === "workflow"
            ? "Trigger Word (say this to run the workflow)"
            : commandType === "text"
              ? "Trigger Word (use {name} for parameters)"
              : commandType === "app"
                ? "Trigger Word (say this to open the app)"
                : "Trigger Word"}
        </label>
        <div className="flex items-center gap-2">
          <Input
            id="trigger-input"
            name="trigger-input"
            placeholder={
              commandType === "workflow"
                ? 'e.g. "push changes"'
                : commandType === "text"
                  ? 'e.g. "branch {name}"'
                  : commandType === "app"
                    ? 'e.g. "open chrome"'
                    : 'e.g. "save"'
            }
            value={trigger}
            onChange={(e) => onTriggerChange(e.target.value)}
            className="bg-secondary border-border font-mono text-sm focus-visible:ring-primary"
          />
          <Button
            variant="outline"
            size="sm"
            className={`gap-1.5 shrink-0 ${isRecording
              ? "border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive"
              : "border-primary/50 text-primary hover:bg-primary/10 hover:text-primary"
              }`}
            onClick={handleRecordTrigger}
          >
            <Mic className={`h-4 w-4 ${isRecording ? "animate-pulse" : ""}`} />
            {isRecording ? "Stop" : "Record"}
          </Button>
        </div>
      </div>

      {/* Aliases */}
      <div className="mb-3">
        <label className="mb-1.5 block text-xs text-muted-foreground">
          Aliases (optional — alternative trigger phrases)
        </label>
        <div className="flex flex-col gap-2">
          {aliases.map((alias, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                placeholder='e.g. "create file"'
                value={alias}
                onChange={(e) => {
                  const updated = [...aliases]
                  updated[index] = e.target.value
                  onAliasesChange(updated)
                }}
                className="bg-secondary border-border font-mono text-sm focus-visible:ring-primary"
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                onClick={() => onAliasesChange(aliases.filter((_, i) => i !== index))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 w-fit text-muted-foreground hover:text-foreground"
            onClick={() => onAliasesChange([...aliases, ""])}
          >
            <Plus className="h-3 w-3" />
            Add Alias
          </Button>
        </div>
      </div>

      {/* App Filters */}
      <AppSelector selectedApps={appFilters} onAppsChange={onAppFiltersChange} />

      {/* Expansion / Keyboard Shortcut / Workflow / App Name */}
      <div className="mb-4">
        <label htmlFor="expansion-input" className="mb-1.5 block text-xs text-muted-foreground">
          {commandType === "workflow"
            ? "Workflow Steps"
            : commandType === "text"
              ? "Expansion"
              : commandType === "app"
                ? "Application Name"
                : "Keyboard Shortcut"}
        </label>
        {commandType === "workflow" ? (
          <WorkflowEditor steps={workflowSteps} onChange={onWorkflowStepsChange} />
        ) : commandType === "text" ? (
          <Textarea
            id="expansion-input"
            name="expansion-input"
            placeholder="e.g. git checkout -b {name}"
            value={expansion}
            onChange={(e) => onExpansionChange(e.target.value)}
            className="min-h-20 bg-secondary border-border font-mono text-sm resize-none focus-visible:ring-primary"
          />
        ) : commandType === "app" ? (
          <div className="space-y-2">
            <Input
              id="expansion-input"
              name="expansion-input"
              placeholder='e.g. "Google Chrome", "Visual Studio Code", "Safari"'
              value={expansion}
              onChange={(e) => onExpansionChange(e.target.value)}
              className="bg-secondary border-border font-mono text-sm focus-visible:ring-primary"
            />
            <p className="text-[10px] text-muted-foreground">
              Note: Opening applications is currently only supported on macOS.
            </p>
          </div>
        ) : (
          <KeyboardShortcutSelector value={expansion} onChange={onExpansionChange} />
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} className="text-muted-foreground">
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={onSave}
          disabled={isSaveDisabled}
          className="bg-primary text-primary-foreground hover:bg-primary/80"
        >
          {editingCommandId ? "Update Command" : "Add Command"}
        </Button>
      </div>
    </div>
  )
}
