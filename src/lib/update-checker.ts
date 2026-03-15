import { invoke } from "@tauri-apps/api/core";
import { confirm, message } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";

const RELEASE_API_URL =
  "https://api.github.com/repos/estruyf/VoiceSnippets/releases/latest";

let isCheckingForUpdates = false;
let lastUpdateCheckTime = 0;
const UPDATE_CHECK_INTERVAL = 30 * 60 * 1000; // 30 minutes in milliseconds

export interface UpdateStatus {
  isAvailable: boolean;
  latestVersion?: string;
  localVersion?: string;
  htmlUrl?: string;
}

const isVersionNewer = (remote: string, local: string) => {
  const r = remote
    .split(".")
    .map((part) => parseInt(part, 10))
    .filter((n) => !Number.isNaN(n));
  const l = local
    .split(".")
    .map((part) => parseInt(part, 10))
    .filter((n) => !Number.isNaN(n));
  const count = Math.max(r.length, l.length);
  for (let i = 0; i < count; i += 1) {
    const rv = i < r.length ? r[i] : 0;
    const lv = i < l.length ? l[i] : 0;
    if (rv > lv) return true;
    if (rv < lv) return false;
  }
  return false;
};

export const checkForUpdates = async (
  showDialog = true,
): Promise<UpdateStatus> => {
  // Prevent multiple simultaneous update checks
  if (isCheckingForUpdates) {
    return { isAvailable: false };
  }

  // Rate limit: only check if 30 minutes have passed (unless showDialog is true for manual checks)
  const now = Date.now();
  if (!showDialog && now - lastUpdateCheckTime < UPDATE_CHECK_INTERVAL) {
    return { isAvailable: false };
  }

  isCheckingForUpdates = true;
  lastUpdateCheckTime = now;

  try {
    const localVersion = await invoke<string>("get_app_version");
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(RELEASE_API_URL, {
        headers: {
          Accept: "application/vnd.github+json",
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Request failed (${response.status})`);
      }

      const json = await response.json();
      const tagName = typeof json?.tag_name === "string" ? json.tag_name : "";
      const htmlUrl = typeof json?.html_url === "string" ? json.html_url : "";

      if (!tagName || !htmlUrl) {
        throw new Error("Could not parse the release information.");
      }

      const latestVersion = tagName.startsWith("v")
        ? tagName.slice(1)
        : tagName;

      const isNewer = isVersionNewer(latestVersion, localVersion);

      if (isNewer) {
        // Only show dialog if this is a manual check (showDialog = true)
        if (showDialog) {
          const shouldOpen = await confirm(
            `VoiceSnippets ${latestVersion} is available. You are currently running v${localVersion}.`,
            {
              title: "Update Available",
              kind: "info",
              okLabel: "Download",
              cancelLabel: "Later",
            },
          );

          if (shouldOpen) {
            await openUrl(htmlUrl);
          }
        }

        return {
          isAvailable: true,
          latestVersion,
          localVersion,
          htmlUrl,
        };
      } else {
        // Only show dialog if this is a manual check
        if (showDialog) {
          await message(
            `VoiceSnippets v${localVersion} is the latest version.`,
            {
              title: "You're Up to Date",
              kind: "info",
            },
          );
        }

        return {
          isAvailable: false,
          latestVersion,
          localVersion,
        };
      }
    } catch (error) {
      const messageText =
        error instanceof Error ? error.message : "Unknown error";

      // Only show error dialog if this is a manual check
      if (showDialog) {
        await message(`Could not check for updates.\n${messageText}`, {
          title: "Update Check Failed",
          kind: "warning",
        });
      }

      return { isAvailable: false };
    } finally {
      window.clearTimeout(timeoutId);
    }
  } finally {
    // Always reset the flag when done
    isCheckingForUpdates = false;
  }
};
