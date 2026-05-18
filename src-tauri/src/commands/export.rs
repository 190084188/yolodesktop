use crate::db::{queries, DbState};
use crate::errors::AppError;
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

#[tauri::command]
pub async fn export_onnx(
    app: AppHandle,
    state: State<'_, DbState>,
    run_id: String,
    checkpoint_id: Option<String>,
) -> Result<String, AppError> {
    let id = Uuid::new_v4().to_string();

    let checkpoint_path = if let Some(cid) = &checkpoint_id {
        let checkpoints = queries::list_checkpoints(&state, &run_id)?;
        checkpoints.iter()
            .find(|c| &c.id == cid)
            .map(|c| c.file_path.clone())
            .ok_or_else(|| AppError::NotFound("Checkpoint not found".into()))?
    } else {
        let checkpoints = queries::list_checkpoints(&state, &run_id)?;
        checkpoints.last()
            .map(|c| c.file_path.clone())
            .or_else(|| {
                let run = queries::get_training_run(&state, &run_id).ok()?;
                run.checkpoint_dir.map(|d| format!("{}/weights/best.pt", d))
            })
            .ok_or_else(|| AppError::NotFound("No checkpoint available".into()))?
    };

    let export_dir = dirs_next::data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("yolodesktop")
        .join("exports")
        .join(&id);
    std::fs::create_dir_all(&export_dir)?;

    let python = crate::python::venv::VenvManager::detect_system_python()?;
    let script = std::env::current_dir()
        .unwrap()
        .join("../python/export_onnx.py");

    app.emit("export:log", "Starting ONNX export...").ok();

    let output = std::process::Command::new(&python)
        .arg(script.to_str().unwrap())
        .args(["--weights", &checkpoint_path, "--output", export_dir.to_str().unwrap()])
        .output()
        .map_err(|e| AppError::CommandFailed(e.to_string()))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    app.emit("export:log", &format!("stdout: {}", stdout)).ok();
    if !stderr.is_empty() {
        app.emit("export:log", &format!("stderr: {}", stderr)).ok();
    }

    if !output.status.success() {
        return Err(AppError::CommandFailed(stderr.to_string()));
    }

    let mut exported_path = String::new();
    for line in stdout.lines() {
        if let Some(path) = line.strip_prefix("EXPORTED:") {
            exported_path = path.trim().to_string();
        }
    }

    let file_size = std::fs::metadata(&exported_path)
        .map(|m| m.len() as i64)
        .ok();

    let row = queries::ExportedModelRow {
        id: id.clone(),
        run_id,
        checkpoint_id,
        format: "onnx".to_string(),
        file_path: exported_path.clone(),
        file_size,
        exported_at: chrono::Utc::now().to_rfc3339(),
    };
    queries::create_exported_model(&state, &row)?;

    app.emit("export:log", &format!("Export complete: {}", exported_path)).ok();
    Ok(id)
}

#[tauri::command]
pub async fn list_exported_models(
    state: State<'_, DbState>,
    run_id: String,
) -> Result<Vec<queries::ExportedModelRow>, AppError> {
    queries::list_exported_models(&state, &run_id)
}
