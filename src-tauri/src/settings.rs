use log::{debug, info, warn};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum OverlayPosition {
    Top,
    Bottom,
    Center,
    Hidden,
}

impl Default for OverlayPosition {
    fn default() -> Self {
        OverlayPosition::Bottom
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub selected_model: String,
    pub selected_language: String,
    pub hotkey: String,
    pub overlay_position: OverlayPosition,
    pub launch_at_login: bool,
    pub selected_microphone: Option<String>,
    pub max_recording_seconds: u32,
    #[serde(default = "default_min_recording_ms")]
    pub min_recording_ms: u32,
    pub fuzzy_match_threshold: f64,
    #[serde(default)]
    pub debug_save_recordings: bool,
    #[serde(default)]
    pub audio_feedback_enabled: bool,
    #[serde(default)]
    pub permissions_requested: bool,
    #[serde(default)]
    pub notifications_enabled: bool,
    #[serde(default = "default_command_chaining_enabled")]
    pub command_chaining_enabled: bool,
}

fn default_command_chaining_enabled() -> bool {
    true
}

fn default_min_recording_ms() -> u32 {
    800
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            selected_model: String::new(),
            selected_language: "en".to_string(),
            hotkey: "Alt+S".to_string(),
            overlay_position: OverlayPosition::Bottom,
            launch_at_login: false,
            selected_microphone: None,
            max_recording_seconds: 5,
            min_recording_ms: default_min_recording_ms(),
            fuzzy_match_threshold: 0.6,
            debug_save_recordings: false,
            audio_feedback_enabled: false,
            permissions_requested: false,
            notifications_enabled: false,
            command_chaining_enabled: default_command_chaining_enabled(),
        }
    }
}

/// Get the store for settings
fn get_settings_store(
    app: &AppHandle,
) -> Result<std::sync::Arc<tauri_plugin_store::Store<tauri::Wry>>, String> {
    app.store("settings.json")
        .map_err(|e| format!("Failed to initialize store: {}", e))
}

pub fn get_settings(app: &AppHandle) -> AppSettings {
    // Read from store
    if let Ok(store) = get_settings_store(app) {
        // Check if we need to migrate from old flat format to new nested format
        if let Some(stored_value) = store.get("settings") {
            if let Ok(settings) = serde_json::from_value::<AppSettings>(stored_value) {
                debug!("Settings loaded from plugin store");
                return settings;
            }
        } else if store.get("selected_model").is_some()
            || store.get("hotkey").is_some()
            || store.get("launch_at_login").is_some()
        {
            // Detected old flat format - try to migrate
            info!("Detected old settings format, migrating to new format");

            // Construct AppSettings from individual old-format keys
            if let Ok(settings) = try_migrate_old_format(&store) {
                // Write the migrated settings to the new "settings" key
                if let Ok(json_value) = serde_json::to_value(&settings) {
                    store.set("settings", json_value);
                    debug!("Settings migrated and saved to store");

                    // Clean up old flat-format keys
                    remove_old_format_keys(&store);
                }
                return settings;
            }
        }
    }

    // Create and return default settings if store doesn't exist or is empty
    debug!("No existing settings found, using defaults");
    let default_settings = AppSettings::default();

    // Write defaults to store for next time
    if let Ok(store) = get_settings_store(app) {
        if let Ok(json_value) = serde_json::to_value(&default_settings) {
            store.set("settings", json_value);
            debug!("Default settings saved to store");
        }
    }

    default_settings
}

pub fn write_settings(app: &AppHandle, settings: AppSettings) {
    // Write to store
    if let Ok(store) = get_settings_store(app) {
        if let Ok(json_value) = serde_json::to_value(&settings) {
            store.set("settings", json_value);
            debug!("Settings saved to store");
        } else {
            warn!("Failed to serialize settings for store");
        }
    } else {
        warn!("Failed to get settings store");
    }
}

/// Migrate settings from old flat format (keys at root level) to AppSettings.
fn try_migrate_old_format(
    store: &std::sync::Arc<tauri_plugin_store::Store<tauri::Wry>>,
) -> anyhow::Result<AppSettings> {
    let mut settings = AppSettings::default();

    // Try to load each field from the store and update if found
    if let Some(val) = store.get("selected_model") {
        if let Ok(s) = serde_json::from_value::<String>(val) {
            settings.selected_model = s;
        }
    }
    if let Some(val) = store.get("selected_language") {
        if let Ok(s) = serde_json::from_value::<String>(val) {
            settings.selected_language = s;
        }
    }
    if let Some(val) = store.get("hotkey") {
        if let Ok(s) = serde_json::from_value::<String>(val) {
            settings.hotkey = s;
        }
    }
    if let Some(val) = store.get("overlay_position") {
        if let Ok(pos) = serde_json::from_value::<OverlayPosition>(val) {
            settings.overlay_position = pos;
        }
    }
    if let Some(val) = store.get("launch_at_login") {
        if let Ok(b) = serde_json::from_value::<bool>(val) {
            settings.launch_at_login = b;
        }
    }
    if let Some(val) = store.get("selected_microphone") {
        if let Ok(s) = serde_json::from_value::<Option<String>>(val) {
            settings.selected_microphone = s;
        }
    }
    if let Some(val) = store.get("max_recording_seconds") {
        if let Ok(u) = serde_json::from_value::<u32>(val) {
            settings.max_recording_seconds = u;
        }
    }
    if let Some(val) = store.get("min_recording_ms") {
        if let Ok(u) = serde_json::from_value::<u32>(val) {
            settings.min_recording_ms = u;
        }
    }
    if let Some(val) = store.get("fuzzy_match_threshold") {
        if let Ok(f) = serde_json::from_value::<f64>(val) {
            settings.fuzzy_match_threshold = f;
        }
    }
    if let Some(val) = store.get("debug_save_recordings") {
        if let Ok(b) = serde_json::from_value::<bool>(val) {
            settings.debug_save_recordings = b;
        }
    }
    if let Some(val) = store.get("audio_feedback_enabled") {
        if let Ok(b) = serde_json::from_value::<bool>(val) {
            settings.audio_feedback_enabled = b;
        }
    }
    if let Some(val) = store.get("permissions_requested") {
        if let Ok(b) = serde_json::from_value::<bool>(val) {
            settings.permissions_requested = b;
        }
    }
    if let Some(val) = store.get("notifications_enabled") {
        if let Ok(b) = serde_json::from_value::<bool>(val) {
            settings.notifications_enabled = b;
        }
    }
    if let Some(val) = store.get("command_chaining_enabled") {
        if let Ok(b) = serde_json::from_value::<bool>(val) {
            settings.command_chaining_enabled = b;
        }
    }

    Ok(settings)
}

/// Remove old flat-format keys from the store after successful migration.
fn remove_old_format_keys(store: &std::sync::Arc<tauri_plugin_store::Store<tauri::Wry>>) {
    let old_keys = vec![
        "selected_model",
        "selected_language",
        "hotkey",
        "overlay_position",
        "launch_at_login",
        "selected_microphone",
        "max_recording_seconds",
        "min_recording_ms",
        "fuzzy_match_threshold",
        "debug_save_recordings",
        "audio_feedback_enabled",
        "permissions_requested",
        "notifications_enabled",
        "command_chaining_enabled",
    ];

    for key in old_keys {
        store.delete(key);
    }
    debug!("Removed old flat-format keys from store");
}
