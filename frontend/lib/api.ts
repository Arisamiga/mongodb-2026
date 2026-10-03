export type User = {id: string; email: string; display_name: string; created_at: string};

export class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
        super(message);
        this.status = status;
    }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("X-Boomerang-Request", "1");
    if (typeof init.body === "string") headers.set("Content-Type", "application/json");
    const response = await fetch(`/api/backend${path}`, {...init, headers, cache: "no-store"});
    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const detail = data.detail ?? data.error;
        const message = typeof detail === "string" ? detail : Array.isArray(detail)
            ? detail.map((error: {msg: string}) => error.msg).join("; ")
            : "The request failed. Please try again.";
        throw new ApiError(message, response.status);
    }
    return response.json() as Promise<T>;
}

export async function apiAll<T>(path: string, init: RequestInit = {}): Promise<T[]> {
    const results: T[] = [];
    const separator = path.includes("?") ? "&" : "?";
    for (let offset = 0; offset <= 10000; offset += 100) {
        const page = await api<T[]>(`${path}${separator}limit=100&offset=${offset}`, init);
        results.push(...page);
        if (page.length < 100) return results;
    }
    throw new Error("This list exceeds the API pagination limit.");
}
