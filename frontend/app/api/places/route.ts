type GeoapifyResult = {
    place_id: string;
    formatted: string;
    address_line1?: string;
    address_line2?: string;
    lat: number;
    lon: number;
};

export async function GET(request: Request) {
    const text = new URL(request.url).searchParams.get("text")?.trim() ?? "";
    if (text.length < 3 || text.length > 160) {
        return Response.json({results: []});
    }
    // Server-side only so the key never reaches the browser.
    const apiKey = process.env.GEOAPIFY_API_KEY;
    if (!apiKey) {
        return Response.json({error: "Location search is not configured."}, {status: 503});
    }

    const url = new URL("https://api.geoapify.com/v1/geocode/autocomplete");
    url.search = new URLSearchParams({text, format: "json", limit: "6", lang: "en", apiKey}).toString();

    try {
        const res = await fetch(url, {signal: AbortSignal.timeout(5000)});
        if (!res.ok) {
            return Response.json({error: "Location search is unavailable."}, {status: 502});
        }
        const data = (await res.json()) as {results?: GeoapifyResult[]};
        const results = (data.results ?? []).map((r) => ({
            id: r.place_id,
            label: r.formatted,
            primary: r.address_line1 ?? r.formatted,
            secondary: r.address_line2 ?? "",
            coordinates: [r.lon, r.lat] as [number, number],
        }));
        return Response.json({results});
    } catch {
        return Response.json({error: "Location search is unavailable."}, {status: 502});
    }
}
