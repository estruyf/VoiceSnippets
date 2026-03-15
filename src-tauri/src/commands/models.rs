use crate::managers::model::{ModelInfo, ModelManager};
use crate::managers::transcription::TranscriptionManager;
use crate::settings::{get_settings, write_settings};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};

#[tauri::command]
pub async fn get_available_models(
    model_manager: State<'_, Arc<ModelManager>>,
) -> Result<Vec<ModelInfo>, String> {
    Ok(model_manager.get_available_models())
}

#[tauri::command]
pub async fn download_model(
    model_manager: State<'_, Arc<ModelManager>>,
    model_id: String,
) -> Result<(), String> {
    model_manager
        .download_model(&model_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_model(
    app_handle: AppHandle,
    model_manager: State<'_, Arc<ModelManager>>,
    transcription_manager: State<'_, Arc<TranscriptionManager>>,
    model_id: String,
) -> Result<(), String> {
    let settings = get_settings(&app_handle);
    if settings.selected_model == model_id {
        transcription_manager
            .unload_model()
            .map_err(|e| format!("Failed to unload model: {}", e))?;

        let mut settings = get_settings(&app_handle);
        settings.selected_model = String::new();
        write_settings(&app_handle, settings);

        app_handle
            .emit("model-changed", "")
            .map_err(|e| e.to_string())?;
    }

    model_manager
        .delete_model(&model_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_active_model(
    app_handle: AppHandle,
    model_manager: State<'_, Arc<ModelManager>>,
    transcription_manager: State<'_, Arc<TranscriptionManager>>,
    model_id: String,
) -> Result<(), String> {
    let model_info = model_manager
        .get_model_info(&model_id)
        .ok_or_else(|| format!("Model not found: {}", model_id))?;

    if !model_info.is_downloaded {
        return Err(format!("Model not downloaded: {}", model_id));
    }

    transcription_manager
        .load_model(&model_id)
        .map_err(|e| e.to_string())?;

    let mut settings = get_settings(&app_handle);
    settings.selected_model = model_id.clone();
    write_settings(&app_handle, settings);

    app_handle
        .emit("model-changed", model_id)
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn get_current_model(app_handle: AppHandle) -> Result<String, String> {
    let settings = get_settings(&app_handle);
    Ok(settings.selected_model)
}

#[tauri::command]
pub async fn cancel_download(
    model_manager: State<'_, Arc<ModelManager>>,
    model_id: String,
) -> Result<(), String> {
    model_manager
        .cancel_download(&model_id)
        .map_err(|e| e.to_string())
}
