use std::fs;
use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;

#[derive(Default)]
struct BackendChild(Mutex<Option<CommandChild>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let app = tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
    .manage(BackendChild::default())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      if !cfg!(debug_assertions) {
        let resource_dir = app.path().resource_dir()?;
        let app_data_dir = app.path().app_data_dir()?;
        fs::create_dir_all(&app_data_dir)?;
        let script = resource_dir.join("runtime/app/server/index.mjs");
        let compiler = resource_dir.join("runtime/app/bin/silverc");
        let (mut events, child) = app
          .shell()
          .sidecar("node")?
          .arg(script)
          .env("HOST", "127.0.0.1")
          .env("PORT", "4310")
          .env("STUDIO_DATA_DIR", app_data_dir)
          .env("SILVERC_BIN", compiler)
          .spawn()?;
        *app.state::<BackendChild>().0.lock().unwrap() = Some(child);
        tauri::async_runtime::spawn(async move {
          while let Some(event) = events.recv().await {
            if let tauri_plugin_shell::process::CommandEvent::Stderr(bytes) = event {
              log::error!("studio sidecar: {}", String::from_utf8_lossy(&bytes));
            }
          }
        });
      }
      Ok(())
    })
    .build(tauri::generate_context!())
    .expect("error while building tauri application");

  app.run(|handle, event| {
    if let tauri::RunEvent::Exit = event {
      if let Some(child) = handle.state::<BackendChild>().0.lock().unwrap().take() {
        let _ = child.kill();
      }
    }
  });
}
