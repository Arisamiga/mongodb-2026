import {NextResponse} from "next/server";
import {getItem} from "@/lib/items";
import {publicItem} from "@/lib/types";
export async function GET(
    _request: Request,
    {params}: {params: Promise<{id: string}>},
) {
    try {
        const item = await getItem((await params).id);
        return item
            ? NextResponse.json({item: publicItem(item)})
            : NextResponse.json({error: "Item not found."}, {status: 404});
    } catch {
        return NextResponse.json({error: "Item unavailable."}, {status: 503});
    }
}
