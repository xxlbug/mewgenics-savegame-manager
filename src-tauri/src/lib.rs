use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FileInfo {
    name: String,
    modified_ms: u64,
}

/// Scan `{APPDATA}/Glaiel Games/Mewgenics/*/saves` directories and return the
/// absolute paths of the ones that exist. Non-Windows / missing APPDATA -> empty.
#[tauri::command]
fn detect_saves_dirs() -> Result<Vec<String>, String> {
    let appdata = match std::env::var("APPDATA") {
        Ok(v) if !v.is_empty() => v,
        _ => return Ok(Vec::new()),
    };

    let base: PathBuf = Path::new(&appdata).join("Glaiel Games").join("Mewgenics");
    if !base.is_dir() {
        return Ok(Vec::new());
    }

    let mut results: Vec<String> = Vec::new();
    let entries = fs::read_dir(&base)
        .map_err(|e| format!("failed to read {}: {}", base.display(), e))?;
    for entry in entries {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let saves = path.join("saves");
        if saves.is_dir() {
            results.push(saves.to_string_lossy().into_owned());
        }
    }

    results.sort();
    Ok(results)
}

/// List files (not subdirectories) in `dir` with their last-modified time in ms.
#[tauri::command]
fn list_files(dir: String) -> Result<Vec<FileInfo>, String> {
    let entries = fs::read_dir(&dir).map_err(|e| format!("failed to read {}: {}", dir, e))?;

    let mut files: Vec<FileInfo> = Vec::new();
    for entry in entries {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        let metadata = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        if !metadata.is_file() {
            continue;
        }

        let modified_ms = metadata
            .modified()
            .ok()
            .and_then(|m| m.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        let name = entry.file_name().to_string_lossy().into_owned();
        files.push(FileInfo { name, modified_ms });
    }

    Ok(files)
}

/// Read a file and return its contents as a standard base64 string.
#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    let bytes = fs::read(&path).map_err(|e| format!("failed to read {}: {}", path, e))?;
    Ok(STANDARD.encode(bytes))
}

/// Decode base64 `data_b64` (arrives from JS as `dataB64`) and write it to `path`
/// atomically via a temp file + rename.
#[tauri::command]
fn write_file(path: String, data_b64: String) -> Result<(), String> {
    let bytes = STANDARD
        .decode(data_b64.as_bytes())
        .map_err(|e| format!("invalid base64: {}", e))?;

    let tmp = format!("{}.tmp-write", path);
    fs::write(&tmp, &bytes).map_err(|e| format!("failed to write {}: {}", tmp, e))?;
    fs::rename(&tmp, &path).map_err(|e| {
        // Best-effort cleanup of the temp file if the rename failed.
        let _ = fs::remove_file(&tmp);
        format!("failed to rename {} -> {}: {}", tmp, path, e)
    })?;
    Ok(())
}

/// Create `path` and all missing parent directories.
#[tauri::command]
fn create_dir(path: String) -> Result<(), String> {
    fs::create_dir_all(&path).map_err(|e| format!("failed to create {}: {}", path, e))
}

/// Return whether `path` exists on disk.
#[tauri::command]
fn path_exists(path: String) -> Result<bool, String> {
    Ok(Path::new(&path).exists())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            detect_saves_dirs,
            list_files,
            read_file,
            write_file,
            create_dir,
            path_exists
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
