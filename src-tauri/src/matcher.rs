use crate::snippets::VoiceCommand;
use strsim::normalized_levenshtein;

#[derive(Debug, Clone)]
pub struct MatchResult {
    pub command: VoiceCommand,
    pub score: f64,
    /// The final expansion text (with parameters substituted if applicable).
    pub resolved_expansion: String,
}

/// Match a transcription against configured voice commands with app-aware filtering.
/// Returns matches sorted by score (highest first) above the given threshold.
/// App-specific commands are prioritized: first app-specific matches, then global matches.
pub fn find_matches_with_app(
    transcription: &str,
    commands: &[VoiceCommand],
    threshold: f64,
    current_app_id: Option<&str>,
    current_app_name: Option<&str>,
) -> Vec<MatchResult> {
    let input = transcription.to_lowercase().trim().to_string();

    if input.is_empty() {
        return Vec::new();
    }

    // Filter commands by app context
    let app_specific_cmds: Vec<&VoiceCommand> = commands
        .iter()
        .filter(|cmd| {
            !cmd.app_filters.is_empty() && cmd.applies_to_app(current_app_id, current_app_name)
        })
        .collect();

    let global_cmds: Vec<&VoiceCommand> = commands
        .iter()
        .filter(|cmd| cmd.app_filters.is_empty())
        .collect();

    // Match app-specific commands first
    let mut matches: Vec<MatchResult> = app_specific_cmds
        .iter()
        .chain(global_cmds.iter())
        .map(|cmd| {
            // Check primary trigger and all aliases, keep the best score
            let best_score = cmd
                .all_triggers()
                .iter()
                .map(|t| {
                    let base = if let Some(idx) = t.find('{') {
                        t[..idx].trim()
                    } else {
                        t.trim()
                    };
                    normalized_levenshtein(&input, &base.to_lowercase())
                })
                .fold(0.0_f64, f64::max);
            MatchResult {
                resolved_expansion: cmd.expansion.clone(),
                command: (*cmd).clone(),
                score: best_score,
            }
        })
        .filter(|m| m.score >= threshold)
        .collect();

    // Sort by score, with app-specific commands boosted slightly in precedence
    matches.sort_by(|a, b| {
        let a_is_app_specific = !a.command.app_filters.is_empty();
        let b_is_app_specific = !b.command.app_filters.is_empty();

        match (a_is_app_specific, b_is_app_specific) {
            (true, false) => std::cmp::Ordering::Less, // App-specific comes first
            (false, true) => std::cmp::Ordering::Greater,
            _ => b.score.partial_cmp(&a.score).unwrap(), // Same priority, sort by score
        }
    });

    matches
}

/// Try to find a single best match with app-aware filtering.
/// Tries both exact/fuzzy match and parameterized matching, returning the highest-scoring match.
/// Parameterized matches are preferred when they achieve a perfect or near-perfect score
/// on the trigger prefix, as this indicates a more specific match.
pub fn find_best_match_with_app(
    transcription: &str,
    commands: &[VoiceCommand],
    threshold: f64,
    current_app_id: Option<&str>,
    current_app_name: Option<&str>,
) -> Option<MatchResult> {
    let input = transcription.to_lowercase().trim().to_string();
    if input.is_empty() {
        return None;
    }

    // 1. Try full-text match
    let full_match = find_matches_with_app(
        transcription,
        commands,
        threshold,
        current_app_id,
        current_app_name,
    )
        .into_iter()
        .next();

    // 2. Try parameterized match: for commands with {param} in expansion,
    //    match the beginning of the transcription against the base trigger.
    let param_match = find_parameterized_match_with_app(
        &input,
        commands,
        threshold,
        current_app_id,
        current_app_name,
    );

    // Return the match with the highest score, preferring parameterized matches
    // in case of a tie (since they're more specific).
    match (full_match, param_match) {
        (Some(f), Some(p)) => {
            if p.score >= f.score {
                Some(p)
            } else {
                Some(f)
            }
        }
        (Some(f), None) => Some(f),
        (None, Some(p)) => Some(p),
        (None, None) => None,
    }
}

