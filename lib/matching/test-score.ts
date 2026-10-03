// Scores the demo pair and an unrelated pair. Needs no API key: the cosine values are the
// ones test-embedding.ts printed. Run:  node lib/matching/test-score.ts
import { scoreMatch, type ScorableReport } from "./score.ts";

const lost: ScorableReport = {
  type: "lost", category: "Electronics", location: { name: "DCU Library" },
  eventDate: new Date("2026-10-03T12:35:00Z"),
};
const foundEarbuds: ScorableReport = {
  type: "found", category: "Electronics", location: { name: "Library entrance" },
  eventDate: new Date("2026-10-03T13:02:00Z"),
};
const foundUmbrella: ScorableReport = {
  type: "found", category: "Clothing & Accessories", location: { name: "Lecture hall" },
  eventDate: new Date("2026-09-12T09:00:00Z"),
};

const pct = (n: number) => `${Math.round(n * 100)}%`;
function show(label: string, s: ReturnType<typeof scoreMatch>) {
  console.log(
    `${pct(s.total).padStart(4)}  ${label}  (description ${pct(s.description)}, location ${pct(s.location)}, time ${pct(s.time)}, category ${pct(s.category)})`,
  );
}

show("AirPods lost vs earbud case found", scoreMatch(lost, foundEarbuds, 0.877));
show("AirPods lost vs umbrella found   ", scoreMatch(lost, foundUmbrella, 0.73));
