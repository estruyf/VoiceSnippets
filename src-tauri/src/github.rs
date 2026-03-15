use log::{debug, info, warn};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

const GITHUB_CLIENT_ID: &str = "Ov23liubsL7EruZqxpph";
const DEVICE_CODE_URL: &str = "https://github.com/login/device/code";
const ACCESS_TOKEN_URL: &str = "https://github.com/login/oauth/access_token";
const GIST_API_URL: &str = "https://api.github.com/gists";
const USER_API_URL: &str = "https://api.github.com/user";

const GIST_DESCRIPTION: &str = "VoiceSnippets - Voice Commands Sync";
const GIST_FILENAME: &str = "voicesnippets-commands.json";

const KEYCHAIN_SERVICE: &str = "com.voicesnippets.github";
const KEYCHAIN_USER: &str = "github_token";

// --- Data types ---

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceFlowResponse {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub expires_in: u64,
    pub interval: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccessTokenResponse {
    #[serde(default)]
    pub access_token: Option<String>,
    #[serde(default)]
    pub token_type: Option<String>,
    #[serde(default)]
    pub scope: Option<String>,
    #[serde(default)]
    pub error: Option<String>,
    #[serde(default)]
    pub error_description: Option<String>,
    #[serde(default)]
    pub interval: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitHubUser {
    pub login: String,
    pub avatar_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncSettings {
    pub github_username: Option<String>,
    pub gist_id: Option<String>,
    pub last_sync_at: Option<String>,
    pub auto_sync_enabled: bool,
    #[serde(default = "default_sync_interval")]
    pub sync_interval_minutes: u32,
}

fn default_sync_interval() -> u32 {
    15
}

impl Default for SyncSettings {
    fn default() -> Self {
        Self {
            github_username: None,
            gist_id: None,
            last_sync_at: None,
            auto_sync_enabled: true,
            sync_interval_minutes: default_sync_interval(),
        }
    }
}

// --- Keychain token storage ---

pub fn store_token(token: &str) -> Result<(), String> {
    let entry = keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_USER)
        .map_err(|e| format!("Failed to create keychain entry: {}", e))?;
    entry
        .set_password(token)
        .map_err(|e| format!("Failed to store token in keychain: {}", e))?;
    debug!("Token stored in OS keychain");
    Ok(())
}

pub fn get_token() -> Option<String> {
    let entry = keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_USER).ok()?;
    match entry.get_password() {
        Ok(token) if !token.is_empty() => Some(token),
        Ok(_) => None,
        Err(keyring::Error::NoEntry) => None,
        Err(e) => {
            warn!("Failed to read token from keychain: {}", e);
            None
        }
    }
}

pub fn delete_token() -> Result<(), String> {
    let entry = keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_USER)
        .map_err(|e| format!("Failed to create keychain entry: {}", e))?;
    match entry.delete_credential() {
        Ok(()) => {
            debug!("Token removed from OS keychain");
            Ok(())
        }
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("Failed to delete token from keychain: {}", e)),
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GistFile {
    pub filename: Option<String>,
    pub content: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Gist {
    pub id: String,
    pub description: Option<String>,
    pub files: std::collections::HashMap<String, GistFile>,
    pub updated_at: Option<String>,
}

// --- Sync settings persistence ---

pub fn get_sync_settings(app: &AppHandle) -> SyncSettings {
    if let Ok(store) = app.store("settings.json") {
        if let Some(val) = store.get("sync") {
            if let Ok(settings) = serde_json::from_value::<SyncSettings>(val) {
                return settings;
            }
        }
    }
    SyncSettings::default()
}

pub fn save_sync_settings(app: &AppHandle, settings: &SyncSettings) {
    if let Ok(store) = app.store("settings.json") {
        if let Ok(json_value) = serde_json::to_value(settings) {
            store.set("sync", json_value);
            debug!("Sync settings saved to store");
        }
    }
}

// --- OAuth Device Flow ---

pub async fn start_device_flow() -> Result<DeviceFlowResponse, String> {
    let client = Client::new();
    let resp = client
        .post(DEVICE_CODE_URL)
        .header("Accept", "application/json")
        .form(&[("client_id", GITHUB_CLIENT_ID), ("scope", "gist")])
        .send()
        .await
        .map_err(|e| format!("Failed to start device flow: {}", e))?;

    let body = resp
        .json::<DeviceFlowResponse>()
        .await
        .map_err(|e| format!("Failed to parse device flow response: {}", e))?;

    info!("Device flow started, user code: {}", body.user_code);
    Ok(body)
}

pub async fn poll_for_token(device_code: &str) -> Result<AccessTokenResponse, String> {
    let client = Client::new();
    let resp = client
        .post(ACCESS_TOKEN_URL)
        .header("Accept", "application/json")
        .form(&[
            ("client_id", GITHUB_CLIENT_ID),
            ("device_code", device_code),
            ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
        ])
        .send()
        .await
        .map_err(|e| format!("Failed to poll for token: {}", e))?;

    let body = resp
        .json::<AccessTokenResponse>()
        .await
        .map_err(|e| format!("Failed to parse token response: {}", e))?;

    debug!(
        "Token poll response: access_token={}, error={:?}",
        if body.access_token.as_ref().map_or(true, |t| t.is_empty()) {
            "empty"
        } else {
            "present"
        },
        body.error
    );

    Ok(body)
}

pub async fn get_authenticated_user(token: &str) -> Result<GitHubUser, String> {
    let client = Client::new();
    let resp = client
        .get(USER_API_URL)
        .header("Authorization", format!("Bearer {}", token))
        .header("User-Agent", "VoiceSnippets")
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| format!("Failed to get user: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("GitHub API error: {}", resp.status()));
    }

    resp.json::<GitHubUser>()
        .await
        .map_err(|e| format!("Failed to parse user response: {}", e))
}

// --- Gist CRUD ---

/// Create a new Gist with the given content
pub async fn create_gist(token: &str, content: &str) -> Result<Gist, String> {
    let client = Client::new();

    let mut files = serde_json::Map::new();
    files.insert(
        GIST_FILENAME.to_string(),
        serde_json::json!({ "content": content }),
    );

    let body = serde_json::json!({
        "description": GIST_DESCRIPTION,
        "public": false,
        "files": files,
    });

    let resp = client
        .post(GIST_API_URL)
        .header("Authorization", format!("Bearer {}", token))
        .header("User-Agent", "VoiceSnippets")
        .header("Accept", "application/vnd.github+json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Failed to create gist: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("GitHub API error {}: {}", status, text));
    }

    resp.json::<Gist>()
        .await
        .map_err(|e| format!("Failed to parse gist response: {}", e))
}

/// Update an existing Gist
pub async fn update_gist(token: &str, gist_id: &str, content: &str) -> Result<Gist, String> {
    let client = Client::new();

    let mut files = serde_json::Map::new();
    files.insert(
        GIST_FILENAME.to_string(),
        serde_json::json!({ "content": content }),
    );

    let body = serde_json::json!({
        "description": GIST_DESCRIPTION,
        "files": files,
    });

    let url = format!("{}/{}", GIST_API_URL, gist_id);
    let resp = client
        .patch(&url)
        .header("Authorization", format!("Bearer {}", token))
        .header("User-Agent", "VoiceSnippets")
        .header("Accept", "application/vnd.github+json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Failed to update gist: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("GitHub API error {}: {}", status, text));
    }

    resp.json::<Gist>()
        .await
        .map_err(|e| format!("Failed to parse gist response: {}", e))
}

/// Get a Gist by ID
pub async fn get_gist(token: &str, gist_id: &str) -> Result<Gist, String> {
    let client = Client::new();
    let url = format!("{}/{}", GIST_API_URL, gist_id);

    let resp = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", token))
        .header("User-Agent", "VoiceSnippets")
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| format!("Failed to get gist: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("GitHub API error {}: {}", status, text));
    }

    resp.json::<Gist>()
        .await
        .map_err(|e| format!("Failed to parse gist response: {}", e))
}

/// Find the VoiceSnippets Gist among the user's gists
pub async fn find_voicesnippets_gist(token: &str) -> Result<Option<Gist>, String> {
    let client = Client::new();
    let mut page = 1u32;

    loop {
        let url = format!("{}?per_page=100&page={}", GIST_API_URL, page);
        let resp = client
            .get(&url)
            .header("Authorization", format!("Bearer {}", token))
            .header("User-Agent", "VoiceSnippets")
            .header("Accept", "application/vnd.github+json")
            .send()
            .await
            .map_err(|e| format!("Failed to list gists: {}", e))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(format!("GitHub API error {}: {}", status, text));
        }

        let gists: Vec<Gist> = resp
            .json()
            .await
            .map_err(|e| format!("Failed to parse gists list: {}", e))?;

        if gists.is_empty() {
            break;
        }

        // Look for our gist by description and filename
        for gist in &gists {
            if gist.description.as_deref() == Some(GIST_DESCRIPTION)
                && gist.files.contains_key(GIST_FILENAME)
            {
                info!("Found existing VoiceSnippets gist: {}", gist.id);
                return match get_gist(token, &gist.id).await {
                    Ok(gist) => Ok(Some(gist)),
                    Err(e) => Err(e),
                };
            }
        }

        page += 1;
    }

    Ok(None)
}

/// Extract the commands JSON content from a Gist
pub fn get_gist_content(gist: &Gist) -> Option<String> {
    gist.files
        .get(GIST_FILENAME)
        .and_then(|f| f.content.clone())
}
