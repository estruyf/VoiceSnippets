"use client"

import { useState, useEffect } from "react"
import { invoke } from "@tauri-apps/api/core"
import { BarChart3, TrendingUp, Clock, Zap, ArrowUpDown, Type, Keyboard, Workflow, ExternalLink } from "lucide-react"
import { type AppFilter } from "@/models"

interface VoiceCommand {
  id: string
  trigger_word: string
  expansion: string
  command_type: string
  last_used_at?: string | null
  use_count: number
  category?: string | null
  app_filters?: AppFilter[]
}

interface CommandAnalytics extends VoiceCommand {
  daysSinceLastUse: number | null
  usageCategory: "frequent" | "moderate" | "rare" | "unused"
}

type SortField = "use_count" | "last_used_at" | "trigger_word"
type SortDirection = "asc" | "desc"

export function AnalyticsTab() {
  const [commands, setCommands] = useState<CommandAnalytics[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [sortField, setSortField] = useState<SortField>("use_count")
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc")

  useEffect(() => {
    loadAnalytics()
  }, [])

  const loadAnalytics = async () => {
    try {
      const voiceCommands = await invoke<VoiceCommand[]>("get_commands")
      const analyticsData = voiceCommands.map((cmd) => {
        const lastUsed = cmd.last_used_at ? new Date(cmd.last_used_at) : null
        const daysSinceLastUse = lastUsed
          ? Math.floor((Date.now() - lastUsed.getTime()) / (1000 * 60 * 60 * 24))
          : null

        let usageCategory: "frequent" | "moderate" | "rare" | "unused" = "unused"
        if (cmd.use_count >= 10) usageCategory = "frequent"
        else if (cmd.use_count >= 5) usageCategory = "moderate"
        else if (cmd.use_count > 0) usageCategory = "rare"

        return {
          ...cmd,
          daysSinceLastUse,
          usageCategory,
        }
      })
      setCommands(analyticsData)
    } catch (error) {
      console.error("Failed to load analytics:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc")
    } else {
      setSortField(field)
      setSortDirection("desc")
    }
  }

  const sortedCommands = [...commands].sort((a, b) => {
    let comparison = 0

    switch (sortField) {
      case "use_count":
        comparison = a.use_count - b.use_count
        break
      case "last_used_at": {
        const aTime = a.last_used_at ? new Date(a.last_used_at).getTime() : 0
        const bTime = b.last_used_at ? new Date(b.last_used_at).getTime() : 0
        comparison = aTime - bTime
        break
      }
      case "trigger_word":
        comparison = a.trigger_word.localeCompare(b.trigger_word)
        break
    }

    return sortDirection === "asc" ? comparison : -comparison
  })

  const totalCommands = commands.length
  const totalUses = commands.reduce((sum, cmd) => sum + cmd.use_count, 0)
  const usedCommands = commands.filter((cmd) => cmd.use_count > 0).length
  const mostUsedCommand = commands.reduce(
    (max, cmd) => (cmd.use_count > max.use_count ? cmd : max),
    commands[0] || { trigger_word: "N/A", use_count: 0 }
  )

  const frequentCommands = commands.filter((cmd) => cmd.usageCategory === "frequent").length
  const moderateCommands = commands.filter((cmd) => cmd.usageCategory === "moderate").length
  const rareCommands = commands.filter((cmd) => cmd.usageCategory === "rare").length
  const unusedCommands = commands.filter((cmd) => cmd.usageCategory === "unused").length

  const recentlyUsed = commands
    .filter((cmd) => cmd.last_used_at)
    .sort((a, b) => {
      const aTime = a.last_used_at ? new Date(a.last_used_at).getTime() : 0
      const bTime = b.last_used_at ? new Date(b.last_used_at).getTime() : 0
      return bTime - aTime
    })
    .slice(0, 5)

  const getCommandTypeIcon = (commandType: string) => {
    switch (commandType) {
      case "Workflow":
        return <Workflow className="h-3.5 w-3.5" />
      case "KeyboardShortcut":
        return <Keyboard className="h-3.5 w-3.5" />
      case "OpenApp":
        return <ExternalLink className="h-3.5 w-3.5" />
      default:
        return <Type className="h-3.5 w-3.5" />
    }
  }

  const formatLastUsed = (dateString: string | null | undefined) => {
    if (!dateString) return "Never"
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / (1000 * 60))
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  }

  const getUsageBadgeColor = (category: string) => {
    switch (category) {
      case "frequent":
        return "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20"
      case "moderate":
        return "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
      case "rare":
        return "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20"
      default:
        return "bg-muted text-muted-foreground border-border"
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px]">
        <p className="text-muted-foreground">Loading analytics...</p>
      </div>
    )
  }

  if (totalCommands === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px] text-muted-foreground">
        <BarChart3 className="mb-3 h-12 w-12 opacity-40" />
        <p className="text-lg font-medium">No command data yet</p>
        <p className="mt-2 text-sm opacity-70">
          Start using voice commands to see analytics here.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8 py-8">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Analytics Dashboard</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Track your voice command usage and identify patterns.
        </p>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <BarChart3 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-semibold">{totalCommands}</p>
              <p className="text-xs text-muted-foreground">Total Commands</p>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10">
              <TrendingUp className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-2xl font-semibold">{totalUses}</p>
              <p className="text-xs text-muted-foreground">Total Uses</p>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
              <Zap className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-semibold">{usedCommands}</p>
              <p className="text-xs text-muted-foreground">
                Used Commands ({Math.round((usedCommands / totalCommands) * 100)}%)
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/10">
              <Clock className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-lg font-semibold font-mono truncate max-w-[150px]">
                {mostUsedCommand.trigger_word}
              </p>
              <p className="text-xs text-muted-foreground">
                Most Used ({mostUsedCommand.use_count}x)
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Usage Distribution */}
      <div className="rounded-lg border border-border bg-card p-6">
        <h2 className="text-lg font-semibold mb-4">Usage Distribution</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div className="text-center">
            <p className="text-2xl font-semibold text-green-600 dark:text-green-400">
              {frequentCommands}
            </p>
            <p className="text-xs text-muted-foreground">Frequent (10+ uses)</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-semibold text-blue-600 dark:text-blue-400">
              {moderateCommands}
            </p>
            <p className="text-xs text-muted-foreground">Moderate (5-9 uses)</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-semibold text-orange-600 dark:text-orange-400">
              {rareCommands}
            </p>
            <p className="text-xs text-muted-foreground">Rare (1-4 uses)</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-semibold text-muted-foreground">{unusedCommands}</p>
            <p className="text-xs text-muted-foreground">Unused</p>
          </div>
        </div>
        <div className="h-3 w-full rounded-full overflow-hidden flex bg-muted">
          {frequentCommands > 0 && (
            <div
              className="bg-green-500 h-full"
              style={{ width: `${(frequentCommands / totalCommands) * 100}%` }}
            />
          )}
          {moderateCommands > 0 && (
            <div
              className="bg-blue-500 h-full"
              style={{ width: `${(moderateCommands / totalCommands) * 100}%` }}
            />
          )}
          {rareCommands > 0 && (
            <div
              className="bg-orange-500 h-full"
              style={{ width: `${(rareCommands / totalCommands) * 100}%` }}
            />
          )}
          {unusedCommands > 0 && (
            <div
              className="bg-muted-foreground/30 h-full"
              style={{ width: `${(unusedCommands / totalCommands) * 100}%` }}
            />
          )}
        </div>
      </div>

      {/* Recently Used */}
      {recentlyUsed.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-6">
          <h2 className="text-lg font-semibold mb-4">Recently Used</h2>
          <div className="space-y-2">
            {recentlyUsed.map((cmd) => (
              <div
                key={cmd.id}
                className="flex items-center justify-between p-3 rounded-lg bg-accent/30 border border-border/50"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 shrink-0">
                    {getCommandTypeIcon(cmd.command_type)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-sm font-medium truncate">{cmd.trigger_word}</p>
                    <p className="text-xs text-muted-foreground truncate">{cmd.expansion}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-muted-foreground">
                    {formatLastUsed(cmd.last_used_at)}
                  </span>
                  <span className="text-xs font-medium px-2 py-1 rounded-md bg-muted">
                    {cmd.use_count}x
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All Commands Table */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="p-6 border-b border-border">
          <h2 className="text-lg font-semibold">Command Details</h2>
          <p className="text-sm text-muted-foreground mt-1">
            View and analyze usage statistics for all commands.
          </p>
        </div>

        {/* Table Header */}
        <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-muted/50 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          <button
            onClick={() => handleSort("trigger_word")}
            className="col-span-4 flex items-center gap-1 hover:text-foreground transition-colors"
          >
            Command
            <ArrowUpDown className="h-3 w-3" />
          </button>
          <div className="col-span-2">Type</div>
          <button
            onClick={() => handleSort("use_count")}
            className="col-span-2 flex items-center gap-1 hover:text-foreground transition-colors"
          >
            Uses
            <ArrowUpDown className="h-3 w-3" />
          </button>
          <button
            onClick={() => handleSort("last_used_at")}
            className="col-span-2 flex items-center gap-1 hover:text-foreground transition-colors"
          >
            Last Used
            <ArrowUpDown className="h-3 w-3" />
          </button>
          <div className="col-span-2">Status</div>
        </div>

        {/* Table Body */}
        <div className="divide-y divide-border max-h-96 overflow-y-auto">
          {sortedCommands.map((cmd) => (
            <div
              key={cmd.id}
              className="grid grid-cols-12 gap-4 px-6 py-4 hover:bg-accent/30 transition-colors"
            >
              <div className="col-span-4 flex items-center gap-2 min-w-0">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 shrink-0">
                  {getCommandTypeIcon(cmd.command_type)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-sm font-medium truncate">{cmd.trigger_word}</p>
                  {cmd.category && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent text-accent-foreground">
                      {cmd.category}
                    </span>
                  )}
                </div>
              </div>
              <div className="col-span-2 flex items-center text-sm text-muted-foreground">
                {cmd.command_type === "Workflow"
                  ? "Workflow"
                  : cmd.command_type === "KeyboardShortcut"
                    ? "Keyboard"
                    : "Text"}
              </div>
              <div className="col-span-2 flex items-center">
                <span className="text-sm font-medium">{cmd.use_count}</span>
              </div>
              <div className="col-span-2 flex items-center text-sm text-muted-foreground">
                {formatLastUsed(cmd.last_used_at)}
              </div>
              <div className="col-span-2 flex items-center">
                <span
                  className={`text-[10px] px-2 py-1 rounded-md border font-medium capitalize ${getUsageBadgeColor(cmd.usageCategory)}`}
                >
                  {cmd.usageCategory}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Insights */}
      <div className="rounded-lg border border-border bg-card p-6">
        <h2 className="text-lg font-semibold mb-4">Insights</h2>
        <div className="space-y-3 text-sm">
          {unusedCommands > 0 && (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
              <div className="h-5 w-5 rounded-full bg-orange-500/20 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-orange-600 dark:text-orange-400 text-xs">!</span>
              </div>
              <div>
                <p className="font-medium">
                  You have {unusedCommands} unused command{unusedCommands !== 1 ? "s" : ""}.
                </p>
                <p className="text-muted-foreground text-xs mt-1">
                  Consider removing commands you don't use to keep your list focused.
                </p>
              </div>
            </div>
          )}
          {frequentCommands > 0 && (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
              <div className="h-5 w-5 rounded-full bg-green-500/20 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-green-600 dark:text-green-400 text-xs">✓</span>
              </div>
              <div>
                <p className="font-medium">
                  {frequentCommands} frequently used command{frequentCommands !== 1 ? "s" : ""}.
                </p>
                <p className="text-muted-foreground text-xs mt-1">
                  These are your power commands — keep them easily accessible!
                </p>
              </div>
            </div>
          )}
          {totalUses > 0 && (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
              <div className="h-5 w-5 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-blue-600 dark:text-blue-400 text-xs">i</span>
              </div>
              <div>
                <p className="font-medium">
                  Average {(totalUses / usedCommands).toFixed(1)} uses per active command.
                </p>
                <p className="text-muted-foreground text-xs mt-1">
                  {totalUses / usedCommands < 3
                    ? "Try using your commands more often to build the habit."
                    : "Great job building consistent voice command habits!"}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
