use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum CommandType {
    TextExpansion,
    KeyboardShortcut,
    Workflow,
    OpenApp,
}

/// A single step in a workflow sequence.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowStep {
    /// "text" for typing text, "key" for pressing a key (enter, tab, etc.),
    /// "delay" for a pause in milliseconds.
    pub step_type: String,
    /// The value: text to type, key name, or delay duration.
    pub value: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct AppFilter {
    pub id: String,
    pub name: String,
}

impl<'de> Deserialize<'de> for AppFilter {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        #[derive(Deserialize)]
        #[serde(untagged)]
        enum AppFilterInput {
            String(String),
            Object { id: String, name: String },
        }

        match AppFilterInput::deserialize(deserializer)? {
            AppFilterInput::String(value) => Ok(AppFilter {
                id: value.clone(),
                name: value,
            }),
            AppFilterInput::Object { id, name } => Ok(AppFilter { id, name }),
        }
    }
}

impl Default for CommandType {
    fn default() -> Self {
        CommandType::TextExpansion
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VoiceCommand {
    pub id: String,
    pub trigger_word: String,
    pub expansion: String,
    #[serde(default)]
    pub command_type: CommandType,
    #[serde(default)]
    pub category: Option<String>,
    /// Alternative trigger phrases that also activate this command.
    #[serde(default)]
    pub aliases: Vec<String>,
    /// Workflow steps – only used when `command_type` is `Workflow`.
    #[serde(default)]
    pub workflow_steps: Option<Vec<WorkflowStep>>,
    /// List of app bundle IDs (macOS) or app names (Windows) this command applies to,
    /// stored as { id, name } pairs.
    /// If empty, the command applies to all apps (global).
    #[serde(default)]
    pub app_filters: Vec<AppFilter>,
    pub created_at: String,
    pub last_used_at: Option<String>,
    pub use_count: u32,
}

impl VoiceCommand {
    pub fn new(trigger_word: String, expansion: String) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            trigger_word,
            expansion,
            command_type: CommandType::TextExpansion,
            category: None,
            aliases: Vec::new(),
            workflow_steps: None,
            app_filters: Vec::new(),
            created_at: chrono::Utc::now().to_rfc3339(),
            last_used_at: None,
            use_count: 0,
        }
    }

    pub fn with_workflow_steps(mut self, steps: Vec<WorkflowStep>) -> Self {
        self.workflow_steps = Some(steps);
        self
    }

    pub fn with_type(mut self, command_type: CommandType) -> Self {
        self.command_type = command_type;
        self
    }

    pub fn with_category(mut self, category: impl Into<String>) -> Self {
        self.category = Some(category.into());
        self
    }

    pub fn with_aliases(mut self, aliases: Vec<String>) -> Self {
        self.aliases = aliases;
        self
    }

    pub fn with_app_filters(mut self, app_filters: Vec<AppFilter>) -> Self {
        self.app_filters = app_filters;
        self
    }

    /// Returns all trigger phrases: the primary trigger word plus any aliases.
    pub fn all_triggers(&self) -> Vec<&str> {
        let mut triggers = vec![self.trigger_word.as_str()];
        for alias in &self.aliases {
            triggers.push(alias.as_str());
        }
        triggers
    }

    /// Returns true if the expansion contains parameter placeholders like {name}.
    pub fn has_parameters(&self) -> bool {
        self.expansion.contains('{') && self.expansion.contains('}')
    }

    /// Check if this command applies to the given app ID or app name.
    /// Returns true if:
    /// - app_filters is empty (global command), OR
    /// - the app_id OR app_name matches one of the app_filters (case-insensitive comparison)
    pub fn applies_to_app(&self, app_id: Option<&str>, app_name: Option<&str>) -> bool {
        if self.app_filters.is_empty() {
            // Global command applies to all apps
            return true;
        }

        let matches_filter = |value: &str| {
            self.app_filters.iter().any(|f| {
                f.id.eq_ignore_ascii_case(value) || f.name.eq_ignore_ascii_case(value)
            })
        };

        if let Some(id) = app_id {
            if matches_filter(id) {
                return true;
            }
        }

        if let Some(name) = app_name {
            if matches_filter(name) {
                return true;
            }
        }

        // If no current app (or no match), only global commands match
        false
    }

