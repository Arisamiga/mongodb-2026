import {timingSafeEqual} from "node:crypto";
import {NextResponse, type NextRequest} from "next/server";

export function proxy(request: NextRequest) {
    const username = process.env.ADMIN_USERNAME;
    const password = process.env.ADMIN_PASSWORD;
    const headers = {"Cache-Control": "no-store"};

    // Keep the board closed until server-side credentials are configured.
    if (!username || !password) {
        return new NextResponse("Admin access is not configured.", {status: 403, headers});
    }

    const expected = Buffer.from(`Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`);
    const supplied = Buffer.from(request.headers.get("authorization") || "");
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
        return new NextResponse("Admin credentials required.", {
            status: 401,
            headers: {...headers, "WWW-Authenticate": 'Basic realm="Boomerang admin", charset="UTF-8"'},
        });
    }

    const response = NextResponse.next();
    response.headers.set("Cache-Control", "no-store");
    return response;
}

export const config = {matcher: "/admin/:path*"};
