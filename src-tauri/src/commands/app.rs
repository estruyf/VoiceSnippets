use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;

#[derive(serde::Serialize)]
pub struct AppInfo {
    pub id: String,
    pub name: String,
}

#[tauri::command]
pub fn get_app_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

#[tauri::command]
pub fn get_log_dir_path(app: AppHandle) -> Result<String, String> {
    let log_dir = app
        .path()
        .app_log_dir()
        .map_err(|e| format!("Failed to get log directory: {}", e))?;

    Ok(log_dir.to_string_lossy().to_string())
}

#[tauri::command]
pub fn open_log_dir(app: AppHandle) -> Result<(), String> {
    let log_dir = app
        .path()
        .app_log_dir()
        .map_err(|e| format!("Failed to get log directory: {}", e))?;

    let path = log_dir.to_string_lossy().as_ref().to_string();
    app.opener()
        .open_path(path, None::<String>)
        .map_err(|e| format!("Failed to open log directory: {}", e))?;

    Ok(())
}

#[tauri::command]
pub fn get_app_dir_path(app: AppHandle) -> Result<String, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    Ok(app_data_dir.to_string_lossy().to_string())
}

#[tauri::command]
pub fn open_app_data_dir(app: AppHandle) -> Result<(), String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    let path = app_data_dir.to_string_lossy().as_ref().to_string();
    app.opener()
        .open_path(path, None::<String>)
        .map_err(|e| format!("Failed to open app data directory: {}", e))?;

    Ok(())
}

#[tauri::command]
pub fn get_app_info_from_path(_path: String) -> Result<AppInfo, String> {
    #[cfg(target_os = "macos")]
    {
        crate::app_detection::macos::get_app_info_from_path(&_path)
            .map(|(id, name)| AppInfo { id, name })
            .ok_or_else(|| "Failed to read app bundle info".to_string())
    }
    #[cfg(not(target_os = "macos"))]
    {
        Err("App bundle info is only supported on macOS.".to_string())
    }
}
