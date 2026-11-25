import { describe, expect, it } from "vitest";
import { dtRatingInputs } from "../kinds";
import fixtures from "./cdot-bridges.json";
import { DT_DEFAULTS, NO_UNIT_CONDITION, codeTension, dtInputsFromBridgeFile, isSidewalkTruckCase, rateDoubleTee, type DtInputs, type DtRating, type DtUnitCondition } from "./double-tee";
import { dtRatingCalcLines } from "./double-tee-calc";
import { CDOT_VEHICLES, laneAt, tons, trainAt, trainMax } from "./vehicles";

// The double-tee LFR rating, against the rating scripts' results for five CDOT bridges without plans
// (cdot-bridges.json: their inputs, and the prestress and ratings the scripts worked out by the
// midspan hand method). The tool's own analysis rates every point of interest; with the back-
// calculation at midspan it must reproduce those results exactly.

const near = (a: number, b: number, rel = 1e-9, label = "") => expect(Math.abs(a - b), `${label} ${a} vs ${b}`).toBeLessThanOrEqual(rel * Math.max(1, Math.abs(b)));
const gname = (n: string) => n.replace(" mnt", " (trucks on sidewalk)");

describe("vehicles", () => {
  it("weigh what CDOT posts: Type 3 27 T, 3S2 42.5 T, the permit 96 T, HS-20 36 T", () => {
    const w = Object.fromEntries(CDOT_VEHICLES.map((v) => [v.name, tons(v)]));
    // The permit's three 10.84 kip wheel lines sum to 96.02 T; CDOT posts it as 96 T.
    [36, 27, 42.5, 96].forEach((t, k) => expect(w[["HS-20", "CO Type 3", "CO Type 3S2", "CO Permit"][k]]).toBeCloseTo(t, k === 3 ? 1 : 9));
  });
  it("give the CDOT workbook's moment at 32.75 ft: HS-20 162.10 kip·ft (0.1%)", () => {
    near(trainMax(CDOT_VEHICLES[0], 32.75).M, 162.1, 1e-3, "HS-20");
  });
  it("moment at midspan by influence line: a single wheel load P·L/4; the lane load wL²/8 + PL/4", () => {
    near(trainAt({ P: [10], S: [] }, 40, 20).M, 100, 1e-9);
    near(laneAt(40, 20).M, (0.32 * 1600) / 8 + (9 * 40) / 4, 1e-12);
  });
});

type Expected = {
  nStrands: number; Pj: number; gov: string; govRF: number; crackGoverns: boolean; M_HS20: number;
  girders: { name: string; dfMulti: number; dfSingle: number; Mnow: number; Mn: number }[];
  ratings: { name: string; Mw: number; gov: string; per: { g: string; inv: number; opr: number }[] }[];
};
it("sets the prestress with trucks between the curbs, then rates trucks on a mountable sidewalk with it", () => {
  const i: DtInputs = { ...DT_DEFAULTS, span: 22, structureLength: 23, loads: { ...DT_DEFAULTS.loads, sidewalks: [{ width: 5, thk: 8 }], sidewalkMountable: true, pedestrians: true }, options: { ...DT_DEFAULTS.options, solveWithOverlay: true } };
  const r = rateDoubleTee(i);
  expect(isSidewalkTruckCase(r.solve.gov)).toBe(false);
  const hs = r.ratings[0];
  for (const p of hs.per.filter((x) => !isSidewalkTruckCase(x.g))) expect(p.flexInv.inv).toBeGreaterThanOrEqual(1 - 1e-9);
  expect(hs.per.some((x) => isSidewalkTruckCase(x.g))).toBe(true);
});

describe("curbs", () => {
  const base: DtInputs = { ...DT_DEFAULTS, span: 24, structureLength: 25, roadway: { ...DT_DEFAULTS.roadway, curbToCurb: 27.5, curbFaceOffset: 15 } };
  const curbs = { ...base, loads: { ...base.loads, sidewalks: [{ width: 1.25, thk: 11, curb: true }, { width: 1.25, thk: 11, curb: true }] } };
  it("carry dead load on their exterior unit without a deck, but no pedestrians and no trucks on them", () => {
    const r = rateDoubleTee(curbs);
    const g1 = r.girders.find((g) => g.name === "G1")!;
    expect(g1.dlNow.sidewalk).toBeCloseTo(1.25 * (11 / 12) * 0.15, 6);
    expect(r.girders.find((g) => g.name === "G2")!.dlNow.sidewalk).toBe(0);
    expect(r.ped.pedKlf).toBe(0);
    expect(r.ped.mountable).toBe(false);
    expect(r.girders.some((g) => g.name.includes("trucks on sidewalk"))).toBe(false);
  });
  it("the same entries as sidewalks carry pedestrians and are mountable", () => {
    const r = rateDoubleTee({ ...curbs, loads: { ...curbs.loads, sidewalks: curbs.loads.sidewalks.map(({ width, thk }) => ({ width, thk })) } });
    expect(r.ped.pedKlf).toBeGreaterThan(0);
    expect(r.ped.mountable).toBe(true);
  });
});

