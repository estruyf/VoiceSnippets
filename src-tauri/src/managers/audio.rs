use anyhow::Result;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use log::{error, info, warn};
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

const WHISPER_SAMPLE_RATE: u32 = 16000;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioDevice {
    pub name: String,
    pub is_default: bool,
}

/// Audio recording manager. Uses a background thread to own the non-Send
/// `cpal::Stream`, communicating via shared atomic/mutex state.
pub struct AudioRecordingManager {
    samples: Arc<Mutex<Vec<f32>>>,
    is_recording: Arc<AtomicBool>,
    stop_signal: Arc<AtomicBool>,
    recording_started_at: Arc<Mutex<Option<std::time::Instant>>>,
    thread_handle: Mutex<Option<std::thread::JoinHandle<()>>>,
}

impl AudioRecordingManager {
    pub fn new() -> Result<Self> {
        Ok(Self {
            samples: Arc::new(Mutex::new(Vec::new())),
            is_recording: Arc::new(AtomicBool::new(false)),
            stop_signal: Arc::new(AtomicBool::new(false)),
            recording_started_at: Arc::new(Mutex::new(None)),
            thread_handle: Mutex::new(None),
        })
    }

    pub fn start_recording(&self, device_name: Option<String>) -> Result<()> {
        if self.is_recording.load(Ordering::Relaxed) {
            return Ok(());
        }

        // Clear previous samples
        {
            let mut samples = self.samples.lock().unwrap();
            samples.clear();
        }

        // Reset start time for this session
        {
            let mut started_at = self.recording_started_at.lock().unwrap();
            *started_at = None;
        }

        self.stop_signal.store(false, Ordering::Relaxed);
        self.is_recording.store(true, Ordering::Relaxed);

        let samples_clone = self.samples.clone();
        let recording_flag = self.is_recording.clone();
        let stop_signal = self.stop_signal.clone();
        let started_at = self.recording_started_at.clone();

        let handle = std::thread::spawn(move || {
            let host = cpal::default_host();

            let device = if let Some(ref name) = device_name {
                host.input_devices()
                    .ok()
                    .and_then(|mut devs| {
                        devs.find(|d| d.name().map(|n| n == *name).unwrap_or(false))
                    })
                    .unwrap_or_else(|| {
                        warn!("Device not found, using default");
                        host.default_input_device().expect("No input device")
                    })
            } else {
                host.default_input_device()
                    .expect("No default input device")
            };

            info!("Using input device: {}", device.name().unwrap_or_default());

            // Query device's preferred config instead of forcing 16kHz mono
            let supported_config = match device.default_input_config() {
                Ok(c) => c,
                Err(e) => {
                    error!("Failed to get default input config: {}", e);
                    recording_flag.store(false, Ordering::Relaxed);
                    return;
                }
            };

            let device_sample_rate = supported_config.sample_rate().0;
            let device_channels = supported_config.channels() as usize;
            info!(
                "Device config: {}Hz, {} channel(s)",
                device_sample_rate, device_channels
            );

            let config = cpal::StreamConfig {
                channels: supported_config.channels(),
                sample_rate: supported_config.sample_rate(),
                buffer_size: cpal::BufferSize::Default,
            };

            let rec_flag = recording_flag.clone();
            let samples_ref = samples_clone.clone();

            let stream = match device.build_input_stream(
                &config,
                move |data: &[f32], _: &cpal::InputCallbackInfo| {
                    if rec_flag.load(Ordering::Relaxed) {
                        // Downmix to mono if multi-channel
                        let mono: Vec<f32> = if device_channels > 1 {
                            data.chunks(device_channels)
                                .map(|frame| frame.iter().sum::<f32>() / device_channels as f32)
                                .collect()
                        } else {
                            data.to_vec()
                        };

                        // Resample to 16kHz if needed
                        let resampled = if device_sample_rate != WHISPER_SAMPLE_RATE {
                            let ratio = WHISPER_SAMPLE_RATE as f64 / device_sample_rate as f64;
                            let output_len = (mono.len() as f64 * ratio).ceil() as usize;
                            let mut output = Vec::with_capacity(output_len);
                            for i in 0..output_len {
                                let src_idx = i as f64 / ratio;
                                let idx = src_idx.floor() as usize;
                                let frac = src_idx - idx as f64;
                                let sample = if idx + 1 < mono.len() {
                                    mono[idx] * (1.0 - frac as f32) + mono[idx + 1] * frac as f32
                                } else if idx < mono.len() {
                                    mono[idx]
                                } else {
                                    0.0
                                };
                                output.push(sample);
                            }
                            output
                        } else {
                            mono
                        };

                        let mut samples = samples_ref.lock().unwrap();
                        samples.extend_from_slice(&resampled);
                    }
                },
                move |err| {
                    error!("Audio stream error: {}", err);
                },
                None,
            ) {
                Ok(s) => s,
                Err(e) => {
                    error!("Failed to build input stream: {}", e);
                    recording_flag.store(false, Ordering::Relaxed);
                    return;
                }
            };

            if let Err(e) = stream.play() {
                error!("Failed to start audio stream: {}", e);
                recording_flag.store(false, Ordering::Relaxed);
                return;
            }

            {
                let mut started_at = started_at.lock().unwrap();
                *started_at = Some(std::time::Instant::now());
            }

            info!("Recording started");

            // Wait for stop signal
            while !stop_signal.load(Ordering::Relaxed) {
                std::thread::sleep(std::time::Duration::from_millis(50));
            }

            // Stream is dropped here when thread ends
            drop(stream);
            info!("Recording thread finished");
        });

        {
            let mut th = self.thread_handle.lock().unwrap();
            *th = Some(handle);
        }

        Ok(())
    }

