import { describe, expect, it } from "vitest";
import { ABUTMENT_DEFAULTS, designAbutment } from "./abutment";
import { abutmentTakeoff, micropileTakeoff, pileTakeoff } from "./detail";
import { abutmentInputs, pileFoundationInputs } from "./kinds";
import { designMicropile, MICROPILE_DEFAULTS } from "./micropile";
import { designPiles, PILE_DEFAULTS } from "./piles";

// D-11-Z's foundations: the pier footing (9.5 x 7 x 3 ft cap on a ring of ten 10 in micropiles, 25 ft) and the
// integral abutment on two rows of micropiles (CDOT 26956 micropile array calc).
const mp = { holeD: 10, casingOD: 9.625, casingT: 0.545, cased: 0, bond: 25, alphaB: 6.2 / ((Math.PI * 10) / 12), phiBond: 0.55, embed: 12 };

describe("a pier footing on micropiles", () => {
  const i = pileFoundationInputs({ ...PILE_DEFAULTS, pileType: "micropile", perimeter: true, micropile: mp, nB: 4, nL: 3, sB: 2.5, sL: 2.5, edge: 1, capT: 36, colB: 108, colL: 36, colShape: "rectangular" });
  it("keeps its micropile settings through saving", () => {
    expect(i.pileType).toBe("micropile");
    expect(i.perimeter).toBe(true);
    expect(i.micropile?.holeD).toBe(10);
  });
  it("a ring of 10 under a 9.5 × 7 ft cap; each micropile by the Micropile design, the cap's own checks too", () => {
    const r = designPiles(i);
    expect(r.n).toBe(10);
    expect(r.capB).toBeCloseTo(9.5, 6);
    expect(r.capL).toBeCloseTo(7, 6);
    const ids = r.checks.map((c) => c.id);
    expect(ids).toContain("mp-bond-comp");
    expect(ids).toContain("cap-punch-col");
    expect(ids).not.toContain("geo-axial");
    // 6.2 k/ft nominal over 25 ft, φ 0.55.
    expect(r.checks.find((c) => c.id === "mp-bond-comp")!.capacity).toBeCloseTo(0.55 * 6.2 * 25, 1);
  });
  it("its quantities: 10 micropiles × 25 ft under Item 503", () => {
    const t = pileTakeoff(i);
    expect(t.quantities.micropile?.value).toBeCloseTo(250, 6);
    expect(t.quantities.pile).toBeUndefined();
  });
});

describe("an integral abutment on two rows of micropiles", () => {
  const i = abutmentInputs({ ...ABUTMENT_DEFAULTS, type: "integral-micropiles", nPiles: 12, mpRows: 2, mpRowSpacing: 5, mpBatterFront: 0, mpBatterBack: 6, groupMoment: 6125, micropile: mp, length: 47, capWidth: 8, capDepth: 3.5 });
  it("the group's forces across its two rows, the second battered, and each micropile checked", () => {
    const r = designAbutment(i);
    const bond = r.checks.find((c) => c.id === "mp-bond-comp")!;
    expect(r.integral).toBeTruthy();
    // The most loaded pile carries the group's share plus the 6125 kip·ft moment across the two rows 5 ft apart (Σy² = 150 ft²).
    expect(bond.demand).toBeGreaterThan((6125 * 2.5) / 150);
    expect(bond.capacity).toBeCloseTo(0.55 * 6.2 * 25, 1);
    expect(r.checks.some((c) => c.id === "mp-movement")).toBe(true);
    expect(r.checks.some((c) => c.id === "pile-length")).toBe(true);
  });
  it("a moment along the abutment (the lanes toward one curb) adds M·x/Σx² on the end pile", () => {
    const a = designAbutment(i).checks.find((c) => c.id === "mp-bond-comp")!.demand;
    const b = designAbutment({ ...i, groupMomentAlong: 2734 }).checks.find((c) => c.id === "mp-bond-comp")!.demand;
    // 12 piles a row along 47 ft, 1 ft in from the ends: the end piles 22.5 ft from the middle, Σx² over both rows.
    const xs = Array.from({ length: 12 }, (_, k) => -22.5 + (k * 45) / 11);
    const Sx2 = 2 * xs.reduce((s, x) => s + x * x, 0);
    expect(b - a).toBeGreaterThan(0.9 * ((2734 * 22.5) / Sx2));
    expect(b - a).toBeLessThan(1.2 * ((2734 * 22.5) / Sx2));
  });
  it("a saved design keeps its optional inputs (the moment along the abutment, lanes, micropile rows, bars)", () => {
    const saved = { ...i, groupMomentAlong: 2734, lanes: 3, RLane: 86.8, mpRowList: [{ x: 1.5, batter: 14 }], stemFrontBars: { bar: 8, spacing: 6 }, stemHQty: 14.95 };
    const back = abutmentInputs(JSON.parse(JSON.stringify(saved)));
    for (const k of ["groupMomentAlong", "lanes", "RLane", "mpRowList", "stemFrontBars", "stemHQty"] as const) expect(back[k], k).toEqual(saved[k]);
  });
  it("its quantities: 24 micropiles × 25 ft", () => {
    expect(abutmentTakeoff(i).quantities.micropile?.value).toBeCloseTo(24 * 25, 6);
  });
});

