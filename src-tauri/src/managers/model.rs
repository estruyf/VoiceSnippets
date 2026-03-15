use anyhow::Result;
use futures_util::StreamExt;
use log::{info, warn};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub filename: String,
    pub url: Option<String>,
    pub size_mb: u64,
    pub is_downloaded: bool,
    pub is_downloading: bool,
    pub partial_size: u64,
    pub is_recommended: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadProgress {
    pub model_id: String,
    pub downloaded: u64,
    pub total: u64,
    pub percentage: f64,
}

pub struct ModelManager {
    app_handle: AppHandle,
    models_dir: PathBuf,
    available_models: Mutex<HashMap<String, ModelInfo>>,
    cancel_flags: Arc<Mutex<HashMap<String, Arc<AtomicBool>>>>,
}

impl ModelManager {
    pub fn new(app_handle: &AppHandle) -> Result<Self> {
        let models_dir = app_handle
            .path()
            .app_data_dir()
            .map_err(|e| anyhow::anyhow!("Failed to get app data dir: {}", e))?
            .join("models");

        if !models_dir.exists() {
            fs::create_dir_all(&models_dir)?;
        }

        let mut available_models = HashMap::new();

        available_models.insert(
            "small".to_string(),
            ModelInfo {
                id: "small".to_string(),
                name: "Whisper Small".to_string(),
                description: "Fast and fairly accurate. Good for short trigger words.".to_string(),
                filename: "ggml-small.bin".to_string(),
                url: Some(
                    "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin"
                        .to_string(),
                ),
                size_mb: 487,
                is_downloaded: false,
                is_downloading: false,
                partial_size: 0,
                is_recommended: false,
            },
        );

        available_models.insert(
            "base".to_string(),
            ModelInfo {
                id: "base".to_string(),
                name: "Whisper Base".to_string(),
                description: "Very fast, lower accuracy. Best for quick trigger words.".to_string(),
                filename: "ggml-base.bin".to_string(),
                url: Some(
                    "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin"
                        .to_string(),
                ),
                size_mb: 147,
                is_downloaded: false,
                is_downloading: false,
                partial_size: 0,
                is_recommended: true,
            },
        );

        available_models.insert(
            "tiny".to_string(),
            ModelInfo {
                id: "tiny".to_string(),
                name: "Whisper Tiny".to_string(),
                description: "Fastest, least accurate. Minimal resource usage.".to_string(),
                filename: "ggml-tiny.bin".to_string(),
                url: Some(
                    "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin"
                        .to_string(),
                ),
                size_mb: 77,
                is_downloaded: false,
                is_downloading: false,
                partial_size: 0,
                is_recommended: false,
            },
        );

        available_models.insert(
            "medium".to_string(),
            ModelInfo {
                id: "medium".to_string(),
                name: "Whisper Medium".to_string(),
                description: "Good accuracy, slower. For noisy environments.".to_string(),
                filename: "ggml-medium.bin".to_string(),
                url: Some(
                    "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin"
                        .to_string(),
                ),
                size_mb: 1533,
                is_downloaded: false,
                is_downloading: false,
                partial_size: 0,
                is_recommended: false,
            },
        );

        let manager = Self {
            app_handle: app_handle.clone(),
            models_dir,
            available_models: Mutex::new(available_models),
            cancel_flags: Arc::new(Mutex::new(HashMap::new())),
        };

        manager.update_download_status()?;

        Ok(manager)
    }

    pub fn get_available_models(&self) -> Vec<ModelInfo> {
        let models = self.available_models.lock().unwrap();
        let mut list: Vec<ModelInfo> = models.values().cloned().collect();
        list.sort_by(|a, b| a.size_mb.cmp(&b.size_mb));
        list
    }

    pub fn get_model_info(&self, model_id: &str) -> Option<ModelInfo> {
        let models = self.available_models.lock().unwrap();
        models.get(model_id).cloned()
    }

    fn update_download_status(&self) -> Result<()> {
        let mut models = self.available_models.lock().unwrap();
        for model in models.values_mut() {
            let model_path = self.models_dir.join(&model.filename);
            let partial_path = self.models_dir.join(format!("{}.partial", &model.filename));

            model.is_downloaded = model_path.exists();
            model.partial_size = if partial_path.exists() {
                partial_path.metadata().map(|m| m.len()).unwrap_or(0)
            } else {
                0
            };
        }
        Ok(())
    }

    pub fn get_model_path(&self, model_id: &str) -> Result<PathBuf> {
        let model_info = self
            .get_model_info(model_id)
            .ok_or_else(|| anyhow::anyhow!("Model not found: {}", model_id))?;

        if !model_info.is_downloaded {
            return Err(anyhow::anyhow!("Model not available: {}", model_id));
        }

        let model_path = self.models_dir.join(&model_info.filename);
        if model_path.exists() {
            Ok(model_path)
        } else {
            Err(anyhow::anyhow!("Model file not found: {}", model_id))
        }
    }

