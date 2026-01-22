#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;

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
            
            // Title bar height tuned for Windows DPI (avoid overlap with YTM view).
            let title_height = 48.0;
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
            .auto_resize();

            main.add_child(
                ui_builder,
                tauri::LogicalPosition::new(0.0, 0.0),
                tauri::LogicalSize::new(width, title_height),
            )?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
