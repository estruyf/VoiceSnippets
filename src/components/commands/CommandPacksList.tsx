import { Package, Check, Trash2, Download } from "lucide-react"
import { Button } from "@/components/ui/button"

export interface CommandPack {
  id: string
  name: string
  description: string
  commandCount: number
  installed: boolean
}

interface CommandPacksListProps {
  packs: CommandPack[]
  onTogglePack: (packId: string) => void
}

export function CommandPacksList({ packs, onTogglePack }: CommandPacksListProps) {
  if (packs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground bg-card">
        <Package className="mb-3 h-8 w-8 opacity-40" />
        <p className="text-sm">No packs available.</p>
      </div>
    )
  }

  return (
    <>
      {packs.map((pack, index) => (
        <div
          key={pack.id}
          className={`flex items-center gap-4 bg-card px-4 py-4 w-full ${index < packs.length - 1 ? "border-b border-border" : ""
            }`}
        >
          {/* Icon */}
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary shrink-0">
            <Package className="h-4 w-4" />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground truncate">{pack.name}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
                {pack.commandCount} commands
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground truncate">{pack.description}</p>
          </div>

          {/* Action */}
          <Button
            variant={pack.installed ? "ghost" : "default"}
            size="sm"
            onClick={() => onTogglePack(pack.id)}
            className={`group ${pack.installed
                ? "gap-1.5 text-muted-foreground hover:text-destructive"
                : "gap-1.5 bg-primary text-primary-foreground hover:bg-primary/80"
              }`}
          >
            {pack.installed ? (
              <>
                <Check className="h-4 w-4 group-hover:hidden" />
                <Trash2 className="h-4 w-4 hidden group-hover:block" />
                <span className="group-hover:hidden">Installed</span>
                <span className="hidden group-hover:inline">Uninstall</span>
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                Install
              </>
            )}
          </Button>
        </div>
      ))}
    </>
  )
}
