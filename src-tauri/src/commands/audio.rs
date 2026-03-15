use crate::managers::audio::{self, AudioDevice, AudioRecordingManager};
use crate::managers::transcription::TranscriptionManager;
use crate::settings::{get_settings, write_settings};
use std::sync::Arc;
use tauri::AppHandle;

#[tauri::command]
pub fn get_available_microphones() -> Result<Vec<AudioDevice>, String> {
    audio::list_input_devices().map_err(|e| format!("Failed to list audio devices: {}", e))
}

#[tauri::command]
pub fn set_selected_microphone(app: AppHandle, device_name: String) -> Result<(), String> {
    let mut settings = get_settings(&app);
    settings.selected_microphone = if device_name == "default" {
        None
    } else {
        Some(device_name)
    };
    write_settings(&app, settings);
    Ok(())
}

#[tauri::command]
pub fn get_selected_microphone(app: AppHandle) -> Result<String, String> {
    let settings = get_settings(&app);
    Ok(settings
        .selected_microphone
        .unwrap_or_else(|| "default".to_string()))
}

#[tauri::command]
pub fn is_recording(app: AppHandle) -> bool {
    use tauri::Manager;
    let audio_manager = app.state::<Arc<AudioRecordingManager>>();
    audio_manager.is_recording()
}

/// Start recording for trigger word capture
#[tauri::command]
pub fn start_trigger_recording(app: AppHandle) -> Result<(), String> {
    use tauri::Manager;
    let am = app.state::<Arc<AudioRecordingManager>>();
    let tm = app.state::<Arc<TranscriptionManager>>();
    let settings = get_settings(&app);

    // Initialize model in background
    tm.initiate_model_load();

    am.start_recording(settings.selected_microphone.clone())
        .map_err(|e| e.to_string())
}

/// Stop recording and transcribe the captured audio
#[tauri::command]
pub async fn stop_trigger_recording(app: AppHandle) -> Result<String, String> {
    use tauri::Manager;
    let am = app.state::<Arc<AudioRecordingManager>>().inner().clone();
    let tm = app.state::<Arc<TranscriptionManager>>().inner().clone();
    let settings = get_settings(&app);

    tokio::task::spawn_blocking(move || {
        let samples = am
            .stop_recording_with_min_duration(settings.min_recording_ms as u64)
            .ok_or_else(|| "No audio captured".to_string())?;
        tm.transcribe(samples).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Record a short audio clip and transcribe it. Used for the "speak trigger word" feature.
#[tauri::command]
pub async fn record_and_transcribe(app: AppHandle) -> Result<String, String> {
    use tauri::Manager;
    let am = app.state::<Arc<AudioRecordingManager>>().inner().clone();
    let tm = app.state::<Arc<TranscriptionManager>>().inner().clone();
    let settings = get_settings(&app);

    tokio::task::spawn_blocking(move || {
        tm.initiate_model_load();
        am.start_recording(settings.selected_microphone.clone())
            .map_err(|e| e.to_string())?;

        // Record for 3 seconds
        std::thread::sleep(std::time::Duration::from_secs(3));

        let samples = am
            .stop_recording_with_min_duration(settings.min_recording_ms as u64)
            .ok_or_else(|| "No audio captured".to_string())?;
        tm.transcribe(samples).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}
