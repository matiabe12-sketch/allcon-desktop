import { describe, expect, it } from "vitest";
import { buildChain, workOut } from "./chain.testkit";
import { I05VA, I05VA_ABUT_SOIL, I05VA_DIAPHRAGM_TOP, I05VA_GIRDER, I05VA_PAD, I05VA_SHAFT_LAYERS, I05VA_SOQ } from "./i05va.fixture";

// CDOT 22943 I-05-VA through the Bridge, end to end, with its plans' details; the report is printed.

describe("I-05-VA through the Bridge, end to end", async () => {
  const r = await buildChain({
    title: "I-05-VA SH 92 over the Gunnison River",
    b: I05VA,
    girder: I05VA_GIRDER,
    pad: I05VA_PAD,
    // Abutments: 9 HP 14x89 (B02: 201 and 203 LF, each about 22.4 ft with 1.5 ft in the cap); the cap 3 ft wide
    // (its back face 1'-6" behind the bearings, B03), 7.5 ft deep to its bottom (El. 5009.0 under seats at 5016.5).
    abutment: (k) => ({ type: "integral-piles", section: "HP14x89", nPiles: 9, pileLength: (k === 0 ? 201 : 203) / 9 - 1.5, embed: 18, capWidth: 3, capDepth: 7.5, soil: I05VA_ABUT_SOIL, prebore: 0 }),
    cap: { topBars: { size: 9, count: 10 }, bottomBars: { size: 9, count: 10 }, stirrups: { size: 6, legs: 4, spacing: 6 }, diaphragmTop: I05VA_DIAPHRAGM_TOP },
    column: { bar: 11, bars: 14, tieBar: 4, tieSpacing: 6 },
    // The caissons: 42 in, 152 LF for six (B02), so about 25.3 ft each; the column's bars as their bars (assumed).
    shaft: { D: 42, length: 25.3, topDepth: 0, layers: I05VA_SHAFT_LAYERS, bar: 11, bars: 14 },
  });

  it("works out the whole calc package with no errors", () => {
    const w = workOut(r.lines);
    expect(w.errors).toEqual([]);
    expect(w.regions).toBeGreaterThan(1500);
  });

  it("reports the checks and the quantities against the summary of quantities", () => {
    const total = (code: string) => r.rows.find((x) => x.code === code)?.total ?? 0;
    console.log(["", "I-05-VA component checks:", `Deck length, back face to back face: ${r.deckFt} ft (B03: 366 ft)`, ...Object.entries(r.verdicts).map(([k, v]) => `${k.padEnd(36)} ${v.fail.length ? `${v.fail.length} of ${v.n} fail: ${v.fail.slice(0, 4).join("; ")}` : `all ${v.n} pass`}`), "", "SOQ: B02 vs the Bridge", ...Object.entries(I05VA_SOQ).map(([code, w]) => `${code.padEnd(10)} B02 ${String(w.total).padStart(7)}   ours ${String(Math.round(total(code) * 10) / 10).padStart(7)}   ${(((total(code) - w.total) / w.total) * 100).toFixed(1)}%`)].join("\n"));
    expect(Math.abs(r.deckFt - 366)).toBeLessThan(0.1);
    const sup = (code: string) => r.rows.find((x) => x.code === code)?.values[0] ?? 0;
    expect(Math.abs(sup("515-00120") - 1790) / 1790).toBeLessThan(0.01); // waterproofing on the bridge
    expect(Math.abs(sup("606-11035") - 732) / 732).toBeLessThan(0.005); // the rail on the bridge
    for (const k of Object.keys(r.verdicts).filter((x) => /Bearings|Columns|shafts|Wingwalls|Approach slab/.test(x))) expect([k, r.verdicts[k].fail]).toEqual([k, []]);
    expect(Math.abs(total("618-01154") - 2169) / 2169).toBeLessThan(0.01);
  });
});
