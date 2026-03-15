use crate::github;
use crate::sync;
use log::{debug, info, warn};
use serde::Serialize;
use tauri::AppHandle;

#[derive(Debug, Clone, Serialize)]
pub struct DeviceFlowInfo {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub expires_in: u64,
    pub interval: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct AuthStatus {
    pub authenticated: bool,
    pub username: Option<String>,
    pub gist_id: Option<String>,
    pub last_sync_at: Option<String>,
    pub auto_sync_enabled: bool,
    pub sync_interval_minutes: u32,
}

#[derive(Debug, Clone, Serialize)]
pub struct PollResult {
    pub status: String, // "success", "pending", "error"
    pub message: Option<String>,
}

#[tauri::command]
pub async fn github_start_device_flow() -> Result<DeviceFlowInfo, String> {
    let resp = github::start_device_flow().await?;
    Ok(DeviceFlowInfo {
        device_code: resp.device_code,
        user_code: resp.user_code,
        verification_uri: resp.verification_uri,
        expires_in: resp.expires_in,
        interval: resp.interval,
    })
}

#[tauri::command]
pub async fn github_poll_auth(app: AppHandle, device_code: String) -> Result<PollResult, String> {
    info!(
        "github_poll_auth called with device_code: {}...",
        &device_code[..8.min(device_code.len())]
    );

    let resp = match github::poll_for_token(&device_code).await {
        Ok(r) => r,
        Err(e) => {
            warn!("poll_for_token returned error: {}", e);
            return Err(e);
        }
    };

    debug!(
        "Raw poll response: access_token={:?}, token_type={:?}, scope={:?}, error={:?}, error_description={:?}",
        resp.access_token.as_ref().map(|t| if t.is_empty() { "<empty>" } else { "<present>" }),
        resp.token_type,
        resp.scope,
        resp.error,
        resp.error_description,
    );

    // Treat empty access_token as None
    let token = resp.access_token.filter(|t| !t.is_empty());

    if let Some(token) = token {
        info!("Got access token, fetching user info...");
        // Got a token — fetch the user info
        let user = github::get_authenticated_user(&token).await?;
        info!("Authenticated as: {}", user.login);

        // Save token to OS keychain
        github::store_token(&token)?;

        // Save non-secret settings
        let mut sync_settings = github::get_sync_settings(&app);
        sync_settings.github_username = Some(user.login.clone());
        github::save_sync_settings(&app, &sync_settings);

        // Try to discover an existing gist
        if sync_settings.gist_id.is_none() {
            if let Ok(Some(gist)) = github::find_voicesnippets_gist(&token).await {
                let mut updated = github::get_sync_settings(&app);
                updated.gist_id = Some(gist.id);
                github::save_sync_settings(&app, &updated);
            }
        }

        Ok(PollResult {
            status: "success".to_string(),
            message: Some(user.login),
        })
    } else if let Some(ref error) = resp.error {
        info!("Poll returned error state: {}", error);
        match error.as_str() {
            "authorization_pending" => Ok(PollResult {
                status: "pending".to_string(),
                message: Some("Waiting for user to authorize...".to_string()),
            }),
            "slow_down" => Ok(PollResult {
                status: "pending".to_string(),
                message: Some("Polling too fast, slowing down...".to_string()),
            }),
            "expired_token" => Ok(PollResult {
                status: "error".to_string(),
                message: Some("Device code expired. Please try again.".to_string()),
            }),
            "access_denied" => Ok(PollResult {
                status: "error".to_string(),
                message: Some("Access denied by user.".to_string()),
            }),
            _ => Ok(PollResult {
                status: "error".to_string(),
                message: resp.error_description.or(Some(error.clone())),
            }),
        }
    } else {
        warn!("Unexpected poll response: no token and no error field");
        Ok(PollResult {
            status: "error".to_string(),
            message: Some("Unexpected response from GitHub".to_string()),
        })
    }
}

#[tauri::command]
pub fn github_logout(app: AppHandle) -> Result<(), String> {
    // Remove token from keychain
    github::delete_token()?;

    // Clear non-secret settings
    let mut sync_settings = github::get_sync_settings(&app);
    sync_settings.github_username = None;
    sync_settings.gist_id = None;
    sync_settings.last_sync_at = None;
    github::save_sync_settings(&app, &sync_settings);
    Ok(())
}

#[tauri::command]
pub fn github_get_auth_status(app: AppHandle) -> Result<AuthStatus, String> {
    let sync_settings = github::get_sync_settings(&app);

    // Only check keychain if we have a username (meaning we previously logged in)
    // This prevents the keychain prompt from appearing on startup for users who haven't set up sync
    let authenticated = if sync_settings.github_username.is_some() {
        github::get_token().is_some()
    } else {
        false
    };

    Ok(AuthStatus {
        authenticated,
        username: sync_settings.github_username,
        gist_id: sync_settings.gist_id,
        last_sync_at: sync_settings.last_sync_at,
        auto_sync_enabled: sync_settings.auto_sync_enabled,
        sync_interval_minutes: sync_settings.sync_interval_minutes,
    })
}

#[tauri::command]
pub async fn sync_push(app: AppHandle) -> Result<(), String> {
    sync::push_commands(&app).await
}

#[tauri::command]
pub async fn sync_pull(app: AppHandle) -> Result<u32, String> {
    sync::pull_commands(&app).await
}

#[tauri::command]
pub fn set_auto_sync(app: AppHandle, enabled: bool) -> Result<(), String> {
    let mut sync_settings = github::get_sync_settings(&app);
    sync_settings.auto_sync_enabled = enabled;
    github::save_sync_settings(&app, &sync_settings);
    Ok(())
}

#[tauri::command]
pub fn set_sync_interval(app: AppHandle, minutes: u32) -> Result<(), String> {
    let mut sync_settings = github::get_sync_settings(&app);
    sync_settings.sync_interval_minutes = minutes;
    github::save_sync_settings(&app, &sync_settings);
    Ok(())
}
