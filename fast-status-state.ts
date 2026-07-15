import { parse, type ParseError } from "jsonc-parser";
import { z } from "zod";

export const FAST_STATUS_POLL_MS = 500;

const FastStateSchema = z.object({
    enabled: z.boolean(),
});

export type ParsedFastState =
    | { readonly kind: "valid"; readonly enabled: boolean }
    | { readonly kind: "invalid" };

export type FastStateMonitorOptions = {
    readonly path: string;
    readonly readText: (path: string) => Promise<string>;
    readonly onChange: (enabled: boolean) => void;
    readonly schedule: (
        poll: () => Promise<void>,
        intervalMs: number,
    ) => () => void;
};

export type FastStateMonitor = {
    readonly isEnabled: () => boolean;
    readonly start: () => Promise<void>;
    readonly refresh: () => Promise<void>;
    readonly dispose: () => void;
};

export function parseFastState(content: string): ParsedFastState {
    const normalized =
        content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
    const errors: ParseError[] = [];
    const decoded: unknown = parse(normalized, errors, {
        allowTrailingComma: true,
    });
    if (errors.length > 0) return { kind: "invalid" };

    const parsed = FastStateSchema.safeParse(decoded);
    return parsed.success
        ? { kind: "valid", enabled: parsed.data.enabled }
        : { kind: "invalid" };
}

export function createFastStateMonitor(
    options: FastStateMonitorOptions,
): FastStateMonitor {
    let enabled = false;
    let disposed = false;
    let started = false;
    let refreshing = false;
    let stop: (() => void) | undefined;

    async function refresh(): Promise<void> {
        if (disposed || refreshing) return;
        refreshing = true;

        let readResult:
            | { readonly kind: "readable"; readonly content: string }
            | { readonly kind: "unreadable" };
        try {
            const content = await options.readText(options.path);
            readResult = { kind: "readable", content };
        } catch {
            readResult = { kind: "unreadable" };
        } finally {
            refreshing = false;
        }
        if (disposed || readResult.kind === "unreadable") return;

        const parsed = parseFastState(readResult.content);
        if (parsed.kind === "invalid" || parsed.enabled === enabled) return;

        enabled = parsed.enabled;
        options.onChange(enabled);
    }

    return {
        isEnabled: () => enabled,
        async start(): Promise<void> {
            if (started || disposed) return;
            started = true;
            await refresh();
            if (disposed) return;
            stop = options.schedule(refresh, FAST_STATUS_POLL_MS);
        },
        refresh,
        dispose(): void {
            if (disposed) return;
            disposed = true;
            const currentStop = stop;
            stop = undefined;
            currentStop?.();
        },
    };
}
