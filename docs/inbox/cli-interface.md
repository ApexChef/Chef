# CLI Interface Improvements

## Context

The current CLI output mixes debug logging with user-facing feedback, making it difficult to follow pipeline progress. Log statements appear for every line with prefixes like `[DependencyMapping]`, `[ConfidenceScoring]`, and JSON log objects are displayed inline with user output.

**Current problems:**
- Debug JSON logs displayed to end users
- Repetitive step prefixes on every line instead of section headers
- No visual hierarchy or separation between pipeline phases
- Lack of color coding, spacing, or visual polish

## Items

### Separate Debug Logging from User Output

**Type:** tech-debt

As a CLI user, I want debug logs separated from pipeline feedback so that I can follow progress without technical noise.

**Current Behavior:**
```
{"level":30,"time":"2025-12-24T11:48:15.356Z","pid":8432,...}
[DependencyMapping] Analyzing 3 candidates...
[DependencyMapping] LLM identified 3 dependencies
```

**Desired Behavior:**
- Debug/JSON logs only appear with `--verbose` or `LOG_LEVEL=debug`
- User output shows clean, formatted progress updates

**Requirements:**
- Implement log level filtering for CLI output
- Default to user-friendly output (no JSON logs)
- Support `--verbose` flag for debug output
- Optionally write debug logs to file instead of stdout

**Acceptance Criteria:**
- [ ] Running `chef backlog process` shows only user-friendly output by default
- [ ] Running with `--verbose` shows detailed debug information
- [ ] JSON log objects never appear in default output
- [ ] Debug logs can be redirected to a file via `LOG_TO_FILE` env var

---

### Implement Section Headers for Pipeline Steps

**Type:** feature

As a CLI user, I want clear section headers for each pipeline phase so that I can understand where I am in the process.

**Current Behavior:**
Every log line has a prefix: `[DependencyMapping] ...`, `[ConfidenceScoring] ...`

**Desired Behavior:**
```
═══════════════════════════════════════
  DEPENDENCY MAPPING
═══════════════════════════════════════
Analyzing 3 candidates...
Identified 3 dependencies

═══════════════════════════════════════
  CONFIDENCE SCORING
═══════════════════════════════════════
Scoring PBI-001... 34/100 (Poor)
```

**Requirements:**
- Single section header per pipeline phase
- Clear visual separation between phases
- Remove repetitive prefixes from individual log lines
- Use consistent header styling

**Acceptance Criteria:**
- [ ] Each pipeline phase displays one header at the start
- [ ] Individual lines within a phase have no prefix
- [ ] Visual separators exist between phases
- [ ] Header style is consistent across all phases

---

### Add Visual Polish to CLI Output

**Type:** feature

As a CLI user, I want visually appealing output with colors and formatting so that the tool feels professional and information is easy to scan.

**Current Behavior:**
Plain monochrome text with no visual hierarchy.

**Desired Behavior:**
- Color-coded output (success=green, warning=yellow, error=red)
- Score indicators with color (Poor=red, Fair=yellow, Good=green)
- Proper spacing between sections
- Progress indicators for long-running operations
- Optional ASCII art/branding

**Requirements:**
- Research CLI UI libraries (ink, chalk, ora, cli-progress, boxen)
- Implement color scheme for different message types
- Add spinners/progress for LLM calls
- Respect `NO_COLOR` environment variable
- Ensure output degrades gracefully in non-TTY environments

**Acceptance Criteria:**
- [ ] Scores are color-coded based on thresholds
- [ ] Errors appear in red, warnings in yellow, success in green
- [ ] Long-running operations show a spinner or progress
- [ ] Output works in non-color terminals (graceful fallback)
- [ ] Spacing creates clear visual sections

**Technical Notes:**
- Consider libraries: `chalk` (colors), `ora` (spinners), `boxen` (boxes), `ink` (React for CLI)
- Look at how `oclif` and other modern CLIs handle output formatting
- May need to refactor logging layer to support dual output (logs vs user display)

**Dependencies:**
- Depends on: Separate Debug Logging from User Output

---

## Out of Scope

- Web UI improvements (separate initiative)
- Changing the underlying pipeline logic
- Changing the checkpoint/persistence format

## Open Questions

- Should we use `ink` (React-based CLI) or simpler libraries like `chalk` + `ora`?
- What ASCII art/branding should appear at startup?
- Should colored output be opt-in or opt-out?
