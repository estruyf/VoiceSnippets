use tauri::{image::Image, AppHandle, Manager};

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum TrayIconState {
    Idle,
    Recording,
    Processing,
}

/// Get the icon path for the given state
pub fn get_icon_path(state: TrayIconState) -> &'static str {
    match state {
        TrayIconState::Idle => "icons/32x32.png",
        TrayIconState::Recording => "icons/32x32_recording.png",
        TrayIconState::Processing => "icons/32x32_processing.png",
    }
}

/// Change the tray icon based on the current state
pub fn change_tray_icon(app: &AppHandle, state: TrayIconState) {
    if let Some(tray) = app.tray_by_id("main") {
        let icon_path = get_icon_path(state);
        match app
            .path()
            .resolve(icon_path, tauri::path::BaseDirectory::Resource)
        {
            Ok(resolved_path) => {
                match Image::from_path(&resolved_path) {
                    Ok(icon) => {
                        if let Err(e) = tray.set_icon(Some(icon)) {
                            log::error!("Failed to set tray icon: {}", e);
                        }
                        // Use template mode so icons adapt to menu bar theme
                        let _ = tray.set_icon_as_template(true);
                    }
                    Err(e) => {
                        log::error!("Failed to create icon from path {}: {}", icon_path, e);
                    }
                }
            }
            Err(e) => {
                log::error!("Failed to resolve icon path {}: {}", icon_path, e);
            }
        }
    }
}
