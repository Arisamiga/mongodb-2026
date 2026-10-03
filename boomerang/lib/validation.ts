import {categories, type ItemInput} from "./types.ts";
export function validateItem(value: unknown): ItemInput {
    if (!value || typeof value !== "object")
        throw new Error("Please provide item details.");
    const v = value as Record<string, unknown>;
    const str = (key: string, min: number, max: number) => {
        const s = typeof v[key] === "string" ? v[key].trim() : "";
        if (s.length < min || s.length > max)
            throw new Error(`${key}: please enter ${min}–${max} characters.`);
        return s;
    };
    if (v.type !== "LOST" && v.type !== "FOUND")
        throw new Error("Choose lost or found.");
    if (!categories.includes(v.category as ItemInput["category"]))
        throw new Error("Choose a category.");
    const eventDate = str("eventDate", 10, 10);
    if (
        !/^\d{4}-\d{2}-\d{2}$/.test(eventDate) ||
        !Number.isFinite(Date.parse(eventDate)) ||
        new Date(eventDate).toISOString().slice(0, 10) !== eventDate ||
        eventDate > new Date().toISOString().slice(0, 10)
    )
        throw new Error("Choose a valid date, today or earlier.");
    const contactEmail = str("contactEmail", 3, 254);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail))
        throw new Error("Enter a valid email address.");
    const imageUrl = str("imageUrl", 0, 2048);
    if (imageUrl) {
        try {
            const u = new URL(imageUrl);
            if (u.protocol !== "https:" || u.username || u.password)
                throw new Error();
        } catch {
            throw new Error("Photo URL must be a valid HTTPS URL.");
        }
    }
    return {
        title: str("title", 3, 100),
        description: str("description", 20, 2000),
        location: str("location", 3, 160),
        type: v.type,
        category: v.category as ItemInput["category"],
        eventDate,
        contactEmail,
        imageUrl,
    };
}
