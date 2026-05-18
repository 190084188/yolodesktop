mod commands;
mod db;
mod errors;
mod parser;
mod python;

use db::{migrate, DbState};

pub fn run() {
    let app_dir = dirs_next::data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("yolodesktop");
    std::fs::create_dir_all(&app_dir).ok();
    let db_path = app_dir.join("yolodesktop.db");

    let db_state = DbState::new(db_path.to_str().unwrap())
        .expect("Failed to open database");
    {
        let conn = db_state.conn.lock().unwrap();
        migrate::run_migrations(&conn).expect("Failed to run migrations");
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(db_state)
        .invoke_handler(tauri::generate_handler![])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
