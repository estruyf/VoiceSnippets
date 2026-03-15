"use client"

import { useState, useEffect } from "react"
import { invoke } from "@tauri-apps/api/core"
import { Mic, Lock, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { checkAccessibilityPermission, requestAccessibilityPermission } from "tauri-plugin-macos-permissions-api";

interface PermissionsScreenProps {
  onComplete: () => void
}

export interface PermissionsStatus {
  permissions_requested: boolean
  microphone_status: string // "granted", "denied", "undetermined"
  is_macos: boolean
}

export function PermissionsScreen({ onComplete }: PermissionsScreenProps) {
  const [status, setStatus] = useState<PermissionsStatus | null>(null)
  const [requestingMicrophone, setRequestingMicrophone] = useState(false)
  const [requestingAccessibility, setRequestingAccessibility] = useState(false)
  const [accessibilityPermission, setAccessibilityPermission] = useState(false);
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const checkPermissions = async () => {
      try {
        const permStatus = await invoke<PermissionsStatus>("get_permissions_status")
        const authorized = await checkAccessibilityPermission();
        setAccessibilityPermission(authorized);
        setStatus(permStatus)
      } catch (e) {
        console.error("Failed to get permissions status", e)
      } finally {
        setIsLoading(false)
      }
    }

    checkPermissions()
  }, [])

  const handleRequestMicrophone = async () => {
    setRequestingMicrophone(true)
    try {
      await invoke("request_microphone_permission")
      // Wait a bit for the system dialog to complete, then check status again
      await new Promise(resolve => setTimeout(resolve, 2000))
      const updated = await invoke<PermissionsStatus>("get_permissions_status")
      setStatus(updated)
    } catch (e) {
      console.error("Failed to request microphone permission", e)
    } finally {
      setRequestingMicrophone(false)
    }
  }

  const handleRequestAccessibility = async () => {
    setRequestingAccessibility(true)
    try {
      await requestAccessibilityPermission();
      // After opening System Preferences, mark as requested
      const check = async () => {
        const authorized = await checkAccessibilityPermission();
        setRequestingAccessibility(false)
        setAccessibilityPermission(authorized);

        if (authorized) return;

        setTimeout(check, 1000);
      };

      check();
    } catch (e) {
      console.error("Failed to request accessibility permission", e)
      setRequestingAccessibility(false)
    }
  }

  const handleComplete = async () => {
    // Mark permissions as requested
    try {
      await invoke("mark_permissions_requested")
    } catch (e) {
      console.error("Failed to mark permissions as requested", e)
    }
    onComplete()
  }

  if (isLoading || !status) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px] px-8 pt-6">
        <p className="text-muted-foreground">Loading permissions...</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[500px] px-8 pt-6">
      <div className="flex flex-col items-center text-center max-w-md gap-6">
        {/* Heading */}
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Permissions Required
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            VoiceSnippets needs a couple of permissions to work properly. Let's get those set up!
          </p>
        </div>

        {/* Permissions List */}
        <div className="w-full rounded-lg border border-border/50 bg-card overflow-hidden">
          {/* Microphone Permission */}
          <div className="flex items-start gap-3 px-4 py-4 border-b border-border">
            <div className="flex-shrink-0 mt-1">
              {status.microphone_status === "granted" ? (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              ) : (
                <Mic className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm text-foreground font-medium">Microphone Access</p>
              <p className="text-xs text-muted-foreground mt-1">
                {status.microphone_status === "granted"
                  ? "✓ Permission granted"
                  : "VoiceSnippets needs access to your microphone to record voice commands."}
              </p>
              {status.microphone_status !== "granted" && (
                <Button
                  onClick={handleRequestMicrophone}
                  disabled={requestingMicrophone}
                  className="mt-3 h-8 text-xs"
                  size="sm"
                >
                  {requestingMicrophone ? "Loading..." : "Allow Access"}
                </Button>
              )}
            </div>
          </div>

          {/* Accessibility Permission (macOS only) */}
          {status.is_macos && (
            <div className="flex items-start gap-3 px-4 py-4">
              <div className="flex-shrink-0 mt-1">
                {accessibilityPermission ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                ) : (
                  <Lock className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm text-foreground font-medium">Accessibility</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {accessibilityPermission
                    ? "✓ Permission granted"
                    : "VoiceSnippets uses accessibility features to enable keyboard bindings and global hotkeys. Click the button below to open System Settings and enable it."}
                </p>
                {!accessibilityPermission && (
                  <Button
                    onClick={handleRequestAccessibility}
                    disabled={requestingAccessibility}
                    className="mt-3 h-8 text-xs"
                    size="sm"
                  >
                    {requestingAccessibility
                      ? "Opening Settings..."
                      : "Trust VoiceSnippets"}
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Info section */}
        <div className="text-left w-full bg-blue-50 dark:bg-blue-950/30 rounded-lg p-3 border border-blue-200 dark:border-blue-800">
          <p className="text-xs text-blue-900 dark:text-blue-200">
            <span className="font-semibold">ℹ️ macOS Note:</span> When you click "Allow Access" or "Trust VoiceSnippets", a system dialog will appear asking for permission. Click "OK" or "Allow" in that dialog to grant access.
          </p>
        </div>

        {/* CTA */}
        <Button
          onClick={handleComplete}
          disabled={status.is_macos && status.microphone_status !== "granted"}
          className="w-full"
          size="lg"
        >
          {status.is_macos && status.microphone_status !== "granted"
            ? "Allow Microphone to Continue"
            : "Continue to VoiceSnippets"}
        </Button>

        {/* Skip option - only if not all required permissions are granted */}
        {status.is_macos && status.microphone_status !== "granted" && (
          <Button
            onClick={handleComplete}
            variant="ghost"
            className="w-full text-xs"
          >
            Skip for Now
          </Button>
        )}
      </div>
    </div>
  )
}
