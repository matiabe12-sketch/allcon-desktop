import { describe, expect, it } from "vitest";
import { dtRatingInputs } from "../kinds";
import fixtures from "./cdot-bridges.json";
import { DT_DEFAULTS, NO_UNIT_CONDITION, RESTRICTED, codeTension, designLanes, designTruck, itemizedLosses, legalLanes, multiBeamEra, originalDesign, postAll, shearRequired, dtInputsFromBridgeFile, interiorMethod, isSidewalkTruckCase, rateDoubleTee, type DtInputs, type DtRating, type DtUnitCondition } from "./double-tee";
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
  // The prestress makes the design rate 1.0 by its own rules (no 1.6 on development); the rating, with the 1.6, may be lower near the ends.
  const i: DtInputs = { ...DT_DEFAULTS, span: 22, structureLength: 23, loads: { ...DT_DEFAULTS.loads, sidewalks: [{ width: 5, thk: 8 }], sidewalkMountable: true, pedestrians: true }, options: { ...DT_DEFAULTS.options, solveWithOverlay: true } };
  const r = rateDoubleTee(i);
  expect(isSidewalkTruckCase(r.solve.gov)).toBe(false);
  const hs = r.ratings[0];
  expect(r.solve.govRF).toBeGreaterThanOrEqual(1 - 1e-9);
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

describe("condition from the inspection (MBE 6.1.2)", () => {
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
    expect(t).toMatch(/Condition:- The bridge is rated in its condition at the latest inspection \(MBE 6\.1\.2\)/);
    expect(t).toMatch(/as designed and as inspected/);
    expect(t).toMatch(/G3: 2 strands broken at an impact\. Rated with 2 strands broken or missing over the whole span/);
  });
});

describe("interior distribution by the deck (the default)", () => {
  const noDeck: DtInputs = { ...DT_DEFAULTS, deck: { ...DT_DEFAULTS.deck, present: false } };
  const withDeck: DtInputs = { ...DT_DEFAULTS, deck: { ...DT_DEFAULTS.deck, present: true } };
  const opts = (i: DtInputs, m: DtInputs["options"]["lldfInterior"]): DtInputs => ({ ...i, options: { ...i.options, lldfInterior: m } });
  const interior = (r: DtRating) => r.girders.filter((g) => !g.ext && !isSidewalkTruckCase(g.name));

  it("is S/D without a deck (a multi-beam deck, SSHB 3.23.4) and Table 3.23.1 under a composite deck", () => {
    expect(DT_DEFAULTS.options.lldfInterior).toBe("auto");
    expect(interiorMethod(noDeck)).toBe("sd");
    expect(interiorMethod(withDeck)).toBe("table");
    const a = rateDoubleTee(noDeck);
    const s = rateDoubleTee(opts(noDeck, "sd"));
    interior(a).forEach((g, k) => near(g.dfMulti, interior(s)[k].dfMulti, 1e-12));
    const t = rateDoubleTee(withDeck);
    for (const g of interior(t)) {
      near(g.dfMulti, g.S / 5.5, 1e-12);
      near(g.dfSingle, g.S / 7.0, 1e-12);
    }
  });

  it("S/D: D = 5.75 − 0.5 NL + 0.7 NL (1 − 0.2 C)², C = K·min(W/L, 1), K = √(1.2 I/J); NL the bridge's lanes for every vehicle", () => {
    const r = rateDoubleTee(noDeck);
    const { I, J } = r.secInt;
    const K = Math.sqrt((1.2 * I) / J);
    const C = K * Math.min(r.geo.roadW / noDeck.span, 1);
    const D = (nl: number) => 5.75 - 0.5 * nl + 0.7 * nl * (1 - 0.2 * C) ** 2;
    for (const g of interior(r)) {
      near(g.dfMulti, g.S / D(r.geo.NL), 1e-12);
      near(g.dfSingle, g.S / D(r.geo.NL), 1e-12); // one equation, whatever the lanes loaded (SSHB 3.23.4.3)
    }
  });

  it("a saved design keeps the method it was rated with; the scripts' bridge files keep theirs", () => {
    expect(dtRatingInputs({ options: { lldfInterior: "table" } }).options.lldfInterior).toBe("table");
    expect(dtRatingInputs({ options: {} }).options.lldfInterior).toBe("table");
    expect(dtRatingInputs({}).options.lldfInterior).toBe("auto");
    const b = (fixtures as unknown as { bridge: Record<string, unknown> }[])[0].bridge;
    expect(dtInputsFromBridgeFile(b).options.lldfInterior).toBe("table");
    expect(dtInputsFromBridgeFile({ ...b, options: {} }).options.lldfInterior).toBe("auto");
  });
});