it("by default doesn't rate the final tension on a back-calculated prestress, but reports it at 6√f′c (BRM 1.7.2)", () => {
  const i: DtInputs = { ...DT_DEFAULTS, loads: { ...DT_DEFAULTS.loads, asphalt: 0 } };
  expect(i.options.ignoreTension).toBe(true);
  const r = rateDoubleTee(i);
  const hs = r.ratings[0];
  const t = hs.per.flatMap((p) => p.points).filter((q) => q.check === "tension");
  expect(t.length).toBeGreaterThan(0);
  expect(t.every((q) => q.info && Math.abs(q.C - codeTension(i.materials.fc)) < 1e-12)).toBe(true);
  expect(hs.tInfo!.pt.inv).toBeCloseTo(Math.min(...t.map((q) => q.inv)), 12);
  expect(hs.govInv.inv.inv).toBeGreaterThanOrEqual(1 - 1e-9);
  expect(hs.govInv.inv.check).toBe("flexure");
  // Known strands: the tension is rated.
  const known = rateDoubleTee({ ...i, prestress: { mode: "known", strands: r.solve.nStrands } });
  const kt = known.ratings[0].per.flatMap((p) => p.points).filter((q) => q.check === "tension");
  expect(kt.length).toBeGreaterThan(0);
  expect(kt.some((q) => q.info)).toBe(false);
  expect(known.ratings[0].tInfo).toBeNull();
});

it("by default solves without the asphalt (the original design) and rates with it (BRM 1.7.2(A))", () => {
  const exact = { ...DT_DEFAULTS.options, roundStrands: false };
  const bare = rateDoubleTee({ ...DT_DEFAULTS, loads: { ...DT_DEFAULTS.loads, asphalt: 0 }, options: exact });
  const paved = rateDoubleTee({ ...DT_DEFAULTS, loads: { ...DT_DEFAULTS.loads, asphalt: 4 }, options: exact });
  // The same prestress: the overlay isn't designed for…
  near(paved.solve.nStrands, bare.solve.nStrands, 1e-9, "strands");
  // …so it lowers the HS-20 rating below 1.0.
  const flex = (r: ReturnType<typeof rateDoubleTee>) => Math.min(...r.ratings[0].per.map((p) => p.flexInv.inv));
  near(flex(bare), 1, 1e-6, "bare");
  expect(flex(paved)).toBeLessThan(0.99);
  // With the asphalt taken as original, it's designed for: 1.0 again.
  const orig = rateDoubleTee({ ...DT_DEFAULTS, loads: { ...DT_DEFAULTS.loads, asphalt: 4 }, options: { ...exact, solveWithOverlay: true } });
  near(flex(orig), 1, 1e-6, "original asphalt");
});

describe.each(fixtures as unknown as { name: string; bridge: Record<string, unknown>; expected: Expected }[])("CDOT bridge $name", (f) => {
  const base = dtInputsFromBridgeFile(f.bridge);
  const hand: DtInputs = { ...base, options: { ...base.options, solveAt: "midspan", poi: "tenth-and-max" } };
  const r = rateDoubleTee(hand);
  const e = f.expected;

  it("back-calculates the same strands and BrR force (midspan, as the scripts)", () => {
    near(r.solve.nStrands, e.nStrands, 1e-9, "strands");
    // The scripts floored 15 × 0.144 × 175 = 377.99… (floating point) to 377 kip; it's 378.
    expect(r.solve.Pj).toBe(f.name === "AUR07.0-H.0" ? 378 : e.Pj);
    // The prestress is set with trucks between the curbs; where the scripts let trucks on a mountable
    // sidewalk govern, it's now rated with that prestress instead (the same whole strands here).
    if (isSidewalkTruckCase(gname(e.gov))) {
      expect(isSidewalkTruckCase(r.solve.gov)).toBe(false);
      expect(r.solve.govRF).toBeGreaterThanOrEqual(1);
    } else {
      expect(r.solve.gov).toBe(gname(e.gov));
      near(r.solve.govRF, e.govRF, 1e-9, "governing RF");
    }
    expect(r.solve.crackGoverns).toBe(e.crackGoverns);
    near(r.M_HS20, e.M_HS20, 1e-9, "HS-20 moment");
  });
  it("has the same distribution factors, dead loads and capacities for every girder", () => {
    for (const g of e.girders) {
      const ours = r.girders.find((x) => x.name === gname(g.name))!;
      near(ours.dfMulti, g.dfMulti, 1e-12, `${g.name} DF multi`);
      near(ours.dfSingle, g.dfSingle, 1e-12, `${g.name} DF single`);
      const mid = r.midspan[0].per.find((x) => x.g === ours.name)!;
      near(mid.D, g.Mnow, 1e-12, `${g.name} dead load`);
      near(mid.C, g.Mn, 1e-12, `${g.name} Mn`);
    }
  });
  it("rates every vehicle and girder the same at midspan", () => {
    for (const ev of e.ratings) {
      const ours = r.midspan.find((x) => x.name === ev.name)!;
      near(ours.Mw, ev.Mw, 1e-12, `${ev.name} moment`);
      for (const p of ev.per) {
        const o = ours.per.find((x) => x.g === gname(p.g))!;
        near(o.inv, p.inv, 1e-9, `${ev.name} ${p.g} inv`);
        near(o.opr, p.opr, 1e-9, `${ev.name} ${p.g} opr`);
      }
      expect(ours.gov.g).toBe(gname(ev.gov));
    }
  });
  it("the full analysis's flexure ratings at the points of interest are no lower than the midspan hand method's", () => {
    for (const rt of r.ratings) {
      const mid = r.midspan.find((x) => x.name === rt.name)!;
      for (const p of rt.per) {
        const m = mid.per.find((x) => x.g === p.g)!;
        // Each vehicle's own maximum is a point of interest; the dead load there is no more than at midspan.
        expect(p.flexOpr.opr!, `${rt.name} ${p.g}`).toBeGreaterThanOrEqual(m.opr - 1e-9);
        expect(p.flexOpr.opr!, `${rt.name} ${p.g}`).toBeLessThanOrEqual(m.opr * 1.02);
      }
    }
  });
});

