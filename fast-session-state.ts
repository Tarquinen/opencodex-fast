export const FAST_METADATA_KEY = "opencodex-fast.enabled";

export type SessionMetadata = Record<string, unknown>;

export function normalizeMetadata(metadata: unknown): SessionMetadata {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
        return {};
    }
    return { ...metadata };
}

export function isFastEnabled(metadata: unknown): boolean {
    return normalizeMetadata(metadata)[FAST_METADATA_KEY] === true;
}

export function withFastEnabled(metadata: unknown, enabled: boolean): SessionMetadata {
    const next = normalizeMetadata(metadata);
    if (enabled) {
        next[FAST_METADATA_KEY] = true;
    } else {
        delete next[FAST_METADATA_KEY];
    }
    return next;
}
