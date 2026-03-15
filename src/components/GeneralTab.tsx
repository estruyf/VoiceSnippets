"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Mic, Settings2, Download, Check, Loader2, RefreshCw, Trash2, Brain } from "lucide-react"
import { invoke } from "@tauri-apps/api/core"
import { isEnabled, enable, disable } from "@tauri-apps/plugin-autostart"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { ShortcutInput } from "./ShortcutInput"
import { SettingItem } from "./SettingItem"

/* ------------------------------------------------------------------ */
/*  Backend types                                                      */
/* ------------------------------------------------------------------ */

interface ModelInfo {
  id: string
  name: string
  description: string
  size_mb: string
  is_downloaded: boolean
  is_downloading: boolean
  is_active: boolean
}

interface AudioDevice {
  name: string
  is_default: boolean
}

// UI state often extends backend state or maps it.
// We'll keep it simple: map ModelInfo to what the UI expects,
// or just use ModelInfo directly but mapped to UI fields.
interface WhisperModelUI extends ModelInfo {
  status: "not-downloaded" | "downloading" | "downloaded" | "active"
  recommended?: boolean
}

interface AppSettings {
  selected_model: string
  selected_language: string
  hotkey: string
  overlay_position: "Top" | "Bottom" | "Center" | "Hidden"
  launch_at_login: boolean
  selected_microphone: string | null
  max_recording_seconds: number
  min_recording_ms: number
  fuzzy_match_threshold: number
  debug_save_recordings: boolean
  audio_feedback_enabled: boolean
  command_chaining_enabled: boolean
}

/* ------------------------------------------------------------------ */
/*  GeneralTab                                                         */
/* ------------------------------------------------------------------ */

interface DownloadState {
  isDownloading: boolean
  modelId: string | null
  progress: number | null
}

interface GeneralTabProps {
  downloadState: DownloadState
  onDownloadStart: (modelId: string) => void
  onSaveStatusChange: (status: "idle" | "saving" | "saved") => void
}

