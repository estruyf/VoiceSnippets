import { Type, Keyboard, Workflow, Trash2, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { type WorkflowStep } from "@/components/WorkflowEditor"
import { type AppFilter } from "@/models"

export interface Command {
  id: string
  type: "text" | "keyboard" | "workflow" | "app"
  trigger: string
  expansion: string
  pack?: string
  aliases?: string[]
  appFilters?: AppFilter[]
  workflowSteps?: WorkflowStep[]
}

interface CommandsListProps {
  commands: Command[]
  onEdit: (command: Command) => void
  onDelete: (id: string) => void
}

export function CommandsList({ commands, onEdit, onDelete }: CommandsListProps) {
  if (commands.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground bg-card">
        <Type className="mb-3 h-8 w-8 opacity-40" />
        <p className="text-sm">No commands configured yet.</p>
        <p className="mt-1 text-xs opacity-70">Add your first voice command!</p>
      </div>
    )
  }

  return (
    <>
      {commands.map((cmd, index) => {
        const prevType = index > 0 ? commands[index - 1].type : null
        const showGroupHeader = index === 0 || cmd.type !== prevType
        return (
          <div key={cmd.id}>
            {showGroupHeader && (
              <div className="px-4 py-2 bg-muted/5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {cmd.type === "keyboard" ? "Keyboard shortcuts" : cmd.type === "workflow" ? "Workflows" : cmd.type === "app" ? "Open Applications (macOS)" : "Text expansions"}
              </div>
            )}

            <div
              onClick={() => onEdit(cmd)}
              className={`group flex items-center gap-3 bg-card px-4 py-3.5 transition-colors hover:bg-accent/50 cursor-pointer w-full ${index < commands.length - 1 ? "border-b border-border" : ""}
              `}
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/15 text-primary shrink-0">
                {cmd.type === "workflow" ? (
                  <Workflow className="h-4 w-4 text-muted-foreground" />
                ) : cmd.type === "keyboard" ? (
                  <Keyboard className="h-4 w-4 text-muted-foreground" />
                ) : cmd.type === "app" ? (
                  <ExternalLink className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Type className="h-4 w-4 text-muted-foreground" />
                )}
              </div>

              <div className="flex flex-1 items-center gap-2 min-w-0 overflow-hidden">
                <div className="min-w-[150px] max-w-[150px]">
                  <span className="font-mono text-sm text-foreground truncate block">{`"${cmd.trigger}"`}</span>
                  {cmd.aliases && cmd.aliases.length > 0 && (
                    <span className="font-mono text-[10px] text-muted-foreground truncate block">
                      aka {cmd.aliases.map(a => `"${a}"`).join(", ")}
                    </span>
                  )}
                </div>
                <span className="text-muted-foreground text-xs shrink-0">{"→"}</span>
                <span className="font-mono text-sm text-muted-foreground truncate">
                  {cmd.expansion}
                </span>
              </div>

              {cmd.pack && (
                <span className="text-[10px] px-2 py-0.5 rounded-md bg-accent text-accent-foreground font-medium shrink-0">
                  {cmd.pack}
                </span>
              )}

              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground/40 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete(cmd.id)
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )
      })}
    </>
  )
}
