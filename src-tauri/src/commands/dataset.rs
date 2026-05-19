use crate::db::{queries, DbState};
use crate::errors::{AppError, AppResult};
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

// ---------------------------------------------------------------------------
// Helper: run a Python script located alongside the binary
// ---------------------------------------------------------------------------

fn run_python_script(script_name: &str, args: &[&str]) -> AppResult<String> {
    let script = {
        let exe_dir = std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|p| p.to_path_buf()))
            .unwrap_or_default();
        let dev_path = exe_dir.join(format!("../../python/{}", script_name));
        let prod_path = exe_dir.join(format!("python/{}", script_name));
        if dev_path.exists() {
            dev_path
        } else if prod_path.exists() {
            prod_path
        } else {
            std::env::current_dir()
                .unwrap_or_default()
                .join(format!("../python/{}", script_name))
        }
    };
    let python = "python";

    let output = std::process::Command::new(python)
        .arg(script.to_str().unwrap())
        .args(args)
        .output()
        .map_err(|e| AppError::CommandFailed(format!("{} failed: {}", script_name, e)))?;

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

// ---------------------------------------------------------------------------
// Search commands (one per source for progressive frontend rendering)
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn search_kaggle(
    state: State<'_, DbState>,
    keyword: String,
) -> Result<serde_json::Value, AppError> {
    let conn = state.conn.lock().unwrap();
    if let Ok(Some(cached)) =
        crate::db::queries::get_search_cache(&conn, &keyword, "kaggle", "{}")
    {
        if let Ok(val) = serde_json::from_str(&cached) {
            return Ok(val);
        }
    }
    drop(conn);

    let stdout = run_python_script("search_kaggle.py", &[&keyword])?;
    let result: serde_json::Value = serde_json::from_str(&stdout)
        .map_err(|e| AppError::CommandFailed(format!("Parse error: {}", e)))?;

    let conn = state.conn.lock().unwrap();
    crate::db::queries::set_search_cache(
        &conn, &keyword, "kaggle", "{}", &result.to_string(), None,
    )
    .ok();
    Ok(result)
}

#[tauri::command]
pub async fn search_huggingface(
    state: State<'_, DbState>,
    keyword: String,
) -> Result<serde_json::Value, AppError> {
    let conn = state.conn.lock().unwrap();
    if let Ok(Some(cached)) =
        crate::db::queries::get_search_cache(&conn, &keyword, "huggingface", "{}")
    {
        if let Ok(val) = serde_json::from_str(&cached) {
            return Ok(val);
        }
    }
    drop(conn);

    let stdout = run_python_script("search_huggingface.py", &[&keyword, "20"])?;
    let result: serde_json::Value = serde_json::from_str(&stdout)
        .map_err(|e| AppError::CommandFailed(format!("Parse error: {}", e)))?;

    let conn = state.conn.lock().unwrap();
    crate::db::queries::set_search_cache(
        &conn, &keyword, "huggingface", "{}", &result.to_string(), None,
    )
    .ok();
    Ok(result)
}

#[tauri::command]
pub async fn search_roboflow(
    state: State<'_, DbState>,
    keyword: String,
) -> Result<serde_json::Value, AppError> {
    let conn = state.conn.lock().unwrap();
    if let Ok(Some(cached)) =
        crate::db::queries::get_search_cache(&conn, &keyword, "roboflow", "{}")
    {
        if let Ok(val) = serde_json::from_str(&cached) {
            return Ok(val);
        }
    }
    drop(conn);

    let stdout = run_python_script("search_roboflow.py", &[&keyword])?;
    let result: serde_json::Value = serde_json::from_str(&stdout)
        .map_err(|e| AppError::CommandFailed(format!("Parse error: {}", e)))?;

    let conn = state.conn.lock().unwrap();
    crate::db::queries::set_search_cache(
        &conn, &keyword, "roboflow", "{}", &result.to_string(), None,
    )
    .ok();
    Ok(result)
}

// ---------------------------------------------------------------------------
// Connectivity check
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn check_connectivity() -> Result<serde_json::Value, AppError> {
    let client = reqwest::Client::new();
    let urls = [
        ("kaggle", "https://www.kaggle.com"),
        ("huggingface", "https://huggingface.co"),
        ("roboflow", "https://universe.roboflow.com"),
    ];
    let mut results = serde_json::Map::new();
    for (name, url) in &urls {
        match client
            .head(*url)
            .timeout(std::time::Duration::from_secs(5))
            .send()
            .await
        {
            Ok(resp) => {
                results.insert(
                    name.to_string(),
                    serde_json::json!({
                        "online": resp.status().is_success() || resp.status().is_redirection(),
                    }),
                );
            }
            Err(_) => {
                results.insert(
                    name.to_string(),
                    serde_json::json!({"online": false}),
                );
            }
        }
    }
    Ok(serde_json::Value::Object(results))
}

// ---------------------------------------------------------------------------
// Dataset folder scanner
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn scan_dataset_folders(
    root_path: String,
) -> Result<Vec<serde_json::Value>, AppError> {
    let stdout = run_python_script("scan_folders.py", &[&root_path])?;
    serde_json::from_str(&stdout)
        .map_err(|e| AppError::CommandFailed(format!("Parse error: {}", e)))
}

// ---------------------------------------------------------------------------
// Settings commands
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Test dataset download
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn download_test_dataset(
    output_dir: String,
) -> Result<serde_json::Value, AppError> {
    let stdout = run_python_script("download_test_dataset.py", &[&output_dir])?;
    serde_json::from_str(&stdout)
        .map_err(|e| AppError::CommandFailed(format!("Parse error: {}", e)))
}

#[tauri::command]
pub async fn get_dataset_setting(
    state: State<'_, DbState>,
    key: String,
) -> Result<Option<String>, AppError> {
    let conn = state.conn.lock().unwrap();
    crate::db::queries::get_setting(&conn, &key)
        .map_err(|e| AppError::Db(e))
}

#[tauri::command]
pub async fn set_dataset_setting(
    state: State<'_, DbState>,
    key: String,
    value: String,
) -> Result<(), AppError> {
    let conn = state.conn.lock().unwrap();
    crate::db::queries::set_setting(&conn, &key, &value)
        .map_err(|e| AppError::Db(e))
}
