import {NextRequest, NextResponse} from "next/server.js";

const sessionCookie = "boomerang-session";
const allowedPath = /^(auth\/(register|login|me|logout)|metadata|items(?:\/[a-zA-Z0-9-]+(?:\/(?:match|matches|images)(?:\/[a-zA-Z0-9-]+)?)?)?|conversations(?:\/[a-zA-Z0-9-]+(?:\/messages)?)?)$/;

async function proxy(request: NextRequest, context: {params: Promise<{path: string[]}>}) {
    const path = (await context.params).path.join("/");
    if (!allowedPath.test(path)) return NextResponse.json({detail: "Not found"}, {status: 404});

    // Require a same-origin custom header for mutations, including login/logout.
    if (request.method !== "GET" && request.headers.get("X-Boomerang-Request") !== "1") {
        return NextResponse.json({detail: "Invalid request origin"}, {status: 403});
    }
    const cookieOptions = {
        httpOnly: true, sameSite: "lax" as const, path: "/",
        secure: request.nextUrl.protocol === "https:" || request.headers.get("x-forwarded-proto") === "https",
    };
    if (path === "auth/logout" && request.method === "POST") {
        const response = NextResponse.json({ok: true});
        response.cookies.set(sessionCookie, "", {...cookieOptions, maxAge: 0});
        return response;
    }
    const headers = new Headers();
    const token = request.cookies.get(sessionCookie)?.value;
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const contentType = request.headers.get("Content-Type");
    if (contentType) headers.set("Content-Type", contentType);
    try {
        const origin = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";
        const upstream = await fetch(`${origin.replace(/\/$/, "")}/${path}${request.nextUrl.search}`, {
            method: request.method, headers,
            body: request.method === "GET" ? undefined : await request.arrayBuffer(),
            cache: "no-store", redirect: "error", signal: AbortSignal.timeout(90_000),
        });
        if (upstream.ok && request.method === "POST" && ["auth/register", "auth/login"].includes(path)) {
            const data = await upstream.json();
            const response = NextResponse.json({user: data.user}, {status: upstream.status});
            response.cookies.set(sessionCookie, data.access_token, cookieOptions);
            response.headers.set("Cache-Control", "no-store");
            return response;
        }
        const response = new NextResponse(upstream.body, {
            status: upstream.status,
            headers: {"Content-Type": upstream.headers.get("Content-Type") ?? "application/json",
                "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"},
        });
        if (upstream.status === 401) response.cookies.set(sessionCookie, "", {...cookieOptions, maxAge: 0});
        return response;
    } catch {
        return NextResponse.json({detail: "The API is unavailable. Please try again shortly."}, {status: 502});
    }
}

export {proxy as GET, proxy as POST, proxy as PATCH, proxy as DELETE};