describe("CDOT's rules around the rating", () => {
  it("counts the design lanes between the curbs: 12 ft lanes, two on a 20 to 24 ft roadway (SSHB 3.6.3)", () => {
    expect(designLanes(18)).toBe(1);
    expect(designLanes(20)).toBe(2);
    expect(designLanes(23.92)).toBe(2); // TELLRD, as BrR counts it
    expect(designLanes(24)).toBe(2);
    expect(designLanes(27.17)).toBe(2); // ARA
    expect(designLanes(36)).toBe(3);
    expect(designLanes(40)).toBe(3); // AUR07
  });

  it("says when shear can't be waived (BRM 1.4(M), 1.4(O))", () => {
    const b = DT_DEFAULTS.bridge;
    expect(shearRequired({ bridge: { ...b, yearBuilt: 1985, nbiSuper: 5 } })).toEqual([]);
    expect(shearRequired({ bridge: { ...b, yearBuilt: 1985, nbiSuper: 4 } })[0]).toMatch(/under 5/);
    expect(shearRequired({ bridge: { ...b, yearBuilt: 1985, nbiSuper: 6, loadInducedDistress: true } })[0]).toMatch(/shear distress/);
    expect(shearRequired({ bridge: { ...b, yearBuilt: 2005, nbiSuper: 7 } })[0]).toMatch(/1\.4\(M\)/);
  });

  it("applies the posting rules of BRM 1.15.1", () => {
    const list = (rf: Record<string, number>) => CDOT_VEHICLES.map((v) => ({ name: v.name, cls: v.cls, tons: tons(v), rf: rf[v.name] ?? 1.2 }));
    const at = (r: string[], name: string) => r[CDOT_VEHICLES.findIndex((v) => v.name === name)];
    // The 95% rule, and posting below it.
    let r = postAll(list({ "CO Type 3": 0.96, "CO Type 3S2": 0.9 }), false);
    expect(at(r, "CO Type 3")).toBe("Exempt (95% rule)");
    expect(at(r, "CO Type 3S2")).toBe("Posting required");
    // SU trucks aren't posted while the NRL rates 40 T or more.
    r = postAll(list({ SU5: 0.9 }), false);
    expect(at(r, "SU5")).toMatch(/Not required/);
    r = postAll(list({ NRL: 0.9, SU5: 0.9 }), false);
    expect(at(r, "SU5")).toBe("Posting required");
    // SU6 at 0.94 (32.6 T) is posted; at 0.95+ exempt; SU7 at 0.93 is 36.0 T, over its 35 T limit (Colorado Bridge Formula).
    r = postAll(list({ NRL: 0.9, "CO SU6": 0.94, "CO SU7": 0.93 }), false);
    expect(at(r, "CO SU6")).toBe("Posting required");
    expect(at(r, "CO SU7")).toMatch(/weight limit/);
    // Emergency vehicles only near an Interstate.
    expect(at(postAll(list({ EV3: 0.5 }), false), "EV3")).toMatch(/N\/A/);
    expect(at(postAll(list({ EV3: 0.5 }), true), "EV3")).toBe("Posting required");
    // Under 0.3, every legal load is restricted.
    r = postAll(list({ "CO Type 3-2": 0.25 }), false);
    expect(at(r, "CO Type 3")).toBe(RESTRICTED);
    expect(at(r, "HS-20")).toBe("—");
  });
});