describe("micropiles: corrosion, the group's p-multipliers, the bar's development, embankment (AASHTO 10.9, CDOT BDM 10.5.1.4)", () => {
  const base = { ...MICROPILE_DEFAULTS };
  it("aggressive ground takes 0.001 in/yr × 75 yr off the casing's outside", () => {
    const a = designMicropile(base);
    const b = designMicropile({ ...base, aggressive: true });
    expect(b.loss).toBeCloseTo(0.075, 6);
    const ID = base.casingOD - 2 * base.casingT;
    expect(b.Ac).toBeCloseTo((Math.PI / 4) * ((base.casingOD - 0.15) ** 2 - ID ** 2), 6);
    expect(b.RnCC).toBeLessThan(a.RnCC);
    expect(b.Mp).toBeLessThan(a.Mp);
    // A coating counted for 30 years: corrosion over the last 45.
    expect(designMicropile({ ...base, aggressive: true, coatingLife: 30 }).loss).toBeCloseTo(0.045, 6);
    expect(b.notes.some((n) => n.includes("BDM 10.5.1.4"))).toBe(true);
  });
  it("an extreme event takes the casing and bar at φ 1.0 (AASHTO 1.3.2.1, 10.5.5.3.3)", () => {
    const lc = { name: "x", compression: 150, tension: 60, H: 10 };
    const s = designMicropile({ ...base, cases: [{ ...lc, limit: "strength" }] });
    const e = designMicropile({ ...base, cases: [{ ...lc, limit: "extreme" }] });
    const cap = (r: typeof s, id: string) => r.checks.find((c) => c.id === id)!.capacity;
    expect(cap(e, "cased-comp") / cap(s, "cased-comp")).toBeCloseTo(1 / 0.75, 6);
    expect(cap(e, "uncased-ten") / cap(s, "uncased-ten")).toBeCloseTo(1 / 0.8, 6);
    const v = (r: typeof s) => r.checks.find((c) => c.id === "interaction")!.demand;
    expect(v(e)).toBeLessThan(v(s));
  });
  it("in a group the lead row's moment, pushed to the group's deflection, is larger than a lone pile's", () => {
    const lone = designMicropile(base);
    const grp = designMicropile({ ...base, groupPm: { avg: 0.5, lead: 0.8 } });
    const m = (r: ReturnType<typeof designMicropile>) => Math.max(...r.comb.map((c) => c.r.Mmax));
    expect(m(grp)).toBeGreaterThan(m(lone));
  });
  it("the bar developed within the bond length: 2.4·db·fy/√f'c·λrc·λer (AASHTO 5.10.8.2.1)", () => {
    const r = designMicropile(base);
    const ch = r.checks.find((c) => c.id === "bar-dev")!;
    expect(ch).toBeDefined();
    // Tension: 60 kip on a #20 (λrc = 2.5/4); compression: 230 kip against 0.75·Rnu, the larger of 0.63·db·fy/√f'c and 0.3·db·fy.
    const needT = Math.max(12, ((2.4 * 2.5 * 75) / Math.sqrt(5)) * (2.5 / 4) * (60 / (0.8 * r.RnTU)));
    const needC = Math.max(8, Math.max((0.63 * 2.5 * 75) / Math.sqrt(5), 0.3 * 2.5 * 75) * (230 / (0.75 * r.RnCU)));
    expect(ch.demand * 12).toBeCloseTo(Math.max(needT, needC), 6);
    expect(ch.demand * 12).toBeCloseTo(36.2, 0);
    expect(ch.capacity).toBe(base.bond);
  });
  it("through embankment: 10 ft into original ground, or less bonded in rock", () => {
    const soil = designMicropile({ ...base, bondGround: "dense-sand", fill: 50, alphaB: 4 });
    expect(soil.checks.find((c) => c.id === "fill")!.ok).toBe(false);
    const rock = designMicropile({ ...base, fill: 40 });
    expect(rock.checks.find((c) => c.id === "fill")!.ok).toBe(true);
  });
  it("the group in net uplift: φ 0.50 on the piles' bond (AASHTO 10.7.3.11)", () => {
    const i = pileFoundationInputs({ ...PILE_DEFAULTS, pileType: "micropile", micropile: mp, nB: 2, nL: 2, sB: 3, sL: 3, edge: 1.25, capT: 36, cases: [{ name: "Strength III", limit: "strength", P: -400, MB: 0, ML: 0, HB: 5, HL: 0 }] });
    const r = designPiles(i);
    const ch = r.checks.find((c) => c.id === "group-uplift")!;
    expect(ch).toBeDefined();
    expect(ch.capacity).toBeCloseTo(0.5 * 4 * 6.2 * 25, 1);
    expect(r.micropileGroup?.d).toBe("B");
  });
});

