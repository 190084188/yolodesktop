use crate::db::{queries, DbState};
use crate::errors::AppError;
use crate::python::manager::PythonProcess;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

pub struct TrainingState {
    pub active_process: Mutex<Option<PythonProcess>>,
}

#[tauri::command]
pub async fn start_training(
    app: AppHandle,
    state: State<'_, DbState>,
    training_state: State<'_, TrainingState>,
    project_id: String,
    dataset_id: String,
    env_id: String,
    config_yaml: String,
    model: Option<String>,
) -> Result<String, AppError> {
    let run_id = Uuid::new_v4().to_string();
    let env = queries::get_env(&state, &env_id)?;

    let config_dir = dirs_next::data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("yolodesktop")
        .join("runs")
        .join(&run_id);
    std::fs::create_dir_all(&config_dir)?;

    let config_path = config_dir.join("config.yaml");
    std::fs::write(&config_path, &config_yaml)?;

    let checkpoint_dir = config_dir.join("checkpoints");
    std::fs::create_dir_all(&checkpoint_dir)?;

    let row = queries::TrainingRunRow {
        id: run_id.clone(),
        project_id: project_id.clone(),
        dataset_id: dataset_id.clone(),
        env_id,
        config_yaml: config_yaml.clone(),
        status: "running".to_string(),
        started_at: Some(chrono::Utc::now().to_rfc3339()),
        ended_at: None,
        best_map50: None,
        best_epoch: None,
        checkpoint_dir: Some(checkpoint_dir.to_str().unwrap().to_string()),
    };
    queries::create_training_run(&state, &row)?;

    let script = std::env::current_dir()
        .unwrap()
        .join("../python/train.py");

    let model_path = model.unwrap_or_else(|| "yolov8n.pt".to_string());

    let process = PythonProcess::new();
    let app_handle = app.clone();
    let python_path = env.python_path.clone();
    let config_path_str = config_path.to_str().unwrap().to_string();
    let project_dir = checkpoint_dir.to_str().unwrap().to_string();

    process.spawn(
        &python_path,
        script.to_str().unwrap(),
        &[
            "--config", &config_path_str,
            "--model", &model_path,
            "--project", &project_dir,
            "--name", "train",
        ],
        move |line| {
            if let Some(json_str) = line.strip_prefix("METRICS:") {
                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(json_str) {
                    let msg_type = parsed["type"].as_str().unwrap_or("");
                    if msg_type == "metrics" || msg_type == "complete" {
                        app_handle.emit("training:metrics", &parsed).ok();
                    }
                }
            } else if line.contains("ERROR") || line.contains("Traceback") {
                app_handle.emit("training:error", line).ok();
            }
            app_handle.emit("training:log", line).ok();
        },
    )?;

    *training_state.active_process.lock().unwrap() = Some(process);

    Ok(run_id)
}

#[tauri::command]
pub async fn stop_training(
    state: State<'_, DbState>,
    training_state: State<'_, TrainingState>,
    run_id: String,
) -> Result<(), AppError> {
    if let Some(ref proc) = *training_state.active_process.lock().unwrap() {
        proc.kill()?;
    }
    queries::update_training_status(&state, &run_id, "stopped")?;
    Ok(())
}

#[tauri::command]
pub async fn list_training_runs(
    state: State<'_, DbState>,
    project_id: String,
) -> Result<Vec<queries::TrainingRunRow>, AppError> {
    queries::list_training_runs(&state, &project_id)
}

#[tauri::command]
pub async fn get_training_run(
    state: State<'_, DbState>,
    id: String,
) -> Result<queries::TrainingRunRow, AppError> {
    queries::get_training_run(&state, &id)
}

#[tauri::command]
pub async fn list_checkpoints(
    state: State<'_, DbState>,
    run_id: String,
) -> Result<Vec<queries::CheckpointRow>, AppError> {
    queries::list_checkpoints(&state, &run_id)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ModelInfo {
    pub filename: String,
    pub path: String,
    pub size_bytes: u64,
    pub modified_at: f64,
}

#[tauri::command]
pub async fn scan_models(
    project_id: Option<String>,
    extra_paths: Option<String>,
) -> Result<Vec<ModelInfo>, AppError> {
    let script = {
        let exe_dir = std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|p| p.to_path_buf()))
            .unwrap_or_default();
        let dev_path = exe_dir.join("../../python/scan_models.py");
        let prod_path = exe_dir.join("python/scan_models.py");
        if dev_path.exists() {
            dev_path
        } else if prod_path.exists() {
            prod_path
        } else {
            std::env::current_dir()
                .unwrap_or_default()
                .join("../python/scan_models.py")
        }
    };
    let python = "python";
    let project_root = project_id.unwrap_or_else(|| ".".to_string());
    let extras = extra_paths.unwrap_or_default();

    let output = std::process::Command::new(python)
        .arg(script.to_str().unwrap())
        .arg(&project_root)
        .arg(&extras)
        .output()
        .map_err(|e| AppError::CommandFailed(format!("Model scan failed: {}", e)))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    serde_json::from_str(&stdout)
        .map_err(|e| AppError::CommandFailed(format!("Parse error: {}", e)))
}
