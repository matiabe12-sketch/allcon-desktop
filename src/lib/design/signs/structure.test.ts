import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, evaluateSheet, type SheetItem } from "@/lib/calcs/evaluate";
import { layout } from "@/lib/calcs/library/templates";
import { readingOrder } from "@/lib/calcs/types";
import { signInputs } from "../kinds";
import { designSign, SIGN_DEFAULTS, type SignInputs } from "./cantilever";
import { signCalcLines } from "./cantilever-calc";
import { IMPORTANCE, roundTube, SIGN_STEEL_DEFAULTS, tubeToPlate } from "./structure";

const near = (a: number, b: number, tol = 0.01) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol * Math.abs(b));

describe("LRFD-LTS-1 round tubes (Section 5)", () => {
  it("classifies D/t and works out Mn by Table 5.8.2-1", () => {
    const Fy = 55;
    const EF = 29000 / Fy;
    const compact = roundTube(24, 0.75, Fy, 20); // D/t 32 ≤ 0.07 E/Fy = 36.9
    expect(compact.cls).toBe("compact");
    expect(compact.Mn).toBeCloseTo(compact.Mp, 9);
    const nc = roundTube(15.5, 0.1875, Fy, 22); // D/t 82.7
    expect(nc.cls).toBe("noncompact");
    expect(nc.Mn).toBeCloseTo(nc.Mp * (0.77 + (0.016 * EF) / (15.5 / 0.1875)), 9);
    const sl = roundTube(30, 0.1875, Fy, 22); // D/t 160 > 0.31 E/Fy = 163? no: 0.31 × 527 = 163.5
    expect(sl.cls).toBe("noncompact");
    const sl2 = roundTube(36, 0.1875, Fy, 22); // D/t 192
    expect(sl2.cls).toBe("slender");
    expect(sl2.Mn).toBeCloseTo(sl2.Mp * ((0.25 * EF) / 192), 6);
  });

  it("takes shear and torsion from the larger buckling stress, at most 0.6 Fy (5.11.2.1.1, 5.11.3.1.1)", () => {
    const t = roundTube(15.5, 0.1875, 55, 22);
    const lam = 15.5 / 0.1875;
    const Lv = 22 * 12;
    expect(t.Fnv).toBeCloseTo(Math.min(33, Math.max((1.6 * 29000) / (Math.sqrt(Lv / 15.5) * lam ** 1.25), (0.78 * 29000) / lam ** 1.5)), 9);
    expect(t.Fnt).toBeCloseTo(Math.min(33, Math.max((1.23 * 29000) / (Math.sqrt(Lv / 15.5) * lam ** 1.25), (0.6 * 29000) / lam ** 1.5)), 9);
  });
});

describe("LRFD-LTS-1 fatigue (Section 11)", () => {
  it("takes Table 11.6-1's importance factors for cantilevered signs", () => {
    expect(IMPORTANCE.II).toEqual({ G: 0.7, NW: 0.85, TG: 0.9 });
    expect(IMPORTANCE.III).toEqual({ G: 0.4, NW: 0.7, TG: 0.8 });
  });

  it("works out KF (Table 11.9.3.1-2), KI (Eq. 11.9.3.1-1) and the threshold by KI (Table 11.9.3.1-1)", () => {
    const w = tubeToPlate("fillet", { D: 15.5, t: 0.25 }, { t: 2, circle: 24, opening: 0 });
    const CBC = 24 / 15.5;
    const KF = 2.2 + 4.6 * (15 * 0.25 + 2) * (15.5 ** 1.2 - 10) * (CBC ** 0.03 - 1) * 2 ** -2.5;
    expect(w.KF).toBeCloseTo(KF, 9);
    expect(w.KI).toBeCloseTo((1.76 + 1.83 * 0.25 - 4.76 * 0.22 ** KF) * KF, 9);
    expect(w.CAFT).toBe(w.KI <= 4 ? 7 : w.KI <= 6.5 ? 4.5 : 2.6);
    const g = tubeToPlate("groove", { D: 15.5, t: 0.25 }, { t: 2, circle: 24, opening: 8 });
    const COP = 8 / 15.5;
    expect(g.KF).toBeCloseTo(1.35 + 16 * (15 * 0.25 + 1) * (15.5 - 5) * ((CBC ** 0.02 - 1) / (4 * COP ** -0.7 - 3)) * 2 ** -2, 9);
    expect(g.valid).toBe(true);
    // Outside the equation's range: the detail's lowest threshold.
    expect(tubeToPlate("groove", { D: 24, t: 0.375 }, { t: 2, circle: 24, opening: 8 }).CAFT).toBe(4.5);
  });
});

