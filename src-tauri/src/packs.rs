use crate::snippets::WorkflowStep;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandPack {
    pub id: String,
    pub name: String,
    pub description: String,
    pub commands: Vec<PackCommand>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PackCommand {
    pub trigger_word: String,
    pub expansion: String,
    pub command_type: String, // "TextExpansion", "KeyboardShortcut", or "Workflow"
    #[serde(default)]
    pub workflow_steps: Option<Vec<WorkflowStep>>,
}

pub fn get_all_packs() -> Vec<CommandPack> {
    vec![
        CommandPack {
            id: "git".into(),
            name: "Git".into(),
            description: "Common Git commands".into(),
            commands: vec![
                PackCommand {
                    trigger_word: "status".into(),
                    expansion: "git status".into(),
                    command_type: "TextExpansion".into(),
                    workflow_steps: None,
                },
                PackCommand {
                    trigger_word: "pull".into(),
                    expansion: "git pull".into(),
                    command_type: "TextExpansion".into(),
                    workflow_steps: None,
                },
                PackCommand {
                    trigger_word: "push".into(),
                    expansion: "git push".into(),
                    command_type: "TextExpansion".into(),
                    workflow_steps: None,
                },
                PackCommand {
                    trigger_word: "commit {message}".into(),
                    expansion: "git commit -m \"{message}\"".into(),
                    command_type: "TextExpansion".into(),
                    workflow_steps: None,
                },
                PackCommand {
                    trigger_word: "branch {name}".into(),
                    expansion: "git checkout -b {name}".into(),
                    command_type: "TextExpansion".into(),
                    workflow_steps: None,
                },
                PackCommand {
                    trigger_word: "stash".into(),
                    expansion: "git stash".into(),
                    command_type: "TextExpansion".into(),
                    workflow_steps: None,
                },
                PackCommand {
                    trigger_word: "stash pop".into(),
                    expansion: "git stash pop".into(),
                    command_type: "TextExpansion".into(),
                    workflow_steps: None,
                },
                PackCommand {
                    trigger_word: "log".into(),
                    expansion: "git log --oneline -20".into(),
                    command_type: "TextExpansion".into(),
                    workflow_steps: None,
                },
                PackCommand {
                    trigger_word: "diff".into(),
                    expansion: "git diff".into(),
                    command_type: "TextExpansion".into(),
                    workflow_steps: None,
                },
                PackCommand {
                    trigger_word: "add all".into(),
                    expansion: "git add .".into(),
                    command_type: "TextExpansion".into(),
                    workflow_steps: None,
                },
            ],
        },
        CommandPack {
            id: "npm".into(),
            name: "NPM".into(),
            description: "Common NPM commands".into(),
            commands: vec![
                PackCommand {
                    trigger_word: "dev".into(),
                    expansion: "npm run dev".into(),
                    command_type: "TextExpansion".into(),
                    workflow_steps: None,
                },
                PackCommand {
                    trigger_word: "build".into(),
                    expansion: "npm run build".into(),
                    command_type: "TextExpansion".into(),
                    workflow_steps: None,
                },
                PackCommand {
                    trigger_word: "test".into(),
                    expansion: "npm test".into(),
                    command_type: "TextExpansion".into(),
                    workflow_steps: None,
                },
                PackCommand {
                    trigger_word: "start".into(),
                    expansion: "npm start".into(),
                    command_type: "TextExpansion".into(),
                    workflow_steps: None,
                },
                PackCommand {
                    trigger_word: "lint".into(),
                    expansion: "npm run lint".into(),
                    command_type: "TextExpansion".into(),
                    workflow_steps: None,
                },
            ],
        },
        CommandPack {
            id: "workflows".into(),
            name: "Git Workflows".into(),
            description: "Multi-step Git workflows triggered by voice".into(),
            commands: vec![
                PackCommand {
                    trigger_word: "push changes {message}".into(),
                    expansion: "git add . → <enter> → git commit -m \"{message}\" → <enter> → git push → <enter>".into(),
                    command_type: "Workflow".into(),
                    workflow_steps: Some(vec![
                        WorkflowStep { step_type: "text".into(), value: "git add .".into() },
                        WorkflowStep { step_type: "key".into(), value: "enter".into() },
                        WorkflowStep { step_type: "delay".into(), value: "500".into() },
                        WorkflowStep { step_type: "text".into(), value: "git commit -m \"{message}\"".into() },
                        WorkflowStep { step_type: "key".into(), value: "enter".into() },
                        WorkflowStep { step_type: "delay".into(), value: "1000".into() },
                        WorkflowStep { step_type: "text".into(), value: "git push".into() },
                        WorkflowStep { step_type: "key".into(), value: "enter".into() },
                    ]),
                },
                PackCommand {
                    trigger_word: "stash and pull".into(),
                    expansion: "git stash → <enter> → git pull → <enter> → git stash pop → <enter>".into(),
                    command_type: "Workflow".into(),
                    workflow_steps: Some(vec![
                        WorkflowStep { step_type: "text".into(), value: "git stash".into() },
                        WorkflowStep { step_type: "key".into(), value: "enter".into() },
                        WorkflowStep { step_type: "delay".into(), value: "500".into() },
                        WorkflowStep { step_type: "text".into(), value: "git pull".into() },
                        WorkflowStep { step_type: "key".into(), value: "enter".into() },
                        WorkflowStep { step_type: "delay".into(), value: "1000".into() },
                        WorkflowStep { step_type: "text".into(), value: "git stash pop".into() },
                        WorkflowStep { step_type: "key".into(), value: "enter".into() },
                    ]),
                },
            ],
        },
        CommandPack {
            id: "shortcuts".into(),
            name: "macOS Shortcuts".into(),
            description: "Common macOS keyboard shortcuts".into(),
            commands: vec![
                PackCommand {
                    trigger_word: "copy".into(),
                    expansion: "Cmd+C".into(),
                    command_type: "KeyboardShortcut".into(),
                    workflow_steps: None,
                },
                PackCommand {
                    trigger_word: "paste".into(),
                    expansion: "Cmd+V".into(),
                    command_type: "KeyboardShortcut".into(),
                    workflow_steps: None,
                },
                PackCommand {
                    trigger_word: "undo".into(),
                    expansion: "Cmd+Z".into(),
                    command_type: "KeyboardShortcut".into(),
                    workflow_steps: None,
                },
                PackCommand {
                    trigger_word: "save".into(),
                    expansion: "Cmd+S".into(),
                    command_type: "KeyboardShortcut".into(),
                    workflow_steps: None,
                },
                PackCommand {
                    trigger_word: "find".into(),
                    expansion: "Cmd+F".into(),
                    command_type: "KeyboardShortcut".into(),
                    workflow_steps: None,
                },
                PackCommand {
                    trigger_word: "new tab".into(),
                    expansion: "Cmd+T".into(),
                    command_type: "KeyboardShortcut".into(),
                    workflow_steps: None,
                },
                PackCommand {
                    trigger_word: "close tab".into(),
                    expansion: "Cmd+W".into(),
                    command_type: "KeyboardShortcut".into(),
                    workflow_steps: None,
                },
                PackCommand {
                    trigger_word: "spotlight".into(),
                    expansion: "Cmd+Space".into(),
                    command_type: "KeyboardShortcut".into(),
                    workflow_steps: None,
                },
            ],
        },
    ]
}
