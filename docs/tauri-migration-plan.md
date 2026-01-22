Tauri 2.0 Migration Plan (Windows, minimal-risk)

Scope
- Goal: Replace Electron Forge runtime with Tauri 2.0 while keeping Vite+Vue front-end intact.
- Platforms: Windows only for now.
- Exclude: Auto-update, Discord presence, Last.fm, tray/shortcut parity only for essentials.

Strategy
- Keep front-end build flow: reuse existing Vite output; point Tauri to it.
- Replace Electron main/preload with Tauri Rust commands and built-ins.
- For local server logic, start with a Node sidecar if needed; migrate to Rust later.

Phases
1) Bootstrap
   - Add Tauri 2 dev deps and generate `src-tauri` scaffold.
   - Configure `tauri.conf.json` (app id/name, Windows bundle, disable updater, devPath/distDir).
   - Wire Vite build output to Tauri (adjust `build.outDir` if needed or point Tauri to existing path).

2) Window and Shell
   - Create main window in `src-tauri/src/main.rs` with URL to bundled front-end.
   - Implement tray and menu (using Tauri tray API), match current icons.
   - Register global shortcuts via `tauri::global_shortcut` (only the required ones).

3) IPC / Services
   - Inventory Electron IPC calls and Fastify/socket.io usages; keep only required ones for UI and tray/shortcut flows.
   - Quick path: run existing Node server as Tauri-managed sidecar (`tauri::api::process::Command`), front-end talks HTTP/WebSocket directly.
   - Later optimization: port critical endpoints to Rust commands/events to remove sidecar.

4) Feature Gaps
   - Notifications: switch to `tauri::api::notification` for Windows.
   - Autostart (if needed): use Tauri plugin or stub off for now.
   - Remove deprecated features (Discord, Last.fm) from build/menus if present.

5) Build & Verify
   - Dev loop: `tauri dev` launches window, tray, shortcuts.
   - Release: `tauri build` produces MSI/EXE; smoke-test tray, shortcuts, IPC path.
   - No updater configured; manual distribution.

Risk Mitigation
- Sidecar-first approach minimizes rewrites; Rust ports can be incremental.
- Keep Electron code until parity is confirmed; remove only after Tauri path is stable.
- Use feature toggles/env to switch between Tauri and legacy paths during transition if needed.

Next Steps
- Confirm required shortcuts and tray menu items.
- Decide whether the Fastify/socket.io server must run in v1 (sidecar) or can be deferred/disabled.
- After confirmation, initialize `src-tauri` and set up config/build wiring.