describe("a seat abutment on a footing over rows of micropiles", () => {
  const i = abutmentInputs({ ...ABUTMENT_DEFAULTS, type: "seat", foundation: "micropiles", toe: 2, stemT: 4, heel: 3, footT: 3, stemH: 12, backwallH: 7, length: 66, mpPerRow: 15, mpRowList: [{ x: 1.5, batter: 0 }, { x: 4.5, batter: 0 }, { x: 7.5, batter: 14.04 }], micropile: { casingOD: 12, casingT: 0.5, holeD: 11, bar: 20, barFy: 75, cased: 10, bond: 10, alphaB: 20, phiBond: 0.55, fcGrout: 6 } });
  const r = designAbutment(i);
  it("each row's share of the load and its moment about the group's centroid, per foot × the spacing, along a battered row", () => {
    const m = r.seat!.micropiles!;
    const row = r.seat!.rows[0];
    const xs = [1.5, 4.5, 7.5];
    const xc = 4.5;
    const S2 = 2 * 9;
    const s = 66 / 15;
    const P = xs.map((x, k) => ((row.V / 3 + (row.V * (xc - row.xR) * (xc - x)) / S2) * s) / Math.cos(((k === 2 ? 14.04 : 0) * Math.PI) / 180));
    expect(m.rows.map((q) => q.P[0])).toEqual(P.map((p) => expect.closeTo(p, 6)));
    expect(r.checks.some((c) => c.id === "mp-bond-comp")).toBe(true);
    expect(m.Pmax).toBeCloseTo(Math.max(...m.rows.flatMap((q) => q.P)), 9);
  });
  it("its quantities: 45 micropiles × 20 ft under Item 503", () => {
    expect(abutmentTakeoff(i).quantities.micropile?.value).toBeCloseTo(900, 6);
  });
});

