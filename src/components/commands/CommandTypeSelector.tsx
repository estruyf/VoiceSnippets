import { Type, Keyboard, Workflow, ExternalLink } from "lucide-react"

interface CommandTypeSelectorProps {
  selectedType: "text" | "keyboard" | "workflow" | "app"
  onTypeChange: (type: "text" | "keyboard" | "workflow" | "app") => void
}

export function CommandTypeSelector({ selectedType, onTypeChange }: CommandTypeSelectorProps) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <button
        onClick={() => onTypeChange("text")}
        className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium border transition-colors hover:cursor-pointer ${selectedType === "text"
          ? "border-primary bg-primary/15 text-primary"
          : "border-border bg-secondary text-muted-foreground hover:text-foreground"
          }`}
      >
        <Type className="h-3 w-3" />
        Text Expansion
      </button>
      <button
        onClick={() => onTypeChange("keyboard")}
        className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium border transition-colors hover:cursor-pointer ${selectedType === "keyboard"
          ? "border-primary bg-primary/15 text-primary"
          : "border-border bg-secondary text-muted-foreground hover:text-foreground"
          }`}
      >
        <Keyboard className="h-3 w-3" />
        Keyboard Shortcut
      </button>
      <button
        onClick={() => onTypeChange("workflow")}
        className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium border transition-colors hover:cursor-pointer ${selectedType === "workflow"
          ? "border-primary bg-primary/15 text-primary"
          : "border-border bg-secondary text-muted-foreground hover:text-foreground"
          }`}
      >
        <Workflow className="h-3 w-3" />
        Workflow
      </button>
      <button
        onClick={() => onTypeChange("app")}
        className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium border transition-colors hover:cursor-pointer ${selectedType === "app"
          ? "border-primary bg-primary/15 text-primary"
          : "border-border bg-secondary text-muted-foreground hover:text-foreground"
          }`}
      >
        <ExternalLink className="h-3 w-3" />
        Open App <span className="text-[10px] opacity-70">(macOS)</span>
      </button>
    </div>
  )
}