export function GeneralTab({ downloadState, onDownloadStart, onSaveStatusChange }: GeneralTabProps) {
  const [models, setModels] = useState<WhisperModelUI[]>([])
  const [loadingModels, setLoadingModels] = useState(true)
  const [availableMicrophones, setAvailableMicrophones] = useState<AudioDevice[]>([])

  const [microphone, setMicrophone] = useState("default")
  const [hotkey, setHotkey] = useState("Alt+S")
  const [overlayPosition, setOverlayPosition] = useState("Bottom")
  const [maxDuration, setMaxDuration] = useState("5")
  const [minRecordingMs, setMinRecordingMs] = useState("800")
  const [fuzzyThreshold, setFuzzyThreshold] = useState("0.6")
  const [launchAtLogin, setLaunchAtLogin] = useState(false)
  const [hotkeyError, setHotkeyError] = useState<string | null>(null)
  const [debugSaveRecordings, setDebugSaveRecordings] = useState(false)
  const [audioFeedbackEnabled, setAudioFeedbackEnabled] = useState(false)
  const [commandChainingEnabled, setCommandChainingEnabled] = useState(true)

  const [isInitialLoad, setIsInitialLoad] = useState(true)
  const saveTimeoutRef = useRef<number | null>(null)
  const isFetchingMicrophonesRef = useRef(false)

  // Fetch available microphones
  const fetchMicrophones = useCallback(async () => {
    if (isFetchingMicrophonesRef.current) return
    isFetchingMicrophonesRef.current = true

    try {
      const mics = await invoke<AudioDevice[]>("get_available_microphones")
      setAvailableMicrophones(mics)
    } catch (err) {
      console.error("Failed to fetch microphones:", err)
    } finally {
      isFetchingMicrophonesRef.current = false
    }
  }, [])

  // Fetch initial data
  useEffect(() => {
    async function loadData() {
      try {
        setLoadingModels(true)

        // 1. Fetch available models
        const availableModels = await invoke<ModelInfo[]>("get_available_models")

        // 2. Fetch current active model ID
        const currentModelId = await invoke<string>("get_current_model")

        // 3. Map to UI state
        // Note: The backend returns "is_downloaded", "is_active", but "is_active" 
        // implies currently loaded in memory, whereas "selected_model" is the setting.
        const mapped: WhisperModelUI[] = availableModels.map((m) => {
          let status: WhisperModelUI["status"] = "not-downloaded"
          if (m.is_downloading) {
            status = "downloading"
          } else if (m.id === currentModelId && m.is_downloaded) {
            status = "active"
          } else if (m.is_downloaded) {
            status = "downloaded"
          }

          return {
            ...m,
            status,
            // Hardcode recommended for base just for UI flair if desired,
            // or move this logic to backend later.
            recommended: m.id === "base"
          }
        })
        setModels(mapped)

        // 4. Fetch settings
        const settings = await invoke<AppSettings>("get_settings")
        setMicrophone(settings.selected_microphone || "default")
        setHotkey(settings.hotkey)
        setOverlayPosition(settings.overlay_position)
        setMaxDuration(settings.max_recording_seconds.toString())
        setMinRecordingMs(settings.min_recording_ms.toString())
        setFuzzyThreshold(settings.fuzzy_match_threshold.toString())
        setDebugSaveRecordings(settings.debug_save_recordings)
        setAudioFeedbackEnabled(!!(settings as any).audio_feedback_enabled)
        setCommandChainingEnabled(settings.command_chaining_enabled ?? true)

        // 5. Check actual autostart status from plugin
        const autostartEnabled = await isEnabled()
        setLaunchAtLogin(autostartEnabled)

        // 6. Fetch available microphones
        await fetchMicrophones()

      } catch (err) {
        console.error("Failed to load settings:", err)
      } finally {
        setLoadingModels(false)
        // Allow auto-save to trigger after initial load
        setTimeout(() => setIsInitialLoad(false), 100)
      }
    }
    loadData()
  }, [])

  useEffect(() => {
    fetchMicrophones()

    const intervalId = window.setInterval(fetchMicrophones, 5000)
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        fetchMicrophones()
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      window.clearInterval(intervalId)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [fetchMicrophones])

  // Auto-save settings when they change (with debounce)
  useEffect(() => {
    // Skip auto-save during initial load
    if (isInitialLoad || loadingModels) return

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    // Set saving status immediately
    onSaveStatusChange("saving")

    // Debounce save by 1 second
    saveTimeoutRef.current = setTimeout(() => {
      handleSave()
    }, 1000) as unknown as number

    // Cleanup timeout on unmount
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [
    microphone,
    hotkey,
    overlayPosition,
    maxDuration,
    minRecordingMs,
    fuzzyThreshold,
    launchAtLogin,
    debugSaveRecordings,
    audioFeedbackEnabled,
    commandChainingEnabled
  ])

  /* ---------------------------------------------------------------- */
  /*  Actions                                                          */
  /* ---------------------------------------------------------------- */

  const handleDownload = async (modelId: string) => {
    onDownloadStart(modelId)
    // Optimistic UI update
    setModels((prev) =>
      prev.map((m) => (m.id === modelId ? { ...m, status: "downloading" } : m))
    )

    try {
      await invoke("download_model", { modelId })
      // Re-fetch to confirm status
      const availableModels = await invoke<ModelInfo[]>("get_available_models")
      const currentModelId = await invoke<string>("get_current_model")

      setModels(_ => {
        // Update just the status of relevant items based on new info
        // simpler: just re-map everything
        return availableModels.map(m => {
          let status: WhisperModelUI["status"] = "not-downloaded"
          if (m.is_downloading) status = "downloading"
          else if (m.id === currentModelId && m.is_downloaded) status = "active"
          else if (m.is_downloaded) status = "downloaded"

          return {
            ...m,
            status,
            recommended: m.id === "base"
          }
        })
      })

    } catch (err) {
      console.error("Download failed:", err)
      // Revert optimistic update
      setModels((prev) =>
        prev.map((m) => (m.id === modelId ? { ...m, status: "not-downloaded" } : m))
      )
    }
  }

  const handleActivate = async (modelId: string) => {
    try {
      await invoke("set_active_model", { modelId })
      // Update UI local state
      setModels(prev => prev.map(m => {
        if (m.id === modelId) return { ...m, status: "active" }
        // Downgrade previous active one
        if (m.status === "active") return { ...m, status: "downloaded" }
        return m
      }))
    } catch (err) {
      console.error("Failed to activate model:", err)
    }
  }

  const handleDelete = async (modelId: string) => {
    try {
      await invoke("delete_model", { modelId })
      // Re-fetch to confirm status
      const availableModels = await invoke<ModelInfo[]>("get_available_models")
      const currentModelId = await invoke<string>("get_current_model")

      setModels(_ => {
        return availableModels.map(m => {
          let status: WhisperModelUI["status"] = "not-downloaded"
          if (m.is_downloading) status = "downloading"
          else if (m.id === currentModelId && m.is_downloaded) status = "active"
          else if (m.is_downloaded) status = "downloaded"

          return {
            ...m,
            status,
            recommended: m.id === "base"
          }
        })
      })
    } catch (err) {
      console.error("Failed to delete model:", err)
    }
  }

  const handleSave = async () => {
    try {
      const settings: AppSettings = {
        selected_model: models.find(m => m.status === "active")?.id || "",
        selected_language: "en", // TODO: Add language selector
        hotkey: hotkey,
        overlay_position: overlayPosition as "Top" | "Bottom" | "Center" | "Hidden",
        launch_at_login: launchAtLogin,
        selected_microphone: microphone === "default" ? null : microphone,
        max_recording_seconds: parseInt(maxDuration) || 5,
        min_recording_ms: parseInt(minRecordingMs) || 800,
        fuzzy_match_threshold: parseFloat(fuzzyThreshold) || 0.6,
        debug_save_recordings: debugSaveRecordings,
        audio_feedback_enabled: audioFeedbackEnabled,
        command_chaining_enabled: commandChainingEnabled,
      }

      await invoke("update_settings", { settings })

      // Notify UI listeners so components (overlay etc.) can react immediately
      try {
        window.dispatchEvent(new CustomEvent('settings-updated', { detail: settings }))
      } catch (e) {
        /* ignore */
      }

      // Handle Autostart Plugin
      const autostartEnabled = await isEnabled()
      if (launchAtLogin && !autostartEnabled) {
        await enable()
      } else if (!launchAtLogin && autostartEnabled) {
        await disable()
      }

      onSaveStatusChange("saved")
      setTimeout(() => {
        onSaveStatusChange("idle")
      }, 2000)
    } catch (err) {
      console.error("Failed to save settings:", err)
    }
  }

  return (
    <div className="flex flex-col gap-6 pt-6">
      {/* Whisper Models */}
      <section>
        <h2 className="mb-4 text-sm font-medium text-foreground flex items-center gap-2">
          <Brain className="h-4 w-4" />
          Whisper Models
        </h2>

        {loadingModels ? (
          <div className="flex items-center justify-center py-12 border border-border/50/50 rounded-lg bg-card">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="rounded-lg border border-border/50/50 overflow-hidden bg-card">
            {models.map((model, index) => (
              <div
                key={model.id}
                className={`flex items-center justify-between px-4 py-3 transition-colors ${model.status === "active" ? "bg-accent/30" : "hover:bg-accent/20"
                  } ${index < models.length - 1 ? "border-b border-border/50" : ""}`}
              >
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{model.name}</span>
                    {model.recommended && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-success/10 text-success/90 font-medium">
                        Recommended
                      </span>
                    )}
                    {model.status === "active" && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-primary/10 text-primary/90 font-medium">
                        Active
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {model.description} ({model.size_mb} MB)
                  </p>
                </div>
                <div className="shrink-0 ml-4">
                  {model.status === "not-downloaded" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5 text-primary hover:text-primary hover:bg-primary/10"
                      disabled={downloadState.isDownloading}
                      onClick={() => handleDownload(model.id)}
                    >
                      <Download className="h-4 w-4" />
                      Download
                    </Button>
                  )}
                  {model.status === "downloading" && (
                    <div className="flex flex-col items-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled
                        className="gap-1.5 text-muted-foreground"
                      >
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Downloading...
                      </Button>
                      {downloadState.modelId === model.id && (
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-32 rounded-full bg-muted/40 overflow-hidden">
                            <div
                              className="h-full bg-primary transition-[width] duration-200"
                              style={{ width: `${Math.min(downloadState.progress ?? 0, 100)}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-muted-foreground tabular-nums">
                            {Math.round(downloadState.progress ?? 0)}%
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    {model.status === "downloaded" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleActivate(model.id)}
                        className="gap-1.5 text-foreground hover:text-foreground hover:bg-accent"
                      >
                        <Check className="h-4 w-4" />
                        Use
                      </Button>
                    )}

                    {(model.status === "active" || model.status === "downloaded") && (
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(model.id)}
                          className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-4 w-4" />
                          Uninstall
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Sound section */}
      <section>
        <h2 className="mb-4 text-sm font-medium text-foreground flex items-center gap-2">
          <Mic className="h-4 w-4" />
          Sound
        </h2>
        <div className="rounded-lg border border-border/50 overflow-hidden">
          {/* Microphone */}
          <div className="flex items-center justify-between bg-card px-4 py-3.5 border-b border-border">
            <span className="text-sm text-foreground">Microphone</span>
            <div className="flex items-center gap-2">
              <Select value={microphone} onValueChange={setMicrophone}>
                <SelectTrigger className="w-[180px] bg-secondary border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default</SelectItem>
                  {availableMicrophones.map((mic) => (
                    <SelectItem key={mic.name} value={mic.name}>
                      {mic.name}
                      {mic.is_default && " (Default)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <button
                onClick={fetchMicrophones}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors hover:cursor-pointer"
                title="Refresh Microphones"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Global Hotkey */}
          <div className="flex items-center justify-between bg-card px-4 py-3.5">
            <div>
              <span className="text-sm text-foreground">Global Hotkey</span>
              <p className="mt-2 text-xs text-muted-foreground">
                Hold to start listening, release to stop and process. Safety timeout after 5s.
              </p>
            </div>
            <ShortcutInput
              value={hotkey}
              onChange={setHotkey}
              onError={(error) => {
                setHotkeyError(error)
                setTimeout(() => setHotkeyError(null), 5000)
              }}
            />
          </div>

          {hotkeyError && (
            <div className="px-4 py-2 bg-destructive/10 border-t border-border">
              <p className="text-xs text-destructive">{hotkeyError}</p>
            </div>
          )}

          {/* Audio feedback */}
          {/* <div className="flex items-center justify-between bg-card px-4 py-3.5 border-t border-border">
            <div>
              <span className="text-sm text-foreground">Audio feedback</span>
              <p className="text-xs text-muted-foreground mt-1">Play short, non-intrusive sounds when recording starts and when transcription begins. Disabled by default.</p>
            </div>
            <Switch checked={audioFeedbackEnabled} onCheckedChange={setAudioFeedbackEnabled} />
          </div> */}
        </div>
      </section>

      {/* Preferences */}
      <section>
        <h2 className="mb-4 text-sm font-medium text-foreground flex items-center gap-2">
          <Settings2 className="h-4 w-4" />
          Preferences
        </h2>
        <div className="rounded-lg border border-border/50 overflow-hidden">
          {/* Launch at Login */}
          <div className="border-b border-border">
            <SettingItem
              title="Launch at Login"
              description="Enable this to automatically start the app when you log in to your computer."
            >
              <Switch checked={launchAtLogin} onCheckedChange={setLaunchAtLogin} />
            </SettingItem>
          </div>

          {/* Overlay Position */}
          <div className="border-b border-border">
            <SettingItem
              title="Overlay Position"
              description="Choose the position of the overlay on your screen."
            >
              <Select value={overlayPosition} onValueChange={setOverlayPosition}>
                <SelectTrigger className="w-[120px] bg-secondary border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Top">Top</SelectItem>
                  <SelectItem value="Bottom">Bottom</SelectItem>
                  <SelectItem value="Center">Center</SelectItem>
                  <SelectItem value="Hidden">Hidden</SelectItem>
                </SelectContent>
              </Select>
            </SettingItem>
          </div>

          {/* Max Recording Duration */}
          <div className="border-b border-border">
            <SettingItem
              title="Max Recording Duration (seconds)"
              description="Set the maximum duration for a recording session. The app will automatically stop recording after this time. Default is 5 seconds."
            >
              <Input
                type="number"
                value={maxDuration}
                onChange={(e) => setMaxDuration(e.target.value)}
                className="w-[80px] bg-secondary border-border text-center font-mono text-sm focus-visible:ring-primary"
              />
            </SettingItem>
          </div>

          {/* Min Recording Duration */}
          {/* Leave this for now, as it is a debugging setting, it might be useful for later */}
          {/* <div className="border-b border-border">
            <SettingItem title="Min Recording Duration (ms)">
              <Input
                type="number"
                value={minRecordingMs}
                onChange={(e) => setMinRecordingMs(e.target.value)}
                className="w-[80px] bg-secondary border-border text-center font-mono text-sm focus-visible:ring-primary"
              />
            </SettingItem>
          </div> */}

          {/* Fuzzy Match Threshold */}
          <div className="border-b border-border">
            <SettingItem
              title="Fuzzy Match Threshold"
              description="Value between 0 and 1 that determines how closely the transcribed text must match the trigger phrase to activate the command. Higher values require a closer match. Default is 0.6."
            >
              <Input
                type="number"
                step="0.1"
                min="0"
                max="1"
                value={fuzzyThreshold}
                onChange={(e) => setFuzzyThreshold(e.target.value)}
                className="w-[80px] bg-secondary border-border text-center font-mono text-sm focus-visible:ring-primary"
              />
            </SettingItem>
          </div>

          {/* Command Chaining */}
          <div className="border-b border-border">
            <SettingItem
              title="Command Chaining"
              description='Trigger multiple commands in a single breath by saying conjunctions like "and" or "then" between commands (e.g. "new file and save it").'
            >
              <Switch checked={commandChainingEnabled} onCheckedChange={setCommandChainingEnabled} />
            </SettingItem>
          </div>

          {/* Debug: Save Recordings */}
          <SettingItem
            title="Debug: Save Recordings"
            description="Enable this to save raw audio recordings to disk for debugging purposes. Recordings are saved in the app's data directory."
          >
            <Switch
              checked={debugSaveRecordings}
              onCheckedChange={setDebugSaveRecordings}
            />
          </SettingItem>
        </div>
      </section>
    </div>
  )
}
