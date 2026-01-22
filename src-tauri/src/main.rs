#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

#[tauri::command]
fn ytmview_navigate_default(app: tauri::AppHandle) {
    if let Some(webview) = app.get_webview("ytmview") {
        let _ = webview.eval("window.location.href = 'https://music.youtube.com';");
    }
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![ytmview_navigate_default])
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
                .inner_size(1280.0, 800.0)
                .visible(true)
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
            .auto_resize();

            main.add_child(
                ytm_builder,
                tauri::LogicalPosition::new(0.0, title_height),
                tauri::LogicalSize::new(width, content_height),
            )?;

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

            // Listen for window resize to manually adjust the UI webview width
            let title_bar_height = title_height;
            let main_clone = main.clone();
            main.on_window_event(move |event| {
                if let tauri::WindowEvent::Resized(_) = event {
                    if let Some(ui_webview) = main_clone.get_webview("ui") {
                        let scale = main_clone.scale_factor().unwrap_or(1.0);
                        if let Ok(size) = main_clone.inner_size() {
                            let new_width = size.width as f64 / scale;
                            let _ = ui_webview.set_size(tauri::LogicalSize::new(new_width, title_bar_height));
                        }
                    }
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