describe("the original design (BRM 1.7.2(A))", () => {
  it("takes CDOT's design vehicle by the year built, and develops the strands without the 1.6 in every era", () => {
    expect(originalDesign(1940).vehicle).toBe("H20");
    expect(originalDesign(1970)).toMatchObject({ vehicle: "HS20", scale: 1, devFactor: 1 });
    expect(originalDesign(1990)).toMatchObject({ vehicle: "HS20", devFactor: 1 }); // without the 1.6 in every era, on the safe side
    expect(originalDesign(1995)).toMatchObject({ vehicle: "HS25", scale: 1.25, devFactor: 1 });
    expect(originalDesign(2005).vehicle).toBe("HL-93");
    expect(designTruck("HS25").P).toEqual([5, 20, 20]);
    expect(designTruck("H20").P).toEqual([4, 16]);
  });

  it("solves for HS25 on a bridge built 1994 to 2001, with more strands than HS20 needs", () => {
    const i: DtInputs = { ...DT_DEFAULTS, span: 22, structureLength: 23, bridge: { ...DT_DEFAULTS.bridge, yearBuilt: 1996 } };
    const r = rateDoubleTee(i);
    const hs = r.ratings[0];
    expect(r.original.vehicle).toBe("HS25");
    expect(r.solve.govRF).toBeGreaterThanOrEqual(1 - 1e-9);
    void hs;
    expect(rateDoubleTee({ ...i, bridge: { ...i.bridge, yearBuilt: 1990 } }).solve.As).toBeLessThan(r.solve.As);
  });

  it("doesn't back-calculate a bridge built from 2002 (LRFD, HL-93)", () => {
    expect(() => rateDoubleTee({ ...DT_DEFAULTS, bridge: { ...DT_DEFAULTS.bridge, yearBuilt: 2003 } })).toThrow(/HL-93/);
  });

  it("rates with the 1.6 development multiplier a design made without it, and reports the difference", () => {
    const i: DtInputs = { ...DT_DEFAULTS, span: 22, structureLength: 23 };
    const r = rateDoubleTee(i);
    expect(r.original.devFactor).toBe(1);
    const d = r.original.devCompare!;
    expect(d.withOriginal).toBeCloseTo(1, 2); // the design rates 1.0 with its own development rule
    expect(d.rated).toBeLessThanOrEqual(d.withOriginal + 1e-9);
    expect(rateDoubleTee({ ...i, bridge: { ...i.bridge, yearBuilt: 1990 } }).original.devCompare).not.toBeNull(); // no 1.6 in the design in any era
  });
});

describe("distribution limits", () => {
  it("caps the multi-beam load fraction at 1 (SSHB 3.23.4.3)", () => {
    const i: DtInputs = { ...DT_DEFAULTS, span: 20, structureLength: 21, deck: { ...DT_DEFAULTS.deck, present: false }, units: { ...DT_DEFAULTS.units, spacing: 96, flangeWidth: 96, stemSpacing: 48 } };
    const r = rateDoubleTee(i);
    expect(r.df.int.method).toBe("sd");
    for (const g of r.girders.filter((x) => !x.ext)) expect(g.dfMulti).toBeLessThanOrEqual(1);
  });

  it("uses the lever rule past 45° of skew (BRM 1.3(E))", () => {
    const i: DtInputs = { ...DT_DEFAULTS, skew: 50, deck: { ...DT_DEFAULTS.deck, present: false } };
    const r = rateDoubleTee(i);
    expect(r.df.int.outOfRange).toMatch(/45/);
    const g = r.girders.find((x) => !x.ext)!;
    expect(g.lever).toEqual({ single: true, multi: true });
    expect(g.dfSingle).toBeCloseTo(1, 6); // one wheel over the unit; the other, 6 ft away, past the next unit
  });
});

describe("the original design's multi-beam distribution, by era", () => {
  const noDeck = (year: number): DtInputs => ({ ...DT_DEFAULTS, span: 24, structureLength: 25, bridge: { ...DT_DEFAULTS.bridge, yearBuilt: year }, deck: { ...DT_DEFAULTS.deck, present: false } });
  it("dates the rules: the slab rule to 1977, the 1977 formula to 1986, today's S/D after", () => {
    expect(multiBeamEra(1960)).toBe("slab");
    expect(multiBeamEra(1977)).toBe("slab");
    expect(multiBeamEra(1978)).toBe("1977");
    expect(multiBeamEra(1986)).toBe("1977");
    expect(multiBeamEra(1987)).toBe("current");
  });
  it("solves with the slab rule, E = 4 + 0.06L ≤ 7 ft, and rates with today's S/D", () => {
    const r = rateDoubleTee(noDeck(1970));
    const g = r.girders.find((x) => !x.ext)!;
    expect(r.era?.rule).toBe("slab");
    expect(g.dfSolve).toBeCloseTo(g.S / Math.min(7, 4 + 0.06 * 24), 10);
    expect(g.dfMulti).not.toBeCloseTo(g.dfSolve, 3);
  });
  it("solves with the 1977 formula: (12NL + 9)/Ng over D", () => {
    const r = rateDoubleTee(noDeck(1982));
    const t = r.era!.typical!;
    expect(t.rule).toBe("1977");
    const NL = r.geo.NL;
    const D = t.C! <= 3 ? 5 + NL / 10 + (3 - (2 * NL) / 7) * (1 - t.C! / 3) ** 2 : 5 + NL / 10;
    expect(t.D).toBeCloseTo(D, 10);
    expect(t.DF).toBeCloseTo((12 * NL + 9) / DT_DEFAULTS.units.count / D, 10);
  });
  it("leaves a composite-deck bridge on the table in every era", () => {
    const r = rateDoubleTee({ ...DT_DEFAULTS, deck: { ...DT_DEFAULTS.deck, present: true }, bridge: { ...DT_DEFAULTS.bridge, yearBuilt: 1970 } });
    expect(r.era).toBeNull();
    for (const g of r.girders) expect(g.dfSolve).toBe(g.dfMultiDesign);
  });
});

