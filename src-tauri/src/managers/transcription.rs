use crate::managers::model::ModelManager;
use crate::settings::get_settings;
use anyhow::Result;
use log::{debug, error, info};
use serde::Serialize;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::thread;
use std::time::{Duration, SystemTime};
use tauri::{AppHandle, Emitter};
use transcribe_rs::{
    engines::whisper::{WhisperEngine, WhisperInferenceParams},
    TranscriptionEngine,
};

const WHISPER_SAMPLE_RATE: f32 = 16_000.0;
const MIN_AUDIO_MS: f32 = 250.0;
const SILENCE_RMS_THRESHOLD: f32 = 0.004;
const SILENCE_RMS_THRESHOLD_LONG: f32 = 0.002;
const SILENCE_PEAK_THRESHOLD: f32 = 0.02;

#[derive(Clone, Debug, Serialize)]
pub struct ModelStateEvent {
    pub event_type: String,
    pub model_id: Option<String>,
    pub model_name: Option<String>,
    pub error: Option<String>,
}

#[derive(Clone)]
pub struct TranscriptionManager {
    engine: Arc<Mutex<Option<WhisperEngine>>>,
    model_manager: Arc<ModelManager>,
    app_handle: AppHandle,
    current_model_id: Arc<Mutex<Option<String>>>,
    last_activity: Arc<AtomicU64>,
    shutdown_signal: Arc<AtomicBool>,
    watcher_handle: Arc<Mutex<Option<thread::JoinHandle<()>>>>,
    is_loading: Arc<Mutex<bool>>,
    loading_condvar: Arc<Condvar>,
}

impl TranscriptionManager {
    pub fn new(app_handle: &AppHandle, model_manager: Arc<ModelManager>) -> Result<Self> {
        let manager = Self {
            engine: Arc::new(Mutex::new(None)),
            model_manager,
            app_handle: app_handle.clone(),
            current_model_id: Arc::new(Mutex::new(None)),
            last_activity: Arc::new(AtomicU64::new(
                SystemTime::now()
                    .duration_since(SystemTime::UNIX_EPOCH)
                    .unwrap()
                    .as_millis() as u64,
            )),
            shutdown_signal: Arc::new(AtomicBool::new(false)),
            watcher_handle: Arc::new(Mutex::new(None)),
            is_loading: Arc::new(Mutex::new(false)),
            loading_condvar: Arc::new(Condvar::new()),
        };

        // Start idle watcher - unloads model after 5 minutes of inactivity
        {
            let manager_clone = manager.clone();
            let shutdown = manager.shutdown_signal.clone();
            let handle = thread::spawn(move || {
                while !shutdown.load(Ordering::Relaxed) {
                    thread::sleep(Duration::from_secs(10));
                    if shutdown.load(Ordering::Relaxed) {
                        break;
                    }

                    let timeout_ms: u64 = 5 * 60 * 1000; // 5 minutes
                    let last = manager_clone.last_activity.load(Ordering::Relaxed);
                    let now_ms = SystemTime::now()
                        .duration_since(SystemTime::UNIX_EPOCH)
                        .unwrap()
                        .as_millis() as u64;

                    if now_ms.saturating_sub(last) > timeout_ms && manager_clone.is_model_loaded() {
                        debug!("Unloading model due to inactivity");
                        if let Ok(()) = manager_clone.unload_model() {
                            let _ = manager_clone.app_handle.emit(
                                "model-state-changed",
                                ModelStateEvent {
                                    event_type: "unloaded".to_string(),
                                    model_id: None,
                                    model_name: None,
                                    error: None,
                                },
                            );
                        }
                    }
                }
            });
            *manager.watcher_handle.lock().unwrap() = Some(handle);
        }

        Ok(manager)
    }

    pub fn is_model_loaded(&self) -> bool {
        self.engine.lock().unwrap().is_some()
    }

    pub fn unload_model(&self) -> Result<()> {
        {
            let mut engine = self.engine.lock().unwrap();
            if let Some(ref mut e) = *engine {
                e.unload_model();
            }
            *engine = None;
        }
        {
            let mut current_model = self.current_model_id.lock().unwrap();
            *current_model = None;
        }

        let _ = self.app_handle.emit(
            "model-state-changed",
            ModelStateEvent {
                event_type: "unloaded".to_string(),
                model_id: None,
                model_name: None,
                error: None,
            },
        );

        debug!("Model unloaded");
        Ok(())
    }

