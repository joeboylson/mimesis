//! The Ochre app: starts Ochre's server if nothing is running on its port,
//! then opens a window onto it. The page is the same one a browser gets, so
//! the app and `ochre open` never drift apart.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::time::{Duration, Instant};

use ochre::{paths, server};
use tauri::{WebviewUrl, WebviewWindowBuilder};

const START_TIMEOUT: Duration = Duration::from_secs(5);

fn main() {
    let port = paths::port();
    tauri::Builder::default()
        .setup(move |app| {
            if !server::is_running(port) {
                tauri::async_runtime::spawn(async move {
                    if let Err(error) = server::serve(port).await {
                        eprintln!("ochre: {error:#}");
                    }
                });
                let started = Instant::now();
                while !server::is_running(port) && started.elapsed() < START_TIMEOUT {
                    std::thread::sleep(Duration::from_millis(50));
                }
            }
            let address = paths::address(port).parse()?;
            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(address))
                .title("Ochre")
                .inner_size(1440.0, 900.0)
                .min_inner_size(900.0, 600.0)
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Ochre couldn't start");
}
