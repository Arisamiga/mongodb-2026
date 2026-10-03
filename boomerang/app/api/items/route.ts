import {NextResponse} from "next/server";
import {createItem, listItems} from "@/lib/items";
import {publicItem, categories} from "@/lib/types";
import {validateItem} from "@/lib/validation";
export const runtime = "nodejs";
export async function GET(request: Request) {
    const s = new URL(request.url).searchParams;
    const type = s.get("type") || "";
    const category = s.get("category") || "";
    if (
        (type && !["LOST", "FOUND"].includes(type)) ||
        (category &&
            !categories.includes(category as (typeof categories)[number]))
    )
        return NextResponse.json({error: "Invalid filters."}, {status: 400});
    try {
        return NextResponse.json({
            items: (
                await listItems({
                    q: (s.get("q") || "").slice(0, 200),
                    type,
                    category,
                })
            ).map(publicItem),
        });
    } catch {
        return NextResponse.json(
            {error: "Items are unavailable. Please try again shortly."},
            {status: 503},
        );
    }
}
export async function POST(request: Request) {
    if (
        request.headers.get("origin") &&
        request.headers.get("origin") !== new URL(request.url).origin
    )
        return NextResponse.json({error: "Invalid origin."}, {status: 403});
    let input;
    try {
        const raw = await request.text();
        if (raw.length > 12000)
            return NextResponse.json(
                {error: "Report is too large."},
                {status: 413},
            );
        input = validateItem(JSON.parse(raw));
    } catch (e) {
        return NextResponse.json(
            {
                error:
                    e instanceof SyntaxError
                        ? "Invalid JSON."
                        : (e as Error).message,
            },
            {status: 400},
        );
    }
    try {
        return NextResponse.json(
            {item: publicItem(await createItem(input))},
            {status: 201},
        );
    } catch {
        return NextResponse.json(
            {error: "Your report could not be saved. Please try again."},
            {status: 503},
        );
    }
}
