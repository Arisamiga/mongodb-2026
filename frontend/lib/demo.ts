import type {Item} from "./types";
const photos = [
    "photo-1505740420928-5e560c06d30e",
    "photo-1553062407-98eeb64c6a62",
    "photo-1511499767150-a48a237f0083",
    "photo-1523275335684-37898b6baf30",
    "photo-1627123424574-724758594e93",
    "photo-1602143407151-7111542de6e8",
];
const entries = [
    [
        "Wireless headphones",
        "LOST",
        "Electronics",
        "O’Reilly Library, DCU",
        "Black over-ear headphones in a soft carry case. Last seen at a desk on the second floor.",
    ],
    [
        "Navy everyday backpack",
        "FOUND",
        "Bags & backpacks",
        "St Stephen’s Green, Dublin",
        "A navy canvas backpack left on a bench near the north entrance. Please describe the contents to identify it.",
    ],
    [
        "Round sunglasses",
        "FOUND",
        "Other",
        "Henry Street, Dublin",
        "A pair of round metal-frame sunglasses in a black case, found near the shopping centre.",
    ],
    [
        "Silver analog watch",
        "LOST",
        "Jewelry",
        "Glasnevin campus, DCU",
        "Silver watch with a brown leather strap. It has a small personal engraving on the back.",
    ],
    [
        "Brown leather wallet",
        "FOUND",
        "Wallets & cards",
        "Drumcondra Road, Dublin",
        "A brown leather wallet found near the bus stop. Owner can identify the cards inside.",
    ],
    [
        "Reusable water bottle",
        "LOST",
        "Other",
        "Sports Centre, DCU",
        "A reusable insulated bottle left in the gym. There is a small sticker on the base.",
    ],
];
export const demoItems: Item[] = entries.map((e, i) => ({
    id: `demo-${i + 1}`,
    title: e[0],
    type: e[1] as Item["type"],
    category: e[2] as Item["category"],
    location: e[3],
    description: e[4],
    imageUrl: `https://images.unsplash.com/${photos[i]}?auto=format&fit=crop&w=900&q=85`,
    eventDate: "2026-10-01",
    contactEmail: "demo@example.com",
    status: "OPEN",
    createdAt: new Date(Date.UTC(2026, 9, 2, 12 - i)).toISOString(),
    updatedAt: new Date(Date.UTC(2026, 9, 2, 12 - i)).toISOString(),
    schemaVersion: 1,
}));