    pub async fn download_model(&self, model_id: &str) -> Result<()> {
        let model_info = {
            let models = self.available_models.lock().unwrap();
            models.get(model_id).cloned()
        };

        let model_info =
            model_info.ok_or_else(|| anyhow::anyhow!("Model not found: {}", model_id))?;

        let url = model_info
            .url
            .ok_or_else(|| anyhow::anyhow!("No download URL for model"))?;
        let model_path = self.models_dir.join(&model_info.filename);
        let partial_path = self
            .models_dir
            .join(format!("{}.partial", &model_info.filename));

        if model_path.exists() {
            if partial_path.exists() {
                let _ = fs::remove_file(&partial_path);
            }
            self.update_download_status()?;
            return Ok(());
        }

        let mut resume_from = if partial_path.exists() {
            let size = partial_path.metadata()?.len();
            info!("Resuming download of model {} from byte {}", model_id, size);
            size
        } else {
            info!("Starting fresh download of model {} from {}", model_id, url);
            0
        };

        // Mark as downloading
        {
            let mut models = self.available_models.lock().unwrap();
            if let Some(model) = models.get_mut(model_id) {
                model.is_downloading = true;
            }
        }

        // Create cancellation flag
        let cancel_flag = Arc::new(AtomicBool::new(false));
        {
            let mut flags = self.cancel_flags.lock().unwrap();
            flags.insert(model_id.to_string(), cancel_flag.clone());
        }

        let client = reqwest::Client::new();
        let mut request = client.get(&url);

        if resume_from > 0 {
            request = request.header("Range", format!("bytes={}-", resume_from));
        }

        let mut response = request.send().await?;

        // Handle server not supporting range requests
        if resume_from > 0 && response.status() == reqwest::StatusCode::OK {
            warn!("Server doesn't support range requests, restarting download");
            drop(response);
            let _ = fs::remove_file(&partial_path);
            resume_from = 0;
            response = client.get(&url).send().await?;
        }

        if !response.status().is_success()
            && response.status() != reqwest::StatusCode::PARTIAL_CONTENT
        {
            {
                let mut models = self.available_models.lock().unwrap();
                if let Some(model) = models.get_mut(model_id) {
                    model.is_downloading = false;
                }
            }
            return Err(anyhow::anyhow!(
                "Failed to download model: HTTP {}",
                response.status()
            ));
        }

        let total_size = if resume_from > 0 {
            resume_from + response.content_length().unwrap_or(0)
        } else {
            response.content_length().unwrap_or(0)
        };

        let mut downloaded = resume_from;
        let mut stream = response.bytes_stream();

        let mut file = if resume_from > 0 {
            std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(&partial_path)?
        } else {
            std::fs::File::create(&partial_path)?
        };

        let mut last_emit = Instant::now();
        let throttle_duration = Duration::from_millis(100);

        while let Some(chunk) = stream.next().await {
            if cancel_flag.load(Ordering::Relaxed) {
                drop(file);
                info!("Download cancelled for: {}", model_id);
                {
                    let mut models = self.available_models.lock().unwrap();
                    if let Some(model) = models.get_mut(model_id) {
                        model.is_downloading = false;
                    }
                }
                {
                    let mut flags = self.cancel_flags.lock().unwrap();
                    flags.remove(model_id);
                }
                return Ok(());
            }

            let chunk = chunk.map_err(|e| {
                {
                    let mut models = self.available_models.lock().unwrap();
                    if let Some(model) = models.get_mut(model_id) {
                        model.is_downloading = false;
                    }
                }
                e
            })?;

            file.write_all(&chunk)?;
            downloaded += chunk.len() as u64;

            let percentage = if total_size > 0 {
                (downloaded as f64 / total_size as f64) * 100.0
            } else {
                0.0
            };

            if last_emit.elapsed() >= throttle_duration {
                let progress = DownloadProgress {
                    model_id: model_id.to_string(),
                    downloaded,
                    total: total_size,
                    percentage,
                };
                let _ = self.app_handle.emit("model-download-progress", &progress);
                last_emit = Instant::now();
            }
        }

        // Final progress
        let final_progress = DownloadProgress {
            model_id: model_id.to_string(),
            downloaded,
            total: total_size,
            percentage: 100.0,
        };
        let _ = self
            .app_handle
            .emit("model-download-progress", &final_progress);

        file.flush()?;
        drop(file);

        // Move partial to final
        fs::rename(&partial_path, &model_path)?;

        // Update status
        {
            let mut models = self.available_models.lock().unwrap();
            if let Some(model) = models.get_mut(model_id) {
                model.is_downloading = false;
                model.is_downloaded = true;
                model.partial_size = 0;
            }
        }

        {
            let mut flags = self.cancel_flags.lock().unwrap();
            flags.remove(model_id);
        }

        let _ = self.app_handle.emit("model-download-complete", model_id);
        info!("Successfully downloaded model {}", model_id);

        Ok(())
    }

    pub fn delete_model(&self, model_id: &str) -> Result<()> {
        let model_info = {
            let models = self.available_models.lock().unwrap();
            models.get(model_id).cloned()
        };

        let model_info =
            model_info.ok_or_else(|| anyhow::anyhow!("Model not found: {}", model_id))?;

        let model_path = self.models_dir.join(&model_info.filename);
        let partial_path = self
            .models_dir
            .join(format!("{}.partial", &model_info.filename));

        let mut deleted = false;

        if model_path.exists() {
            fs::remove_file(&model_path)?;
            info!("Deleted model file: {:?}", model_path);
            deleted = true;
        }

        if partial_path.exists() {
            fs::remove_file(&partial_path)?;
            deleted = true;
        }

        if !deleted {
            return Err(anyhow::anyhow!("No model files found to delete"));
        }

        self.update_download_status()?;
        let _ = self.app_handle.emit("model-deleted", model_id);

        Ok(())
    }

    pub fn cancel_download(&self, model_id: &str) -> Result<()> {
        {
            let flags = self.cancel_flags.lock().unwrap();
            if let Some(flag) = flags.get(model_id) {
                flag.store(true, Ordering::Relaxed);
                info!("Cancellation flag set for: {}", model_id);
            }
        }

        {
            let mut models = self.available_models.lock().unwrap();
            if let Some(model) = models.get_mut(model_id) {
                model.is_downloading = false;
            }
        }

        self.update_download_status()?;
        let _ = self.app_handle.emit("model-download-cancelled", model_id);

        Ok(())
    }
}
