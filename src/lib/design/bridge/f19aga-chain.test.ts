import { describe, expect, it } from "vitest";
import { buildChain, workOut } from "./chain.testkit";
import { F19AGA, F19AGA_ABUT_SOIL, F19AGA_DIAPHRAGM_TOP, F19AGA_GIRDER, F19AGA_PAD, F19AGA_SHAFT_LAYERS, F19AGA_SOQ } from "./f19aga.fixture";

// CDOT 24898 F-19-AGA (side-by-side boxes) through the Bridge, end to end; the report is printed.

describe("F-19-AGA through the Bridge, end to end", async () => {
  const r = await buildChain({
    title: "F-19-AGA SH 79 over I-70",
    b: F19AGA,
    girder: F19AGA_GIRDER,
    pad: F19AGA_PAD,
    deck: { topBars: { bar: 5, spacing: 6 }, botBars: { bar: 5, spacing: 6 }, topLong: { bar: 4, spacing: 6 }, botLong: { bar: 4, spacing: 6 } },
    // 15 HP 14x89 a side (840 and 825 LF), 1 ft into the cap; the caps 3 ft wide, 5 ft deep (4.5 to 5.46 ft).
    abutment: (k) => ({ type: "integral-piles", section: "HP14x89", nPiles: 15, pileLength: (k === 0 ? 840 : 825) / 15 - 1, embed: 12, capWidth: 3, capDepth: 5, soil: F19AGA_ABUT_SOIL, prebore: 0 }),
    approach: { L: 20.5, t: 12, mainBars: { bar: 9, spacing: 6 }, distBars: { bar: 5, spacing: 12 }, topLong: { bar: 4, spacing: 18 }, topTrans: { bar: 5, spacing: 12 } },
    cap: { topBars: { size: 11, count: 8 }, bottomBars: { size: 11, count: 8 }, stirrups: { size: 5, legs: 4, spacing: 8 }, diaphragmTop: F19AGA_DIAPHRAGM_TOP },
    column: { bar: 9, bars: 32, tieBar: 5, tieSpacing: 6 },
    shaft: { D: 54, length: 65, topDepth: 2, layers: F19AGA_SHAFT_LAYERS, bar: 11, bars: 37 },
  });

  it("works out the whole calc package with no errors", () => {
    const w = workOut(r.lines);
    expect(w.errors).toEqual([]);
  });

  it("reports the checks and the quantities against the IDC's", () => {
    const total = (code: string) => r.rows.find((x) => x.code === code)?.total ?? 0;
    const sup = (code: string) => r.rows.find((x) => x.code === code)?.values[0] ?? 0;
    console.log(["", "F-19-AGA component checks:", `Deck length, back face to back face: ${r.deckFt} ft`, ...Object.entries(r.verdicts).map(([k, v]) => `${k.padEnd(36)} ${v.fail.length ? `${v.fail.length} of ${v.n} fail: ${v.fail.slice(0, 4).join("; ")}` : `all ${v.n} pass`}`), "", "Quantities: the IDC's vs the Bridge", ...Object.entries(F19AGA_SOQ).map(([code, w]) => `${code.padEnd(10)} IDC ${String(w.total).padStart(7)}   ours ${String(Math.round((code.startsWith("606") ? sup(code) : total(code)) * 10) / 10).padStart(7)}`)].join("\n"));
    expect(Math.abs(total("618-01994") - 16204) / 16204).toBeLessThan(0.01); // square feet of box
  });
});
