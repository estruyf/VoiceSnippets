use crate::settings::{get_settings, write_settings};
use tauri::AppHandle;

#[tauri::command]
pub fn mark_permissions_requested(app: AppHandle) -> Result<(), String> {
    let mut settings = get_settings(&app);
    settings.permissions_requested = true;
    write_settings(&app, settings);
    Ok(())
}

#[tauri::command]
pub fn request_microphone_permission(_app: AppHandle) -> Result<bool, String> {
    #[cfg(target_os = "macos")]
    {
        // Try to access microphone which will trigger the system permission dialog
        use cpal::traits::HostTrait;
        let host = cpal::default_host();
        let _ = host.input_devices(); // This triggers the permission prompt
        Ok(true)
    }
    #[cfg(not(target_os = "macos"))]
    {
        Ok(true)
    }
}

#[tauri::command]
pub fn get_permissions_status(app: AppHandle) -> Result<PermissionsStatus, String> {
    let settings = get_settings(&app);

    #[cfg(target_os = "macos")]
    let microphone_status =
        check_microphone_permission().unwrap_or_else(|_| "undetermined".to_string());

    #[cfg(not(target_os = "macos"))]
    let microphone_status = "granted".to_string();

    Ok(PermissionsStatus {
        permissions_requested: settings.permissions_requested,
        microphone_status,
        is_macos: cfg!(target_os = "macos"),
    })
}

#[cfg(target_os = "macos")]
#[tauri::command]
pub fn check_microphone_permission() -> Result<String, String> {
    // Check if microphone access is available
    // On macOS, we can try to enumerate devices to see if permission was granted
    use cpal::traits::HostTrait;
    let host = cpal::default_host();

    match host.input_devices() {
        Ok(mut devices) => {
            // If we can get at least one device, we have permission
            if devices.next().is_some() {
                Ok("granted".to_string())
            } else {
                // No devices but no error - might mean denied or no hardware
                Ok("denied".to_string())
            }
        }
        Err(_) => Ok("denied".to_string()),
    }
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub fn check_microphone_permission() -> Result<String, String> {
    // On non-macOS platforms, assume permission is granted
    Ok("granted".to_string())
}

#[derive(serde::Serialize)]
pub struct PermissionsStatus {
    pub permissions_requested: bool,
    pub microphone_status: String, // "granted", "denied", "undetermined"
    pub is_macos: bool,
}

#[cfg(target_os = "macos")]
#[allow(dead_code)]
fn is_accessibility_enabled() -> bool {
    unsafe {
        #[link(name = "ApplicationServices", kind = "framework")]
        extern "C" {
            // AXIsProcessTrusted returns a C 'Boolean' which is an unsigned char.
            fn AXIsProcessTrusted() -> u8;
        }
        AXIsProcessTrusted() != 0
    }
}

#[cfg(target_os = "macos")]
#[allow(dead_code)]
fn is_accessibility_trusted_with_prompt(prompt: bool) -> bool {
    use core_foundation::base::TCFType;
    use core_foundation::boolean::CFBoolean;
    use core_foundation::dictionary::CFDictionary;
    use core_foundation::string::CFString;

    // Build a CFDictionary with the key kAXTrustedCheckOptionPrompt -> kCFBooleanTrue
    let key = CFString::new("kAXTrustedCheckOptionPrompt");
    let val = if prompt {
        CFBoolean::true_value()
    } else {
        CFBoolean::false_value()
    };
    let dict = CFDictionary::from_CFType_pairs(&[(key.as_CFType(), val.as_CFType())]);

    unsafe {
        #[link(name = "ApplicationServices", kind = "framework")]
        extern "C" {
            fn AXIsProcessTrustedWithOptions(options: core_foundation::base::CFTypeRef) -> u8;
        }

        AXIsProcessTrustedWithOptions(dict.as_concrete_TypeRef() as core_foundation::base::CFTypeRef)
            != 0
    }
}
