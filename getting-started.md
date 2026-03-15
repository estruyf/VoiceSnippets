# VoiceSnippets Beta Getting Started

Thanks for testing VoiceSnippets. This guide gets you from install to first
command.

> VoiceSnippets is a desktop application that uses voice commands to expand text
> snippets, execute keyboard shortcuts, and run workflows. Say a trigger word,
> get instant text expansion or automation.

## 1) Install

- Download the `VoiceSnippets.app` file to your computer.
- If you want, you can move it to your Applications folder.
- Launch the app; it will appear in your menu bar/system tray.

## 2) Grant permissions (important)

VoiceSnippets needs access to your microphone and keyboard shortcuts, and shall
prompt you when you go to the general settings page. Please grant these
permissions for the app to function properly.

macOS:
- Microphone: System Settings > Privacy & Security > Microphone
- Accessibility: System Settings > Privacy & Security > Accessibility
- Input Monitoring (if prompted): System Settings > Privacy & Security > Input
  Monitoring
                
## 3) First run setup

- When you open the app, you will first need to install a voice model to
  transcribe your commands. The app will prompt you to choose a model size. The
  "base" model is the best one for the tool. Others are there to test the
  tradeoff between speed and accuracy. You can always change the model later in
  settings.
- Pick your microphone input.
- Confirm the recording hotkey (default: Option+S on macOS).

## 4) Create your first command

Text expansion example:
- Go to Commands tab
- Add a new Text Expansion
- Trigger: email
- Expansion: your@email.com

Try it:
- Click in a textbox, or open a new document in a text editor
- Hold the hotkey, say "email", release
- The text should expand in your active app

Feel free to experiment with different command types and features. Check out the
Command Packs for pre-built commands for Git, npm, macOS shortcuts, and more.
