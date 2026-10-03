import type {PublicItem} from "./types";
// Extension point: implement a service later using Atlas Vector Search.
// Keep embeddings in a separate collection keyed by itemId and model version.
export interface MatchCandidate {
    item: PublicItem;
    score: number;
    reasons: string[];
}
export interface MatchingService {
    findMatches(item: PublicItem): Promise<MatchCandidate[]>;
}
