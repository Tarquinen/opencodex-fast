/** @jsxImportSource @opentui/solid */
import type { TuiPlugin, TuiPluginModule } from "@opencode-ai/plugin/tui";
import { createSignal } from "solid-js";

import { isFastEnabled, normalizeMetadata, withFastEnabled } from "./fast-session-state.js";

const FAST_TOGGLE_COMMAND = "opencodex-fast.toggle";

type SessionResult = { data?: { metadata?: unknown }; error?: unknown };
type SessionCreateParameters = {
    directory?: string;
    workspace?: string;
    parentID?: string;
    title?: string;
    agent?: string;
    model?: { id: string; providerID: string; variant?: string };
    metadata?: Record<string, unknown>;
    permission?: unknown;
    workspaceID?: string;
};
type SessionClient = {
    get: (input: { sessionID: string }) => Promise<SessionResult>;
    update: (input: { sessionID: string; metadata: Record<string, unknown> }) => Promise<SessionResult>;
    create: (this: SessionClient, input?: SessionCreateParameters, options?: unknown) => Promise<SessionResult>;
};

export function createHomeFastReservation(onChange: () => void): {
    readonly isArmed: () => boolean;
    readonly isReserved: () => boolean;
    readonly toggle: () => void;
    readonly wrap: (client: SessionClient, originalCreate: SessionClient["create"], isHome: () => boolean) => SessionClient["create"];
} {
    let armed = false;
    let reserved = false;
    let armVersion = 0;
    const changed = (): void => onChange();

    return {
        isArmed: () => armed,
        isReserved: () => reserved,
        toggle(): void {
            armVersion += 1;
            armed = !armed;
            changed();
        },
        wrap(client, originalCreate, isHome): SessionClient["create"] {
            return async function wrappedCreate(parameters = {}, options): Promise<SessionResult> {
                if (!isHome() || !armed || reserved) {
                    return originalCreate.call(client, parameters, options);
                }
                const version = armVersion;
                reserved = true;
                changed();
                try {
                    const result = await originalCreate.call(client, {
                        ...parameters,
                        metadata: withFastEnabled(parameters.metadata, true),
                    }, options);
                    if (armVersion === version) armed = result.error ? true : false;
                    return result;
                } catch (error) {
                    if (armVersion === version) armed = true;
                    throw error;
                } finally {
                    reserved = false;
                    changed();
                }
            };
        },
    };
}

const tui: TuiPlugin = async (api) => {
    const client = api.client.session as unknown as SessionClient;
    const [armed, setArmed] = createSignal(false);
    const [reserved, setReserved] = createSignal(false);
    const queues = new Map<string, Promise<void>>();

    const render = (): void => api.renderer.requestRender();
    const reservation = createHomeFastReservation((): void => {
        setArmed(reservation.isArmed());
        setReserved(reservation.isReserved());
        render();
    });
    const setSessionFast = (sessionID: string): Promise<void> => {
        const previous = queues.get(sessionID) ?? Promise.resolve();
        const next = previous.catch(() => undefined).then(async () => {
            const current = await client.get({ sessionID });
            if (current.error || !current.data) throw new Error("Could not read session Fast mode.");
            const updated = await client.update({
                sessionID,
                metadata: withFastEnabled(normalizeMetadata(current.data.metadata), !isFastEnabled(current.data.metadata)),
            });
            if (updated.error) throw new Error("Could not update session Fast mode.");
        });
        queues.set(sessionID, next);
        return next.finally(() => {
            if (queues.get(sessionID) === next) queues.delete(sessionID);
        });
    };

    const originalCreate = client.create;
    const wrappedCreate = reservation.wrap(client, originalCreate, () => api.route.current.name === "home");
    client.create = wrappedCreate;

    api.keymap.registerLayer({
        commands: [{ name: FAST_TOGGLE_COMMAND, title: "Toggle Fast mode", category: "Plugin", namespace: "palette", async run(): Promise<void> {
            if (api.route.current.name === "home") {
                reservation.toggle();
                return;
            }
            const route = api.route.current;
            if (route.name !== "session") return;
            const sessionID = route.params?.sessionID;
            if (typeof sessionID !== "string") return;
            try {
                await setSessionFast(sessionID);
            } catch {
                api.ui.toast({ variant: "error", message: "Could not update Fast mode for this session." });
            }
        }}],
        bindings: [{ key: "ctrl+y", cmd: FAST_TOGGLE_COMMAND, desc: "Toggle Fast mode" }],
    });
    api.slots.register({ order: 90, slots: {
        home_prompt_right: () => armed() || reserved() ? <text fg={api.theme.current.warning}>fast</text> : null,
        session_prompt_right: (_context, props) => isFastEnabled(api.state.session.get(props.session_id)?.metadata) ? <text fg={api.theme.current.warning}>fast</text> : null,
    }});
    api.lifecycle.onDispose(() => {
        if (client.create === wrappedCreate) client.create = originalCreate;
    });
};

const plugin: TuiPluginModule = { id: "opencodex-fast", tui };
export default plugin;
