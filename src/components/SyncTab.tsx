"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Github, Loader2, LogOut, Cloud, ExternalLink, CloudUpload, CloudDownload, Copy, Check } from "lucide-react"
import { invoke } from "@tauri-apps/api/core"
import { openUrl } from "@tauri-apps/plugin-opener"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { SettingItem } from "./SettingItem"
import { writeText } from '@tauri-apps/plugin-clipboard-manager';


interface AuthStatus {
  authenticated: boolean
  username: string | null
  gist_id: string | null
  last_sync_at: string | null
  auto_sync_enabled: boolean
  sync_interval_minutes: number
}

interface DeviceFlowInfo {
  device_code: string
  user_code: string
  verification_uri: string
  expires_in: number
  interval: number
}

interface PollResult {
  status: "success" | "pending" | "error"
  message: string | null
}

export function SyncTab() {
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [deviceFlow, setDeviceFlow] = useState<DeviceFlowInfo | null>(null)
  const [isPolling, setIsPolling] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [codeCopied, setCodeCopied] = useState(false)
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await writeText(text);
      setCodeCopied(true)
      setTimeout(() => setCodeCopied(false), 2000)
      return true
    } catch {
      return false
    }
  }, [])

  const fetchAuthStatus = useCallback(async () => {
    try {
      const status = await invoke<AuthStatus>("github_get_auth_status")
      setAuthStatus(status)
    } catch (e) {
      console.error("Failed to get auth status", e)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAuthStatus()
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current)
    }
  }, [fetchAuthStatus])

  const startLogin = async () => {
    setError(null)
    try {
      const flow = await invoke<DeviceFlowInfo>("github_start_device_flow")
      setDeviceFlow(flow)
      setIsPolling(true)

      // Copy code to clipboard via Tauri plugin
      await copyToClipboard(flow.user_code)

      // Open GitHub device page
      await openUrl(flow.verification_uri)

      // Poll with recursive setTimeout to handle slow_down properly
      let currentInterval = Math.max(flow.interval, 5) * 1000
      let expired = false

      const poll = async () => {
        if (expired) return
        try {
          const result = await invoke<PollResult>("github_poll_auth", {
            deviceCode: flow.device_code,
          })

          if (result.status === "success") {
            pollRef.current = null
            setIsPolling(false)
            setDeviceFlow(null)
            await fetchAuthStatus()
            return
          } else if (result.status === "error") {
            pollRef.current = null
            setIsPolling(false)
            setDeviceFlow(null)
            setError(result.message || "Authentication failed")
            return
          }

          // "pending" — schedule next poll
          // If message indicates slow_down, add 5 seconds per GitHub docs
          if (result.message?.includes("slow")) {
            currentInterval += 5000
          }
          pollRef.current = setTimeout(poll, currentInterval)
        } catch (e) {
          console.error("Poll error", e)
          // Retry on network errors
          pollRef.current = setTimeout(poll, currentInterval)
        }
      }

      // Start first poll after interval
      pollRef.current = setTimeout(poll, currentInterval)

      // Auto-expire
      setTimeout(() => {
        expired = true
        if (pollRef.current) {
          clearTimeout(pollRef.current as ReturnType<typeof setTimeout>)
          pollRef.current = null
          setIsPolling(false)
          setDeviceFlow(null)
          setError("Device code expired. Please try again.")
        }
      }, flow.expires_in * 1000)
    } catch (e) {
      setError(`Failed to start login: ${e}`)
    }
  }

  const handleLogout = async () => {
    try {
      await invoke("github_logout")
      setAuthStatus({
        authenticated: false,
        username: null,
        gist_id: null,
        last_sync_at: null,
        auto_sync_enabled: true,
        sync_interval_minutes: 15,
      })
    } catch (e) {
      setError(`Failed to logout: ${e}`)
    }
  }

  const handlePush = async () => {
    setIsSyncing(true)
    setSyncMessage(null)
    setError(null)
    try {
      await invoke("sync_push")
      await fetchAuthStatus()
      setSyncMessage("Commands pushed to GitHub successfully!")
    } catch (e) {
      setError(`Push failed: ${e}`)
    } finally {
      setIsSyncing(false)
    }
  }

  const handlePull = async () => {
    setIsSyncing(true)
    setSyncMessage(null)
    setError(null)
    try {
      const count = await invoke<number>("sync_pull")
      await fetchAuthStatus()
      setSyncMessage(`Pulled ${count} commands from GitHub.`)
    } catch (e) {
      setError(`Pull failed: ${e}`)
    } finally {
      setIsSyncing(false)
    }
  }

  const handleAutoSyncToggle = async (enabled: boolean) => {
    try {
      await invoke("set_auto_sync", { enabled })
      setAuthStatus((prev) =>
        prev ? { ...prev, auto_sync_enabled: enabled } : prev
      )
    } catch (e) {
      setError(`Failed to update auto-sync: ${e}`)
    }
  }

  const handleSyncIntervalChange = async (value: string) => {
    const minutes = parseInt(value, 10)
    try {
      await invoke("set_sync_interval", { minutes })
      setAuthStatus((prev) =>
        prev ? { ...prev, sync_interval_minutes: minutes } : prev
      )
    } catch (e) {
      setError(`Failed to update sync interval: ${e}`)
    }
  }

  const formatLastSync = (isoDate: string | null) => {
    if (!isoDate) return "Never"
    try {
      const date = new Date(isoDate)
      return date.toLocaleString()
    } catch {
      return isoDate
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6 pt-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">GitHub Sync</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Sync your voice commands across devices using a GitHub Gist.
        </p>
      </div>

      {/* GitHub Account */}
      <section>
        <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
          <Github className="h-4 w-4" />
          GitHub Account
        </h3>
        <div className="rounded-xl border border-border overflow-hidden">
          {authStatus?.authenticated ? (
            <div className="bg-card px-4 py-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <Github className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <span className="text-sm font-medium text-foreground">
                      {authStatus.username}
                    </span>
                    <p className="text-xs text-muted-foreground">Connected</p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleLogout}
                  className="text-destructive hover:text-destructive"
                >
                  <LogOut className="h-4 w-4 mr-1" />
                  Disconnect
                </Button>
              </div>
            </div>
          ) : (
            <div className="bg-card px-4 py-4">
              {deviceFlow && isPolling ? (
                <div className="space-y-3">
                  <p className="text-sm text-foreground">
                    Enter this code on GitHub:
                  </p>
                  <div className="flex items-center justify-center">
                    <button
                      onClick={() => copyToClipboard(deviceFlow.user_code)}
                      className="relative text-2xl font-mono font-bold tracking-widest bg-muted px-6 py-3 rounded-lg hover:bg-muted/80 transition-colors cursor-pointer group"
                      title="Click to copy"
                    >
                      {deviceFlow.user_code}
                      <span className="absolute -right-2 -top-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        {codeCopied ? (
                          <Check className="h-4 w-4 text-success" />
                        ) : (
                          <Copy className="h-4 w-4 text-muted-foreground" />
                        )}
                      </span>
                    </button>
                  </div>
                  <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>
                      {codeCopied
                        ? "Code copied to clipboard. Waiting for authorization..."
                        : "Waiting for authorization..."}
                    </span>
                  </div>
                  <div className="flex justify-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openUrl(deviceFlow.verification_uri)}
                    >
                      <ExternalLink className="h-3 w-3 mr-1" />
                      Open GitHub
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm text-foreground">
                      Not connected
                    </span>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Sign in with GitHub to sync your commands.
                    </p>
                  </div>
                  <Button size="sm" onClick={startLogin}>
                    <Github className="h-4 w-4 mr-1" />
                    Sign in
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Sync Settings — only show when authenticated */}
      {authStatus?.authenticated && (
        <>
          {/* Sync Status */}
          <section>
            <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
              <Cloud className="h-4 w-4" />
              Sync
            </h3>
            <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
              <SettingItem
                title="Auto-sync"
                description="Automatically sync commands when they change and pull on app start."
              >
                <Switch
                  checked={authStatus.auto_sync_enabled}
                  onCheckedChange={handleAutoSyncToggle}
                />
              </SettingItem>

              <SettingItem
                title="Sync interval"
                description="How often to pull commands from GitHub."
              >
                <Select
                  value={String(authStatus.sync_interval_minutes)}
                  onValueChange={handleSyncIntervalChange}
                  disabled={!authStatus.auto_sync_enabled}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Off</SelectItem>
                    <SelectItem value="15">15 min</SelectItem>
                    <SelectItem value="30">30 min</SelectItem>
                    <SelectItem value="60">1 hour</SelectItem>
                  </SelectContent>
                </Select>
              </SettingItem>

              <SettingItem
                title="Last synced"
                description={
                  authStatus.gist_id
                    ? `Gist ID: ${authStatus.gist_id}`
                    : "No gist created yet"
                }
              >
                <span className="text-xs text-muted-foreground">
                  {formatLastSync(authStatus.last_sync_at)}
                </span>
              </SettingItem>

              <div className="bg-card px-4 py-3.5">
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handlePush}
                    disabled={isSyncing}
                  >
                    {isSyncing ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <CloudUpload className="h-4 w-4 mr-1" />
                    )}
                    Push to GitHub
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handlePull}
                    disabled={isSyncing}
                  >
                    {isSyncing ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <CloudDownload className="h-4 w-4 mr-1" />
                    )}
                    Pull from GitHub
                  </Button>
                </div>
              </div>
            </div>
          </section>
        </>
      )}

      {/* Messages */}
      {syncMessage && (
        <div className="rounded-lg bg-success/10 border border-success/20 px-4 py-3">
          <p className="text-sm text-success">{syncMessage}</p>
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}
    </div>
  )
}
