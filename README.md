# opencodex-fast

An OpenCode plugin that adds `"service_tier": "priority"` to Codex requests when `/fast` is enabled globally.

## What it does

- Adds a `/fast` command to OpenCode
- When enabled, injects `service_tier: "priority"` into requests sent to `https://chatgpt.com/backend-api/codex/responses`
- Mirrors Codex Fast mode, which is documented as 1.5x faster at 2x credit cost
- Leaves all non-Codex requests untouched
- Persists a single global `enabled` flag in the OpenCode config directory
  (typically `~/.config/opencode/opencodex-fast.jsonc`)
- Shows a `fast` indicator beside the terminal TUI home and session prompts
  while fast mode is enabled
- Supports `Ctrl+Y` in the terminal TUI's base mode to toggle fast mode globally

## Commands

```text
/fast           Toggle fast mode globally
/fast on        Enable fast mode
/fast off       Disable fast mode
/fast status    Show current global fast-mode state
```

## Installation

Add to your OpenCode config to enable `/fast` and Codex request injection in
both OpenCode Desktop and the terminal client:

```jsonc
// opencode.jsonc
{
  "plugin": ["opencodex-fast@latest"],
}
```

OpenCode 1.18.1 and newer can also load the package's terminal TUI entry point.
Add the same package to your TUI config to show the status indicator and enable
`Ctrl+Y`:

```jsonc
// tui.jsonc
{
  "plugin": ["opencodex-fast@latest"],
}
```

The server and TUI entry points are separate. List the plugin in both files for
the complete terminal experience; the Desktop app only uses the server entry
from `opencode.jsonc`. The status indicator and `Ctrl+Y` binding are therefore
terminal-only. The TUI integration requires OpenCode 1.18.1+. The indicator
uses the active theme's warning color and remains hidden while fast mode is
off.
