"use client"

import { useState, useEffect, useCallback } from "react"
import { Search } from "lucide-react"
import { invoke } from "@tauri-apps/api/core"
import { save, open } from "@tauri-apps/plugin-dialog"
import { writeTextFile, readTextFile } from "@tauri-apps/plugin-fs"
import { Input } from "@/components/ui/input"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"
import { type WorkflowStep } from "@/components/WorkflowEditor"
import { CommandsHeader } from "@/components/commands/CommandsHeader"
import { CommandForm } from "@/components/commands/CommandForm"
import { CommandsList, type Command } from "@/components/commands/CommandsList"
import { CommandPacksList, type CommandPack } from "@/components/commands/CommandPacksList"
import { type AppFilter } from "@/models"

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface VoiceCommand {
  id: string
  trigger_word: string
  expansion: string
  command_type: "TextExpansion" | "KeyboardShortcut" | "Workflow" | "OpenApp"
  category?: string | null
  aliases?: string[]
  app_filters?: AppFilter[]
  workflow_steps?: WorkflowStep[] | null
  created_at: string
  last_used_at?: string | null
  use_count: number
}

interface BackendCommandPack {
  id: string
  name: string
  description: string
  commands: { trigger_word: string; expansion: string; command_type: string }[]
}

/* ------------------------------------------------------------------ */
/*  Helper functions                                                   */
/* ------------------------------------------------------------------ */

function voiceCommandToCommand(vc: VoiceCommand): Command {
  let type: Command["type"] = "text"
  if (vc.command_type === "KeyboardShortcut") type = "keyboard"
  else if (vc.command_type === "Workflow") type = "workflow"
  else if (vc.command_type === "OpenApp") type = "app"

  return {
    id: vc.id,
    type,
    trigger: vc.trigger_word,
    expansion: vc.expansion,
    pack: vc.category || undefined,
    aliases: vc.aliases || [],
    appFilters: vc.app_filters || undefined,
    workflowSteps: vc.workflow_steps || undefined,
  }
}

/* ------------------------------------------------------------------ */
/*  CommandsTab                                                        */
/* ------------------------------------------------------------------ */

