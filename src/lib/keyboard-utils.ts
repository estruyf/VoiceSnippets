/**
 * Maps common key codes to readable names
 */
const KEY_CODE_MAP: Record<string, string> = {
  Space: "Space",
  Enter: "Enter",
  Backspace: "Backspace",
  Tab: "Tab",
  Escape: "Escape",
  Delete: "Delete",
  Insert: "Insert",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  ArrowUp: "Up",
  ArrowDown: "Down",
};

/**
 * Returns a normalized key name from a keyboard event based on the OS
 */
export function getKeyName(e: KeyboardEvent, osType: string): string {
  // Handle modifiers
  if (e.key === "Control") return "Ctrl";
  if (e.key === "Meta" && osType === "Darwin") return "Cmd";
  if (e.key === "Meta") return "Super";
  if (e.key === "Alt" && osType === "Darwin") return "Option";
  if (e.key === "Alt") return "Alt";
  if (e.key === "Shift") return "Shift";

  // Use the code for letter keys to get physical key position
  if (e.code.startsWith("Key")) {
    return e.code.slice(3); // 'KeyA' -> 'A'
  }

  // Use the code for digit keys
  if (e.code.startsWith("Digit")) {
    return e.code.slice(5); // 'Digit1' -> '1'
  }

  // Function keys
  if (e.code.startsWith("F") && e.code.length <= 4) {
    return e.code;
  }

  // Special keys from the map
  if (KEY_CODE_MAP[e.code]) {
    return KEY_CODE_MAP[e.code];
  }

  // Fallback to the key value
  return e.key;
}

/**
 * Normalizes a key string to match Tauri's format
 */
export function normalizeKey(key: string): string {
  const normalized = key.trim();

  // Normalize modifiers to Tauri format
  if (normalized.toLowerCase() === "control") return "Ctrl";
  if (normalized.toLowerCase() === "command") return "Cmd";
  if (normalized.toLowerCase() === "meta") return "Cmd";
  if (normalized.toLowerCase() === "option") return "Alt";

  return normalized;
}

/**
 * Formats a key combination string for display based on OS
 * Example: "Ctrl+Shift+A" becomes "⌃⇧A" on macOS
 */
export function formatKeyCombination(combo: string, osType: string): string {
  if (!combo) return "";

  const parts = combo.split("+").map((k) => k.trim());

  if (osType === "Darwin") {
    // macOS symbols
    return parts
      .map((part) => {
        const lower = part.toLowerCase();
        if (lower === "ctrl" || lower === "control") return "⌃";
        if (lower === "cmd" || lower === "command" || lower === "meta")
          return "⌘";
        if (lower === "alt" || lower === "option") return "⌥";
        if (lower === "shift") return "⇧";
        return part;
      })
      .join(" + ");
  }
  // Windows/Linux: keep the same format
  return parts.join(" + ");
}

/**
 * Validates a shortcut string
 */
export function validateShortcut(shortcut: string): {
  valid: boolean;
  error?: string;
} {
  if (!shortcut || shortcut.trim() === "") {
    return { valid: false, error: "Shortcut cannot be empty" };
  }

  const parts = shortcut.split("+").map((p) => p.trim().toLowerCase());
  const modifiers = [
    "ctrl",
    "control",
    "shift",
    "alt",
    "option",
    "meta",
    "command",
    "cmd",
    "super",
    "win",
    "windows",
  ];

  // Check for at least one non-modifier key
  const hasNonModifier = parts.some((part) => !modifiers.includes(part));

  if (!hasNonModifier) {
    return {
      valid: false,
      error:
        "Shortcut must include a main key (letter, number, F-key, etc.) in addition to modifiers",
    };
  }

  return { valid: true };
}
