import {demoItems} from "./demo";
import type {Item, ItemInput} from "./types";

const storageKey = "lost-found-items";

export function readItems(): Item[] {
    if (typeof window === "undefined") return [...demoItems];
    try {
        const saved = window.localStorage.getItem(storageKey);
        return saved ? [...demoItems, ...JSON.parse(saved)] : [...demoItems];
    } catch {
        return [...demoItems];
    }
}

export function findItems(filters: {q?: string; type?: string; category?: string} = {}): Item[] {
    const q = filters.q?.trim().toLowerCase();
    return readItems().filter((item) =>
        (!filters.type || item.type === filters.type) &&
        (!filters.category || item.category === filters.category) &&
        (!q || `${item.title} ${item.description} ${item.location}`.toLowerCase().includes(q)),
    ).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function findItem(id: string): Item | undefined {
    return readItems().find((item) => item.id === id);
}

export function saveItem(input: ItemInput): Item {
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
    return item;
}
