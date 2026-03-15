import { CommandsTab } from "./CommandsTab"
import { GeneralTab } from "./GeneralTab"
import { AboutTab } from "./AboutTab"
import { AnalyticsTab } from "./AnalyticsTab"
import { SyncTab } from "./SyncTab"
import { CustomWordsTab } from "./CustomWordsTab"
import { WelcomeScreen } from "./WelcomeScreen"
import { Tab } from "@/models"

interface DownloadState {
  isDownloading: boolean
  modelId: string | null
  progress: number | null
}

interface MainContentProps {
  activeTab: Tab
  hasDownloadedModel: boolean
  isLoading: boolean
  downloadState: DownloadState
  onDownloadStart: (modelId: string) => void
  onSaveStatusChange: (status: "idle" | "saving" | "saved") => void
  onGetStarted: () => void
}

export function MainContent({
  activeTab,
  hasDownloadedModel,
  isLoading,
  downloadState,
  onDownloadStart,
  onSaveStatusChange,
  onGetStarted,
}: MainContentProps) {
  return (
    <div className="flex flex-1 flex-col h-screen border-l border-border">
      {/* Drag region (titlebar area) */}
      <div className="h-8 shrink-0 w-full" data-tauri-drag-region />

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-8 pb-8">
          {activeTab === "general" && (
            <GeneralTab
              downloadState={downloadState}
              onDownloadStart={onDownloadStart}
              onSaveStatusChange={onSaveStatusChange}
            />
          )}
          {activeTab === "commands" &&
            (!isLoading && !hasDownloadedModel ? (
              <WelcomeScreen onGetStarted={onGetStarted} />
            ) : (
              <CommandsTab />
            ))}
          {activeTab === "custom-words" && (
            <CustomWordsTab onSaveStatusChange={onSaveStatusChange} />
          )}
          {activeTab === "analytics" && <AnalyticsTab />}
          {activeTab === "sync" && <SyncTab />}
          {activeTab === "advanced" && (
            <div className="text-muted-foreground text-sm">Advanced settings coming soon.</div>
          )}
          {activeTab === "history" && (
            <div className="text-muted-foreground text-sm">Command history coming soon.</div>
          )}
          {activeTab === "about" && <AboutTab />}
        </div>
      </main>
    </div>
  )
}
