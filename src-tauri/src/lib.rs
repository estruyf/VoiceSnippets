mod app_detection;
mod commands;
mod github;
mod managers;
mod matcher;
mod packs;
mod settings;
mod snippets;
mod sync;
mod tray;

use chrono::Local;
use log::{info, warn};
use managers::audio::AudioRecordingManager;
use managers::model::ModelManager;
use managers::transcription::TranscriptionManager;
use std::fs;
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::TrayIconBuilder,
    Emitter, Manager,
};
use tauri_plugin_global_shortcut::GlobalShortcutExt;

/// Epoch millis when recording started; 0 means not recording via hotkey.
static RECORDING_START_MS: AtomicU64 = AtomicU64::new(0);
/// Minimum hold duration in ms before a release is honoured.
const MIN_HOLD_MS: u64 = 400;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // When app is clicked while already running, show settings window
            if let Some(window) = app.get_webview_window("settings") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_macos_permissions::init())
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, _shortcut, event| match event.state {
                    tauri_plugin_global_shortcut::ShortcutState::Pressed => {
                        handle_hotkey_pressed(app);
                    }
                    tauri_plugin_global_shortcut::ShortcutState::Released => {
                        handle_hotkey_released(app);
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            // App commands
            commands::app::get_app_version,
            commands::app::get_log_dir_path,
            commands::app::open_log_dir,
            commands::app::get_app_dir_path,
            commands::app::open_app_data_dir,
            commands::app::get_app_info_from_path,
            // Model commands
            commands::models::get_available_models,
            commands::models::download_model,
            commands::models::delete_model,
            commands::models::set_active_model,
            commands::models::get_current_model,
            commands::models::cancel_download,
            // Audio commands
            commands::audio::get_available_microphones,
            commands::audio::set_selected_microphone,
            commands::audio::get_selected_microphone,
            commands::audio::is_recording,
            commands::audio::record_and_transcribe,
            commands::audio::start_trigger_recording,
            commands::audio::stop_trigger_recording,
            // Snippet commands
            commands::snippets::get_commands,
            commands::snippets::add_command,
            commands::snippets::update_command,
            commands::snippets::delete_command,
            commands::snippets::get_command_packs,
            commands::snippets::install_command_pack,
            commands::snippets::uninstall_command_pack,
            commands::snippets::export_commands,
            commands::snippets::import_commands,
            commands::snippets::get_custom_words,
            commands::snippets::add_custom_word,
            commands::snippets::remove_custom_word,
            // Settings commands
            commands::settings::get_settings,
            commands::settings::update_settings,
            commands::settings::get_hotkey,
            commands::settings::set_hotkey,
            commands::settings::update_hotkey,
            commands::settings::suspend_hotkey,
            commands::settings::resume_hotkey,
            commands::settings::get_overlay_position,
            commands::settings::set_overlay_position,
            // Permissions commands
            commands::permissions::request_microphone_permission,
            commands::permissions::mark_permissions_requested,
            commands::permissions::get_permissions_status,
            commands::permissions::check_microphone_permission,
            // Sync commands
            commands::sync::github_start_device_flow,
            commands::sync::github_poll_auth,
            commands::sync::github_logout,
            commands::sync::github_get_auth_status,
            commands::sync::sync_push,
            commands::sync::sync_pull,
            commands::sync::set_auto_sync,
            commands::sync::set_sync_interval,
        ])
        .setup(|app| {
            // Initialize managers
            let model_manager = Arc::new(
                ModelManager::new(&app.handle()).expect("Failed to initialize model manager"),
            );
            let transcription_manager = Arc::new(
                TranscriptionManager::new(&app.handle(), model_manager.clone())
                    .expect("Failed to initialize transcription manager"),
            );
            let audio_manager = Arc::new(
                AudioRecordingManager::new().expect("Failed to initialize audio recording manager"),
            );

            app.manage(model_manager.clone());
            app.manage(transcription_manager.clone());
            app.manage(audio_manager.clone());

            // Build tray menu
            let settings_item = MenuItemBuilder::with_id("settings", "Settings...").build(app)?;
            let update_item =
                MenuItemBuilder::with_id("check-updates", "Check for Updates...").build(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "Quit").build(app)?;
            let menu = MenuBuilder::new(app)
                .item(&settings_item)
                .item(&update_item)
                .separator()
                .item(&quit_item)
                .build()?;

            // Build tray icon
            let icon_path = app
                .path()
                .resolve("icons/32x32.png", tauri::path::BaseDirectory::Resource)?;
            let icon = tauri::image::Image::from_path(icon_path)?;
            let _tray = TrayIconBuilder::with_id("main")
                .icon(icon)
                .icon_as_template(true)
                .menu(&menu)
                .tooltip("VoiceSnippets")
                .on_menu_event(move |app, event| match event.id().as_ref() {
                    "settings" => {
                        if let Some(window) = app.get_webview_window("settings") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "check-updates" => {
                        if let Some(window) = app.get_webview_window("settings") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                        let _ = app.emit("check-for-updates", ());
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .build(app)?;

            // Show settings window on first launch (when permissions haven't been requested yet)
            let settings_val = crate::settings::get_settings(&app.handle());
            if !settings_val.permissions_requested {
                if let Some(window) = app.get_webview_window("settings") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }

            // Register the hotkey from settings
            if let Ok(shortcut) = settings_val
                .hotkey
                .parse::<tauri_plugin_global_shortcut::Shortcut>()
            {
                let gs = app.global_shortcut();
                if let Err(e) = gs.register(shortcut) {
                    log::warn!("Failed to register hotkey '{}': {}", settings_val.hotkey, e);
                } else {
                    info!("Registered global hotkey: {}", settings_val.hotkey);
                }
            }

            // Hide from dock on macOS (menu bar only app)
            #[cfg(target_os = "macos")]
            {
                app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            }

            info!("VoiceSnippets initialized");

            // Trigger sync pull on startup (non-blocking)
            crate::sync::trigger_startup_pull(&app.handle());

            // Start periodic sync loop
            crate::sync::start_periodic_sync(&app.handle());

            Ok(())
        })
        .on_window_event(|window, event| {
            // Hide settings window instead of closing; let overlay be managed by Rust
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "settings" {
                    let _ = window.hide();
                    api.prevent_close();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn handle_hotkey_pressed(app: &tauri::AppHandle) {
    let am = app.state::<Arc<AudioRecordingManager>>();
    let tm = app.state::<Arc<TranscriptionManager>>();

    if am.is_recording() {
        return; // Already recording, ignore repeated press events
    }

    let settings_val = crate::settings::get_settings(app);
    let mic = settings_val.selected_microphone.clone();
    let min_recording_ms = settings_val.min_recording_ms;

    // Pre-load model in background
    tm.initiate_model_load();

    match am.start_recording(mic) {
        Ok(()) => {
            // Record the start time so we can enforce minimum hold duration
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64;
            RECORDING_START_MS.store(now, Ordering::SeqCst);

            if !am.wait_for_start(600) {
                warn!("Audio stream did not report start within 600ms");
            }

            update_visual_state(app, "listening");

            // Safety: auto-stop after max recording duration.
            // Capture the session start timestamp so the timer only acts
            // on the recording session that spawned it.
            let session_start = now;
            let max_seconds = settings_val.max_recording_seconds;
            let am_clone = am.inner().clone();
            let tm_clone = tm.inner().clone();
            let app_clone = app.clone();

            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_secs(max_seconds as u64));
                // Only auto-stop if the *same* session is still active
                let current_start = RECORDING_START_MS.load(Ordering::SeqCst);
                if am_clone.is_recording() && current_start == session_start {
                    info!("Auto-stopping recording after {}s timeout", max_seconds);
                    RECORDING_START_MS.store(0, Ordering::SeqCst);
                    update_visual_state(&app_clone, "processing");
                    let has_feedback = if let Some(samples) =
                        am_clone.stop_recording_with_min_duration(min_recording_ms as u64)
                    {
                        process_transcription(&app_clone, &tm_clone, samples)
                    } else {
                        false
                    };
                    if has_feedback {
                        // Let the overlay show the result briefly before hiding
                        std::thread::sleep(std::time::Duration::from_millis(2200));
                    }
                    update_visual_state(&app_clone, "idle");
                }
            });
        }
        Err(e) => {
            log::error!("Failed to start recording: {}", e);
            let _ = app.emit("recording-error", e.to_string());
        }
    }
}

fn handle_hotkey_released(app: &tauri::AppHandle) {
    let am = app.state::<Arc<AudioRecordingManager>>();
    let tm = app.state::<Arc<TranscriptionManager>>();
    let settings_val = crate::settings::get_settings(app);
    let min_recording_ms = settings_val.min_recording_ms;

    if !am.is_recording() {
        return;
    }

    // Ignore spurious release events from key repeat
    let start = RECORDING_START_MS.load(Ordering::SeqCst);
    if start == 0 {
        return;
    }
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;
    if now.saturating_sub(start) < MIN_HOLD_MS {
        return; // Too soon — key repeat artifact, keep recording
    }

    RECORDING_START_MS.store(0, Ordering::SeqCst);
    update_visual_state(app, "processing");
    let am = am.inner().clone();
    let tm = tm.inner().clone();
    let app_handle = app.clone();

    std::thread::spawn(move || {
        let has_feedback =
            if let Some(samples) = am.stop_recording_with_min_duration(min_recording_ms as u64) {
                process_transcription(&app_handle, &tm, samples)
            } else {
                false
            };
        if has_feedback {
            std::thread::sleep(std::time::Duration::from_millis(2200));
        }
        // Only emit idle if no new recording session has started
        // (RECORDING_START_MS would be non-zero if a new session began)
        if RECORDING_START_MS.load(Ordering::SeqCst) == 0 {
            update_visual_state(&app_handle, "idle");
        }
    });
}

fn update_visual_state(app: &tauri::AppHandle, state: &str) {
    // Emit state event to all windows
    let _ = app.emit("recording-state", state);

    // Update tray icon based on state
    match state {
        "listening" => {
            tray::change_tray_icon(app, tray::TrayIconState::Recording);
        }
        "processing" => {
            tray::change_tray_icon(app, tray::TrayIconState::Processing);
        }
        "idle" => {
            tray::change_tray_icon(app, tray::TrayIconState::Idle);
        }
        _ => {}
    }

    // Show/hide overlay
    if let Some(overlay) = app.get_webview_window("overlay") {
        let settings = crate::settings::get_settings(app);
        match state {
            "listening" | "processing"
                if settings.overlay_position != crate::settings::OverlayPosition::Hidden =>
            {
                position_overlay(&overlay, &settings.overlay_position);
                let _ = overlay.set_ignore_cursor_events(true);
                let _ = overlay.show();
            }
            _ => {
                let _ = overlay.hide();
            }
        }
    }
}

fn position_overlay(overlay: &tauri::WebviewWindow, position: &crate::settings::OverlayPosition) {
    // Find the monitor containing the mouse cursor (active monitor)
    let monitor = find_active_monitor(overlay).or_else(|| overlay.primary_monitor().ok().flatten());

    if let Some(monitor) = monitor {
        let mon_pos = monitor.position();
        let mon_size = monitor.size();
        let scale = monitor.scale_factor();

        // Monitor origin and size in logical pixels
        let mx = mon_pos.x as f64 / scale;
        let my = mon_pos.y as f64 / scale;
        let sw = mon_size.width as f64 / scale;
        let sh = mon_size.height as f64 / scale;
        let ow = 280.0;
        let oh = 60.0;

        let (x, y) = match position {
            crate::settings::OverlayPosition::Top => (mx + (sw - ow) / 2.0, my + 50.0),
            crate::settings::OverlayPosition::Bottom => (mx + (sw - ow) / 2.0, my + sh - oh - 50.0),
            crate::settings::OverlayPosition::Center => {
                (mx + (sw - ow) / 2.0, my + (sh - oh) / 2.0)
            }
            crate::settings::OverlayPosition::Hidden => return,
        };

        let _ = overlay.set_position(tauri::Position::Logical(tauri::LogicalPosition::new(x, y)));
    }
}

/// Find the monitor that contains the current mouse cursor position.
fn find_active_monitor(window: &tauri::WebviewWindow) -> Option<tauri::Monitor> {
    #[cfg(target_os = "macos")]
    {
        let event_source = core_graphics::event_source::CGEventSource::new(
            core_graphics::event_source::CGEventSourceStateID::CombinedSessionState,
        )
        .ok()?;
        let event = core_graphics::event::CGEvent::new(event_source).ok()?;
        let cursor_pos = event.location();
        let cx = cursor_pos.x;
        let cy = cursor_pos.y;

        if let Ok(monitors) = window.available_monitors() {
            for monitor in monitors {
                let pos = monitor.position();
                let size = monitor.size();
                let scale = monitor.scale_factor();
                let mx = pos.x as f64 / scale;
                let my = pos.y as f64 / scale;
                let mw = size.width as f64 / scale;
                let mh = size.height as f64 / scale;

                if cx >= mx && cx < mx + mw && cy >= my && cy < my + mh {
                    return Some(monitor);
                }
            }
        }
    }

    None
}

fn maybe_save_debug_recording(app: &tauri::AppHandle, samples: &[f32]) {
    if samples.is_empty() {
        return;
    }

    let settings_val = crate::settings::get_settings(app);
    if !settings_val.debug_save_recordings {
        return;
    }

    let app_data_dir = match app.path().app_data_dir() {
        Ok(dir) => dir,
        Err(e) => {
            warn!("Failed to resolve app data dir for debug recordings: {}", e);
            return;
        }
    };

    let recordings_dir = app_data_dir.join("recordings");
    let today = Local::now().format("%Y-%m-%d").to_string();
    let today_dir = recordings_dir.join(&today);

    if let Err(e) = fs::create_dir_all(&today_dir) {
        warn!(
            "Failed to create debug recordings dir {:?}: {}",
            today_dir, e
        );
        return;
    }

    // Remove recordings from previous days
    if let Ok(entries) = fs::read_dir(&recordings_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path == today_dir {
                continue;
            }

            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                if name == today {
                    continue;
                }
            }

            if path.is_dir() {
                if let Err(e) = fs::remove_dir_all(&path) {
                    warn!("Failed to remove old recordings dir {:?}: {}", path, e);
                }
            } else if let Err(e) = fs::remove_file(&path) {
                warn!("Failed to remove old recordings file {:?}: {}", path, e);
            }
        }
    }

    let timestamp_ms = Local::now().timestamp_millis();
    let file_name = format!("recording-{}.wav", timestamp_ms);
    let file_path = today_dir.join(file_name);

    if let Err(e) = write_wav_float32(&file_path, samples) {
        warn!("Failed to write debug recording {:?}: {}", file_path, e);
    }
}

fn write_wav_float32(path: &Path, samples: &[f32]) -> Result<(), hound::Error> {
    let spec = hound::WavSpec {
        channels: 1,
        sample_rate: 16_000,
        bits_per_sample: 32,
        sample_format: hound::SampleFormat::Float,
    };

    let mut writer = hound::WavWriter::create(path, spec)?;
    for sample in samples {
        writer.write_sample(*sample)?;
    }
    writer.finalize()?;

    Ok(())
}

/// Process audio samples: transcribe, match, and paste. Returns true if
/// feedback (match or no-match) was emitted and the overlay should linger.
fn process_transcription(
    app: &tauri::AppHandle,
    tm: &TranscriptionManager,
    samples: Vec<f32>,
) -> bool {
    maybe_save_debug_recording(app, &samples);

    // Build a vocabulary hint from configured trigger words
    let store = crate::snippets::load_commands(app);
    let prompt = if store.commands.is_empty() {
        None
    } else {
        let words: Vec<String> = store
            .commands
            .iter()
            .flat_map(|c| {
                c.all_triggers()
                    .into_iter()
                    .map(|t| {
                        if let Some(idx) = t.find('{') {
                            t[..idx].trim().to_string()
                        } else {
                            t.trim().to_string()
                        }
                    })
                    .collect::<Vec<_>>()
            })
            .collect();
        Some(words.join(", "))
    };

    match tm.transcribe_with_prompt(samples, prompt) {
        Ok(text) => {
            // Clean Whisper artifacts: trim whitespace, remove internal punctuation, and trailing punctuation
            let text = text
                .trim()
                .trim_end_matches(|c: char| {
                    c == '.' || c == ',' || c == '!' || c == '?' || c == ';' || c == ':'
                })
                .trim()
                // Replace internal punctuation (commas, etc.) with spaces to prevent matching issues
                .replace(',', " ")
                .replace(';', " ")
                // Collapse multiple spaces into single space
                .split_whitespace()
                .collect::<Vec<_>>()
                .join(" ")
                .to_string();
            info!("Transcribed: {}", text);
            let settings_val = crate::settings::get_settings(app);

            // Apply custom word remapping using fuzzy matching
            let custom_words = crate::snippets::get_custom_words(app);
            let text = if !custom_words.is_empty() {
                let remapped = crate::matcher::apply_word_remapping(
                    &text,
                    &custom_words,
                    settings_val.fuzzy_match_threshold,
                );
                if remapped != text {
                    info!("After remapping: {}", remapped);
                }
                remapped
            } else {
                text
            };

            // Get the currently active app for context-aware command matching
            let current_app_id = crate::app_detection::get_active_app_id();
            let current_app_name = crate::app_detection::get_active_app_name();
            match (current_app_name.as_deref(), current_app_id.as_deref()) {
                (Some(name), Some(id)) => info!("Active app: {} ({})", name, id),
                (Some(name), None) => info!("Active app: {}", name),
                (None, Some(id)) => info!("Active app: {}", id),
                (None, None) => {}
            }

            let best_match = crate::matcher::find_best_match_with_app(
                &text,
                &store.commands,
                settings_val.fuzzy_match_threshold,
                current_app_id.as_deref(),
                current_app_name.as_deref(),
            );

            let chained = if settings_val.command_chaining_enabled {
                crate::matcher::find_chained_matches_with_app(
                    &text,
                    &store.commands,
                    settings_val.fuzzy_match_threshold,
                    current_app_id.as_deref(),
                    current_app_name.as_deref(),
                )
            } else {
                None
            };

            // Prefer the chained match when its weakest segment still scores
            // higher than the single-command match (avoids a fuzzy partial
            // match swallowing a valid chain like "clear terminal and dev").
            let use_chain = match (&best_match, &chained) {
                (Some(single), Some(chain)) => {
                    let min_chain_score =
                        chain.iter().map(|m| m.score).fold(f64::INFINITY, f64::min);
                    min_chain_score > single.score
                }
                (None, Some(_)) => true,
                _ => false,
            };

            if use_chain {
                let chained = chained.unwrap();
                info!("Chained match: {} commands from '{}'", chained.len(), text);
                for (i, m) in chained.iter().enumerate() {
                    if i > 0 {
                        std::thread::sleep(std::time::Duration::from_millis(200));
                    }
                    execute_matched_command(app, m);
                }
                true
            } else if let Some(m) = best_match {
                execute_matched_command(app, &m);
                true
            } else {
                emit_no_match(app, &text)
            }
        }
        Err(e) => {
            log::error!("Transcription error: {}", e);
            let _ = app.emit("transcription-error", e.to_string());
            false
        }
    }
}

/// Execute a single matched command: log, emit event, record usage, and dispatch.
fn execute_matched_command(app: &tauri::AppHandle, m: &crate::matcher::MatchResult) {
    let expansion = &m.resolved_expansion;
    info!(
        "Match: {} -> {} (score: {:.2})",
        m.command.trigger_word, expansion, m.score
    );
    crate::snippets::record_usage(app, &m.command.id);

    let _ = app.emit(
        "match-found",
        serde_json::json!({
            "trigger": m.command.trigger_word,
            "expansion": expansion,
            "score": m.score,
        }),
    );

    match m.command.command_type {
        crate::snippets::CommandType::KeyboardShortcut => {
            execute_shortcut(expansion);
        }
        crate::snippets::CommandType::TextExpansion => {
            paste_text(expansion);
        }
        crate::snippets::CommandType::Workflow => {
            execute_workflow(&m.command);
        }
        crate::snippets::CommandType::OpenApp => {
            open_application(expansion);
        }
    }
}

/// Emit a no-match event for unrecognised transcriptions.
fn emit_no_match(app: &tauri::AppHandle, text: &str) -> bool {
    info!("No match found for: {}", text);
    if text.is_empty() {
        return false;
    }
    let _ = app.emit("no-match", serde_json::json!({ "text": text }));
    true
}

fn paste_text(_text: &str) {
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        // Copy to clipboard
        let mut child = match Command::new("pbcopy")
            .stdin(std::process::Stdio::piped())
            .spawn()
        {
            Ok(c) => c,
            Err(e) => {
                log::error!("Failed to spawn pbcopy: {}", e);
                return;
            }
        };
        if let Some(ref mut stdin) = child.stdin {
            use std::io::Write;
            let _ = stdin.write_all(_text.as_bytes());
        }
        let _ = child.wait();

        // Small delay before pasting
        std::thread::sleep(std::time::Duration::from_millis(50));

        // Simulate Cmd+V paste
        let _ = Command::new("osascript")
            .args([
                "-e",
                "tell application \"System Events\" to keystroke \"v\" using command down",
            ])
            .output();
    }
}

/// Execute a keyboard shortcut string like "Cmd+Shift+T" or "Cmd+Space" via osascript.
fn execute_shortcut(_shortcut: &str) {
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;

        let parts: Vec<&str> = _shortcut.split('+').map(|s| s.trim()).collect();
        if parts.is_empty() {
            return;
        }

        let mut modifiers: Vec<&str> = Vec::new();
        let mut key_part = "";

        for part in &parts {
            match part.to_lowercase().as_str() {
                "cmd" | "command" | "super" | "⌘" => modifiers.push("command down"),
                "shift" | "⇧" => modifiers.push("shift down"),
                "alt" | "option" | "opt" | "⌥" => modifiers.push("option down"),
                "ctrl" | "control" | "⌃" => modifiers.push("control down"),
                _ => key_part = part,
            }
        }

        let modifier_str = if modifiers.is_empty() {
            String::new()
        } else {
            format!(" using {{{}}}", modifiers.join(", "))
        };

        // Map special key names to key codes
        let script = match key_part.to_lowercase().as_str() {
            "space" => format!(
                "tell application \"System Events\" to key code 49{}",
                modifier_str
            ),
            "tab" => format!(
                "tell application \"System Events\" to key code 48{}",
                modifier_str
            ),
            "return" | "enter" => format!(
                "tell application \"System Events\" to key code 36{}",
                modifier_str
            ),
            "escape" | "esc" => format!(
                "tell application \"System Events\" to key code 53{}",
                modifier_str
            ),
            "delete" | "backspace" => format!(
                "tell application \"System Events\" to key code 51{}",
                modifier_str
            ),
            "up" => format!(
                "tell application \"System Events\" to key code 126{}",
                modifier_str
            ),
            "down" => format!(
                "tell application \"System Events\" to key code 125{}",
                modifier_str
            ),
            "left" => format!(
                "tell application \"System Events\" to key code 123{}",
                modifier_str
            ),
            "right" => format!(
                "tell application \"System Events\" to key code 124{}",
                modifier_str
            ),
            // For single characters, use keystroke
            _ => {
                let ch = key_part.to_lowercase();
                format!(
                    "tell application \"System Events\" to keystroke \"{}\"{}",
                    ch, modifier_str
                )
            }
        };

        info!("Executing shortcut: {} → {}", _shortcut, script);
        let _ = Command::new("osascript").args(["-e", &script]).output();
    }
}

