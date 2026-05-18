use crate::db::{queries, DbState};
use crate::errors::AppError;
use tauri::State;
use uuid::Uuid;
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct PluginManifest {
    pub id: String,
    pub name: String,
    pub version: String,
    pub supported_formats: Vec<String>,
    pub launcher_path: String,
    pub description: String,
    pub is_installed: bool,
}

#[tauri::command]
pub async fn scan_plugins(state: State<'_, DbState>) -> Result<Vec<PluginManifest>, AppError> {
    let plugins_dir = std::env::current_dir()
        .unwrap()
        .join("../python/plugins/annotation");

    let mut manifests = Vec::new();

    if plugins_dir.exists() {
        for entry in std::fs::read_dir(&plugins_dir)? {
            let entry = entry?;
            if entry.file_type()?.is_dir() {
                let manifest_path = entry.path().join("manifest.json");
                if manifest_path.exists() {
                    let content = std::fs::read_to_string(&manifest_path)?;
                    if let Ok(manifest) = serde_json::from_str::<serde_json::Value>(&content) {
                        let name = manifest["name"].as_str().unwrap_or("unknown").to_string();
                        let version = manifest["version"].as_str().unwrap_or("0.0.0").to_string();
                        let description = manifest["description"].as_str().unwrap_or("").to_string();
                        let formats: Vec<String> = manifest["supported_formats"]
                            .as_array()
                            .map(|a| a.iter().filter_map(|v| v.as_str().map(String::from)).collect())
                            .unwrap_or_default();
                        let launcher = entry.path()
                            .join(manifest["launcher"].as_str().unwrap_or("launcher.py"));

                        let existing = queries::list_plugins(&state)?;
                        let installed = existing.iter().any(|p| p.name == name);

                        let plugin_id = existing.iter()
                            .find(|p| p.name == name)
                            .map(|p| p.id.clone())
                            .unwrap_or_else(|| Uuid::new_v4().to_string());

                        manifests.push(PluginManifest {
                            id: plugin_id,
                            name,
                            version,
                            supported_formats: formats,
                            launcher_path: launcher.to_str().unwrap_or("").to_string(),
                            description,
                            is_installed: installed,
                        });
                    }
                }
            }
        }
    }

    Ok(manifests)
}

#[tauri::command]
pub async fn install_plugin(
    state: State<'_, DbState>,
    name: String,
    version: String,
    launcher_path: String,
    formats_json: String,
) -> Result<(), AppError> {
    let id = Uuid::new_v4().to_string();
    let row = queries::PluginRow {
        id,
        name,
        version,
        formats_json,
        launcher_path,
        is_installed: true,
        installed_at: chrono::Utc::now().to_rfc3339(),
    };
    queries::create_plugin(&state, &row)?;
    Ok(())
}

#[tauri::command]
pub async fn remove_plugin(
    state: State<'_, DbState>,
    id: String,
) -> Result<(), AppError> {
    queries::delete_plugin(&state, &id)?;
    Ok(())
}

#[tauri::command]
pub async fn list_installed_plugins(
    state: State<'_, DbState>,
) -> Result<Vec<queries::PluginRow>, AppError> {
    queries::list_plugins(&state)
}