/// For commands whose expansion contains `{...}`, check if the transcription
/// starts with the base trigger. If so, capture the remaining words as parameters.
/// Supports app-aware filtering and prioritization.
fn find_parameterized_match_with_app(
    input: &str,
    commands: &[VoiceCommand],
    threshold: f64,
    current_app_id: Option<&str>,
    current_app_name: Option<&str>,
) -> Option<MatchResult> {
    let input_words: Vec<&str> = input.split_whitespace().collect();
    if input_words.is_empty() {
        return None;
    }

    // Filter commands by app context, prioritizing app-specific ones
    let app_specific_cmds: Vec<&VoiceCommand> = commands
        .iter()
        .filter(|cmd| {
            cmd.has_parameters()
                && !cmd.app_filters.is_empty()
                && cmd.applies_to_app(current_app_id, current_app_name)
        })
        .collect();

    let global_cmds: Vec<&VoiceCommand> = commands
        .iter()
        .filter(|cmd| cmd.has_parameters() && cmd.app_filters.is_empty())
        .collect();

    let mut best: Option<MatchResult> = None;

    // Check app-specific commands first, then global commands
    for cmd in app_specific_cmds.iter().chain(global_cmds.iter()) {
        // Check the primary trigger and all aliases
        for trigger in cmd.all_triggers() {
            let base = if let Some(idx) = trigger.find('{') {
                trigger[..idx].trim()
            } else {
                trigger.trim()
            };
            let base = base.to_lowercase();
            let base_words: Vec<&str> = base.split_whitespace().collect();
            if base_words.is_empty() || input_words.len() <= base_words.len() {
                continue;
            }

            let input_prefix = input_words[..base_words.len()].join(" ");
            let score = normalized_levenshtein(&input_prefix, &base);

            if score >= threshold {
                let remaining = input_words[base_words.len()..].join(" ");
                let resolved = cmd.expand_with_params(&remaining);

                // Prioritize app-specific matches over global matches
                let is_app_specific = !cmd.app_filters.is_empty();
                let is_better = if let Some(ref b) = best {
                    let b_is_app_specific = !b.command.app_filters.is_empty();
                    match (is_app_specific, b_is_app_specific) {
                        (true, false) => true, // App-specific is better than global
                        (false, true) => false, // Global is worse than app-specific
                        _ => score > b.score, // Same category, compare scores
                    }
                } else {
                    true
                };

                if is_better {
                    best = Some(MatchResult {
                        resolved_expansion: resolved,
                        command: (*cmd).clone(),
                        score,
                    });
                }
            }
        }
    }

    best
}
/// Conjunctions used to split chained voice commands.
/// Ordered from longest to shortest to avoid partial matches.
const CHAIN_CONJUNCTIONS: &[&str] = &[" and then ", " then ", " and "];

/// Try to split a transcription on conjunctions and match each segment independently.
/// Supports app-aware filtering. Returns `Some(vec)` only when ALL segments match a command.
/// Each conjunction is tried as the sole splitter (not progressively) so that
/// triggers containing a conjunction word (e.g. "search and replace") are preserved.
pub fn find_chained_matches_with_app(
    transcription: &str,
    commands: &[VoiceCommand],
    threshold: f64,
    current_app_id: Option<&str>,
    current_app_name: Option<&str>,
) -> Option<Vec<MatchResult>> {
    let input = transcription.to_lowercase().trim().to_string();
    if input.is_empty() {
        return None;
    }

    for conj in CHAIN_CONJUNCTIONS {
        let parts: Vec<String> = input
            .split(conj)
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();

        if parts.len() < 2 {
            continue;
        }

        let matches: Vec<Option<MatchResult>> = parts
            .iter()
            .map(|part| {
                find_best_match_with_app(part, commands, threshold, current_app_id, current_app_name)
            })
            .collect();

        if matches.iter().all(|m| m.is_some()) {
            return Some(matches.into_iter().map(|m| m.unwrap()).collect());
        }
    }

    None
}

