// Scores the demo pair, an unrelated pair, and location/time edge cases. Needs no API key:
// the cosine values are the ones test-embedding.ts printed. Run:  node test-score.ts
import { contractScore, haversineMetres, locationScore, scoreMatch, type ScorableReport } from "./score.ts";

// Approximate DCU Glasnevin library position, [longitude, latitude]. Typed from memory, not
// surveyed: replace with a pin from the map if you need exact figures.
const LIBRARY: [number, number] = [-6.2575, 53.3855];
const LIBRARY_ENTRANCE: [number, number] = [-6.2572, 53.3857]; // a few tens of metres away
const TRINITY: [number, number] = [-6.2573, 53.3438]; // ~4.6 km south, far away

const lost: ScorableReport = {
  type: "lost", category: "Electronics",
  location: { coordinates: LIBRARY },
  eventDate: new Date("2026-10-03T12:35:00Z"),
};
const foundEarbuds: ScorableReport = {
  type: "found", category: "Electronics",
  location: { coordinates: LIBRARY_ENTRANCE },
  eventDate: new Date("2026-10-03T13:02:00Z"),
};
const foundUmbrella: ScorableReport = {
  type: "found", category: "Other",
  location: { coordinates: TRINITY },
  eventDate: new Date("2026-09-12T09:00:00Z"),
};

const pct = (n: number) => `${Math.round(n * 100)}%`;
function show(label: string, s: ReturnType<typeof scoreMatch>) {
  console.log(
    `${pct(s.total).padStart(4)}  ${label}  (description ${pct(s.description)}, location ${pct(s.location)}, time ${pct(s.time)}, category ${pct(s.category)})  contract score ${contractScore(s)}`,
  );
}

console.log("Match scores");
show("AirPods lost vs earbud case found", scoreMatch(lost, foundEarbuds, 0.877));
show("AirPods lost vs umbrella found   ", scoreMatch(lost, foundUmbrella, 0.73));

// Location cases. 200 m north of the library: 1 degree of latitude is ~111,195 m.
const north200: [number, number] = [LIBRARY[0], LIBRARY[1] + 200 / 111_195];
const cases: [string, ScorableReport["location"], ScorableReport["location"]][] = [
  ["same spot", { coordinates: LIBRARY }, { coordinates: LIBRARY }],
  ["200 m apart", { coordinates: LIBRARY }, { coordinates: north200 }],
  ["far away", { coordinates: LIBRARY }, { coordinates: TRINITY }],
  ["one side has no coords", { coordinates: LIBRARY }, {}],
  ["neither has coords", {}, {}],
];
console.log("\nLocation score");
for (const [label, a, b] of cases) {
  const dist = a.coordinates && b.coordinates ? `${Math.round(haversineMetres(a.coordinates, b.coordinates))} m` : "n/a";
  console.log(`${pct(locationScore(a, b)).padStart(4)}  ${label.padEnd(26)} distance ${dist}`);
}

// Time: found 2 h before lost is inside the 3 h tolerance (scores above 0); 4 h before is outside.
const at = (iso: string): ScorableReport => ({ ...lost, eventDate: new Date(iso) });
console.log("\nTime score (found before lost)");
for (const [label, iso] of [["2 h before", "2026-10-03T10:35:00Z"], ["4 h before", "2026-10-03T08:35:00Z"]] as const) {
  console.log(`${pct(scoreMatch(lost, at(iso), 0.877).time).padStart(4)}  found ${label}`);
}
