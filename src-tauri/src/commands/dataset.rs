use crate::db::{queries, DbState};
use crate::errors::AppError;
use crate::python::venv::VenvManager;
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

#[derive(Debug, Serialize)]
pub struct DatasetStats {
    pub format: String,
    pub image_count: i32,
    pub class_names: Vec<String>,
    pub class_counts: std::collections::HashMap<String, i32>,
}

#[tauri::command]
pub async fn detect_dataset_format(path: String) -> Result<String, AppError> {
    let python = VenvManager::detect_system_python()?;
    let script = std::env::current_dir()
        .unwrap()
        .join("../python/convert_dataset.py");

    let output = std::process::Command::new(&python)
        .arg(script.to_str().unwrap())
        .args(["--input", &path, "--command", "detect"])
        .output()
        .map_err(|e| AppError::CommandFailed(e.to_string()))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    for line in stdout.lines() {
        if let Some(fmt) = line.strip_prefix("FORMAT:") {
            return Ok(fmt.trim().to_string());
        }
    }
    Ok("unknown".to_string())
}

#[tauri::command]
pub async fn get_dataset_stats(path: String) -> Result<DatasetStats, AppError> {
    let python = VenvManager::detect_system_python()?;
    let script = std::env::current_dir()
        .unwrap()
        .join("../python/convert_dataset.py");

    let output = std::process::Command::new(&python)
        .arg(script.to_str().unwrap())
        .args(["--input", &path, "--command", "stats"])
        .output()
        .map_err(|e| AppError::CommandFailed(e.to_string()))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    for line in stdout.lines() {
        if let Some(json_str) = line.strip_prefix("STATS:") {
            let parsed: serde_json::Value = serde_json::from_str(json_str.trim())?;
            let class_counts: std::collections::HashMap<String, i32> = parsed["class_counts"]
                .as_object()
                .map(|obj| {
                    obj.iter()
                        .map(|(k, v)| (k.clone(), v.as_i64().unwrap_or(0) as i32))
                        .collect()
                })
                .unwrap_or_default();

            return Ok(DatasetStats {
                format: parsed["format"].as_str().unwrap_or("unknown").to_string(),
                image_count: parsed["image_count"].as_i64().unwrap_or(0) as i32,
                class_names: parsed["class_names"]
                    .as_array()
                    .map(|a| a.iter().filter_map(|v| v.as_str().map(String::from)).collect())
                    .unwrap_or_default(),
                class_counts,
            });
        }
    }
    Err(AppError::CommandFailed("Failed to parse dataset stats".into()))
}

#[tauri::command]
pub async fn import_dataset(
    app: AppHandle,
    state: State<'_, DbState>,
    project_id: String,
    name: String,
    source_path: String,
) -> Result<String, AppError> {
    let id = Uuid::new_v4().to_string();

    app.emit("dataset:log", format!("Detecting format for {}...", name)).ok();
    let format = detect_dataset_format(source_path.clone()).await?;

    app.emit("dataset:log", format!("Detected format: {}", format)).ok();
    let stats = get_dataset_stats(source_path.clone()).await?;

    let workspace_dir = dirs_next::data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("yolodesktop")
        .join("datasets")
        .join(&id);
    std::fs::create_dir_all(&workspace_dir)?;

    app.emit("dataset:log", "Copying dataset files...").ok();
    copy_dir_recursive(&std::path::PathBuf::from(&source_path), &workspace_dir)?;

    let classes_json = serde_json::to_string(&stats.class_names)?;

    let row = queries::DatasetRow {
        id: id.clone(),
        project_id,
        name,
        format,
        image_count: stats.image_count,
        class_count: stats.class_names.len() as i32,
        classes_json,
        path: workspace_dir.to_str().unwrap().to_string(),
        imported_at: String::new(),
    };
    queries::create_dataset(&state, &row)?;

    app.emit("dataset:log", "Import complete!").ok();
    Ok(id)
}

#[tauri::command]
pub async fn list_datasets(
    state: State<'_, DbState>,
    project_id: String,
) -> Result<Vec<queries::DatasetRow>, AppError> {
    queries::list_datasets(&state, &project_id)
}

#[tauri::command]
pub async fn get_dataset(
    state: State<'_, DbState>,
    id: String,
) -> Result<queries::DatasetRow, AppError> {
    queries::get_dataset(&state, &id)
}

#[tauri::command]
pub async fn delete_dataset(
    state: State<'_, DbState>,
    id: String,
) -> Result<(), AppError> {
    let ds = queries::get_dataset(&state, &id)?;
    let path = std::path::PathBuf::from(&ds.path);
    if path.exists() {
        std::fs::remove_dir_all(&path)?;
    }
    queries::delete_dataset(&state, &id)?;
    Ok(())
}

fn copy_dir_recursive(src: &std::path::Path, dst: &std::path::Path) -> Result<(), AppError> {
    if !dst.exists() {
        std::fs::create_dir_all(dst)?;
    }
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        let dest = dst.join(entry.file_name());
        if ty.is_dir() {
            copy_dir_recursive(&entry.path(), &dest)?;
        } else {
            std::fs::copy(entry.path(), &dest).ok();
        }
    }
    Ok(())
}