describe("legal and permit vehicles' distribution (BRM 1.3(C), (D))", () => {
  const at = (year: number, legalLldf: "single" | "multi"): DtInputs => ({ ...DT_DEFAULTS, deck: { ...DT_DEFAULTS.deck, present: true }, bridge: { ...DT_DEFAULTS.bridge, yearBuilt: year }, options: { ...DT_DEFAULTS.options, legalLldf } });
  it("uses the multi-lane factor for a bridge built after 1985, whatever the setting", () => {
    expect(legalLanes(at(1986, "single"))).toBe("multi");
    expect(legalLanes(at(1985, "single"))).toBe("single");
    expect(legalLanes(at(1985, "multi"))).toBe("multi");
  });
  it("rates the legal loads of a 1990 bridge with the multi-lane factor", () => {
    const r = rateDoubleTee(at(1990, "single"));
    const legal = r.ratings.find((v) => v.name === "CO Type 3")!;
    const p = legal.per.find((x) => x.g === "G3")!;
    expect(p.df).toBeCloseTo(r.girders.find((g) => g.name === "G3")!.dfMulti, 12);
    const old = rateDoubleTee(at(1985, "single")).ratings.find((v) => v.name === "CO Type 3")!.per.find((x) => x.g === "G3")!;
    expect(old.df).toBeCloseTo(rateDoubleTee(at(1985, "single")).girders.find((g) => g.name === "G3")!.dfSingle, 12);
  });
});

describe("prestress losses (SSHB 9.16.2.1)", () => {
  it("adds shrinkage, elastic shortening, creep and relaxation by the article's equations", () => {
    const r = rateDoubleTee(DT_DEFAULTS);
    const l = r.solve.losses!;
    expect(l.SH).toBeCloseTo(17 - 0.15 * 55, 10);
    expect(l.ES).toBeCloseTo((28000 / l.Eci) * l.fcir, 10);
    expect(l.CRc).toBeCloseTo(12 * l.fcir - 7 * l.fcds, 10);
    expect(l.CRs).toBeCloseTo(20 - 0.4 * l.ES - 0.2 * (l.SH + l.CRc), 10); // stress-relieved
    expect(r.solve.fse).toBeCloseTo(r.solve.fpj - l.total, 10);
    expect(r.solve.fsuValid).toBe(r.solve.fse >= 0.5 * DT_DEFAULTS.materials.fpu);
  });
  it("uses the low-relaxation relaxation equation for low-relaxation strand", () => {
    const i: DtInputs = { ...DT_DEFAULTS, materials: { ...DT_DEFAULTS.materials, fpu: 270, lowRelaxation: true, jackingRatio: 0.75 } };
    const l = rateDoubleTee(i).solve.losses!;
    expect(l.CRs).toBeCloseTo(Math.max(0, 5 - 0.1 * l.ES - 0.05 * (l.SH + l.CRc)), 10);
  });
  it("keeps the lump sum for bridge files and when chosen", () => {
    const b = (fixtures as unknown as { bridge: Record<string, unknown> }[])[0].bridge;
    expect(dtInputsFromBridgeFile(b).options.losses).toBe("lump");
    const r = rateDoubleTee({ ...DT_DEFAULTS, options: { ...DT_DEFAULTS.options, losses: "lump" } });
    expect(r.solve.losses).toBeNull();
    expect(r.solve.fse).toBeCloseTo(r.solve.fpj - 45, 10);
    expect(typeof itemizedLosses).toBe("function");
  });
  it("a saved design from before keeps the lump sum", () => {
    expect(dtRatingInputs({ options: { lldfInterior: "table" } }).options.losses).toBe("lump");
    expect(dtRatingInputs({}).options.losses).toBe("itemized");
  });
});