/// Execute a workflow: a sequence of text expansions, key presses, and delays.
fn execute_workflow(command: &crate::snippets::VoiceCommand) {
    let steps = match &command.workflow_steps {
        Some(steps) if !steps.is_empty() => steps.clone(),
        _ => {
            info!("Workflow '{}' has no steps, skipping", command.trigger_word);
            return;
        }
    };

    info!(
        "Executing workflow '{}' with {} steps",
        command.trigger_word,
        steps.len()
    );

    for (i, step) in steps.iter().enumerate() {
        info!(
            "  Step {}/{}: type={}, value={}",
            i + 1,
            steps.len(),
            step.step_type,
            step.value
        );

        match step.step_type.as_str() {
            "text" => {
                paste_text(&step.value);
                // Small delay after pasting to let the OS process it
                std::thread::sleep(std::time::Duration::from_millis(100));
            }
            "key" => {
                execute_key_press(&step.value);
                std::thread::sleep(std::time::Duration::from_millis(100));
            }
            "shortcut" => {
                execute_shortcut(&step.value);
                std::thread::sleep(std::time::Duration::from_millis(100));
            }
            "delay" => {
                if let Ok(ms) = step.value.parse::<u64>() {
                    std::thread::sleep(std::time::Duration::from_millis(ms));
                }
            }
            _ => {
                log::warn!("Unknown workflow step type: {}", step.step_type);
            }
        }
    }

    info!("Workflow '{}' completed", command.trigger_word);
}

