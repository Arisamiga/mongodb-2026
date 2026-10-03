export const categories = [
    "Electronics",
    "Bags & backpacks",
    "Keys",
    "Wallets & cards",
    "Clothing",
    "Jewelry",
    "Other",
] as const;
export type Category = (typeof categories)[number];
export type ItemInput = {
    title: string;
    type: "LOST" | "FOUND";
    category: Category;
    description: string;
    location: string;
    eventDate: string;
    contactEmail: string;
    imageUrl: string;
};
export type Item = ItemInput & {
    id: string;
    status: "OPEN" | "RESOLVED";
    createdAt: string;
    updatedAt: string;
    schemaVersion: 1;
};
