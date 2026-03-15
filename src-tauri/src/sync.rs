use log::{error, info, warn};
use tauri::AppHandle;

use crate::github;
use crate::snippets;

/// Push local commands to the GitHub Gist.
/// Creates a new Gist if none exists, otherwise updates the existing one.
pub async fn push_commands(app: &AppHandle) -> Result<(), String> {
    let sync_settings = github::get_sync_settings(app);
    let token = github::get_token().ok_or("Not authenticated with GitHub")?;

    // Serialize current commands
    let store = snippets::load_commands(app);
    let json = serde_json::to_string_pretty(&store.commands)
        .map_err(|e| format!("Failed to serialize commands: {}", e))?;

    let gist = if let Some(gist_id) = &sync_settings.gist_id {
        // Try to update existing gist
        match github::update_gist(&token, gist_id, &json).await {
            Ok(gist) => gist,
            Err(e) => {
                // If gist was deleted (404), create a new one
                if e.contains("404") {
                    warn!("Gist {} not found, creating new one", gist_id);
                    github::create_gist(&token, &json).await?
                } else {
                    return Err(e);
                }
            }
        }
    } else {
        // No gist ID stored — try to find existing one first
        if let Some(existing) = github::find_voicesnippets_gist(&token).await? {
            info!("Found existing VoiceSnippets gist: {}", existing.id);
            github::update_gist(&token, &existing.id, &json).await?
        } else {
            info!("Creating new VoiceSnippets gist");
            github::create_gist(&token, &json).await?
        }
    };

    // Save gist ID and update last sync time
    let mut updated_settings = sync_settings;
    updated_settings.gist_id = Some(gist.id);
    updated_settings.last_sync_at = Some(chrono::Utc::now().to_rfc3339());
    github::save_sync_settings(app, &updated_settings);

    info!("Commands pushed to gist successfully");
    Ok(())
}

/// Pull commands from the GitHub Gist and replace local commands.
/// Uses last-write-wins strategy.
pub async fn pull_commands(app: &AppHandle) -> Result<u32, String> {
    let sync_settings = github::get_sync_settings(app);
    let token = github::get_token().ok_or("Not authenticated with GitHub")?;

    // Find or get the gist
    let gist = if let Some(gist_id) = &sync_settings.gist_id {
        match github::get_gist(&token, gist_id).await {
            Ok(gist) => gist,
            Err(e) => {
                if e.contains("404") {
                    warn!("Stored gist {} not found, searching for existing", gist_id);
                    github::find_voicesnippets_gist(&token)
                        .await?
                        .ok_or("No VoiceSnippets gist found")?
                } else {
                    return Err(e);
                }
            }
        }
    } else {
        // No gist ID stored, try to discover one
        github::find_voicesnippets_gist(&token)
            .await?
            .ok_or("No VoiceSnippets gist found. Push your commands first to create one.")?
    };

    let content = github::get_gist_content(&gist).ok_or("Gist does not contain commands file")?;

    let remote_commands: Vec<snippets::VoiceCommand> = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse gist content: {}", e))?;

    let count = remote_commands.len() as u32;

    // Load local store to preserve custom_words (they are not synced, only local)
    let local_store = snippets::load_commands(app);

    // Last-write-wins: replace local commands entirely, but preserve custom_words
    let store = snippets::CommandStore {
        commands: remote_commands,
        custom_words: local_store.custom_words,
    };
    snippets::save_commands(app, &store);

    // Update sync settings
    let mut updated_settings = sync_settings;
    updated_settings.gist_id = Some(gist.id);
    updated_settings.last_sync_at = Some(chrono::Utc::now().to_rfc3339());
    github::save_sync_settings(app, &updated_settings);

    info!("Pulled {} commands from gist", count);
    Ok(count)
}

/// Trigger a background push (debounced). Called after command mutations.
pub fn trigger_background_push(app: &AppHandle) {
    let sync_settings = github::get_sync_settings(app);

    // Only push if auto-sync is enabled and authenticated
    // Check auto_sync_enabled first to avoid accessing Keychain if syncing is disabled
    if !sync_settings.auto_sync_enabled || github::get_token().is_none() {
        return;
    }

    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        // Debounce: wait 2 seconds before pushing
        tokio::time::sleep(std::time::Duration::from_secs(2)).await;

        if let Err(e) = push_commands(&app_handle).await {
            error!("Background sync push failed: {}", e);
        }
    });
}

/// Trigger a pull on app start (called from setup).
pub fn trigger_startup_pull(app: &AppHandle) {
    let sync_settings = github::get_sync_settings(app);

    // Check auto_sync_enabled first to avoid accessing Keychain if syncing is disabled
    if !sync_settings.auto_sync_enabled || github::get_token().is_none() {
        return;
    }

    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        match pull_commands(&app_handle).await {
            Ok(count) => info!("Startup sync: pulled {} commands", count),
            Err(e) => warn!("Startup sync pull failed: {}", e),
        }
    });
}

/// Start a periodic sync loop that pulls from the Gist every N minutes.
pub fn start_periodic_sync(app: &AppHandle) {
    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            let sync_settings = github::get_sync_settings(&app_handle);
            let interval = sync_settings.sync_interval_minutes;

            // If disabled (0) or auto-sync off, sleep briefly and recheck
            // Check these flags before accessing Keychain to avoid prompts
            if interval == 0 || !sync_settings.auto_sync_enabled || github::get_token().is_none() {
                tokio::time::sleep(std::time::Duration::from_secs(30)).await;
                continue;
            }

            tokio::time::sleep(std::time::Duration::from_secs(interval as u64 * 60)).await;

            // Re-check settings after sleep (user may have changed them)
            let settings = github::get_sync_settings(&app_handle);
            if settings.sync_interval_minutes == 0
                || !settings.auto_sync_enabled
                || github::get_token().is_none()
            {
                continue;
            }

            info!("Periodic sync: pulling commands");
            match pull_commands(&app_handle).await {
                Ok(count) => info!("Periodic sync: pulled {} commands", count),
                Err(e) => warn!("Periodic sync pull failed: {}", e),
            }
        }
    });
}
