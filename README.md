# VoiceSnippets

A cross-platform desktop application that uses voice commands to expand text snippets, execute keyboard shortcuts, and run workflows. Say a trigger word, get instant text expansion or automation.

## About

VoiceSnippets is a powerful voice-activated productivity tool that allows you to:

- 🗣️ **Expand text snippets** using voice commands
- ⌨️ **Execute keyboard shortcuts** hands-free
- ⚡ **Run custom workflows** with simple voice triggers
- 🖥️ **Cross-platform support** for seamless productivity across devices (*WIP*)

Simply speak your trigger word, and VoiceSnippets instantly performs your configured action - whether it's inserting a code snippet, executing a shortcut, or automating a complex workflow.

## 📥 Releases

All official releases of VoiceSnippets are published in this repository. You can find the latest version and download links in the [Releases](../../releases) section.

To get started, head over to the [latest release](../../releases/latest) and download the version for your platform.

## 🐛 Issues & Feedback

This repository is the official place to:

- **Report bugs** or issues you encounter
- **Request new features** or enhancements
- **Provide feedback** on your experience with VoiceSnippets
- **Ask questions** about usage or configuration

Please [open an issue](../../issues/new) if you have any problems, suggestions, or feedback. Your input helps make VoiceSnippets better for everyone!

## 🔍 Debugging

Under the **about** tab, you can find the log and application directory.

<img width="1264" height="506" alt="eliostruyf-2026-02-17-14 26 57" src="https://github.com/user-attachments/assets/ad21e8aa-a66e-46ea-8bc8-4a3d5f13d5d4" />

### Logs

In the log directory, you can find the logs from the application. You will also find the transcribed text, that way you can check if what you speak, is also transcribed.

> **Hint**: In some cases, it can be that the transcription is off; for that, you can lower the `Fuzzy Match Threshold` under the **General** tab.

### Application directory

In this directory, you can find the Whisper model, settings, and stored commands. In case you have the `Debug: Save Recordings` option turned on, you will find these recordings in the **recordings** folder of the application directory.