export function CommandsTab() {
  const [commands, setCommands] = useState<Command[]>([])
  const [packs, setPacks] = useState<CommandPack[]>([])
  const [search, setSearch] = useState("")
  const [filterType, setFilterType] = useState<"all" | "text" | "keyboard" | "workflow" | "app">("all")
  const [showNewForm, setShowNewForm] = useState(false)
  const [activeSubTab, setActiveSubTab] = useState<"commands" | "packs">("commands")
  const [newType, setNewType] = useState<"text" | "keyboard" | "workflow" | "app">("text")
  const [newTrigger, setNewTrigger] = useState("")
  const [newExpansion, setNewExpansion] = useState("")
  const [newWorkflowSteps, setNewWorkflowSteps] = useState<WorkflowStep[]>([])
  const [newAliases, setNewAliases] = useState<string[]>([])
  const [newAppFilters, setNewAppFilters] = useState<AppFilter[]>([])
  const [editingCommandId, setEditingCommandId] = useState<string | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)

  // Load commands and packs on mount
  const loadData = useCallback(async () => {
    try {
      const [voiceCommands, backendPacks] = await Promise.all([
        invoke<VoiceCommand[]>("get_commands"),
        invoke<BackendCommandPack[]>("get_command_packs"),
      ])
      const cmds = voiceCommands.map(voiceCommandToCommand)
      setCommands(cmds)

      // Determine installed state by checking if commands with the pack's name as category exist
      const installedCategories = new Set(
        voiceCommands.map((vc) => vc.category).filter((c): c is string => !!c)
      )
      setPacks(
        backendPacks.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          commandCount: p.commands.length,
          installed: installedCategories.has(p.name),
        }))
      )
    } catch (error) {
      console.error("Failed to load data:", error)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const filteredCommands = commands.filter((cmd) => {
    const matchesSearch =
      cmd.trigger.toLowerCase().includes(search.toLowerCase()) ||
      cmd.expansion.toLowerCase().includes(search.toLowerCase())
    const matchesType = filterType === "all" || cmd.type === filterType
    return matchesSearch && matchesType
  })

  // Sort by type (text, keyboard, workflow, app) then by trigger
  const typeOrder: Record<Command["type"], number> = { text: 0, keyboard: 1, workflow: 2, app: 3 }
  const sortedCommands = [...filteredCommands].sort((a, b) => {
    if (a.type !== b.type) return typeOrder[a.type] - typeOrder[b.type]
    return a.trigger.localeCompare(b.trigger)
  })

  const handleAddCommand = async () => {
    if (!newTrigger) return
    // For workflow type, we need steps; for others we need expansion
    if (newType === "workflow" && newWorkflowSteps.length === 0) return
    if (newType !== "workflow" && !newExpansion) return

    // Check for duplicate trigger word (case-insensitive)
    const normalizedTrigger = newTrigger.toLowerCase().trim()
    const duplicateCmd = commands.find(
      (cmd) =>
        cmd.trigger.toLowerCase().trim() === normalizedTrigger &&
        cmd.id !== editingCommandId
    )
    if (duplicateCmd) {
      setValidationError(
        `A command with trigger word "${duplicateCmd.trigger}" already exists.`
      )
      return
    }

    // Clear any previous validation error
    setValidationError(null)

    // Build expansion summary for workflow
    const expansion =
      newType === "workflow"
        ? newWorkflowSteps
          .map((s) => {
            if (s.step_type === "text") return s.value
            if (s.step_type === "key") return `<${s.value}>`
            return `<delay ${s.value}ms>`
          })
          .join(" → ")
        : newExpansion

    try {
      if (editingCommandId) {
        // Update existing command
        const commandType =
          newType === "keyboard"
            ? "KeyboardShortcut"
            : newType === "workflow"
              ? "Workflow"
              : newType === "app"
                ? "OpenApp"
                : "TextExpansion"

        const updated = await invoke<VoiceCommand>("update_command", {
          id: editingCommandId,
          triggerWord: newTrigger,
          expansion,
          commandType,
          workflowSteps: newType === "workflow" ? newWorkflowSteps : null,
          aliases: newAliases,
          appFilters: newAppFilters,
        })
        setCommands(
          commands.map((cmd) =>
            cmd.id === editingCommandId ? voiceCommandToCommand(updated) : cmd
          )
        )
        setEditingCommandId(null)
      } else {
        // Add new command
        const commandType =
          newType === "keyboard"
            ? "KeyboardShortcut"
            : newType === "workflow"
              ? "Workflow"
              : newType === "app"
                ? "OpenApp"
                : "TextExpansion"
        const newCmd = await invoke<VoiceCommand>("add_command", {
          triggerWord: newTrigger,
          expansion,
          commandType,
          category: null,
          workflowSteps: newType === "workflow" ? newWorkflowSteps : null,
          aliases: newAliases.length > 0 ? newAliases : null,
          appFilters: newAppFilters.length > 0 ? newAppFilters : null,
        })
        setCommands([...commands, voiceCommandToCommand(newCmd)])
      }

      setNewTrigger("")
      setNewExpansion("")
      setNewWorkflowSteps([])
      setNewAliases([])
      setNewAppFilters([])
      setShowNewForm(false)
    } catch (error) {
      console.error("Failed to add/update command:", error)
    }
  }

  const handleEditCommand = (cmd: Command) => {
    setNewType(cmd.type)
    setNewTrigger(cmd.trigger)
    setNewExpansion(cmd.expansion)
    setNewWorkflowSteps(cmd.workflowSteps || [])
    setNewAliases(cmd.aliases || [])
    setNewAppFilters(cmd.appFilters || [])
    setEditingCommandId(cmd.id)
    setValidationError(null)
    setShowNewForm(true)
  }

  const handleDeleteCommand = async (id: string) => {
    try {
      await invoke("delete_command", { id })
      setCommands(commands.filter((c) => c.id !== id))
    } catch (error) {
      console.error("Failed to delete command:", error)
    }
  }

  const handleTogglePack = async (packId: string) => {
    const pack = packs.find((p) => p.id === packId)
    if (!pack) return

    try {
      if (pack.installed) {
        await invoke("uninstall_command_pack", { packId })
      } else {
        await invoke("install_command_pack", { packId })
      }
      // Reload everything so commands list and installed state stay in sync
      await loadData()
    } catch (error) {
      console.error("Failed to toggle pack:", error)
    }
  }

  const handleExport = async () => {
    try {
      const json = await invoke<string>("export_commands")

      const filePath = await save({
        defaultPath: `voicesnippets-commands-${new Date().toISOString().split("T")[0]}.json`,
        filters: [
          {
            name: "JSON",
            extensions: ["json"],
          },
        ],
      })

      if (filePath) {
        await writeTextFile(filePath, json)
        console.log("Export completed successfully to:", filePath)
      }
    } catch (error) {
      console.error("Failed to export commands:", error)
      alert(`Export failed: ${error}`)
    }
  }

  const handleImport = async () => {
    try {
      const filePath = await open({
        multiple: false,
        filters: [
          {
            name: "JSON",
            extensions: ["json"],
          },
        ],
      })

      if (!filePath) return

      const text = await readTextFile(filePath)
      const count = await invoke<number>("import_commands", {
        json: text,
        merge: true,
      })

      // Reload commands and packs
      await loadData()

      console.log(`Imported ${count} commands`)
      alert(`Successfully imported ${count} commands`)
    } catch (error) {
      console.error("Failed to import commands:", error)
      alert(`Import failed: ${error}`)
    }
  }

  const handleAddNew = () => {
    setEditingCommandId(null)
    setNewTrigger("")
    setNewExpansion("")
    setNewWorkflowSteps([])
    setNewAliases([])
    setNewType("text")
    setValidationError(null)
    setShowNewForm(true)
  }

  const handleCancelForm = () => {
    setShowNewForm(false)
    setEditingCommandId(null)
    setNewTrigger("")
    setNewExpansion("")
    setNewWorkflowSteps([])
    setNewAliases([])
    setNewAppFilters([])
    setValidationError(null)
  }

  /* ================================================================ */
  /*  PACKS VIEW                                                       */
  /* ================================================================ */

  if (activeSubTab === "packs") {
    return (
      <div className="flex flex-col gap-6 overflow-hidden">
        <CommandsHeader
          activeTab={activeSubTab}
          onTabChange={setActiveSubTab}
        />

        {/* Section label */}
        <h2 className="text-xs font-semibold uppercase tracking-wider text-primary">
          Command Packs
        </h2>

        {/* Packs list */}
        <div className="rounded-lg border border-border/50 overflow-hidden w-full max-w-full">
          <div className="overflow-x-hidden overflow-y-auto max-h-125 w-full">
            <CommandPacksList packs={packs} onTogglePack={handleTogglePack} />
          </div>
        </div>
      </div>
    )
  }

  /* ================================================================ */
  /*  COMMANDS VIEW                                                    */
  /* ================================================================ */

  return (
    <div className="relative flex flex-col gap-6">
      <div className="flex flex-col gap-6 sticky top-0 z-10 bg-background pb-4">
        <CommandsHeader
          activeTab={activeSubTab}
          onTabChange={setActiveSubTab}
          onAdd={handleAddNew}
          onImport={handleImport}
          onExport={handleExport}
        />

        {/* Search + Type filter */}
        <div className="flex gap-2 px-1">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search commands..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-card border-border focus-visible:ring-primary"
            />
          </div>

          <div className="w-44">
            <Select value={filterType} onValueChange={(v) => setFilterType(v as any)}>
              <SelectTrigger className="h-10 bg-card border-border text-sm w-full">
                <SelectValue>
                  {filterType === "all"
                    ? "All types"
                    : filterType === "keyboard"
                      ? "Keyboard shortcuts"
                      : filterType === "workflow"
                        ? "Workflows"
                        : filterType === "app"
                          ? "Open applications"
                          : "Text expansions"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="text">Text expansions</SelectItem>
                <SelectItem value="keyboard">Keyboard shortcuts</SelectItem>
                <SelectItem value="workflow">Workflows</SelectItem>
                <SelectItem value="app">Open applications</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* New command form */}
      {showNewForm && (
        <CommandForm
          editingCommandId={editingCommandId}
          commandType={newType}
          trigger={newTrigger}
          expansion={newExpansion}
          workflowSteps={newWorkflowSteps}
          aliases={newAliases}
          appFilters={newAppFilters}
          validationError={validationError}
          onTypeChange={setNewType}
          onTriggerChange={setNewTrigger}
          onExpansionChange={setNewExpansion}
          onWorkflowStepsChange={setNewWorkflowSteps}
          onAliasesChange={setNewAliases}
          onAppFiltersChange={setNewAppFilters}
          onSave={handleAddCommand}
          onCancel={handleCancelForm}
        />
      )}

      {/* Section label */}
      <h2 className="text-xs font-semibold uppercase tracking-wider text-primary px-1">
        Commands
      </h2>

      {/* Commands list */}
      <div className="rounded-lg border border-border/50 overflow-hidden w-full max-w-full">
        <div className="overflow-x-hidden overflow-y-auto w-full">
          <div>
            <CommandsList
              commands={sortedCommands}
              onEdit={handleEditCommand}
              onDelete={handleDeleteCommand}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