/// Apply custom word remapping to transcribed text using fuzzy matching.
/// For each custom word, tries to find similar words in the transcription and replaces them.
///
/// # Arguments
/// * `text` - The transcribed text to process
/// * `custom_words` - List of target words to match/replace to
/// * `threshold` - Fuzzy match threshold (0.0 to 1.0)
///
/// # Example
/// If custom_words = ["tauri", "github"], and text = "please send to tawri and github page"
/// With threshold 0.7, might replace "tawri" with "tauri"
pub fn apply_word_remapping(text: &str, custom_words: &[String], threshold: f64) -> String {
    if custom_words.is_empty() || text.is_empty() {
        return text.to_string();
    }

    let words: Vec<&str> = text.split_whitespace().collect();
    let mut result_words = Vec::new();

    for word in words {
        let word_lower = word.to_lowercase();
        let mut best_match: Option<(String, f64)> = None;

        // Find the best custom word match for this transcribed word
        for custom_word in custom_words {
            let custom_lower = custom_word.to_lowercase();
            let score = normalized_levenshtein(&word_lower, &custom_lower);

            if score >= threshold {
                if let Some(ref best) = best_match {
                    if score > best.1 {
                        best_match = Some((custom_word.clone(), score));
                    }
                } else {
                    best_match = Some((custom_word.clone(), score));
                }
            }
        }

        // Use the best match if found, otherwise keep original word
        if let Some((replacement, _)) = best_match {
            result_words.push(replacement);
        } else {
            result_words.push(word.to_string());
        }
    }

    result_words.join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::snippets::{CommandType, VoiceCommand};

    fn make_cmd(trigger: &str, expansion: &str) -> VoiceCommand {
        VoiceCommand {
            id: trigger.to_string(),
            trigger_word: trigger.to_string(),
            expansion: expansion.to_string(),
            command_type: CommandType::TextExpansion,
            category: None,
            aliases: Vec::new(),
            app_filters: Vec::new(),
            workflow_steps: None,
            created_at: String::new(),
            last_used_at: None,
            use_count: 0,
        }
    }

    fn make_cmd_with_aliases(trigger: &str, expansion: &str, aliases: Vec<&str>) -> VoiceCommand {
        let mut cmd = make_cmd(trigger, expansion);
        cmd.aliases = aliases.into_iter().map(|s| s.to_string()).collect();
        cmd
    }

    #[test]
    fn chained_two_commands_with_and() {
        let cmds = vec![make_cmd("new file", "Cmd+N"), make_cmd("save", "Cmd+S")];
        let result = find_chained_matches_with_app("new file and save", &cmds, 0.6, None, None);
        assert!(result.is_some());
        let matches = result.unwrap();
        assert_eq!(matches.len(), 2);
        assert_eq!(matches[0].command.trigger_word, "new file");
        assert_eq!(matches[1].command.trigger_word, "save");
    }

    #[test]
    fn chained_two_commands_with_then() {
        let cmds = vec![make_cmd("new file", "Cmd+N"), make_cmd("save", "Cmd+S")];
        let result = find_chained_matches_with_app("new file then save", &cmds, 0.6, None, None);
        assert!(result.is_some());
        assert_eq!(result.unwrap().len(), 2);
    }

    #[test]
    fn chained_two_commands_with_and_then() {
        let cmds = vec![make_cmd("new file", "Cmd+N"), make_cmd("save", "Cmd+S")];
        let result = find_chained_matches_with_app("new file and then save", &cmds, 0.6, None, None);
        assert!(result.is_some());
        assert_eq!(result.unwrap().len(), 2);
    }

    #[test]
    fn chained_three_commands() {
        let cmds = vec![
            make_cmd("new file", "Cmd+N"),
            make_cmd("save", "Cmd+S"),
            make_cmd("close", "Cmd+W"),
        ];
        let result = find_chained_matches_with_app(
            "new file and save and close",
            &cmds,
            0.6,
            None,
            None,
        );
        assert!(result.is_some());
        assert_eq!(result.unwrap().len(), 3);
    }

    #[test]
    fn chained_returns_none_when_partial_match() {
        let cmds = vec![make_cmd("save", "Cmd+S")];
        let result = find_chained_matches_with_app("new file and save", &cmds, 0.6, None, None);
        assert!(result.is_none());
    }

    #[test]
    fn chained_returns_none_for_single_command() {
        let cmds = vec![make_cmd("save", "Cmd+S")];
        let result = find_chained_matches_with_app("save", &cmds, 0.6, None, None);
        assert!(result.is_none());
    }

    #[test]
    fn chained_preserves_trigger_containing_and() {
        let cmds = vec![
            make_cmd("search and replace", "Cmd+H"),
            make_cmd("save", "Cmd+S"),
        ];
        // "then" split should work: ["search and replace", "save"]
        let result = find_chained_matches_with_app(
            "search and replace then save",
            &cmds,
            0.6,
            None,
            None,
        );
        assert!(result.is_some());
        let matches = result.unwrap();
        assert_eq!(matches.len(), 2);
        assert_eq!(matches[0].command.trigger_word, "search and replace");
    }

    // --- Alias tests ---

    #[test]
    fn alias_matches_primary_trigger() {
        let cmds = vec![make_cmd_with_aliases(
            "new file",
            "Cmd+N",
            vec!["create file", "make file"],
        )];
        let result = find_best_match_with_app("new file", &cmds, 0.6, None, None);
        assert!(result.is_some());
        assert_eq!(result.unwrap().command.trigger_word, "new file");
    }

    #[test]
    fn alias_matches_alias_trigger() {
        let cmds = vec![make_cmd_with_aliases(
            "new file",
            "Cmd+N",
            vec!["create file", "make file"],
        )];
        let result = find_best_match_with_app("create file", &cmds, 0.6, None, None);
        assert!(result.is_some());
        assert_eq!(result.unwrap().command.trigger_word, "new file");
    }

    #[test]
    fn alias_matches_second_alias() {
        let cmds = vec![make_cmd_with_aliases(
            "new file",
            "Cmd+N",
            vec!["create file", "make file"],
        )];
        let result = find_best_match_with_app("make file", &cmds, 0.6, None, None);
        assert!(result.is_some());
        assert_eq!(result.unwrap().command.trigger_word, "new file");
    }

    #[test]
    fn alias_works_in_chained_commands() {
        let cmds = vec![
            make_cmd_with_aliases("new file", "Cmd+N", vec!["create file"]),
            make_cmd("save", "Cmd+S"),
        ];
        let result = find_chained_matches_with_app("create file and save", &cmds, 0.6, None, None);
        assert!(result.is_some());
        let matches = result.unwrap();
        assert_eq!(matches.len(), 2);
        assert_eq!(matches[0].command.trigger_word, "new file");
        assert_eq!(matches[1].command.trigger_word, "save");
    }

    #[test]
    fn alias_no_match_unrelated_text() {
        let cmds = vec![make_cmd_with_aliases(
            "new file",
            "Cmd+N",
            vec!["create file"],
        )];
        let result = find_best_match_with_app("delete everything", &cmds, 0.6, None, None);
        assert!(result.is_none());
    }
}
