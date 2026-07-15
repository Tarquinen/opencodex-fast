import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";

import {
    createFastToggleLayer,
    FAST_TOGGLE_COMMAND,
    readPersistedFastState,
    togglePersistedFastState,
} from "./fast-toggle.js";

async function withStatePath(
    run: (path: string) => Promise<void>,
): Promise<void> {
    const directory = await mkdtemp(join(tmpdir(), "opencodex-fast-"));
    try {
        await run(join(directory, "nested", "opencodex-fast.jsonc"));
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
}

test("togglePersistedFastState writes false to true atomically", async () => {
    await withStatePath(async (path) => {
        const existingPath = join(dirname(path), "opencodex-fast.jsonc");
        await mkdir(dirname(existingPath), { recursive: true });
        await writeFile(existingPath, '{ "enabled": false }');

        assert.equal(await togglePersistedFastState(existingPath), true);
        assert.equal(await readPersistedFastState(existingPath), true);
        assert.deepEqual(JSON.parse(await readFile(existingPath, "utf8")), {
            enabled: true,
        });
    });
});

test("togglePersistedFastState writes true to false", async () => {
    await withStatePath(async (path) => {
        const existingPath = join(dirname(path), "opencodex-fast.jsonc");
        await mkdir(dirname(existingPath), { recursive: true });
        await writeFile(existingPath, '{ /* JSONC */ "enabled": true, }');

        assert.equal(await togglePersistedFastState(existingPath), false);
        assert.equal(await readPersistedFastState(existingPath), false);
    });
});

test("toggle layer registers the base Ctrl+Y command and refreshes after invoke", async () => {
    await withStatePath(async (path) => {
        let refreshes = 0;
        const layer = createFastToggleLayer(path, async () => {
            refreshes += 1;
        });

        assert.equal(layer.mode, "base");
        assert.deepEqual(layer.bindings, [
            {
                key: "ctrl+y",
                cmd: FAST_TOGGLE_COMMAND,
                desc: "Toggle Fast mode",
            },
        ]);
        assert.equal(layer.commands[0].name, FAST_TOGGLE_COMMAND);
        assert.equal(layer.commands[0].title, "Toggle Fast mode");
        assert.equal(layer.commands[0].category, "Plugin");
        assert.equal(layer.commands[0].namespace, "palette");

        await layer.commands[0].run();
        assert.equal(await readPersistedFastState(path), true);
        assert.equal(refreshes, 1);
    });
});
