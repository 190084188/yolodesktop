use crate::db::{queries, DbState};
use crate::errors::AppError;
use tauri::State;
use uuid::Uuid;

#[tauri::command]
pub async fn create_project(
    state: State<'_, DbState>,
    name: String,
    path: String,
) -> Result<String, AppError> {
    let id = Uuid::new_v4().to_string();
    std::fs::create_dir_all(&path)?;
    queries::create_project(&state, &id, &name, &path)?;
    Ok(id)
}

#[tauri::command]
pub async fn list_projects(
    state: State<'_, DbState>,
) -> Result<Vec<queries::ProjectRow>, AppError> {
    queries::list_projects(&state)
}

#[tauri::command]
pub async fn delete_project(
    state: State<'_, DbState>,
    id: String,
) -> Result<(), AppError> {
    queries::delete_project(&state, &id)?;
    Ok(())
}
