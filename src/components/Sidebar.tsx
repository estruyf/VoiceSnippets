import { Mic, Settings, Info, Loader2, Check, AlertCircle, Heart, BarChart3, CloudBackup, WholeWord } from "lucide-react"

type Tab = "general" | "commands" | "advanced" | "history" | "about" | "analytics" | "sync" | "custom-words"

interface UpdateAvailable {
  isAvailable: boolean
  latestVersion?: string
}

interface SidebarProps {
  activeTab: Tab
  onTabChange: (tab: Tab) => void
  activeModel: string | null
  appVersion: string
  saveStatus: "idle" | "saving" | "saved"
  isDownloading: boolean
  updateStatus: UpdateAvailable
}

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "commands", label: "Commands", icon: <Mic className="h-5 w-5" /> },
  { id: "general", label: "General", icon: <Settings className="h-5 w-5" /> },
  { id: "custom-words", label: "Custom Words", icon: <WholeWord className="h-5 w-5" /> },
  { id: "sync", label: "Sync", icon: <CloudBackup className="h-5 w-5" /> },
  { id: "analytics", label: "Analytics", icon: <BarChart3 className="h-5 w-5" /> },
  { id: "about", label: "About", icon: <Info className="h-5 w-5" /> },
]

export function Sidebar({
  activeTab,
  onTabChange,
  activeModel,
  appVersion,
  saveStatus,
  isDownloading,
  updateStatus,
}: SidebarProps) {
  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col bg-secondary">
      {/* Drag region (titlebar area) */}
      <div className="h-8 shrink-0 w-full" data-tauri-drag-region />

      {/* Logo area */}
      <div className="px-6 pt-3 pb-6">
        <h1 className="text-xl font-semibold tracking-tight">
          <span className="text-foreground">Voice</span>
          <span className="text-primary">Snippets</span>
        </h1>
      </div>

      {/* Navigation */}
      <nav className="flex flex-col gap-1 px-3" role="tablist" aria-label="Settings tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            disabled={isDownloading}
            onClick={() => onTabChange(tab.id)}
            title={isDownloading ? "Downloading model in progress" : undefined}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors hover:cursor-pointer disabled:opacity-60 disabled:pointer-events-none ${activeTab === tab.id
              ? "bg-accent text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
              }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Status bar */}
      <div className="px-3 py-3 border-t border-border/50">
        {/* Auto-save indicator */}
        {saveStatus !== "idle" && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground  mb-2">
            {saveStatus === "saving" && (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Saving changes...</span>
              </>
            )}
            {saveStatus === "saved" && (
              <>
                <Check className="h-3 w-3 text-success" />
                <span className="text-success">Changes saved</span>
              </>
            )}
          </div>
        )}

        {/* Support */}
        <a
          href="https://github.com/sponsors/estruyf"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-3 py-1 mb-2 rounded-lg bg-gradient-to-r from-pink-500/10 to-red-500/10 border border-pink-500/20 hover:border-pink-500/40 hover:from-pink-500/20 hover:to-red-500/20 transition-all duration-300 group"
        >
          <Heart className="h-4 w-4 text-pink-500 group-hover:fill-pink-500 transition-all duration-300" />
          <span className="text-xs font-medium text-pink-600 dark:text-pink-400">Sponsor</span>
        </a>

        {/* Update indicator */}
        {updateStatus.isAvailable && (
          <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-500 mb-2">
            <AlertCircle className="h-3 w-3" />
            <span>Update available: v{updateStatus.latestVersion}</span>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className={`h-1.5 w-1.5 rounded-full ${activeModel ? "bg-success" : "bg-muted-foreground/40"
                }`}
            />
            <span className="text-xs text-muted-foreground truncate max-w-[140px]">
              {activeModel || "No model"}
            </span>
          </div>
          <span className="text-[10px] text-muted-foreground/60">{appVersion}</span>
        </div>
      </div>
    </aside>
  )
}
