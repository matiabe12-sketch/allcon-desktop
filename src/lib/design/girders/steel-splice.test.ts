import { describe, expect, it } from "vitest";
import { designSplice, holeOf, SPLICE_DEFAULTS, type SpliceForces } from "./steel-splice";

// Bolted field splices (AASHTO 10th 6.13.6.1.3) against Caltrans Bridge Design Practice 6.2 (October 2022), the
// splice at 0.7 of span 2: the flanges by the same Pfy method (its web splice follows Caltrans's own amendments,
// not compared). Its plates and rows given; 7/8 in A325, threads excluded, edge 2 in, end 1-7/8 in, gage 4 in.

const within = (a: number, b: number, rel: number) => expect(Math.abs(a - b) / Math.abs(b)).toBeLessThanOrEqual(rel);
const s = { ...SPLICE_DEFAULTS, edge: 2, endGirder: 1.875, gage: 4 };
const forces: SpliceForces = { MuPos: 6000, MuNeg: -3000, Vr: 843.6, MsPos: 4692, MsNeg: 814, Vs: 300, Mdeck: 1434 * 1.4, Vdeck: 60, ftPos: 30, ftNeg: 10, fatigue: { top: 4.5, bot: 3.5 }, adttSL: 2500, life: 75, cycles: 1 };
const L = { D: 78, tw: 0.625, top: { b: 18, t: 1 }, bottom: { b: 18, t: 1.75 } };
const R = { D: 78, tw: 0.625, top: { b: 18, t: 2 }, bottom: { b: 18, t: 2 } };
const r = designSplice(s, 0, 0, 1, L, R, 50, 50, { ts: 9, above: 2 }, forces, {
  bottom: { outer: { b: 18, t: 1 }, inner: { b: 8, t: 1.125 }, rows: 7 },
  top: { outer: { b: 18, t: 0.625 }, inner: { b: 8, t: 0.75 }, rows: 5 },
});
const chk = (part: string) => r.checks.find((c) => c.name.includes(part))!;

describe("bolted field splice, Caltrans BDP 6.2", () => {
  it("standard hole 15/16 in", () => expect(holeOf(0.875)).toBe(0.9375));
  it("bottom flange: An 24.94, Ae 27.30 in², Pfy 1,365 kip; filler 1/4 in, R 0.889; 28 bolts for 23.8 needed", () => {
    within(r.bottom.An, 24.94, 0.001);
    within(r.bottom.Ae, 27.3, 0.001);
    within(r.bottom.Pfy, 1365, 0.001);
    expect(r.bottom.filler).toBe(0.25);
    within(r.bottom.R, 0.889, 0.001);
    within(r.bottom.Rn, 80.6, 0.004); // Caltrans rounds Ab to 0.60 in²
    within(r.bottom.Pfy / (0.8 * r.bottom.R * r.bottom.Rn), 23.81, 0.004);
    expect(r.bottom.n).toBe(28);
  });
  it("bottom splice plates: gross 1,710; outer net 741.0, inner 716.6; block shear outer 1,316.6, inner 1,481.4; flange 2,290.8 kip", () => {
    within(chk("bottom flange splice plates, gross").capacity, 1710, 0.001);
    within(chk("bottom flange outer plate, net").capacity, 741, 0.001);
    within(chk("bottom flange inner plates, net").capacity, 716.6, 0.001);
    within(chk("bottom flange outer plate, block").capacity, 1316.6, 0.002);
  });
  it("top flange: Ae 15.60 in², Pfy 780 kip, filler 1 in, R 0.667; 20 bolts for 18.1 needed", () => {
    within(r.top.Ae, 15.6, 0.001);
    within(r.top.Pfy, 780, 0.001);
    expect(r.top.filler).toBe(1);
    within(r.top.R, 0.667, 0.001);
    within(r.top.Pfy / (0.8 * r.top.R * r.top.Rn), 18.14, 0.004);
    within(chk("top flange outer plate, net").capacity, 463.3, 0.001);
    within(chk("top flange inner plates, net").capacity, 477.9, 0.001);
  });
  it("designed by itself, every check passes", () => {
    const own = designSplice(s, 0, 0, 1, L, R, 50, 50, { ts: 9, above: 2 }, forces);
    expect(own.checks.filter((c) => c.demand > c.capacity * (1 + 1e-9)).map((c) => c.name)).toEqual([]);
    expect(own.bottom.rows).toBeGreaterThanOrEqual(2);
    expect(own.web.cols).toBeGreaterThanOrEqual(2);
  });
});
