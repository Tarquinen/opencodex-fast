import {
    existsSync,
    mkdirSync,
    readFileSync,
    renameSync,
    writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { Plugin } from "@opencode-ai/plugin";
import { parseFastState } from "./fast-status-state.js";

const FAST_ON_MESSAGE = "Fast mode is now ON.";
const FAST_OFF_MESSAGE = "Fast mode is now OFF.";
const FAST_HANDLED_ERROR = "__FAST_HANDLED__";
const STATE_PATH = join(
    process.env.XDG_CONFIG_HOME || join(homedir(), ".config"),
    "opencode",
    "opencodex-fast.jsonc",
);

let fastEnabled = false;

function ensureStateDir(): void {
    mkdirSync(dirname(STATE_PATH), { recursive: true });
}

function resolveUrl(input: any): string {
    if (typeof input === "string") return input;
    if (input instanceof URL) return input.href;
    return input?.url ?? "";
}

function isCodexUrl(url: string): boolean {
    return url.includes("/backend-api/codex/responses");
}

function parseBody(body: unknown): Record<string, unknown> | null {
    if (typeof body !== "string") return null;

    try {
        const parsed = JSON.parse(body);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            return null;
        }
        return parsed as Record<string, unknown>;
    } catch {
        return null;
    }
}

function writeState(enabled: boolean): void {
    ensureStateDir();
    const tempPath = `${STATE_PATH}.tmp`;
    const content = `${JSON.stringify({ enabled }, null, 2)}\n`;
    writeFileSync(tempPath, content, "utf8");
    renameSync(tempPath, STATE_PATH);
}

function readState(): boolean {
    try {
        if (!existsSync(STATE_PATH)) {
            writeState(false);
            return false;
        }

        const parsed = parseFastState(readFileSync(STATE_PATH, "utf8"));
        return parsed.kind === "valid" && parsed.enabled;
    } catch {
        return false;
    }
}

function maybeInjectPriority(init: any, input: any): any {
    const url = resolveUrl(input);
    if (!isCodexUrl(url)) return init;
    fastEnabled = readState();
    if (!fastEnabled) return init;

    const body = parseBody(init?.body);
    if (!body) return init;
    if (body.service_tier === "priority") return init;

    return {
        ...init,
        body: JSON.stringify({
            ...body,
            service_tier: "priority",
        }),
    };
}

async function sendIgnoredMessage(
    client: any,
    sessionID: string,
    text: string,
): Promise<void> {
    await client.session.prompt({
        path: { id: sessionID },
        body: {
            noReply: true,
            parts: [
                {
                    type: "text",
                    text,
                    ignored: true,
                },
            ],
        },
    });
}

function getFastMessage(modeArg?: string): string {
    fastEnabled = readState();
    const normalized = modeArg?.toLowerCase();

    if (normalized === "on") {
        fastEnabled = true;
        writeState(true);
        return FAST_ON_MESSAGE;
    }

    if (normalized === "off") {
        fastEnabled = false;
        writeState(false);
        return FAST_OFF_MESSAGE;
    }

    if (normalized === "status") {
        return fastEnabled ? FAST_ON_MESSAGE : FAST_OFF_MESSAGE;
    }

    if (fastEnabled) {
        fastEnabled = false;
        writeState(false);
        return FAST_OFF_MESSAGE;
    }

    fastEnabled = true;
    writeState(true);
    return FAST_ON_MESSAGE;
}

const plugin: Plugin = async (ctx) => {
    fastEnabled = readState();
    const originalFetch = globalThis.fetch;

    globalThis.fetch = async (input: any, init?: any) => {
        const nextInit = maybeInjectPriority(init, input);
        return originalFetch(input, nextInit);
    };

    return {
        config: async (opencodeConfig) => {
            opencodeConfig.command ??= {};
            opencodeConfig.command["fast"] = {
                template: "[on|off|status]",
                description: "Toggle Codex priority service tier injection",
            };
        },

        "command.execute.before": async (
            input: { command: string; sessionID: string; arguments: string },
            _output: { parts: any[] },
        ) => {
            if (input.command !== "fast") {
                return;
            }

            const message = getFastMessage(input.arguments.trim() || undefined);
            await sendIgnoredMessage(ctx.client, input.sessionID, message);
            throw new Error(FAST_HANDLED_ERROR);
        },
    };
};

export default plugin;
