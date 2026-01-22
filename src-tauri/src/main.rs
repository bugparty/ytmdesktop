#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
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

            let size = main.inner_size().unwrap();
            // Title bar height tuned for Windows DPI (avoid overlap with YTM view).
            let title_height = 60.0;
            let width = size.width as f64;
            let content_height = (size.height as f64 - title_height).max(0.0);

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
