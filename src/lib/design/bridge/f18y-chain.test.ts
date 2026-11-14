import { describe, expect, it } from "vitest";
import { buildChain, workOut } from "./chain.testkit";
import { F18Y, F18Y_ABUT_SOIL, F18Y_DIAPHRAGM_TOP, F18Y_GIRDER, F18Y_PAD, F18Y_SHAFT_LAYERS } from "./f18y.fixture";

// CDOT F-18-Y Picadilly Road over I-70 through the Bridge, end to end; the report is printed.

describe("F-18-Y through the Bridge, end to end", async () => {
  const r = await buildChain({
    title: "F-18-Y Picadilly Road over I-70",
    b: F18Y,
    girder: F18Y_GIRDER,
    pad: F18Y_PAD,
    // IDC: #5 @ 6 in top and bottom transverse, additional #4 @ 12 in over the overhangs, #4 @ 6 in longitudinal.
    deck: { topBars: { bar: 5, spacing: 6 }, botBars: { bar: 5, spacing: 6 }, overhangBars: { bar: 4, spacing: 12 }, topLong: { bar: 4, spacing: 6 }, botLong: { bar: 5, spacing: 8 } },
    // 13 HP 12x74 a side, 30 ft (assumed), 1 ft into the cap; end bearing 18 ksi factored on 21.8 in² (Rn as factored, φ 1).
    abutment: () => ({ type: "integral-piles", section: "HP12x74", nPiles: 13, pileLength: 30, embed: 12, capWidth: 2.5, capDepth: 4, soil: F18Y_ABUT_SOIL, prebore: 0, Rn: 18 * 21.8, phiDyn: 1 }),
    cap: { topBars: { size: 10, count: 12 }, bottomBars: { size: 10, count: 14 }, stirrups: { size: 5, legs: 4, spacing: 6 }, diaphragmTop: F18Y_DIAPHRAGM_TOP },
    // 24 #10: 8 along each 5 ft face, 4 more along each 3 ft face (as the pill section's ring of 24).
    column: { bar: 10, bars: 24, barsT: 8, barsL: 4, tieBar: 4, tieSpacing: 12 },
    shaft: { D: 48, length: 47, topDepth: 0, layers: F18Y_SHAFT_LAYERS, bar: 10, bars: 30 },
  });

  it("works out the whole calc package with no errors", () => {
    const w = workOut(r.lines);
    expect(w.errors).toEqual([]);
  });

  it("reports the checks", () => {
    console.log(["", "F-18-Y component checks:", `Deck length, back face to back face: ${r.deckFt} ft`, ...Object.entries(r.verdicts).map(([k, v]) => `${k.padEnd(36)} ${v.fail.length ? `${v.fail.length} of ${v.n} fail: ${v.fail.slice(0, 4).join("; ")}` : `all ${v.n} pass`}`)].join("\n"));
    expect(Object.keys(r.verdicts).length).toBeGreaterThan(5);
  });
});
