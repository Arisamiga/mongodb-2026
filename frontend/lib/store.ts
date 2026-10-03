import type {Item, ItemInput} from "./types";

const storageKey = "lost-found-items";

export function saveItem(input: ItemInput): void {
    const item: Item = {
        ...input,
        id: crypto.randomUUID(),
        status: "OPEN",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        schemaVersion: 1,
    };
    const saved = window.localStorage.getItem(storageKey);
    const items: Item[] = saved ? JSON.parse(saved) : [];
    window.localStorage.setItem(storageKey, JSON.stringify([...items, item]));
}
