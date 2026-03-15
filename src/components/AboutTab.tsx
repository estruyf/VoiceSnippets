"use client"

import { useState, useEffect } from "react"
import { ExternalLink, Info, Cpu, RefreshCw, Loader2, FolderOpen } from "lucide-react"
import { useAppVersion } from "@/hooks/useAppVersion"
import { Button } from "@/components/ui/button"
import { checkForUpdates } from "@/lib/update-checker"
import { invoke } from "@tauri-apps/api/core"

export function AboutTab() {
  const appVersion = useAppVersion()
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [logDir, setLogDir] = useState<string>("")
  const [loadingLogDir, setLoadingLogDir] = useState(true)
  const [appDir, setAppDir] = useState<string>("")
  const [loadingAppDir, setLoadingAppDir] = useState(true)

  useEffect(() => {
    const loadLogDirectory = async () => {
      try {
        const result = await invoke<string>("get_log_dir_path")
        setLogDir(result)
      } catch (err) {
        console.error("Failed to load log directory:", err)
      } finally {
        setLoadingLogDir(false)
      }
    }

    const loadAppDirectory = async () => {
      try {
        const result = await invoke<string>("get_app_dir_path")
        setAppDir(result)
      } catch (err) {
        console.error("Failed to load app data directory:", err)
      } finally {
        setLoadingAppDir(false)
      }
    }

    loadLogDirectory()
    loadAppDirectory()
  }, [])

  const handleCheckForUpdates = async () => {
    if (checkingUpdate) return
    setCheckingUpdate(true)

    try {
      await checkForUpdates()
    } finally {
      setCheckingUpdate(false)
    }
  }

  const handleOpenLogDir = async () => {
    try {
      await invoke("open_log_dir")
    } catch (err) {
      console.error("Failed to open log directory:", err)
    }
  }

  const handleOpenAppDir = async () => {
    try {
      await invoke("open_app_data_dir")
    } catch (err) {
      console.error("Failed to open app data directory:", err)
    }
  }

  return (
    <div className="flex flex-col gap-6 pt-6">
      {/* About section */}
      <section>
        <h2 className="mb-4 text-sm font-medium text-foreground flex items-center gap-2">
          <Info className="h-4 w-4" />
          About
        </h2>
        <div className="rounded-lg border border-border/50 overflow-hidden">
          {/* App Name */}
          <div className="flex items-center justify-between bg-card px-4 py-3.5 border-b border-border">
            <span className="text-sm text-foreground">Application</span>
            <span className="text-sm font-semibold text-foreground">VoiceSnippets</span>
          </div>

          {/* Description */}
          <div className="bg-card px-4 py-3.5 border-b border-border">
            <span className="text-sm text-foreground block mb-1">Description</span>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Voice-triggered text expansion, keybinding, and workflow automation for macOS. Speak a trigger word and have it instantly
              expand into commands, snippets, or any text you configure.
            </p>
          </div>

          {/* Version */}
          <div className="flex items-center justify-between bg-card px-4 py-3.5 border-b border-border">
            <span className="text-sm text-foreground">Version</span>
            <span className="text-sm font-mono text-muted-foreground">{appVersion}</span>
          </div>

          {/* Log Directory */}
          <div className="bg-card px-4 py-3.5 border-b border-border">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-foreground">Log Directory</span>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleOpenLogDir}
                disabled={loadingLogDir || !logDir}
              >
                <FolderOpen className="h-4 w-4" />
                Open
              </Button>
            </div>
            {loadingLogDir ? (
              <div className="animate-pulse">
                <div className="h-6 bg-muted rounded" />
              </div>
            ) : (
              <div className="rounded-md bg-muted px-3 py-2 break-all">
                <span className="text-xs font-mono text-muted-foreground">
                  {logDir}
                </span>
              </div>
            )}
          </div>

          {/* App Data Directory */}
          <div className="bg-card px-4 py-3.5 border-b border-border">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-foreground">Application Directory</span>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleOpenAppDir}
                disabled={loadingAppDir || !appDir}
              >
                <FolderOpen className="h-4 w-4" />
                Open
              </Button>
            </div>
            {loadingAppDir ? (
              <div className="animate-pulse">
                <div className="h-6 bg-muted rounded" />
              </div>
            ) : (
              <div className="rounded-md bg-muted px-3 py-2 break-all">
                <span className="text-xs font-mono text-muted-foreground">
                  {appDir}
                </span>
              </div>
            )}
          </div>

          {/* Updates */}
          <div className="flex items-center justify-between bg-card px-4 py-3.5 border-b border-border">
            <span className="text-sm text-foreground">Updates</span>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleCheckForUpdates}
              disabled={checkingUpdate}
            >
              {checkingUpdate ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Checking...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" />
                  Check for Updates
                </>
              )}
            </Button>
          </div>

          {/* Support */}
          <div className="flex items-center justify-between bg-card px-4 py-3.5 border-b border-border">
            <span className="text-sm text-foreground">Support</span>
            <a
              href="https://github.com/estruyf/VoiceSnippets"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-md border border-border/50 bg-secondary px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Get Help on GitHub
            </a>
          </div>

          {/* Author */}
          <div className="flex items-center justify-between bg-card px-4 py-3.5">
            <span className="text-sm text-foreground">Made by</span>
            <a
              href="https://eliostruyf.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline"
            >
              Elio Struyf
            </a>
          </div>
        </div>
      </section>

      {/* Acknowledgments */}
      <section>
        <h2 className="mb-4 text-sm font-medium text-foreground flex items-center gap-2">
          <Cpu className="h-4 w-4" />
          Acknowledgments
        </h2>
        <div className="rounded-lg border border-border/50 overflow-hidden">
          {[
            {
              name: "Handy",
              description:
                "Special thanks to CJ Pais for creating Handy, which inspired to create VoiceSnippets to create a seamless voice command experience.",
              url: "https://handy.computer/",
            },
            {
              name: "Whisper.cpp",
              description:
                "VoiceSnippets uses Whisper.cpp for fast, local speech-to-text processing. Thanks to the amazing work by Georgi Gerganov and contributors.",
              url: "https://github.com/ggerganov/whisper.cpp",
            },
          ].map((item) => (
            <div key={item.name} className="bg-card px-4 py-3.5">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium text-foreground">{item.name}</span>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-primary transition-colors"
                >
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
