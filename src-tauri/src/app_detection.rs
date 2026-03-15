#![allow(unexpected_cfgs)]
/// Active application detection module
/// Provides cross-platform functionality to detect the currently focused application

#[cfg(target_os = "macos")]
pub mod macos {
    use cocoa::base::{id, nil};
    use cocoa::foundation::{NSAutoreleasePool, NSString};
    use objc::{class, msg_send};
    use objc::sel;
    use objc::sel_impl;

    /// Get the bundle identifier of the currently focused application
    pub fn get_active_app_bundle_id() -> Option<String> {
        unsafe {
            let _pool = NSAutoreleasePool::new(nil);

            // Get the shared NSWorkspace singleton
            let workspace: id = msg_send![class!(NSWorkspace), sharedWorkspace];
            let active_app: id = msg_send![workspace, frontmostApplication];

            if active_app.is_null() {
                return None;
            }

            let bundle_id: id = msg_send![active_app, bundleIdentifier];
            if bundle_id.is_null() {
                return None;
            }

            // Convert NSString to Rust String
            let c_str: *const u8 = msg_send![bundle_id, UTF8String];
            if c_str.is_null() {
                return None;
            }

            let bundle_id_str = std::ffi::CStr::from_ptr(c_str as *const i8)
                .to_string_lossy()
                .into_owned();

            Some(bundle_id_str)
        }
    }

    /// Get the localized name of the currently focused application
    pub fn get_active_app_name() -> Option<String> {
        unsafe {
            let _pool = NSAutoreleasePool::new(nil);

            // Get the shared NSWorkspace singleton
            let workspace: id = msg_send![class!(NSWorkspace), sharedWorkspace];
            let active_app: id = msg_send![workspace, frontmostApplication];

            if active_app.is_null() {
                return None;
            }

            let app_name: id = msg_send![active_app, localizedName];
            if app_name.is_null() {
                return None;
            }

            // Convert NSString to Rust String
            let c_str: *const u8 = msg_send![app_name, UTF8String];
            if c_str.is_null() {
                return None;
            }

            let name_str = std::ffi::CStr::from_ptr(c_str as *const i8)
                .to_string_lossy()
                .into_owned();

            Some(name_str)
        }
    }

    fn nsstring_to_string(value: id) -> Option<String> {
        if value.is_null() {
            return None;
        }

        unsafe {
            let c_str: *const u8 = msg_send![value, UTF8String];
            if c_str.is_null() {
                return None;
            }

            Some(
                std::ffi::CStr::from_ptr(c_str as *const i8)
                    .to_string_lossy()
                    .into_owned(),
            )
        }
    }

    /// Get bundle identifier and display name from a .app bundle path.
    pub fn get_app_info_from_path(path: &str) -> Option<(String, String)> {
        unsafe {
            let _pool = NSAutoreleasePool::new(nil);
            let ns_path = NSString::alloc(nil).init_str(path);
            let bundle: id = msg_send![class!(NSBundle), bundleWithPath: ns_path];

            if bundle.is_null() {
                return None;
            }

            let bundle_id: id = msg_send![bundle, bundleIdentifier];
            let bundle_id_str = nsstring_to_string(bundle_id)?;

            let display_key = NSString::alloc(nil).init_str("CFBundleDisplayName");
            let mut name: id = msg_send![bundle, objectForInfoDictionaryKey: display_key];
            if name.is_null() {
                let name_key = NSString::alloc(nil).init_str("CFBundleName");
                name = msg_send![bundle, objectForInfoDictionaryKey: name_key];
            }

            let fallback = nsstring_to_string(msg_send![ns_path, lastPathComponent])
                .unwrap_or_else(|| bundle_id_str.clone());
            let name_str = nsstring_to_string(name).unwrap_or(fallback);

            Some((bundle_id_str, name_str.trim_end_matches(".app").to_string()))
        }
    }

}

#[cfg(target_os = "windows")]
pub mod windows {
    use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowTextW};

    /// Get the window title of the currently focused application (Windows)
    pub fn get_active_app_title() -> Option<String> {
        unsafe {
            let hwnd = GetForegroundWindow();

            if hwnd.is_invalid() {
                return None;
            }

            let mut title = vec![0u16; 512];
            let len = GetWindowTextW(hwnd, &mut title);

            if len == 0 {
                return None;
            }

            let title_str = String::from_utf16_lossy(&title[..len as usize]);
            Some(title_str)
        }
    }
}

/// Get the active application identifier (platform-dependent)
/// On macOS: returns bundle identifier (e.g., "com.apple.Terminal")
/// On Windows: returns window title
/// On other platforms: returns None
pub fn get_active_app_id() -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        macos::get_active_app_bundle_id()
    }
    #[cfg(target_os = "windows")]
    {
        windows::get_active_app_title()
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        None
    }
}

/// Get the active application name (platform-dependent)
/// On macOS: returns localized app name
/// On Windows: returns window title
/// On other platforms: returns None
pub fn get_active_app_name() -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        macos::get_active_app_name()
    }
    #[cfg(target_os = "windows")]
    {
        windows::get_active_app_title()
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        None
    }
}

