import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { parseFastState } from "./fast-status-state.js";

export const FAST_TOGGLE_COMMAND = "opencodex-fast.toggle";
export const FAST_TOGGLE_TITLE = "Toggle Fast mode";

export type FastToggleCommand = {
    readonly name: typeof FAST_TOGGLE_COMMAND;
    readonly title: typeof FAST_TOGGLE_TITLE;
    readonly category: "Plugin";
    readonly namespace: "palette";
    readonly run: () => Promise<void>;
};

export type FastToggleLayer = {
    readonly mode: "base";
    readonly commands: readonly [FastToggleCommand];
    readonly bindings: readonly [{
        readonly key: "ctrl+y";
        readonly cmd: typeof FAST_TOGGLE_COMMAND;
        readonly desc: typeof FAST_TOGGLE_TITLE;
    }];
};

export async function readPersistedFastState(path: string): Promise<boolean> {
    try {
        const parsed = parseFastState(await readFile(path, "utf8"));
        return parsed.kind === "valid" && parsed.enabled;
    } catch {
        return false;
    }
}

export async function togglePersistedFastState(path: string): Promise<boolean> {
    const enabled = !(await readPersistedFastState(path));
    await mkdir(dirname(path), { recursive: true });

    const tempPath = `${path}.${process.pid}.${crypto.randomUUID()}.tmp`;
    await writeFile(tempPath, `${JSON.stringify({ enabled }, null, 2)}\n`, "utf8");
    await rename(tempPath, path);
    return enabled;
}

export function createFastToggleLayer(
    path: string,
    refresh: () => Promise<void>,
): FastToggleLayer {
    let inFlight = false;

    return {
        mode: "base",
        commands: [
            {
                name: FAST_TOGGLE_COMMAND,
                title: FAST_TOGGLE_TITLE,
                category: "Plugin",
                namespace: "palette",
                async run(): Promise<void> {
                    if (inFlight) return;
                    inFlight = true;
                    try {
                        await togglePersistedFastState(path);
                        await refresh();
                    } finally {
                        inFlight = false;
                    }
                },
            },
        ],
        bindings: [
            {
                key: "ctrl+y",
                cmd: FAST_TOGGLE_COMMAND,
                desc: FAST_TOGGLE_TITLE,
            },
        ],
    };
}
