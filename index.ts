import type { Plugin } from "@opencode-ai/plugin";

import { isFastEnabled, normalizeMetadata, withFastEnabled } from "./fast-session-state.js";

const FAST_ON_MESSAGE = "Fast mode is now ON for this session.";
const FAST_OFF_MESSAGE = "Fast mode is now OFF for this session.";
const FAST_HANDLED_ERROR = "__FAST_HANDLED__";
const FAST_HEADER = "x-opencodex-fast";

type LegacySessionClient = {
    get: (input: { path: { id: string } }) => Promise<{ data?: unknown; error?: unknown }>;
    update: (input: { path: { id: string }; body: { metadata: Record<string, unknown> } }) => Promise<{ error?: unknown }>;
    prompt: (input: unknown) => Promise<unknown>;
};

function resolveUrl(input: unknown): string {
    if (typeof input === "string") return input;
    if (input instanceof URL) return input.href;
    return input && typeof input === "object" && "url" in input && typeof input.url === "string"
        ? input.url
        : "";
}

function isCodexUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        return parsed.protocol === "https:"
            && parsed.hostname === "chatgpt.com"
            && parsed.pathname.endsWith("/backend-api/codex/responses");
    } catch {
        return false;
    }
}

function parseBody(body: unknown): Record<string, unknown> | undefined {
    if (typeof body !== "string") return undefined;
    try {
        const parsed: unknown = JSON.parse(body);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed)
            ? parsed as Record<string, unknown>
            : undefined;
    } catch {
        return undefined;
    }
}

/** Removes the private session marker and injects priority only for Codex OAuth requests. */
export function prepareFastRequest(input: unknown, init?: RequestInit): RequestInit | undefined {
    const inputHeaders = input && typeof input === "object" && "headers" in input
        ? (input as { headers?: RequestInit["headers"] }).headers
        : undefined;
    const headers = new Headers(init?.headers ?? inputHeaders);
    const enabled = headers.get(FAST_HEADER) === "true";
    headers.delete(FAST_HEADER);
    const next: RequestInit = { ...init, headers };
    if (!enabled || !isCodexUrl(resolveUrl(input))) return next;

    const body = parseBody(init?.body);
    if (!body || body.service_tier === "priority") return next;
    return { ...next, body: JSON.stringify({ ...body, service_tier: "priority" }) };
}

function legacySessionClient(client: unknown): LegacySessionClient {
    return (client as { session: LegacySessionClient }).session;
}

function metadataFromResponse(data: unknown): Record<string, unknown> {
    if (!data || typeof data !== "object") return {};
    return normalizeMetadata((data as { metadata?: unknown }).metadata);
}

async function readSessionMetadata(client: unknown, sessionID: string): Promise<Record<string, unknown>> {
    const result = await legacySessionClient(client).get({ path: { id: sessionID } });
    if (result.error || !result.data) throw new Error("Could not read session metadata.");
    return metadataFromResponse(result.data);
}

async function sendIgnoredMessage(client: unknown, sessionID: string, text: string): Promise<void> {
    await legacySessionClient(client).prompt({
        path: { id: sessionID },
        body: { noReply: true, parts: [{ type: "text", text, ignored: true }] },
    });
}

const plugin: Plugin = async (ctx) => {
    const originalFetch = globalThis.fetch;
    const queues = new Map<string, Promise<void>>();
    globalThis.fetch = async (input, init) => originalFetch(input, prepareFastRequest(input, init));

    const queueSessionWrite = (
        sessionID: string,
        operation: (metadata: Record<string, unknown>) => boolean,
    ): Promise<boolean> => {
        const previous = queues.get(sessionID) ?? Promise.resolve();
        let enabled = false;
        const next = previous.catch(() => undefined).then(async () => {
            const metadata = await readSessionMetadata(ctx.client, sessionID);
            enabled = operation(metadata);
            const result = await legacySessionClient(ctx.client).update({
                path: { id: sessionID },
                body: { metadata: withFastEnabled(metadata, enabled) },
            });
            if (result.error) throw new Error("Could not update session Fast mode.");
        });
        queues.set(sessionID, next);
        return next.then(() => enabled).finally(() => {
            if (queues.get(sessionID) === next) queues.delete(sessionID);
        });
    };

    return {
        config: async (opencodeConfig) => {
            opencodeConfig.command ??= {};
            opencodeConfig.command.fast = { template: "[on|off|status]", description: "Toggle Codex priority service tier for this session" };
        },
        "chat.headers": async (input, output) => {
            try {
                if (isFastEnabled(await readSessionMetadata(ctx.client, input.sessionID))) {
                    output.headers[FAST_HEADER] = "true";
                }
            } catch {
                // Fail closed: without session metadata, never mark the request Fast.
            }
        },
        "command.execute.before": async (input) => {
            if (input.command !== "fast") return;
            const mode = input.arguments.trim().toLowerCase();
            if (mode === "status") {
                const enabled = isFastEnabled(await readSessionMetadata(ctx.client, input.sessionID));
                await sendIgnoredMessage(ctx.client, input.sessionID, enabled ? FAST_ON_MESSAGE : FAST_OFF_MESSAGE);
                throw new Error(FAST_HANDLED_ERROR);
            }
            const enabled = await queueSessionWrite(
                input.sessionID,
                (metadata) => mode === "on" ? true : mode === "off" ? false : !isFastEnabled(metadata),
            );
            await sendIgnoredMessage(ctx.client, input.sessionID, enabled ? FAST_ON_MESSAGE : FAST_OFF_MESSAGE);
            throw new Error(FAST_HANDLED_ERROR);
        },
    };
};

export default plugin;
