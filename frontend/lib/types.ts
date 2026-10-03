export const categories = ["Electronics", "Clothing", "Bags", "Keys", "Cards and IDs", "Books", "Other"] as const;
export type Category = (typeof categories)[number];
export type Item = {
    _id: string;
    userId: string;
    title: string;
    type: "lost" | "found";
    category: Category;
    description: string;
    location: {coordinates: [number, number]};
    eventDate: string;
    status: "open" | "matched" | "returned";
    matchingStatus: "pending" | "completed" | "failed";
    images: string[];
};
