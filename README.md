# opencodex-fast

An OpenCode plugin that adds `"service_tier": "priority"` to eligible Codex requests for a Fast-enabled chat session.

## Per-session Fast mode

- `/fast`, `/fast on`, `/fast off`, and `/fast status` apply only to the current session.
- Session metadata is the source of truth, so the same session stays synchronized in multiple TUI windows. Different sessions remain isolated.
- The server entry marks only Fast-enabled sessions. The request wrapper removes that private marker before forwarding every request and injects priority only for the Codex endpoint (`/backend-api/codex/responses`), leaving OpenAI API-key requests untouched.
- The legacy global `~/.config/opencode/opencodex-fast.jsonc` file is ignored and never modified.

## Terminal TUI

Install the TUI entry as well as the server entry to get indicators and `Ctrl+Y`:

- In a session, `Ctrl+Y` toggles Fast for that session. The indicator is driven by reactive session metadata.
- On the home screen, `Ctrl+Y` arms Fast only in that TUI window. Its indicator shows the local arm/reservation state. The next newly created session in that window inherits Fast before its first request; the arm is one-shot and nonpersistent.
- Home-screen arming does not affect other TUI windows or existing sessions.

## Installation

For OpenCode Desktop or server-only use, add the package only to the OpenCode configuration:

```jsonc
// opencode.jsonc (server entry; Desktop and terminal)
{ "plugin": ["opencodex-fast@latest"] }
```

For the complete terminal experience (session indicators and `Ctrl+Y`), add it to both `opencode.jsonc` and the TUI configuration:

```jsonc
// tui.jsonc (terminal TUI entry)
{ "plugin": ["opencodex-fast@latest"] }
```

OpenCode 1.18.1+ is required for the TUI integration.
