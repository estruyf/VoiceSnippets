"use client"

import { useState, useEffect } from "react"
import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import { Sidebar } from "@/components/Sidebar"
import { MainContent } from "@/components/MainContent"
import { PermissionsScreen, PermissionsStatus } from "@/components/PermissionsScreen"
import { useOverlayScrollbars } from "@/hooks/useOverlayScrollbars"
import { checkForUpdates } from "@/lib/update-checker"
import { Tab } from "@/models"


interface DownloadProgress {
  model_id: string
  downloaded: number
  total: number
  percentage: number
}

interface DownloadState {
  isDownloading: boolean
  modelId: string | null
  progress: number | null
}

interface UpdateAvailable {
  isAvailable: boolean
  latestVersion?: string
}

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("commands")
  const [activeModel, setActiveModel] = useState<string | null>(null)
  const [appVersion, setAppVersion] = useState<string>("unknown")
  const [hasDownloadedModel, setHasDownloadedModel] = useState<boolean>(false)
  const [isLoading, setIsLoading] = useState(true)
  const [showPermissionsScreen, setShowPermissionsScreen] = useState(false)
  const [downloadState, setDownloadState] = useState<DownloadState>({
    isDownloading: false,
    modelId: null,
    progress: null,
  })
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle")
  const [updateStatus, setUpdateStatus] = useState<UpdateAvailable>({ isAvailable: false })
  // Initialize custom scrollbars
  useOverlayScrollbars()

  useEffect(() => {
    let unlistenModel: (() => void) | undefined
    let unlistenUpdates: (() => void) | undefined
    let unlistenDownloadProgress: (() => void) | undefined
    let unlistenDownloadComplete: (() => void) | undefined
    let unlistenDownloadCancelled: (() => void) | undefined

    async function init() {
      try {
        // Check permissions status first
        const permissionsStatus = await invoke<PermissionsStatus>("get_permissions_status")
        if (!permissionsStatus.permissions_requested) {
          setShowPermissionsScreen(true)
          setIsLoading(false)
          return
        }

        // Fetch available models + current ID + app version
        const [models, currentId, version] = await Promise.all([
          invoke<{ id: string; name: string; is_downloaded: boolean }[]>("get_available_models"),
          invoke<string>("get_current_model"),
          invoke<string>("get_app_version"),
        ])

        // Check if any model is downloaded
        const anyDownloaded = models.some(m => m.is_downloaded)
        setHasDownloadedModel(anyDownloaded)
        setAppVersion(`v${version}`)

        const updateModel = (id: string) => {
          if (!id) {
            setActiveModel(null)
            return
          }
          const found = models.find((m) => m.id === id)
          setActiveModel(found ? found.name : id)
        }

        // Initial set
        updateModel(currentId)

        // Listen for changes
        unlistenModel = await listen<string>("model-changed", (event) => {
          updateModel(event.payload)
        })

        unlistenUpdates = await listen("check-for-updates", async () => {
          const result = await checkForUpdates(false)
          setUpdateStatus({
            isAvailable: result.isAvailable,
            latestVersion: result.latestVersion,
          })
        })

        unlistenDownloadProgress = await listen<DownloadProgress>(
          "model-download-progress",
          (event) => {
            setDownloadState({
              isDownloading: true,
              modelId: event.payload.model_id,
              progress: event.payload.percentage,
            })
          }
        )

        unlistenDownloadComplete = await listen<string>(
          "model-download-complete",
          async (event) => {
            setDownloadState({ isDownloading: false, modelId: null, progress: null })
            try {
              const refreshed = await invoke<{ id: string; name: string; is_downloaded: boolean }[]>(
                "get_available_models"
              )
              setHasDownloadedModel(refreshed.some((m) => m.is_downloaded))

              // If no model is currently selected, auto-activate the newly downloaded model
              const currentModel = await invoke<string>("get_current_model")
              if (!currentModel && event.payload) {
                await invoke("set_active_model", { modelId: event.payload })
              }
            } catch (e) {
              console.error("Failed to refresh model status", e)
            }
          }
        )

        unlistenDownloadCancelled = await listen<string>(
          "model-download-cancelled",
          () => {
            setDownloadState({ isDownloading: false, modelId: null, progress: null })
          }
        )
      } catch (e) {
        console.error("Failed to init app state", e)
      } finally {
        setIsLoading(false)
      }
    }

    init()

    return () => {
      if (unlistenModel) unlistenModel()
      if (unlistenUpdates) unlistenUpdates()
      if (unlistenDownloadProgress) unlistenDownloadProgress()
      if (unlistenDownloadComplete) unlistenDownloadComplete()
      if (unlistenDownloadCancelled) unlistenDownloadCancelled()
    }
  }, [])

  const handlePermissionsComplete = () => {
    setShowPermissionsScreen(false)
    // Refresh the app state now that permissions are handled
    setIsLoading(true)
    window.location.reload()
  }

  const handleGetStarted = () => {
    setActiveTab("general")
  }

  const handleDownloadStart = (modelId: string) => {
    setDownloadState({ isDownloading: true, modelId, progress: 0 })
  }

  // Refresh model status when switching tabs
  const handleTabChange = async (tab: Tab) => {
    if (downloadState.isDownloading) return
    setActiveTab(tab)

    // Recheck if a model has been downloaded when switching to commands tab
    if (tab === "commands") {
      try {
        const models = await invoke<{ id: string; name: string; is_downloaded: boolean }[]>("get_available_models")
        const anyDownloaded = models.some(m => m.is_downloaded)
        setHasDownloadedModel(anyDownloaded)
      } catch (e) {
        console.error("Failed to refresh model status", e)
      }
    }
  }

  if (showPermissionsScreen) {
    return <PermissionsScreen onComplete={handlePermissionsComplete} />
  }

  return (
    <div className="flex h-screen min-w-180 bg-background text-foreground overflow-hidden">
      <Sidebar
        activeTab={activeTab}
        onTabChange={handleTabChange}
        activeModel={activeModel}
        appVersion={appVersion}
        saveStatus={saveStatus}
        isDownloading={downloadState.isDownloading}
        updateStatus={updateStatus}
      />
      <MainContent
        activeTab={activeTab}
        hasDownloadedModel={hasDownloadedModel}
        isLoading={isLoading}
        downloadState={downloadState}
        onDownloadStart={handleDownloadStart}
        onSaveStatusChange={setSaveStatus}
        onGetStarted={handleGetStarted}
      />
    </div>
  )
}