describe("a seat abutment's footing on its micropile rows (hand check)", () => {
  // Rows at 1.5, 4.5 and 7.5 ft across a 9 ft footing (toe 2 ft, stem 4 ft, heel 3 ft); the heel's free body from the
  // heel to the stem's back bars: the back row's reaction less the footing and the soil on the heel.
  const i = abutmentInputs({ ...ABUTMENT_DEFAULTS, type: "seat", foundation: "micropiles", toe: 2, stemT: 4, heel: 3, footT: 3, stemH: 12, backwallH: 7, length: 66, mpPerRow: 15, mpRowList: [{ x: 1.5, batter: 0 }, { x: 4.5, batter: 0 }, { x: 7.5, batter: 0 }], micropile: { casingOD: 12, casingT: 0.5, holeD: 11, bar: 20, barFy: 75, cased: 10, bond: 10, alphaB: 20, phiBond: 0.55, fcGrout: 6, plate: { size: 15, t: 1.25, Fy: 36, weld: 0.375, Fexx: 70 } } });
  const r = designAbutment(i);
  const m = r.seat!.micropiles!;
  it("the top bars' moment is the largest of the cases' heel and toe free bodies at the stem's bars", () => {
    const x2b = 2 + 4 - (2 + 1.0 / 2) / 12; // the stem's back bars: #8 (1.0 in) at 2 in cover
    const s = 66 / 15;
    const g = i.backfillGamma / 1000;
    const heel = (k: number, dc: number, ev: number) => {
      const R3 = m.rows[2].P[k] / s;
      return -(R3 * (7.5 - x2b) - (dc * i.gammaC * 3 + ev * g * (12 + 7)) * (9 - x2b) ** 2 / 2);
    };
    const expected = Math.max(heel(0, 1.25, 1.35), heel(1, 0.9, 1.0));
    const top = r.checks.find((c) => c.id === "foot-top")!;
    expect(top.demand).toBeCloseTo(Math.max(0, expected), 6);
  });
  it("punching at the most loaded micropile on dv/2 round its 15 in plate, cut by the footing's edge", () => {
    const P = Math.max(...m.rows.flatMap((q) => q.P));
    const dv = 36 - 12;
    const side = 15 + dv;
    const edge = 1.5 * 12;
    const bo = side + 2 * (edge + side / 2);
    const ch = r.checks.find((c) => c.id === "foot-punch")!;
    expect(ch.demand).toBeCloseTo(P, 6);
    expect(ch.capacity).toBeCloseTo(0.9 * 0.126 * Math.sqrt(i.fc) * bo * dv, 6);
  });
  it("the plate's bearing, thickness and weld (AASHTO 5.6.5, AISC DG 1, AASHTO 6.13.3.2.4b)", () => {
    const P = Math.max(...m.result.comb.map((c) => c.c.compression));
    expect(r.checks.find((c) => c.id === "mp-plate-bearing")!.capacity).toBeCloseTo(0.7 * 0.85 * i.fc * 225, 6);
    expect(r.checks.find((c) => c.id === "mp-plate-t")!.demand).toBeCloseTo(Math.max((15 - 0.8 * 12) / 2, 3) * Math.sqrt((2 * P) / (0.9 * 36 * 225)), 6);
    expect(r.checks.find((c) => c.id === "mp-plate-weld")!.capacity).toBeCloseTo(0.8 * 0.6 * 70 * 0.707 * 0.375 * Math.PI * 12, 6);
  });
});

describe("micropile bond: preliminary (presumptive φ 0.55) and final with load tests (φ 0.70)", () => {
  const base = { ...MICROPILE_DEFAULTS };
  const pre = designMicropile(base);
  const fin = designMicropile({ ...base, loadTested: true });
  it("the bond's resistance takes the chosen φ", () => {
    expect(pre.checks.find((c) => c.id === "bond-comp")!.capacity).toBeCloseTo(0.55 * pre.Rs, 6);
    expect(fin.checks.find((c) => c.id === "bond-comp")!.capacity).toBeCloseTo(0.7 * fin.Rs, 6);
  });
  it("both report the bond length each way: the governing load over φ π db αb", () => {
    const Pc = 230; // the defaults' Strength I
    const per = (phi: number) => phi * Math.PI * (base.holeD / 12) * base.alphaB;
    for (const r of [pre, fin]) {
      expect(r.bondNeeded.preliminary).toBeCloseTo(Pc / per(0.55), 6);
      expect(r.bondNeeded.tested).toBeCloseTo(Pc / per(0.7), 6);
    }
    expect(pre.bondNeeded.design).toBe("preliminary");
    expect(fin.bondNeeded.design).toBe("final");
  });
  it("a load-tested design pays a verification test pile (503-02000); a preliminary one doesn't", () => {
    expect(micropileTakeoff({ ...base, loadTested: true }, 10).quantities.testing?.value).toBe(1);
    expect(micropileTakeoff(base, 10).quantities.testing).toBeUndefined();
  });
});
