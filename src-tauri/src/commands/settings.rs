use crate::settings::{self, AppSettings, OverlayPosition};
use log::{info, warn};
use tauri::AppHandle;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

#[tauri::command]
pub fn get_settings(app: AppHandle) -> Result<AppSettings, String> {
    Ok(settings::get_settings(&app))
}

#[tauri::command]
pub fn update_settings(app: AppHandle, settings: AppSettings) -> Result<(), String> {
    let current_settings = settings::get_settings(&app);
    let mut merged_settings = settings;
    merged_settings.permissions_requested = current_settings.permissions_requested;
    merged_settings.notifications_enabled = current_settings.notifications_enabled;
    settings::write_settings(&app, merged_settings);
    Ok(())
}

#[tauri::command]
pub fn get_hotkey(app: AppHandle) -> Result<String, String> {
    let s = settings::get_settings(&app);
    Ok(s.hotkey)
}

#[tauri::command]
pub fn set_hotkey(app: AppHandle, hotkey: String) -> Result<(), String> {
    let mut s = settings::get_settings(&app);
    s.hotkey = hotkey;
    settings::write_settings(&app, s);
    Ok(())
}

/// Validate and update the global hotkey, re-registering it
#[tauri::command]
pub fn update_hotkey(app: AppHandle, hotkey: String) -> Result<(), String> {
    if hotkey.trim().is_empty() {
        return Err("Hotkey cannot be empty".to_string());
    }

    // Validate the shortcut can be parsed
    let new_shortcut = hotkey
        .parse::<Shortcut>()
        .map_err(|e| format!("Invalid shortcut format: {}", e))?;

    // Validate that it has at least one non-modifier key
    let parts: Vec<String> = hotkey.split('+').map(|p| p.trim().to_lowercase()).collect();
    let modifiers = [
        "ctrl", "control", "shift", "alt", "option", "meta", "command", "cmd", "super", "win",
        "windows",
    ];
    let has_non_modifier = parts.iter().any(|part| !modifiers.contains(&part.as_str()));

    if !has_non_modifier {
        return Err(
            "Shortcut must include a main key (letter, number, F-key, etc.) in addition to modifiers"
                .to_string(),
        );
    }

    // Get the current hotkey to unregister it
    let current_settings = settings::get_settings(&app);
    let old_hotkey = current_settings.hotkey.clone();

    // Unregister the old shortcut if it exists
    if let Ok(old_shortcut) = old_hotkey.parse::<Shortcut>() {
        let gs = app.global_shortcut();
        if gs.is_registered(old_shortcut) {
            if let Err(e) = gs.unregister(old_shortcut) {
                warn!("Failed to unregister old hotkey '{}': {}", old_hotkey, e);
            } else {
                info!("Unregistered old hotkey: {}", old_hotkey);
            }
        }
    }

    // Register the new shortcut
    let gs = app.global_shortcut();
    if gs.is_registered(new_shortcut) {
        return Err(format!("Shortcut '{}' is already in use", hotkey));
    }

    gs.register(new_shortcut)
        .map_err(|e| format!("Failed to register shortcut '{}': {}", hotkey, e))?;

    info!("Registered new global hotkey: {}", hotkey);

    // Update settings
    let mut s = settings::get_settings(&app);
    s.hotkey = hotkey;
    settings::write_settings(&app, s);

    Ok(())
}

/// Temporarily unregister the hotkey (used when recording a new shortcut)
#[tauri::command]
pub fn suspend_hotkey(app: AppHandle) -> Result<(), String> {
    let settings = settings::get_settings(&app);
    if let Ok(shortcut) = settings.hotkey.parse::<Shortcut>() {
        let gs = app.global_shortcut();
        if gs.is_registered(shortcut) {
            gs.unregister(shortcut)
                .map_err(|e| format!("Failed to suspend hotkey: {}", e))?;
            info!("Suspended hotkey: {}", settings.hotkey);
        }
    }
    Ok(())
}

/// Re-register the hotkey after recording is cancelled
#[tauri::command]
pub fn resume_hotkey(app: AppHandle) -> Result<(), String> {
    let settings = settings::get_settings(&app);
    if let Ok(shortcut) = settings.hotkey.parse::<Shortcut>() {
        let gs = app.global_shortcut();
        if !gs.is_registered(shortcut) {
            gs.register(shortcut)
                .map_err(|e| format!("Failed to resume hotkey: {}", e))?;
            info!("Resumed hotkey: {}", settings.hotkey);
        }
    }
    Ok(())
}

#[tauri::command]
pub fn get_overlay_position(app: AppHandle) -> Result<OverlayPosition, String> {
    let s = settings::get_settings(&app);
    Ok(s.overlay_position)
}

#[tauri::command]
pub fn set_overlay_position(app: AppHandle, position: OverlayPosition) -> Result<(), String> {
    let mut s = settings::get_settings(&app);
    s.overlay_position = position;
    settings::write_settings(&app, s);
    Ok(())
}
