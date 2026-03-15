import { useEffect, useState, type Dispatch, type SetStateAction } from "react"
import { X, Plus, AlertCircle } from "lucide-react"
import { open } from "@tauri-apps/plugin-dialog"
import { invoke } from "@tauri-apps/api/core"
import { Button } from "@/components/ui/button"
import { ErrorBoundary } from "@/components/ErrorBoundary"
import { type AppFilter } from "@/models"

interface SelectedApp {
  id: string
  displayName: string
  path: string
}

interface AppInfo {
  id: string
  name: string
}

interface AppSelectorProps {
  selectedApps: AppFilter[]
  onAppsChange: Dispatch<SetStateAction<AppFilter[]>>
}

export function AppSelector({ selectedApps, onAppsChange }: AppSelectorProps) {
  const [selectedAppDetails, setSelectedAppDetails] = useState<Map<string, SelectedApp>>(new Map())
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setSelectedAppDetails((prev) => {
      if (prev.size === 0) return prev

      const next = new Map(prev)
      for (const key of next.keys()) {
        if (!selectedApps.some((app) => app.id === key)) {
          next.delete(key)
        }
      }

      return next
    })
  }, [selectedApps])

  const handlePickApp = async () => {
    setError(null)
    try {
      const selected = await open({
        title: "Select an Application",
        directory: false,
        multiple: false,
        defaultPath: "/Applications",
        filters: [
          {
            name: "Applications",
            extensions: ["app"],
          },
        ],
      })

      if (typeof selected === "string" && selected) {
        let appId = ""
        let appName = ""
        try {
          const appInfo = await invoke<AppInfo>("get_app_info_from_path", { path: selected })
          appId = appInfo.id
          appName = appInfo.name
        } catch (err) {
          // Fallback to path-derived name when bundle lookup fails
          const parts = selected.split("/")
          const appFileName = parts[parts.length - 1] // "VoiceSnippets.app"
          appName = appFileName.replace(".app", "") // "VoiceSnippets"
          appId = appName
        }

        if (!appId) {
          setError("Failed to resolve application bundle ID")
          return
        }

        // Only add if not already selected
        onAppsChange((current) => {
          if (current.some((app) => app.id === appId)) {
            setError(`"${appName}" is already added`)
            return current
          }

          return [...current, { id: appId, name: appName }]
        })

        // Store app details for display
        setSelectedAppDetails((prev) => {
          const next = new Map(prev)
          next.set(appId, {
            id: appId,
            displayName: appName,
            path: selected,
          })
          return next
        })
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes("canceled")) {
        // User cancelled the dialog, not an error
        return
      }
      setError(`Failed to pick application: ${err}`)
    }
  }

  const handleRemoveApp = (appId: string) => {
    onAppsChange((current) => current.filter((app) => app.id !== appId))

    setSelectedAppDetails((prev) => {
      const next = new Map(prev)
      next.delete(appId)
      return next
    })
  }

  const getAppDisplayName = (appId: string): string => {
    const selected = selectedApps.find((app) => app.id === appId)
    return selectedAppDetails.get(appId)?.displayName || selected?.name || appId
  }

  return (
    <ErrorBoundary>
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1.5">
          <label className="block text-xs text-muted-foreground">
            App Filters (optional — command applies to all apps if empty)
          </label>
        </div>

        {error && (
          <div className="rounded-md bg-destructive/15 border border-destructive/30 px-2 py-1.5 text-xs text-destructive mb-2 flex items-center gap-2">
            <AlertCircle className="h-3 w-3 shrink-0" />
            {error}
          </div>
        )}

        {/* Display selected apps */}
        {selectedApps.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {selectedApps.map((app) => {
              const displayName = getAppDisplayName(app.id)

              return (
                <div
                  key={app.id}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary/15 border border-primary/30 px-3 py-2"
                >
                  <span className="text-xs text-primary truncate">{displayName}</span>
                  <button
                    onClick={() => handleRemoveApp(app.id)}
                    className="text-primary hover:text-primary/80 transition-colors"
                    aria-label={`Remove ${displayName}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {/* Add App button */}
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 w-fit text-muted-foreground hover:text-foreground"
          onClick={handlePickApp}
        >
          <Plus className="h-3 w-3" />
          Add Application
        </Button>

        {selectedApps.length > 0 && (
          <p className="text-[10px] text-muted-foreground mt-2">
            This command will only trigger when using: {selectedApps
              .map((app) => getAppDisplayName(app.id))
              .join(", ")}
          </p>
        )}
      </div>
    </ErrorBoundary>
  )
}
