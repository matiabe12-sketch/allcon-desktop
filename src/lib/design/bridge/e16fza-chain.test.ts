import { describe, expect, it } from "vitest";
import { buildChain, workOut } from "./chain.testkit";
import { E16FZA, E16FZA_ABUT_SOIL, E16FZA_DIAPHRAGM_TOP, E16FZA_GIRDER, E16FZA_PAD, E16FZA_SHAFT_LAYERS } from "./e16fza.fixture";

// CDOT 24057 E-16-FZA (side-by-side boxes, the north unit) through the Bridge, end to end; the report is printed.

describe("E-16-FZA through the Bridge, end to end", async () => {
  const r = await buildChain({
    title: "E-16-FZA I-70 over Harlan Street",
    b: E16FZA,
    girder: E16FZA_GIRDER,
    pad: E16FZA_PAD,
    // IDC: #5 @ 5 in top and bottom transverse, 2 #5 bundled @ 5 in over the overhangs, #4 @ 6 in longitudinal.
    deck: { topBars: { bar: 5, spacing: 5 }, botBars: { bar: 5, spacing: 5 }, overhangBars: { bar: 5, spacing: 5 }, topLong: { bar: 4, spacing: 6 }, botLong: { bar: 4, spacing: 6 } },
    // 13 of the 23 HP 14x89 (the north unit's share), 47.55 ft; end bearing on rock 24 ksi x 26.1 in², φ 0.65.
    abutment: () => ({ type: "integral-piles", section: "HP14x89", nPiles: 13, pileLength: 47.55, embed: 12, capWidth: 3, capDepth: 3.5, soil: E16FZA_ABUT_SOIL, prebore: 0, Rn: 24 * 26.1, phiDyn: 0.65 }),
    cap: { topBars: { size: 11, count: 18 }, bottomBars: { size: 11, count: 14 }, stirrups: { size: 6, legs: 6, spacing: 6 }, diaphragmTop: E16FZA_DIAPHRAGM_TOP },
    // 28 #11: 10 along each 5.5 ft face, 4 more along each 3.5 ft face (IDC layers).
    column: { bar: 11, bars: 28, barsT: 10, barsL: 4, tieBar: 6, tieSpacing: 6 },
    shaft: { D: 54, length: 45, topDepth: 3, layers: E16FZA_SHAFT_LAYERS, bar: 11, bars: 18 },
  });

  it("works out the whole calc package with no errors", () => {
    const w = workOut(r.lines);
    expect(w.errors).toEqual([]);
  });

  it("reports the checks", () => {
    console.log(["", "E-16-FZA component checks:", `Deck length, back face to back face: ${r.deckFt} ft`, ...Object.entries(r.verdicts).map(([k, v]) => `${k.padEnd(36)} ${v.fail.length ? `${v.fail.length} of ${v.n} fail: ${v.fail.slice(0, 4).join("; ")}` : `all ${v.n} pass`}`)].join("\n"));
    expect(Object.keys(r.verdicts).length).toBeGreaterThan(5);
  });
});