    /// Substitute parameters in the expansion with the given remaining text.
    pub fn expand_with_params(&self, remaining: &str) -> String {
        let mut result = self.expansion.clone();
        // Collect all {param} names
        let mut params: Vec<String> = Vec::new();
        let mut i = 0;
        let bytes = result.as_bytes();
        while i < bytes.len() {
            if bytes[i] == b'{' {
                if let Some(end) = result[i..].find('}') {
                    let name = &result[i..i + end + 1];
                    if !params.contains(&name.to_string()) {
                        params.push(name.to_string());
                    }
                    i += end + 1;
                } else {
                    i += 1;
                }
            } else {
                i += 1;
            }
        }

        if params.len() == 1 {
            // Single parameter gets all remaining text
            result = result.replace(&params[0], remaining);
        } else {
            // Multiple parameters: split remaining by whitespace
            let words: Vec<&str> = remaining.split_whitespace().collect();
            for (idx, param) in params.iter().enumerate() {
                if idx < words.len() {
                    result = result.replace(param, words[idx]);
                } else {
                    result = result.replace(param, "");
                }
            }
        }

        result.trim().to_string()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CommandStore {
    pub commands: Vec<VoiceCommand>,
    #[serde(default)]
    pub custom_words: Vec<String>,
}

fn commands_path(app: &AppHandle) -> PathBuf {
    let dir = app
        .path()
        .app_data_dir()
        .expect("Failed to get app data dir");
    if !dir.exists() {
        fs::create_dir_all(&dir).expect("Failed to create app data dir");
    }
    dir.join("commands.json")
}

pub fn load_commands(app: &AppHandle) -> CommandStore {
    let path = commands_path(app);
    if path.exists() {
        match fs::read_to_string(&path) {
            Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
            Err(_) => CommandStore::default(),
        }
    } else {
        CommandStore::default()
    }
}

pub fn save_commands(app: &AppHandle, store: &CommandStore) {
    let path = commands_path(app);
    if let Ok(json) = serde_json::to_string_pretty(&store) {
        let _ = fs::write(&path, json);
    }
}

pub fn add_command(
    app: &AppHandle,
    trigger_word: String,
    expansion: String,
    command_type: CommandType,
    category: Option<String>,
    workflow_steps: Option<Vec<WorkflowStep>>,
    aliases: Option<Vec<String>>,
    app_filters: Option<Vec<AppFilter>>,
) -> VoiceCommand {
    let mut store = load_commands(app);
    let trigger_word_lower = trigger_word.to_lowercase();
    let mut cmd = VoiceCommand::new(trigger_word_lower, expansion).with_type(command_type);
    if let Some(cat) = category {
        cmd = cmd.with_category(cat);
    }
    if let Some(steps) = workflow_steps {
        cmd = cmd.with_workflow_steps(steps);
    }
    if let Some(a) = aliases {
        cmd = cmd.with_aliases(a.into_iter().map(|s| s.to_lowercase()).collect());
    }
    if let Some(filters) = app_filters {
        cmd = cmd.with_app_filters(filters);
    }
    store.commands.push(cmd.clone());
    save_commands(app, &store);
    cmd
}

pub fn update_command(
    app: &AppHandle,
    id: &str,
    trigger_word: String,
    expansion: String,
    command_type: Option<CommandType>,
    category: Option<Option<String>>,
    workflow_steps: Option<Option<Vec<WorkflowStep>>>,
    aliases: Option<Option<Vec<String>>>,
    app_filters: Option<Option<Vec<AppFilter>>>,
) -> Option<VoiceCommand> {
    let mut store = load_commands(app);
    if let Some(cmd) = store.commands.iter_mut().find(|c| c.id == id) {
        cmd.trigger_word = trigger_word.to_lowercase();
        cmd.expansion = expansion;
        if let Some(ct) = command_type {
            cmd.command_type = ct;
        }
        if let Some(cat) = category {
            cmd.category = cat;
        }
        if let Some(steps) = workflow_steps {
            cmd.workflow_steps = steps;
        }
        if let Some(a) = aliases {
            cmd.aliases = a.map(|vec| vec.into_iter().map(|s| s.to_lowercase()).collect()).unwrap_or_default();
        }
        if let Some(filters) = app_filters {
            cmd.app_filters = filters.unwrap_or_default();
        }
        let updated = cmd.clone();
        save_commands(app, &store);
        Some(updated)
    } else {
        None
    }
}

pub fn delete_command(app: &AppHandle, id: &str) -> bool {
    let mut store = load_commands(app);
    let initial_len = store.commands.len();
    store.commands.retain(|c| c.id != id);
    if store.commands.len() < initial_len {
        save_commands(app, &store);
        true
    } else {
        false
    }
}

pub fn record_usage(app: &AppHandle, id: &str) {
    let mut store = load_commands(app);
    if let Some(cmd) = store.commands.iter_mut().find(|c| c.id == id) {
        cmd.use_count += 1;
        cmd.last_used_at = Some(chrono::Utc::now().to_rfc3339());
        save_commands(app, &store);
    }
}
pub fn add_custom_word(app: &AppHandle, word: String) -> bool {
    let mut store = load_commands(app);
    let word_lower = word.to_lowercase();
    if !store.custom_words.contains(&word_lower) {
        store.custom_words.push(word_lower);
        save_commands(app, &store);
        true
    } else {
        false
    }
}

pub fn remove_custom_word(app: &AppHandle, word: &str) -> bool {
    let mut store = load_commands(app);
    let word_lower = word.to_lowercase();
    let initial_len = store.custom_words.len();
    store.custom_words.retain(|w| w != &word_lower);
    if store.custom_words.len() < initial_len {
        save_commands(app, &store);
        true
    } else {
        false
    }
}

pub fn get_custom_words(app: &AppHandle) -> Vec<String> {
    let store = load_commands(app);
    store.custom_words
}
