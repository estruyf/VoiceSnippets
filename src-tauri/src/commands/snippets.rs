use crate::packs;
use crate::snippets::{self, AppFilter, CommandType, VoiceCommand, WorkflowStep};
use crate::sync;
use tauri::AppHandle;

#[tauri::command]
pub fn get_commands(app: AppHandle) -> Result<Vec<VoiceCommand>, String> {
    let store = snippets::load_commands(&app);
    Ok(store.commands)
}

#[tauri::command]
pub fn add_command(
    app: AppHandle,
    trigger_word: String,
    expansion: String,
    command_type: Option<String>,
    category: Option<String>,
    workflow_steps: Option<Vec<WorkflowStep>>,
    aliases: Option<Vec<String>>,
    app_filters: Option<Vec<AppFilter>>,
) -> Result<VoiceCommand, String> {
    let ct = parse_command_type(command_type.as_deref());
    let cmd = snippets::add_command(
        &app,
        trigger_word,
        expansion,
        ct,
        category,
        workflow_steps,
        aliases,
        app_filters,
    );
    sync::trigger_background_push(&app);
    Ok(cmd)
}

#[tauri::command]
pub fn update_command(
    app: AppHandle,
    id: String,
    trigger_word: String,
    expansion: String,
    command_type: Option<String>,
    workflow_steps: Option<Vec<WorkflowStep>>,
    aliases: Option<Vec<String>>,
    app_filters: Option<Vec<AppFilter>>,
) -> Result<VoiceCommand, String> {
    let ct = Some(parse_command_type(command_type.as_deref()));
    // Wrap workflow_steps, aliases, and app_filters in Some() so they always update (None clears, Some sets)
    let ws = Some(workflow_steps);
    let a = Some(aliases);
    let af = Some(app_filters);
    let result = snippets::update_command(
        &app,
        &id,
        trigger_word,
        expansion,
        ct,
        None,
        ws,
        a,
        af,
    )
    .ok_or_else(|| "Command not found".to_string());
    if result.is_ok() {
        sync::trigger_background_push(&app);
    }
    result
}

#[tauri::command]
pub fn delete_command(app: AppHandle, id: String) -> Result<bool, String> {
    let deleted = snippets::delete_command(&app, &id);
    if deleted {
        sync::trigger_background_push(&app);
    }
    Ok(deleted)
}

// --- Command Packs ---

#[tauri::command]
pub fn get_command_packs() -> Result<Vec<packs::CommandPack>, String> {
    Ok(packs::get_all_packs())
}

#[tauri::command]
pub fn install_command_pack(app: AppHandle, pack_id: String) -> Result<u32, String> {
    let all_packs = packs::get_all_packs();
    let pack = all_packs
        .iter()
        .find(|p| p.id == pack_id)
        .ok_or_else(|| format!("Pack '{}' not found", pack_id))?;

    let mut store = snippets::load_commands(&app);
    let mut added = 0u32;

    for pc in &pack.commands {
        // Skip if a command with the same trigger already exists
        let exists = store
            .commands
            .iter()
            .any(|c| c.trigger_word.to_lowercase() == pc.trigger_word.to_lowercase());
        if exists {
            continue;
        }

        let ct = parse_command_type(Some(&pc.command_type));
        let mut cmd = VoiceCommand::new(pc.trigger_word.clone(), pc.expansion.clone())
            .with_type(ct)
            .with_category(&pack.name);
        if let Some(ref steps) = pc.workflow_steps {
            cmd = cmd.with_workflow_steps(steps.clone());
        }
        cmd.category = Some(pack.name.clone());
        store.commands.push(cmd);
        added += 1;
    }

    snippets::save_commands(&app, &store);
    sync::trigger_background_push(&app);
    Ok(added)
}

#[tauri::command]
pub fn uninstall_command_pack(app: AppHandle, pack_id: String) -> Result<u32, String> {
    let all_packs = packs::get_all_packs();
    let pack = all_packs
        .iter()
        .find(|p| p.id == pack_id)
        .ok_or_else(|| format!("Pack '{}' not found", pack_id))?;

    let mut store = snippets::load_commands(&app);
    let before = store.commands.len();
    store
        .commands
        .retain(|c| c.category.as_deref() != Some(&pack.name));
    let removed = (before - store.commands.len()) as u32;

    snippets::save_commands(&app, &store);
    sync::trigger_background_push(&app);
    Ok(removed)
}

// --- Export / Import ---

#[tauri::command]
pub fn export_commands(app: AppHandle) -> Result<String, String> {
    let store = snippets::load_commands(&app);
    serde_json::to_string_pretty(&store.commands).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn import_commands(app: AppHandle, json: String, merge: bool) -> Result<u32, String> {
    let incoming: Vec<VoiceCommand> =
        serde_json::from_str(&json).map_err(|e| format!("Invalid JSON: {}", e))?;

    let mut store = snippets::load_commands(&app);

    if !merge {
        // Replace all
        let count = incoming.len() as u32;
        store.commands = incoming;
        snippets::save_commands(&app, &store);
        sync::trigger_background_push(&app);
        return Ok(count);
    }

    // Merge: add only commands whose trigger_word doesn't already exist
    let mut added = 0u32;
    for cmd in incoming {
        let exists = store
            .commands
            .iter()
            .any(|c| c.trigger_word.to_lowercase() == cmd.trigger_word.to_lowercase());
        if !exists {
            store.commands.push(cmd);
            added += 1;
        }
    }
    snippets::save_commands(&app, &store);
    if added > 0 {
        sync::trigger_background_push(&app);
    }
    Ok(added)
}

fn parse_command_type(s: Option<&str>) -> CommandType {
    match s {
        Some("KeyboardShortcut") => CommandType::KeyboardShortcut,
        Some("Workflow") => CommandType::Workflow,
        Some("OpenApp") => CommandType::OpenApp,
        _ => CommandType::TextExpansion,
    }
}
// --- Custom Words Management ---

#[tauri::command]
pub fn get_custom_words(app: AppHandle) -> Result<Vec<String>, String> {
    let words = snippets::get_custom_words(&app);
    Ok(words)
}

#[tauri::command]
pub fn add_custom_word(app: AppHandle, word: String) -> Result<bool, String> {
    let added = snippets::add_custom_word(&app, word);
    if added {
        sync::trigger_background_push(&app);
    }
    Ok(added)
}

#[tauri::command]
pub fn remove_custom_word(app: AppHandle, word: String) -> Result<bool, String> {
    let removed = snippets::remove_custom_word(&app, &word);
    if removed {
        sync::trigger_background_push(&app);
    }
    Ok(removed)
}