describe("NCHRP Report 796, Example 9: a cantilevered monotube with a dynamic message sign (Fort Collins, CO)", () => {
  // 24 in tubes (11/16 in pole, 3/8 in arm), a 30 ft arm at 20 ft, a 24 × 8 × 4 ft, 5 kip sign centered 18 ft out,
  // 120 mph, Fatigue Category I. The report's values (Maryland SHA's comparison, Table Appendix 4 and 5).
  const ex: SignInputs = {
    ...SIGN_DEFAULTS,
    poleLength: 20,
    armDrop: 0,
    armLength: 30,
    poleBase: 24,
    poleTop: 24,
    poleWall: 11 / 16,
    armBase: 24,
    armEnd: 24,
    armWall: 0.375,
    signLength: 24,
    signHeight: 8,
    signOffset: 18,
    miscPct: 0,
    V: 120,
    Kd: 0.85,
    G: 1.14,
    CdSign: 1.19,
    steel: { ...SIGN_STEEL_DEFAULTS, Fy: 36, signWeight: 5, signDepth: 4, fatigue: { ...SIGN_STEEL_DEFAULTS.fatigue, galloping: false, clearance: 17, vMean: 11.2 } },
  };
  const r = designSign(ex);

  it("wind on the sign (Extreme I): 7.32 kip; its torsion 132 kip·ft", () => {
    near(r.wind.Wsign, 7.32);
    near(r.wind.Wsign * 18, 132);
  });

  it("natural wind gust: 1.188 kip on the sign, 27.5 kip·ft at the base", () => {
    near(r.steel!.fatigue.NWsign, 1.188, 0.001);
    near(r.steel!.fatigue.MNWpole, 27.504);
  });

  it("truck-induced gust: 1.085 kip on the sign, 26.04 kip·ft", () => {
    near(r.steel!.fatigue.TGsign, 1.085);
    near(r.steel!.fatigue.MTGarm, 26.04);
  });
});

describe("the sign structure in the tool", () => {
  it("designs the steel for a new design, and keeps an older design's shaft alone", () => {
    expect(designSign(signInputs({})).checks.some((c) => c.id === "pole-combined")).toBe(true);
    const old = signInputs({ poleLength: 22 });
    expect(old.steel).toBeUndefined();
    expect(designSign(old).checks.some((c) => c.id === "pole-combined")).toBe(false);
  });

  it("passes with the defaults, galloping aside", () => {
    const d = designSign(SIGN_DEFAULTS);
    expect(d.checks.filter((c) => !c.ok && !c.advisory).map((c) => c.id)).toEqual([]);
  });

  it("reduces the truck gust from 20 to 33 ft above the road", () => {
    const at = (clearance: number) => designSign({ ...SIGN_DEFAULTS, steel: { ...SIGN_STEEL_DEFAULTS, fatigue: { ...SIGN_STEEL_DEFAULTS.fatigue, clearance } } }).steel!.fatigue.red;
    expect(at(18)).toBe(1);
    expect(at(26.5)).toBeCloseTo(0.5, 9);
    expect(at(34)).toBe(0);
  });

  it("works out its calc package with no errors", () => {
    const regions = readingOrder(layout(signCalcLines(SIGN_DEFAULTS, "Test sign"), { x: 0, y: 0 }));
    const items = regions.flatMap((x): SheetItem[] => (x.kind === "text" || x.kind === "image" ? [] : [x as SheetItem]));
    const results = evaluateSheet(items, DEFAULT_SETTINGS, new Map());
    const errors = regions.flatMap((x) => (results.get(x.id)?.kind === "error" ? [`${x.kind === "math" ? x.latex : x.kind}: ${(results.get(x.id) as { message: string }).message}`] : []));
    expect(errors).toEqual([]);
  });
});
