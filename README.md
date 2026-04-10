# opencodex-fast

An OpenCode plugin that adds `"service_tier": "priority"` to matching requests when `/fast` is enabled.

## What It Does

- Adds a `/fast` command to OpenCode
- By default, injects `service_tier: "priority"` into requests whose URL contains `/backend-api/codex/responses`
- Supports additional third-party URL prefixes through plugin options in `opencode.json`
- Leaves all other requests untouched
- Supports configuring startup `enabled` state in plugin options
- Keeps backward compatibility with `~/.config/opencode/opencodex-fast.jsonc`

## Commands

```text
/fast           Toggle fast mode
/fast on        Enable fast mode
/fast off       Disable fast mode
/fast status    Show current fast-mode state
```

## Installation

Add the plugin to your OpenCode config:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencodex-fast@latest"]
}
```

## Configuration

You can pass plugin options directly on the `opencodex-fast` plugin entry in `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "@example-org/one-plugin",
    [
      "opencodex-fast@latest",
      {
        "enabled": true,
        "extraUrlPrefixes": [
          "https://third-party.example.com/v1",
          "https://proxy.example.com/backend-api/codex/responses"
        ]
      }
    ],
    "@example-org/another-plugin"
  ]
}
```

### Options

- `enabled`: starts OpenCode with fast mode already enabled so you do not need to run `/fast` manually
- `extraUrlPrefixes`: additional URL prefixes to match for priority injection, such as a provider `baseUrl` or a more specific endpoint URL; these are added on top of the built-in Codex matcher, not used instead of it

### Behavior Notes

- The built-in Codex matcher `/backend-api/codex/responses` is always kept; `extraUrlPrefixes` only adds more matches
- Use a provider `baseUrl` for broader matching, or a more specific endpoint URL prefix for tighter matching
- If plugin config sets `enabled`, that value takes precedence on startup
- If plugin config does not set `enabled`, the plugin falls back to `~/.config/opencode/opencodex-fast.jsonc`
- `/fast` still updates the current session and writes the state file for backward compatibility
- When plugin config sets `enabled`, restarting OpenCode restores the configured value even if `/fast` changed it during the previous session