describe("the back-calculation over the points of interest (as BrR rates)", () => {
  it("rates HS-20 inventory at exactly 1.0 in flexure before rounding to whole strands", () => {
    const i: DtInputs = { ...DT_DEFAULTS, options: { ...DT_DEFAULTS.options, roundStrands: false, solveWithOverlay: true } };
    const r = rateDoubleTee(i);
    near(r.solve.govRF, 1, 1e-6, "RF");
    const hs = r.ratings.find((x) => x.name === "HS-20")!;
    near(Math.min(...hs.per.map((p) => p.flexInv.inv)), 1, 1e-6, "flexure inventory");
  });
  it("with whole strands rates HS-20 inventory at 1.0 or a little more", () => {
    const r = rateDoubleTee(DT_DEFAULTS);
    expect(r.solve.govRF).toBeGreaterThanOrEqual(1 - 1e-9);
    expect(Number.isInteger(Math.round(r.solve.nStrands * 1e9) / 1e9)).toBe(true);
  });
});

describe("saved ratings", () => {
  it("a new one takes the defaults: solved without the asphalt, final tension for information", () => {
    const o = dtRatingInputs({}).options;
    expect([o.solveWithOverlay, o.ignoreTension, o.tensionLimit]).toEqual([false, true, null]);
  });
  it("one saved before the defaults changed keeps what it was rated with", () => {
    const o = dtRatingInputs({ options: { roundStrands: true } }).options;
    expect([o.solveWithOverlay, o.ignoreTension, o.tensionLimit]).toEqual([true, false, 1]);
  });
  it("one saved with the settings keeps them", () => {
    const o = dtRatingInputs({ options: { solveWithOverlay: false, ignoreTension: true, tensionLimit: null } }).options;
    expect([o.solveWithOverlay, o.ignoreTension, o.tensionLimit]).toEqual([false, true, null]);
  });
});

