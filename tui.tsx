/** @jsxImportSource @opentui/solid */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { TuiPlugin, TuiPluginModule } from "@opencode-ai/plugin/tui";
import { createSignal } from "solid-js";

import { createFastStateMonitor } from "./fast-status-state.js";
import { createFastToggleLayer } from "./fast-toggle.js";

const tui: TuiPlugin = async (api) => {
    const [enabled, setEnabled] = createSignal(false);
    const monitor = createFastStateMonitor({
        path: join(api.state.path.config, "opencodex-fast.jsonc"),
        readText: (path) => readFile(path, "utf8"),
        onChange(nextEnabled): void {
            setEnabled(nextEnabled);
            api.renderer.requestRender();
        },
        schedule(poll, intervalMs): () => void {
            const interval = setInterval(() => {
                void poll();
            }, intervalMs);
            return () => clearInterval(interval);
        },
    });

    api.keymap.registerLayer(
        createFastToggleLayer(
            join(api.state.path.config, "opencodex-fast.jsonc"),
            monitor.refresh,
        ),
    );

    api.slots.register({
        order: 90,
        slots: {
            home_prompt_right() {
                return enabled() ? (
                    <text fg={api.theme.current.warning}>fast</text>
                ) : null;
            },
            session_prompt_right() {
                return enabled() ? (
                    <text fg={api.theme.current.warning}>fast</text>
                ) : null;
            },
        },
    });

    api.lifecycle.onDispose(monitor.dispose);
    await monitor.start();
};

const plugin: TuiPluginModule = {
    id: "opencodex-fast-status",
    tui,
};

export default plugin;
