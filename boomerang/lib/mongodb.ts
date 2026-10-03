import {MongoClient} from "mongodb";
const globalMongo = globalThis as typeof globalThis & {
    mongoPromise?: Promise<MongoClient>;
};
export async function database() {
    const uri = process.env.MONGODB_URI;
    if (!uri)
        throw new Error(
            "MONGODB_URI is not configured. Set it in .env.local or enable DEMO_MODE.",
        );
    if (!globalMongo.mongoPromise)
        globalMongo.mongoPromise = new MongoClient(uri, {
            serverSelectionTimeoutMS: 5000,
        })
            .connect()
            .catch((e) => {
                globalMongo.mongoPromise = undefined;
                throw e;
            });
    return (await globalMongo.mongoPromise).db(
        process.env.MONGODB_DB || "lost_found_ai",
    );
}
