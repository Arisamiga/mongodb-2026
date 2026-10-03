import {randomUUID} from "node:crypto";
import {mkdir, readFile, writeFile, rename} from "node:fs/promises";
import path from "node:path";
import {database} from "./mongodb";
import {demoItems} from "./demo";
import {type Item, type ItemInput} from "./types";
export const isDemo = () => process.env.DEMO_MODE === "true";
const file = path.join(process.cwd(), ".data", "items.json");
async function localItems(): Promise<Item[]> {
    try {
        return JSON.parse(await readFile(file, "utf8"));
    } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT")
            return [...demoItems];
        throw e;
    }
}
let queue: Promise<unknown> = Promise.resolve();
let indexes: Promise<unknown> | undefined;
async function collection() {
    const c = (await database()).collection<Item>("items");
    indexes ??= Promise.all([
        c.createIndex({id: 1}, {unique: true}),
        c.createIndex({status: 1, type: 1, category: 1, createdAt: -1}),
        c.createIndex({title: "text", description: "text", location: "text"}),
    ]).catch((e) => {
        indexes = undefined;
        throw e;
    });
    await indexes;
    return c;
}
export async function listItems(
    filters: {q?: string; type?: string; category?: string} = {},
): Promise<Item[]> {
    if (isDemo())
        return (await localItems())
            .filter(
                (i) =>
                    (!filters.type || i.type === filters.type) &&
                    (!filters.category || i.category === filters.category) &&
                    (!filters.q ||
                        `${i.title} ${i.description} ${i.location}`
                            .toLowerCase()
                            .includes(filters.q.toLowerCase())),
            )
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const query = {
        ...(filters.type ? {type: filters.type as Item["type"]} : {}),
        ...(filters.category
            ? {category: filters.category as Item["category"]}
            : {}),
        ...(filters.q ? {$text: {$search: filters.q}} : {}),
    };
    return (await collection())
        .find(query, {projection: {_id: 0}})
        .sort({createdAt: -1})
        .limit(100)
        .toArray();
}
export async function getItem(id: string): Promise<Item | null> {
    return isDemo()
        ? (await localItems()).find((i) => i.id === id) || null
        : (await collection()).findOne({id}, {projection: {_id: 0}});
}
export async function createItem(input: ItemInput): Promise<Item> {
    const item: Item = {
        ...input,
        id: randomUUID(),
        status: "OPEN",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        schemaVersion: 1,
    };
    if (isDemo()) {
        const task = queue
            .catch(() => {})
            .then(async () => {
                const items = await localItems();
                items.push(item);
                await mkdir(path.dirname(file), {recursive: true});
                await writeFile(file + ".tmp", JSON.stringify(items, null, 2));
                await rename(file + ".tmp", file);
            });
        queue = task;
        await task;
    } else await (await collection()).insertOne({...item});
    return item;
}
