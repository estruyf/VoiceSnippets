# Changelog

## [0.7.1]

- fix: implement Windows text expansion by copying matched text to the clipboard and triggering Ctrl+V key input
- fix: apply the same Windows paste path to workflow text steps so workflow typing works consistently across command types

## [0.7.0]

- feat: app-aware command matching supports, you can now specify which commands apply to which apps using bundle IDs (macOS) or app names (Windows)
- fix: normalize transcriptions by removing internal punctuation and collapsing extra spaces to improve matching

## [0.6.0]

- feat: add single-instance plugin to prevent multiple app instances from running simultaneously
- feat: app now starts hidden after first launch; clicking the app icon when already running brings settings window to front
- feat: settings window automatically appears on first launch for initial setup

## [0.5.0]

- feat: command chaining — trigger multiple commands in a single breath using conjunctions like "and", "then", or "and then"
- feat: command aliases — define multiple trigger phrases for a single command (e.g. "new file", "create file", "make file")
- fix: disable auto-capitalization on input fields to prevent text from being automatically uppercased

## [0.4.0]

- feat: add custom word remapping with fuzzy matching to correct commonly misheard words during transcription

## [0.3.0]

- feat: ability to sync commands to GitHub Gist for backup and cross-device sync (optional) 
- feat: update recommended Whisper model from "Tiny" to "Base" for improved transcription accuracy

## [0.2.1]

- fix: use proper Developer ID code signing instead of ad-hoc signing to preserve macOS accessibility permissions across app updates

## [0.2.0]

- feat: automatically activate newly installed model when no model is currently selected
- feat: implement bidirectional settings sync between JSON file and plugin store for better user control
- fix: truncate long command names in overlay with ellipsis to prevent overflow
- fix: corrected default hotkey format from "Alt+KeyS" to "Alt+S"
- fix: improved keyboard shortcut display formatting with proper spacing
- fix: improved settings deserialization to preserve critical flags during compatibility issues
- fix: removed notification logic
- fix: avoid re-adding login item when autostart is already enabled
- fix: skip low-energy audio before Whisper to reduce silent "thank you" transcriptions (Whisper hallucinations)

## [0.1.0]

- First public release of VoiceSnippets, a local voice command app built with Tauri and React. Features include:
  - Fast, local speech-to-text using Whisper.cpp
  - Customizable voice commands with support for variables
  - Overlay interface for quick access to commands
  - Cross-platform support for Windows and macOS

## [0.0.5]

- feat: update CommandsTab and CommandsList to include command type filtering and sorting
- feat: add analytics tab with command usage statistics
- fix: better accessibility permission handling on macOS