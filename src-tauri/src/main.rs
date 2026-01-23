#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

// Injected into the YTM webview to forward player progress/state to the backend
const YTM_PROGRESS_HOOK: &str = include_str!("../../src/renderer/ytmview/scripts/tauri-progress-hook.js");

#[tauri::command]
fn ytmview_navigate_default(app: tauri::AppHandle) {
    if let Some(webview) = app.get_webview("ytmview") {
        let _ = webview.eval("window.location.href = 'https://music.youtube.com';");
    }
}

#[tauri::command]
fn set_progress_bar(window: tauri::Window, progress: f64) {
    // progress is 0-100 percentage, convert to u64 for taskbar
    let progress_value = progress.max(0.0).min(100.0).round() as u64;
    println!("[progress-bar] set progress: {}%", progress_value);
    let _ = window.set_progress_bar(tauri::window::ProgressBarState {
        progress: Some(progress_value),
        status: None,
    });
}

#[tauri::command]
fn clear_progress_bar(window: tauri::Window) {
    let _ = window.set_progress_bar(tauri::window::ProgressBarState {
        progress: None,
        status: None,
    });
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, Some(vec!["--start-minimized"])))
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            ytmview_navigate_default,
            set_progress_bar,
            clear_progress_bar
        ])
        .setup(|app| {
            // Create tray menu
            let show_hide = MenuItem::with_id(app, "show_hide", "Show/Hide Window", true, None::<&str>)?;
            let play_pause = MenuItem::with_id(app, "play_pause", "Play/Pause", true, None::<&str>)?;
            let previous = MenuItem::with_id(app, "previous", "Previous", true, None::<&str>)?;
            let next = MenuItem::with_id(app, "next", "Next", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

            let menu = Menu::with_items(
                app,
                &[&show_hide, &play_pause, &previous, &next, &quit],
            )?;

            // Get the icon path
            let icon_path = if cfg!(debug_assertions) {
                // In dev mode, use absolute path from project root
                std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                    .parent()
                    .expect("failed to get parent dir")
                    .join("src/assets/icons/tray.ico")
            } else {
                app.path()
                    .resource_dir()
                    .expect("failed to get resource dir")
                    .join("icons/tray.ico")
            };

            // Create tray icon
            let _tray = TrayIconBuilder::new()
                .icon(tauri::image::Image::from_path(&icon_path).expect("failed to load tray icon"))
                .menu(&menu)
                .tooltip("YouTube Music Desktop App")
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show_hide" => {
                        if let Some(window) = app.get_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                    "play_pause" => {
                        if let Some(webview) = app.get_webview("ytmview") {
                            let _ = webview.eval("document.querySelector('#play-pause-button')?.click();");
                        }
                    }
                    "previous" => {
                        if let Some(webview) = app.get_webview("ytmview") {
                            let _ = webview.eval("document.querySelector('.previous-button')?.click();");
                        }
                    }
                    "next" => {
                        if let Some(webview) = app.get_webview("ytmview") {
                            let _ = webview.eval("document.querySelector('.next-button')?.click();");
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_window("main") {
                            if window.is_minimized().unwrap_or(false) {
                                let _ = window.unminimize();
                                let _ = window.set_focus();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            // Load settings from store
            use tauri_plugin_store::StoreExt;
            let store = app.store("config.json").expect("failed to load store");
            
            // Check if we should start minimized
            let start_minimized = if std::env::args().any(|arg| arg == "--start-minimized") {
                true
            } else {
                store.get("general.startMinimized").and_then(|v| v.as_bool()).unwrap_or(false)
            };

            let ui_url = if cfg!(debug_assertions) {
                let dev_url = app
                    .config()
                    .build
                    .dev_url
                    .as_ref()
                    .map(|url| url.as_str())
                    .unwrap_or("http://localhost:5173");
                format!("{}/windows/main/index.html", dev_url.trim_end_matches('/'))
            } else {
                "app://localhost/windows/main/index.html".to_string()
            };

            let main = tauri::window::WindowBuilder::new(app, "main")
                .title("YouTube Music Desktop App")
                .decorations(false)
                .inner_size(1280.0, 800.0)
                .visible(!start_minimized)
                .build()?;

            // Use the logical size (DPI-independent) for webview layout.
            let scale_factor = main.scale_factor().unwrap_or(1.0);
            let physical_size = main.inner_size().unwrap();
            let width = physical_size.width as f64 / scale_factor;
            let height = physical_size.height as f64 / scale_factor;
            
            // Title bar height in logical pixels
            let title_height = 36.0;
            let content_height = (height - title_height).max(0.0);
            
            println!("scale_factor: {}, width: {}, height: {}", scale_factor, width, height);

            // YTM webview fills the rest of the window below the title bar.
            let ytm_builder = tauri::webview::WebviewBuilder::new(
                "ytmview",
                tauri::WebviewUrl::External(
                    "https://music.youtube.com"
                        .parse()
                        .expect("invalid YTM url"),
                ),
            )
            .initialization_script(YTM_PROGRESS_HOOK)
            .auto_resize();

            main.add_child(
                ytm_builder,
                tauri::LogicalPosition::new(0.0, title_height),
                tauri::LogicalSize::new(width, content_height),
            )?;

            // Ensure progress hook is injected even if initialization_script is skipped
            if let Some(wv) = main.get_webview("ytmview") {
                let _ = wv.eval(YTM_PROGRESS_HOOK);
            }

            // UI webview on top bar area (added after YTM to ensure it is above).
            let ui_builder = tauri::webview::WebviewBuilder::new(
                "ui",
                tauri::WebviewUrl::External(ui_url.parse().expect("invalid UI url")),
            )
            .transparent(true);

            main.add_child(
                ui_builder,
                tauri::LogicalPosition::new(0.0, 0.0),
                tauri::LogicalSize::new(width, title_height),
            )?;

            // In dev builds, open the YTM webview devtools so console logs from injected scripts are visible
            // if cfg!(debug_assertions) {
            //     if let Some(wv) = main.get_webview("ytmview") {
            //         let _ = wv.open_devtools();
            //     }
            // }

            // Listen for window resize to manually adjust the UI webview width
            let title_bar_height = title_height;
            let main_clone = main.clone();
            let store_clone = store.clone();
            main.on_window_event(move |event| {
                match event {
                    tauri::WindowEvent::Resized(_) => {
                        if let Some(ui_webview) = main_clone.get_webview("ui") {
                            let scale = main_clone.scale_factor().unwrap_or(1.0);
                            if let Ok(size) = main_clone.inner_size() {
                                let new_width = size.width as f64 / scale;
                                let _ = ui_webview.set_size(tauri::LogicalSize::new(new_width, title_bar_height));
                            }
                        }
                    }
                    tauri::WindowEvent::CloseRequested { api, .. } => {
                        // Check if we should hide to tray instead of closing
                        let _ = store_clone.reload(); // refresh from disk in case renderer updated settings
                        // Prefer dotted key; fall back to `general` object for older saves
                        let hide_to_tray = store_clone
                            .get("general.hideToTrayOnClose")
                            .and_then(|v| v.as_bool())
                            .or_else(|| {
                                store_clone
                                    .get("general")
                                    .and_then(|v| v.get("hideToTrayOnClose").cloned())
                                    .and_then(|v| v.as_bool())
                            })
                            .unwrap_or(false);

                        println!(
                            "[store:get backend] general.hideToTrayOnClose => {}",
                            hide_to_tray
                        );
                        
                        if hide_to_tray {
                            api.prevent_close();
                            let _ = main_clone.hide();
                        }
                    }
                    _ => {}
                }
            });

            // Register global shortcuts for media control
            // Using Media keys as default (can be configured later via store)
            let app_handle = app.handle().clone();
            
            // Play/Pause - MediaPlayPause
            if let Ok(shortcut) = "MediaPlayPause".parse::<Shortcut>() {
                let ytmview_handle = app_handle.clone();
                let _ = app.global_shortcut().on_shortcut(shortcut, move |_app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        if let Some(webview) = ytmview_handle.get_webview("ytmview") {
                            let _ = webview.eval("document.querySelector('#play-pause-button')?.click();");
                        }
                    }
                });
            }

            // Next - MediaTrackNext  
            if let Ok(shortcut) = "MediaTrackNext".parse::<Shortcut>() {
                let ytmview_handle = app_handle.clone();
                let _ = app.global_shortcut().on_shortcut(shortcut, move |_app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        if let Some(webview) = ytmview_handle.get_webview("ytmview") {
                            let _ = webview.eval("document.querySelector('.next-button')?.click();");
                        }
                    }
                });
            }

            // Previous - MediaTrackPrevious
            if let Ok(shortcut) = "MediaTrackPrevious".parse::<Shortcut>() {
                let ytmview_handle = app_handle.clone();
                let _ = app.global_shortcut().on_shortcut(shortcut, move |_app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        if let Some(webview) = ytmview_handle.get_webview("ytmview") {
                            let _ = webview.eval("document.querySelector('.previous-button')?.click();");
                        }
                    }
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