/// Execute a single key press (e.g. "enter", "tab", "escape").
fn execute_key_press(key: &str) {
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;

        let script = match key.to_lowercase().as_str() {
            "enter" | "return" => "tell application \"System Events\" to key code 36".to_string(),
            "tab" => "tell application \"System Events\" to key code 48".to_string(),
            "escape" | "esc" => "tell application \"System Events\" to key code 53".to_string(),
            "space" => "tell application \"System Events\" to key code 49".to_string(),
            "delete" | "backspace" => {
                "tell application \"System Events\" to key code 51".to_string()
            }
            "up" => "tell application \"System Events\" to key code 126".to_string(),
            "down" => "tell application \"System Events\" to key code 125".to_string(),
            "left" => "tell application \"System Events\" to key code 123".to_string(),
            "right" => "tell application \"System Events\" to key code 124".to_string(),
            _ => {
                // Treat as a shortcut string (e.g. "Cmd+S")
                execute_shortcut(key);
                return;
            }
        };

        info!("Executing key press: {} → {}", key, script);
        let _ = Command::new("osascript").args(["-e", &script]).output();
    }
}

/// Open an application by name (e.g., "Google Chrome", "Safari", "Visual Studio Code")
fn open_application(_app_name: &str) {
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;

        let script = format!("tell application \"{}\" to activate", _app_name);
        info!("Opening application: {}", _app_name);

        match Command::new("osascript").args(["-e", &script]).output() {
            Ok(output) => {
                if !output.status.success() {
                    let error = String::from_utf8_lossy(&output.stderr);
                    log::error!("Failed to open application '{}': {}", _app_name, error);
                }
            }
            Err(e) => {
                log::error!("Failed to execute osascript to open '{}': {}", _app_name, e);
            }
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        log::warn!("Opening applications is only supported on macOS");
    }
}
