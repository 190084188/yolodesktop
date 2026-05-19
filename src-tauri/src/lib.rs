use crate::errors::AppError;

mod commands;
mod db;
mod errors;
mod parser;
mod python;

use commands::training::TrainingState;
use db::{migrate, DbState};
use std::sync::Mutex;

#[tauri::command]
async fn pick_folder() -> Result<Option<String>, AppError> {
    use tauri_plugin_dialog::DialogExt;
    // This is a placeholder — the dialog plugin requires a window handle
    // For now, return None and let the frontend handle path input manually
    Ok(None)
}

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
        .plugin(tauri_plugin_dialog::init())
        .manage(db_state)
        .manage(TrainingState {
            active_process: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            pick_folder,
            commands::env::check_prereqs,
            commands::env::check_gpu_diagnostics,
            commands::env::install_yolo,
            commands::env::list_envs,
            commands::env::delete_env,
            commands::dataset::detect_dataset_format,
            commands::dataset::get_dataset_stats,
            commands::dataset::import_dataset,
            commands::dataset::list_datasets,
            commands::dataset::get_dataset,
            commands::dataset::delete_dataset,
            commands::dataset::search_kaggle,
            commands::dataset::search_huggingface,
            commands::dataset::search_roboflow,
            commands::dataset::check_connectivity,
            commands::dataset::scan_dataset_folders,
            commands::dataset::get_dataset_setting,
            commands::dataset::set_dataset_setting,
            commands::training::start_training,
            commands::training::stop_training,
            commands::training::list_training_runs,
            commands::training::get_training_run,
            commands::training::list_checkpoints,
            commands::export::export_onnx,
            commands::export::list_exported_models,
            commands::workspace::create_project,
            commands::workspace::list_projects,
            commands::workspace::delete_project,
            commands::plugins::scan_plugins,
            commands::plugins::install_plugin,
            commands::plugins::remove_plugin,
            commands::plugins::list_installed_plugins,
            parser::model_config::parse_model_config,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