    pub fn load_model(&self, model_id: &str) -> Result<()> {
        let load_start = std::time::Instant::now();
        info!("Loading model: {}", model_id);

        let _ = self.app_handle.emit(
            "model-state-changed",
            ModelStateEvent {
                event_type: "loading_started".to_string(),
                model_id: Some(model_id.to_string()),
                model_name: None,
                error: None,
            },
        );

        let model_info = self
            .model_manager
            .get_model_info(model_id)
            .ok_or_else(|| anyhow::anyhow!("Model not found: {}", model_id))?;

        if !model_info.is_downloaded {
            let _ = self.app_handle.emit(
                "model-state-changed",
                ModelStateEvent {
                    event_type: "loading_failed".to_string(),
                    model_id: Some(model_id.to_string()),
                    model_name: Some(model_info.name.clone()),
                    error: Some("Model not downloaded".to_string()),
                },
            );
            return Err(anyhow::anyhow!("Model not downloaded"));
        }

        let model_path = self.model_manager.get_model_path(model_id)?;
        let mut engine = WhisperEngine::new();
        engine.load_model(&model_path).map_err(|e| {
            let error_msg = format!("Failed to load model: {}", e);
            let _ = self.app_handle.emit(
                "model-state-changed",
                ModelStateEvent {
                    event_type: "loading_failed".to_string(),
                    model_id: Some(model_id.to_string()),
                    model_name: Some(model_info.name.clone()),
                    error: Some(error_msg.clone()),
                },
            );
            anyhow::anyhow!(error_msg)
        })?;

        {
            let mut eng = self.engine.lock().unwrap();
            *eng = Some(engine);
        }
        {
            let mut current_model = self.current_model_id.lock().unwrap();
            *current_model = Some(model_id.to_string());
        }

        let _ = self.app_handle.emit(
            "model-state-changed",
            ModelStateEvent {
                event_type: "loading_completed".to_string(),
                model_id: Some(model_id.to_string()),
                model_name: Some(model_info.name.clone()),
                error: None,
            },
        );

        info!("Model loaded in {}ms", load_start.elapsed().as_millis());
        Ok(())
    }

    pub fn initiate_model_load(&self) {
        let mut is_loading = self.is_loading.lock().unwrap();
        if *is_loading || self.is_model_loaded() {
            return;
        }

        *is_loading = true;
        let self_clone = self.clone();
        thread::spawn(move || {
            let settings = get_settings(&self_clone.app_handle);
            if !settings.selected_model.is_empty() {
                if let Err(e) = self_clone.load_model(&settings.selected_model) {
                    error!("Failed to load model: {}", e);
                }
            }
            let mut is_loading = self_clone.is_loading.lock().unwrap();
            *is_loading = false;
            self_clone.loading_condvar.notify_all();
        });
    }

    pub fn transcribe(&self, audio: Vec<f32>) -> Result<String> {
        self.transcribe_with_prompt(audio, None)
    }

    /// Transcribe with an optional initial prompt to bias Whisper's vocabulary.
    pub fn transcribe_with_prompt(
        &self,
        audio: Vec<f32>,
        prompt: Option<String>,
    ) -> Result<String> {
        self.last_activity.store(
            SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap()
                .as_millis() as u64,
            Ordering::Relaxed,
        );

        let st = std::time::Instant::now();

        if audio.is_empty() {
            return Ok(String::new());
        }

        let duration_ms = (audio.len() as f32 / WHISPER_SAMPLE_RATE) * 1000.0;
        let (rms, peak) = compute_rms_and_peak(&audio);
        // Simple VAD-like gate to drop low-energy buffers before Whisper.
        if (duration_ms < MIN_AUDIO_MS
            && rms < SILENCE_RMS_THRESHOLD
            && peak < SILENCE_PEAK_THRESHOLD)
            || (rms < SILENCE_RMS_THRESHOLD_LONG && peak < SILENCE_PEAK_THRESHOLD)
        {
            debug!(
                "Skipping transcription (silence gate) duration_ms={:.1} rms={:.6} peak={:.6}",
                duration_ms, rms, peak
            );
            return Ok(String::new());
        }

        // Wait for model loading if in progress
        {
            let mut is_loading = self.is_loading.lock().unwrap();
            while *is_loading {
                is_loading = self.loading_condvar.wait(is_loading).unwrap();
            }
        }

        let settings = get_settings(&self.app_handle);

        let result = {
            let mut engine_guard = self.engine.lock().unwrap();
            let engine = engine_guard
                .as_mut()
                .ok_or_else(|| anyhow::anyhow!("Model is not loaded for transcription."))?;

            let language = if settings.selected_language == "auto" {
                None
            } else {
                Some(settings.selected_language.clone())
            };

            let params = WhisperInferenceParams {
                language,
                initial_prompt: prompt,
                // Tuned to prevent "thank you" hallucinations at end of silence:
                // - Higher no_speech_thold (0.8) = more aggressive silence detection
                no_speech_thold: 0.8,
                suppress_blank: true,
                ..Default::default()
            };

            engine
                .transcribe_samples(audio, Some(params))
                .map_err(|e| anyhow::anyhow!("Transcription failed: {}", e))?
        };

        info!(
            "Transcription completed in {}ms: {}",
            st.elapsed().as_millis(),
            result.text
        );

        Ok(result.text.trim().to_string())
    }
}

fn compute_rms_and_peak(samples: &[f32]) -> (f32, f32) {
    // RMS captures overall signal energy; peak helps detect brief spikes.
    if samples.is_empty() {
        return (0.0, 0.0);
    }

    let mut sum_sq = 0.0f32;
    let mut peak = 0.0f32;
    for &s in samples {
        // Use absolute value to find the max magnitude sample (peak).
        let abs = s.abs();
        if abs > peak {
            peak = abs;
        }
        sum_sq += s * s;
    }
    // Normalize by sample count to compute the RMS energy level.
    let rms = (sum_sq / samples.len() as f32).sqrt();
    (rms, peak)
}

impl Drop for TranscriptionManager {
    fn drop(&mut self) {
        self.shutdown_signal.store(true, Ordering::Relaxed);
        if let Some(handle) = self.watcher_handle.lock().unwrap().take() {
            let _ = handle.join();
        }
    }
}