    pub fn stop_recording(&self) -> Option<Vec<f32>> {
        if !self.is_recording.load(Ordering::Relaxed) {
            return None;
        }

        self.is_recording.store(false, Ordering::Relaxed);
        self.stop_signal.store(true, Ordering::Relaxed);

        // Wait for recording thread to finish
        {
            let mut th = self.thread_handle.lock().unwrap();
            if let Some(handle) = th.take() {
                let _ = handle.join();
            }
        }

        let samples = {
            let mut s = self.samples.lock().unwrap();
            std::mem::take(&mut *s)
        };

        {
            let mut started_at = self.recording_started_at.lock().unwrap();
            *started_at = None;
        }

        info!("Recording stopped, {} samples captured", samples.len());

        if samples.is_empty() {
            None
        } else {
            Some(samples)
        }
    }

    pub fn stop_recording_with_min_duration(&self, min_duration_ms: u64) -> Option<Vec<f32>> {
        if !self.is_recording.load(Ordering::Relaxed) {
            return None;
        }

        if min_duration_ms > 0 {
            if let Some(started_at) = *self.recording_started_at.lock().unwrap() {
                let elapsed_ms = started_at.elapsed().as_millis() as u64;
                if elapsed_ms < min_duration_ms {
                    std::thread::sleep(std::time::Duration::from_millis(
                        min_duration_ms - elapsed_ms,
                    ));
                }
            }
        }

        self.stop_recording()
    }

    pub fn wait_for_start(&self, timeout_ms: u64) -> bool {
        let deadline = Instant::now() + Duration::from_millis(timeout_ms);
        loop {
            if self.recording_started_at.lock().unwrap().is_some() {
                return true;
            }
            if Instant::now() >= deadline {
                return false;
            }
            std::thread::sleep(Duration::from_millis(5));
        }
    }

    pub fn is_recording(&self) -> bool {
        self.is_recording.load(Ordering::Relaxed)
    }
}

pub fn list_input_devices() -> Result<Vec<AudioDevice>> {
    let host = cpal::default_host();
    let default_name = host
        .default_input_device()
        .and_then(|d| d.name().ok())
        .unwrap_or_default();

    let mut devices = Vec::new();
    if let Ok(input_devices) = host.input_devices() {
        for device in input_devices {
            if let Ok(name) = device.name() {
                devices.push(AudioDevice {
                    is_default: name == default_name,
                    name,
                });
            }
        }
    }

    Ok(devices)
}
