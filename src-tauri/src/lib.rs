use std::{
  fs,
  net::{SocketAddr, TcpStream},
  path::PathBuf,
  thread,
  time::{Duration, Instant},
};

use tauri::{LogicalSize, Manager, Size, WebviewWindow};
use tauri_plugin_shell::ShellExt;

fn fit_main_window(window: &WebviewWindow) -> tauri::Result<()> {
  const DEFAULT_WIDTH: f64 = 1280.0;
  const DEFAULT_HEIGHT: f64 = 820.0;
  const MIN_WIDTH: f64 = 1100.0;
  const MIN_HEIGHT: f64 = 760.0;
  const TARGET_AREA_RATIO: f64 = 0.8;

  let mut target_width = DEFAULT_WIDTH;
  let mut target_height = DEFAULT_HEIGHT;

  if let Some(monitor) = window.current_monitor()? {
    let monitor_size = monitor.size().to_logical::<f64>(monitor.scale_factor());
    let edge_ratio = TARGET_AREA_RATIO.sqrt();
    let min_width = MIN_WIDTH.min(monitor_size.width);
    let min_height = MIN_HEIGHT.min(monitor_size.height);

    target_width = (monitor_size.width * edge_ratio)
      .max(min_width)
      .min(monitor_size.width);
    target_height = (monitor_size.height * edge_ratio)
      .max(min_height)
      .min(monitor_size.height);
  }

  window.set_size(Size::Logical(LogicalSize::new(
    target_width,
    target_height,
  )))?;
  window.center()?;
  window.show()?;
  window.set_focus()?;

  Ok(())
}

fn project_root() -> PathBuf {
  PathBuf::from(env!("CARGO_MANIFEST_DIR"))
    .parent()
    .expect("src-tauri should live under the project root")
    .to_path_buf()
}

fn wait_for_backend_ready(port: u16, timeout: Duration) -> tauri::Result<()> {
  let deadline = Instant::now() + timeout;
  let address: SocketAddr = format!("127.0.0.1:{port}")
    .parse()
    .expect("invalid backend address");

  while Instant::now() < deadline {
    if TcpStream::connect_timeout(&address, Duration::from_millis(500)).is_ok() {
      return Ok(());
    }

    thread::sleep(Duration::from_millis(250));
  }

  Err(tauri::Error::AssetNotFound(format!(
    "backend did not become ready on 127.0.0.1:{port}"
  )))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      app.handle().plugin(tauri_plugin_shell::init())?;

      let sidecar = if cfg!(debug_assertions) {
        let repo_root = project_root();
        let server_entry = repo_root.join("server.js");
        let node_binary = std::env::var("WORKHORSE_NODE_BIN").unwrap_or_else(|_| "node".into());

        app
          .shell()
          .command(node_binary)
          .args([server_entry.to_string_lossy().into_owned()])
          .current_dir(repo_root)
          .env("PORT", "12621")
      } else {
        let resource_dir = app.path().resource_dir()?;
        let runtime_dir = resource_dir.join("sidecar-runtime");
        let launcher_name = if cfg!(target_os = "windows") {
          "workhorse-server.cmd"
        } else {
          "workhorse-server"
        };
        let launcher_path = runtime_dir.join(launcher_name);
        let app_data_dir = app.path().app_data_dir()?;
        fs::create_dir_all(&app_data_dir)?;

        let mut command = app
          .shell()
          .command(launcher_path.to_string_lossy().into_owned())
          .current_dir(&app_data_dir)
          .env("PORT", "12621")
          .env("WORKHORSE_APP_DATA_DIR", app_data_dir.to_string_lossy().to_string());

        if let Ok(home_dir) = app.path().home_dir() {
          command = command.env(
            "WORKHORSE_WORKSPACE_ROOT",
            home_dir.to_string_lossy().to_string(),
          );
        }

        command
      };

      let (mut rx, _child) = sidecar
        .spawn()
        .expect("failed to spawn workhorse-server sidecar");

      wait_for_backend_ready(12621, Duration::from_secs(20))
        .expect("failed to start backend sidecar");

      tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
          if let tauri_plugin_shell::process::CommandEvent::Stdout(line) = event {
            println!("sidecar: {}", String::from_utf8_lossy(&line));
          } else if let tauri_plugin_shell::process::CommandEvent::Stderr(line) = event {
            eprintln!("sidecar error: {}", String::from_utf8_lossy(&line));
          }
        }
      });

      if let Some(window) = app.get_webview_window("main") {
        fit_main_window(&window)?;
      }

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