describe("condition from the inspection (MBE 6.1.4)", () => {
  const base: DtInputs = { ...DT_DEFAULTS, span: 30, structureLength: 30.5 };
  const unit = (u: Partial<DtUnitCondition> & { unit: number }): DtUnitCondition => ({ ...NO_UNIT_CONDITION, ...u });
  const withCond = (c: Partial<DtInputs["condition"]>): DtInputs => ({ ...base, condition: { ...DT_DEFAULTS.condition, ...c } });
  const intact = rateDoubleTee(base);
  const flexAt = (r: DtRating, g: string, x: number) => r.ratings[0].per.find((p) => p.g === g)!.points.find((p) => p.check === "flexure" && Math.abs(p.x - x) < 1e-9)!;

  it("never changes the back-calculated strands, and the as-designed ratings are the intact bridge's", () => {
    for (const c of [{ units: [unit({ unit: 3, lostStrands: 2 })] }, { jointsFailed: true }, { units: [unit({ unit: 2, topLoss: 1, factor: 0.9, note: "spalls" })] }]) {
      const r = rateDoubleTee(withCond(c));
      expect(r.solve.As).toBe(intact.solve.As);
      expect(r.solve.Pj).toBe(intact.solve.Pj);
      r.condition.asDesigned!.forEach((d, k) => {
        near(d.inv, intact.ratings[k].govInv.inv.inv, 1e-12);
        near(d.opr, intact.ratings[k].govOpr.opr.opr, 1e-12);
      });
    }
    expect(intact.condition.active).toBe(false);
    expect(intact.condition.asDesigned).toBeNull();
  });

  it("removes lost strands from that unit's Mn only", () => {
    const r = rateDoubleTee(withCond({ units: [unit({ unit: 3, lostStrands: 2 })] }));
    const x = base.span / 2;
    expect(flexAt(r, "G3", x).C).toBeLessThan(flexAt(intact, "G3", x).C);
    near(flexAt(r, "G2", x).C, flexAt(intact, "G2", x).C, 1e-12);
    const cu = r.condition.units[0];
    near(cu.intact.As - cu.inspected.As, 2 * base.materials.aps, 1e-12);
    expect(r.ratings[0].govInv.inv.inv).toBeLessThan(intact.ratings[0].govInv.inv.inv);
  });

  it("counts a corroded strand by its lost area, and a damaged zone a development length past each end", () => {
    const r = rateDoubleTee(withCond({ units: [unit({ unit: 3, corrodedStrands: 2, areaLoss: 50, zone: { from: 14, to: 16 } })] }));
    const cu = r.condition.units[0];
    near(cu.intact.As - cu.inspected.As, base.materials.aps, 1e-12);
    const ld = r.condition.ldDev;
    expect(ld).toBeGreaterThan(3);
    // Within the zone and ld of it: reduced; beyond: intact.
    expect(flexAt(r, "G3", 15).C).toBeLessThan(flexAt(intact, "G3", 15).C);
    const far = r.pois.find((x) => x > 0 && x < 14 - ld - 1e-6)!;
    near(flexAt(r, "G3", far).C, flexAt(intact, "G3", far).C, 1e-12);
  });

  it("a judgment factor scales the capacity and needs its reason", () => {
    const r = rateDoubleTee(withCond({ units: [unit({ unit: 3, factor: 0.9, note: "honeycombing, extent unknown" })] }));
    near(flexAt(r, "G3", 15).C, 0.9 * flexAt(intact, "G3", 15).C, 1e-12);
    expect(() => rateDoubleTee(withCond({ units: [unit({ unit: 3, factor: 0.9 })] }))).toThrow(/reason/);
    expect(() => rateDoubleTee(withCond({ units: [unit({ unit: 3, lostStrands: 99 })] }))).toThrow(/damaged strands/);
  });

  it("failed joints: each unit carries the wheels on it, the design's factors set the prestress", () => {
    const r = rateDoubleTee(withCond({ jointsFailed: true }));
    expect(r.condition.alone).toBe(true);
    const g = Object.fromEntries(r.girders.map((x) => [x.name, x]));
    // 5 ft units, 2 in joints: two trucks' wheels 4 ft apart fit on an interior unit; one truck's single wheel line.
    expect(g.G3.dfMulti).toBe(2);
    expect(g.G3.dfSingle).toBe(1);
    // Symmetric across the bridge.
    expect(g.G1.dfMulti).toBe(g.G6.dfMulti);
    expect(g.G2.dfMulti).toBe(g.G5.dfMulti);
    for (const x of r.girders) {
      const y = intact.girders.find((q) => q.name === x.name)!;
      expect(x.dfMultiDesign).toBe(y.dfMulti);
    }
    expect(r.ratings[0].govInv.inv.inv).toBeLessThan(intact.ratings[0].govInv.inv.inv);
  });

  it("is kept when saved, and an old design has none", () => {
    expect(dtRatingInputs({ options: {} }).condition).toEqual(DT_DEFAULTS.condition);
    const c = { jointsFailed: true, jointsNote: "cracks", units: [unit({ unit: 2, lostStrands: 1, zone: { from: 3, to: 5 }, note: "impact" })] };
    expect(dtRatingInputs({ condition: c }).condition).toEqual(c);
  });

  it("the calc package states the condition and compares as designed with as inspected", () => {
    const lines = dtRatingCalcLines(withCond({ units: [unit({ unit: 3, lostStrands: 2, note: "2 strands broken at an impact" })] }), "Test");
    const t = lines.map((l) => ("text" in l ? l.text : "") + ("ref" in l && l.ref ? l.ref : "")).join("\n");
    expect(t).toMatch(/Condition:- The bridge is rated in its condition at the latest inspection \(MBE 6\.1\.4\)/);
    expect(t).toMatch(/as designed and as inspected/);
    expect(t).toMatch(/G3: 2 strands broken at an impact\. Rated with 2 strands broken or missing over the whole span/);
  });
});
