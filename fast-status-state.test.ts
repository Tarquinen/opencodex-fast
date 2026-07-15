import assert from "node:assert/strict";
import { test } from "node:test";

import {
    createFastStateMonitor,
    FAST_STATUS_POLL_MS,
    parseFastState,
    type FastStateMonitor,
} from "./fast-status-state.js";

type ReadResult =
    | { readonly kind: "content"; readonly value: string }
    | { readonly kind: "error" };

type Harness = {
    readonly monitor: FastStateMonitor;
    readonly tick: () => Promise<void>;
    readonly renderCount: () => number;
    readonly readCount: () => number;
    readonly intervalMs: () => number | undefined;
    readonly stopCount: () => number;
};

function createHarness(reads: readonly ReadResult[]): Harness {
    let index = 0;
    let renders = 0;
    let stops = 0;
    let scheduledPoll: (() => Promise<void>) | undefined;
    let scheduledInterval: number | undefined;

    const monitor = createFastStateMonitor({
        path: "C:/config/opencodex-fast.jsonc",
        async readText(): Promise<string> {
            const result = reads[index];
            index += 1;
            if (result === undefined) {
                throw new Error("Test read sequence exhausted");
            }
            if (result.kind === "error") {
                throw new Error("Transient read failure");
            }
            return result.value;
        },
        onChange(): void {
            renders += 1;
        },
        schedule(poll, intervalMs): () => void {
            scheduledPoll = poll;
            scheduledInterval = intervalMs;
            return () => {
                stops += 1;
            };
        },
    });

    return {
        monitor,
        async tick(): Promise<void> {
            const poll = scheduledPoll;
            assert.ok(poll, "monitor should schedule polling");
            await poll();
        },
        renderCount: () => renders,
        readCount: () => index,
        intervalMs: () => scheduledInterval,
        stopCount: () => stops,
    };
}

test("parseFastState returns enabled when valid booleans are provided", () => {
    const enabled = '\uFEFF{ "enabled": true }';
    const disabled = '{ "enabled": false, "other": "ignored" }';

    const enabledResult = parseFastState(enabled);
    const disabledResult = parseFastState(disabled);

    assert.deepEqual(enabledResult, { kind: "valid", enabled: true });
    assert.deepEqual(disabledResult, { kind: "valid", enabled: false });
});

test("parseFastState accepts JSONC comments and trailing commas", () => {
    const commented = '{ /* persisted fast mode */ "enabled": true }';
    const trailingComma = '{ "enabled": false, }';

    const commentedResult = parseFastState(commented);
    const trailingCommaResult = parseFastState(trailingComma);

    assert.deepEqual(commentedResult, { kind: "valid", enabled: true });
    assert.deepEqual(trailingCommaResult, { kind: "valid", enabled: false });
});

test("parseFastState rejects malformed and wrong-shaped input", () => {
    const invalidContents = ["{", "null", "[]", "{}", '{ "enabled": "true" }'];

    const results = invalidContents.map(parseFastState);

    assert.deepEqual(
        results,
        invalidContents.map(() => ({ kind: "invalid" })),
    );
});

test("monitor starts disabled when the initial state is invalid", async () => {
    const harness = createHarness([{ kind: "content", value: "{" }]);

    await harness.monitor.start();

    assert.equal(harness.monitor.isEnabled(), false);
    assert.equal(harness.renderCount(), 0);
    assert.equal(harness.intervalMs(), FAST_STATUS_POLL_MS);
});

test("monitor starts disabled when the initial state is unreadable", async () => {
    const harness = createHarness([{ kind: "error" }]);

    await harness.monitor.start();

    assert.equal(harness.monitor.isEnabled(), false);
    assert.equal(harness.renderCount(), 0);
    assert.equal(harness.intervalMs(), FAST_STATUS_POLL_MS);
});

test("monitor renders only for valid boolean transitions", async () => {
    const harness = createHarness([
        { kind: "content", value: '{ "enabled": true }' },
        { kind: "content", value: '{ "enabled": true }' },
        { kind: "content", value: '{ "enabled": false }' },
    ]);

    await harness.monitor.start();
    await harness.tick();
    await harness.tick();

    assert.equal(harness.monitor.isEnabled(), false);
    assert.equal(harness.renderCount(), 2);
});

test("monitor preserves last-known-good state across failed polls", async () => {
    const harness = createHarness([
        { kind: "content", value: '{ "enabled": true }' },
        { kind: "content", value: "{" },
        { kind: "error" },
        { kind: "content", value: '{ "enabled": false }' },
    ]);

    await harness.monitor.start();
    await harness.tick();
    assert.equal(harness.monitor.isEnabled(), true);
    await harness.tick();
    assert.equal(harness.monitor.isEnabled(), true);
    await harness.tick();

    assert.equal(harness.monitor.isEnabled(), false);
    assert.equal(harness.renderCount(), 2);
});

test("monitor skips overlapping refreshes", async () => {
    let resolveRead: ((content: string) => void) | undefined;
    let reads = 0;
    const monitor = createFastStateMonitor({
        path: "C:/config/opencodex-fast.jsonc",
        readText: () => {
            reads += 1;
            return new Promise<string>((resolve) => {
                resolveRead = resolve;
            });
        },
        onChange(): void {},
        schedule: () => () => {},
    });

    const first = monitor.refresh();
    const second = monitor.refresh();

    assert.equal(reads, 1);
    resolveRead?.('{ "enabled": true }');
    await Promise.all([first, second]);
    assert.equal(monitor.isEnabled(), true);
});

test("monitor recovers after a synchronous read throw", async () => {
    let reads = 0;
    const monitor = createFastStateMonitor({
        path: "C:/config/opencodex-fast.jsonc",
        readText: () => {
            reads += 1;
            if (reads === 1) throw new Error("Synchronous read failure");
            return Promise.resolve('{ "enabled": true }');
        },
        onChange(): void {},
        schedule: () => () => {},
    });

    await monitor.refresh();
    await monitor.refresh();

    assert.equal(monitor.isEnabled(), true);
});

test("monitor ignores an in-flight read after disposal", async () => {
    let resolveRead: ((content: string) => void) | undefined;
    let renders = 0;
    const monitor = createFastStateMonitor({
        path: "C:/config/opencodex-fast.jsonc",
        readText: () =>
            new Promise<string>((resolve) => {
                resolveRead = resolve;
            }),
        onChange(): void {
            renders += 1;
        },
        schedule: () => () => {},
    });

    const refresh = monitor.refresh();
    monitor.dispose();
    resolveRead?.('{ "enabled": true }');
    await refresh;

    assert.equal(monitor.isEnabled(), false);
    assert.equal(renders, 0);
});

test("monitor disposal is idempotent and blocks later polling work", async () => {
    const harness = createHarness([
        { kind: "content", value: '{ "enabled": false }' },
        { kind: "content", value: '{ "enabled": true }' },
    ]);
    await harness.monitor.start();

    harness.monitor.dispose();
    harness.monitor.dispose();
    await harness.tick();

    assert.equal(harness.stopCount(), 1);
    assert.equal(harness.readCount(), 1);
    assert.equal(harness.renderCount(), 0);
});
