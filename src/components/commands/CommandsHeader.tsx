import { Type, Package, Upload, Download, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"

interface CommandsHeaderProps {
  activeTab: "commands" | "packs"
  onTabChange: (tab: "commands" | "packs") => void
  onAdd?: () => void
  onImport?: () => void
  onExport?: () => void
}

export function CommandsHeader({
  activeTab,
  onTabChange,
  onAdd,
  onImport,
  onExport,
}: CommandsHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1 rounded-lg bg-card p-1 border border-border/50">
        <button
          onClick={() => onTabChange("commands")}
          className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors hover:cursor-pointer ${activeTab === "commands"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
            }`}
        >
          <Type className="h-4 w-4" />
          Commands
        </button>
        <button
          onClick={() => onTabChange("packs")}
          className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors hover:cursor-pointer ${activeTab === "packs"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
            }`}
        >
          <Package className="h-4 w-4" />
          Packs
        </button>
      </div>

      {activeTab === "commands" && (
        <div className="flex items-center gap-2">
          {onImport && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-accent hover:cursor-pointer"
              title="Import"
              onClick={onImport}
            >
              <Download className="h-4 w-4" />
              <span className="sr-only">Import</span>
            </Button>
          )}
          {onExport && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-accent hover:cursor-pointer"
              title="Export"
              onClick={onExport}
            >
              <Upload className="h-4 w-4" />
              <span className="sr-only">Export</span>
            </Button>
          )}
          {onAdd && (
            <Button
              size="sm"
              className="bg-primary text-primary-foreground hover:bg-primary/80 hover:cursor-pointer"
              onClick={onAdd}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Add
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
