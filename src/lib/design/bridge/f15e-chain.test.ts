import { describe, expect, it } from "vitest";
import { abutmentInputs } from "../foundations/kinds";
import { designAbutment, type AbutmentInputs } from "../foundations/abutment";
import { buildChain, workOut } from "./chain.testkit";
import { abutmentFromBridge, bearingFromBridge, fixedPoint, girdersInside, jointFromBridge } from "./loadpath";
import { bearingInputs, stripSealInputs } from "../kinds";
import { F15E, F15E_ABUTMENT, F15E_APPROACH, F15E_CALC, F15E_GIRDER, F15E_PAD } from "./f15e.fixture";

// CDOT F-15-E "Bridge X", I-70 WB over Sawmill Gulch (project 25177), through the Bridge, end to end, against its
// design calcs (PGSuper for the girders, a pile group program for the micropiles) and its summary of quantities.

describe("F-15-E (Bridge X) through the Bridge, end to end", async () => {
  const r = await buildChain({
    title: "F-15-E Bridge X",
    b: F15E,
    girder: F15E_GIRDER,
    pad: F15E_PAD,
    deck: { topBars: { bar: 5, spacing: 6 }, botBars: { bar: 5, spacing: 6 } },
    abutment: F15E_ABUTMENT,
    approach: F15E_APPROACH,
  });
  const span = r.run.groups[0].result.spans[0];
  const check = (x: typeof span.interior, id: string) => x.checks.find((c) => c.id === id)!;
  const abut = [0, 1].map((k) => designAbutment({ ...abutmentFromBridge(F15E, r.run, k, abutmentInputs({})), ...F15E_ABUTMENT(k) } as AbutmentInputs));
  const soq = (code: string) => r.rows.find((x) => x.code === code)?.total ?? 0;

  it("works out the whole calc package with no errors", () => {
    expect(workOut(r.lines).errors).toEqual([]);
  });

  it("girders: the midspan moment within 2 % of PGSuper's, the resistance within 4 % (interior and exterior)", () => {
    const c = F15E_CALC.midspan;
    const fi = check(span.interior, "flexure");
    const fe = check(span.exterior, "flexure");
    expect(Math.abs(fi.demand / c.interior.Mu - 1)).toBeLessThan(0.02); // 14,426 / 14,246
    expect(Math.abs(fe.demand / c.exterior.Mu - 1)).toBeLessThan(0.02); // 15,570 / 15,658
    expect(Math.abs(fi.capacity / c.interior.phiMn - 1)).toBeLessThan(0.04); // 20,759 / 21,342
    expect(Math.abs(fe.capacity / c.exterior.phiMn - 1)).toBeLessThan(0.04); // 20,695 / 21,253
  });

  it("girders: the prestress after transfer within 1 %, after all losses within 5 % (refined losses, ours fewer)", () => {
    const A = 64 * 0.217;
    expect(Math.abs((span.interior.losses.fpt * A) / F15E_CALC.prestress.transfer - 1)).toBeLessThan(0.01);
    expect(Math.abs((span.interior.losses.fpe * A) / F15E_CALC.prestress.final - 1)).toBeLessThan(0.05);
  });

  it("girders: what fails is the plans' harped strands above CDOT B-618's 66 in at the ends, and release compression by 1 %; the bed force a warning", () => {
    const fails = [...new Set([span.interior, span.exterior].flatMap((x) => x.checks.filter((c) => !c.ok && !c.advisory).map((c) => c.id)))].sort();
    expect(fails).toEqual(["harp-height", "rel-comp"]);
    expect(check(span.interior, "harp-height").demand).toBeCloseTo(69.2, 6); // 2½ in clear of the top (BX18), past 72 − 6 = 66 in
    const bed = check(span.interior, "bed-force");
    expect([bed.demand, bed.ok, bed.advisory]).toEqual([expect.closeTo(2812.32, 1), false, true]); // the plans' Fi, over 2,800 kip: confirm with the fabricator
    expect(check(span.interior, "hold-down").demand).toBeLessThan(4); // BDM 5.5.2.2
    expect(check(span.interior, "rel-comp").demand / check(span.interior, "rel-comp").capacity).toBeLessThan(1.02);
  });

  it("girders: the plans' debonding (BX18), 4 strands each at 9, 12 and 15 ft, passes AASHTO 5.9.4.3.3 with 4 ending at each section", async () => {
    const { strandLayout } = await import("../girders/strand-layout");
    const { girderShape } = await import("../girders/prestressed");
    const lay = strandLayout(girderShape(F15E_GIRDER), { strands: F15E_GIRDER.strands, harped: F15E_GIRDER.harped }, 141.5);
    const by = (L: number) => lay.strands.filter((s) => s.debondLength === L).length;
    expect([by(9), by(12), by(15)]).toEqual([4, 4, 4]);
    // The longest innermost: no strand debonded 9 ft nearer the middle than one debonded 15 ft in its row.
    for (const y of [2.25, 4.25]) {
      const row = lay.strands.filter((s) => s.y === y && s.debondLength > 0);
      const far = (L: number) => Math.max(...row.filter((s) => s.debondLength === L).map((s) => Math.abs(s.x)));
      const near = (L: number) => Math.min(...row.filter((s) => s.debondLength === L).map((s) => Math.abs(s.x)));
      expect(far(15)).toBeLessThanOrEqual(near(9));
    }
    for (const x of [span.interior, span.exterior]) {
      for (const id of ["deb-row", "deb-section", "deb-length", "deb-max", "deb-outer"]) expect(check(x, id).ok, id).toBe(true);
      expect(check(x, "deb-section").demand).toBe(4);
    }
  });
  it("abutments, their bearings and approach slabs pass every check but Abutment 1's micropile weld and footing top bars (allcon's rigid-footing pile load is about 20 % over the designer's)", () => {
    for (const [k, v] of Object.entries(r.verdicts))
      if (/Abutment \d, (Abutment|Bearings|Approach slab)/.test(k)) {
        if (k === "Abutment 1, Abutment") expect(v.fail.length, k).toBe(3);
        else expect(v.fail, k).toEqual([]);
      }
    // Abutment 1's others: the plans' #5@6 top bars across its footing (BX13), short of 5.6.3.3's minimum and, with the
    // plans' 4 ft end diaphragm on the rigid footing, of Mu by about 5 %.
    expect(abut[0].checks.filter((c) => !c.ok && !c.advisory).map((c) => c.id).sort()).toEqual(["foot-top", "foot-top-min", "mp-plate-weld"]);
    expect(abut[1].checks.filter((c) => !c.ok && !c.advisory)).toEqual([]);
    const m = abut[0].checks.find((c) => c.id === "foot-top-min")!;
    expect(m.demand / m.capacity).toBeLessThan(1.3);
    const top = abut[0].checks.find((c) => c.id === "foot-top")!;
    expect(top.demand / top.capacity).toBeLessThan(1.1);
  });
  it("the footing on its micropile rows, punching at a micropile and the bearing's anchor rods are checked", () => {
    const ids = abut[0].checks.map((c) => c.id);
    for (const id of ["foot-bot", "foot-top", "foot-shear", "foot-punch", "mp-plate-bearing", "mp-plate-t", "mp-plate-weld", "mp-casing-shear"]) expect(ids, id).toContain(id);
    const punch = abut[0].checks.find((c) => c.id === "foot-punch")!;
    expect(punch.demand / punch.capacity).toBeLessThan(0.5); // the calcs: 391 / 1,216 kip
  });

  it("micropiles: Abutment 2's most loaded above the plans' 213 kip (its fixed bearings take the unit's braking), Abutment 1's above the pile group program's 256 kip (a rigid footing here)", () => {
    const p1 = abut[0].seat!.micropiles!.Pmax;
    const p2 = abut[1].seat!.micropiles!.Pmax;
    // The braking goes to the fixed abutment alone (the stiffness split: fixed bearings are rigid against the other
    // end's pads); the plans share it between the two, which put Abutment 2 within 8 % of their 213 kip.
    const br = [0, 1].map((k) => abutmentFromBridge(F15E, r.run, k, abutmentInputs({})).braking);
    expect(br[0]).toBe(0);
    expect(br[1]).toBeGreaterThan(0);
    expect(p2 / F15E_CALC.micropile.abut2.factored).toBeGreaterThan(1);
    expect(p2 / F15E_CALC.micropile.abut2.factored).toBeLessThan(1.2);
    expect(p1 / F15E_CALC.micropile.abut1.factored).toBeGreaterThan(1);
    expect(p1 / F15E_CALC.micropile.abut1.factored).toBeLessThan(1.25);
    // The bond: 20 ksf × π × 11 in × 10 ft = 576 kip nominal, φ 0.70 (the calcs' 575.96 and 403.17).
    expect(abut[0].checks.find((c) => c.id === "mp-bond-comp")!.capacity).toBeCloseTo(403.17, 1);
  });

  it("quantities against the summary of quantities (BX02)", () => {
    expect(soq("618-01172")).toBe(F15E_CALC.soq["618-01172"]); // 991 LF of CBT 72
    expect(soq("512-00102")).toBe(F15E_CALC.soq["512-00102"]); // 7 Type II bearings
    expect(soq("503-02000")).toBe(2); // a verification test pile at each abutment (BX02, BX10 Note 2)
    expect(soq("503-01120")).toBeGreaterThan(0.75 * F15E_CALC.soq["503-01120"]); // 1,420 LF at the 10 ft minimum casing, the plans' 1,753 with their longer casings
    expect(Math.abs(soq("606-10900") / (268 + 19) - 1)).toBeLessThan(0.02); // the bridge's rail: the plans' 268 LF of Type 9 and 19 of Type 9 (Special) on the superstructure
    // The 3 in SMA on the deck and the approach slabs (147 + 43 tons), the devices curb to curb along the skew (2 × 58 LF).
    expect(Math.abs(soq("403-09210") / F15E_CALC.soq["403-09210"] - 1)).toBeLessThan(0.02);
    expect(Math.abs(soq("518-01004") / F15E_CALC.soq["518-01004"] - 1)).toBeLessThan(0.02);
    // Abutment 2's plain leveling pads are in the girders' item: no Type I bearings.
    expect(soq("512-00101")).toBe(0);
    // The panels between the flanges (the plans' panels also sit on the flanges' edges: 481 SY).
    expect(soq("601-25730") / F15E_CALC.soq["601-25730"]).toBeGreaterThan(0.8);
    // Class D: the footings (69 + 44 CY) and the approach and sleeper slabs (BX25 Note 1, 130 CY); all the concrete
    // within 1 % of the plans' 862 CY.
    const d = r.rows.find((x) => x.code === "601-03040")!.values;
    expect(Math.abs((d[1] + d[2]) / (69 + 44) - 1)).toBeLessThan(0.12);
    expect(Math.abs(d[3] / 130 - 1)).toBeLessThan(0.02);
    const concrete = soq("601-03040") + soq("601-03056");
    expect(Math.abs(concrete / (F15E_CALC.soq["601-03040"] + F15E_CALC.soq["601-03056"]) - 1)).toBeLessThan(0.01);
    // Class DF by column (BX02: 387 superstructure, 154 and 78 at the abutments): the semi-integral end diaphragms
    // (BX15, 4 ft by 7'-10") paid with the superstructure, the stems and wingwalls with the abutments.
    const df = r.rows.find((x) => x.code === "601-03056")!.values;
    expect(Math.abs(df[0] / 387 - 1)).toBeLessThan(0.05);
    expect(Math.abs(df[1] / 154 - 1)).toBeLessThan(0.03);
    expect(Math.abs(df[2] / 78 - 1)).toBeLessThan(0.03);
    // Plain bars in the footings (13,526 + 8,652 lb) within 10 %. Abutment 2's coated bars, its own column only (the end
    // diaphragm's are the superstructure's): 14,370 lb against the plans' 16,037 lb, 10 % under. Before the end diaphragm
    // was designed (2026-11-20) its stand-in bars were counted here and the totals matched by chance; the abutment's
    // missing 1,700 lb is open (BX13/BX14's other bars).
    expect(Math.abs(soq("602-00000") / (13526 + 8652) - 1)).toBeLessThan(0.1);
    const coated2 = r.pay.find((c) => c.label === "Abutment 2")!.lines.filter((l) => l.code === "602-00020" && !l.paidWith).reduce((s, l) => s + l.quantity, 0);
    expect(Math.abs(coated2 / 16037 - 1)).toBeLessThan(0.12);
  });

  it("expands from its fixed abutment (2): the Type II bearings and the device at Abutment 1 take the whole 140 ft, the leveling pads none", () => {
    expect(fixedPoint(F15E)).toBe(107625);
    expect(bearingFromBridge(F15E, r.run, 0, bearingInputs({})).expansionLength).toBe(140);
    const held = bearingFromBridge(F15E, r.run, 1, bearingInputs({}));
    expect([held.expansionLength, held.otherStatic, held.cyclic]).toEqual([0, 0, 0]);
    expect(jointFromBridge(F15E, 0, 20, stripSealInputs({})).L).toBe(160); // at the sleeper slab: the span and the 20 ft approach slab
    expect(jointFromBridge(F15E, 1, 20, stripSealInputs({})).L).toBe(20);
    // An integral bridge keeps its middle.
    expect(fixedPoint({ ...F15E, supports: F15E.supports.map((x) => ({ ...x, type: "integral-abutment" as const })) })).toBe(107555);
  });

  it("bearings carry the end diaphragm (semi-integral, CDOT BDM 11.3.2): its weight shared by the 7 girders, within 3 % of the calcs' DC + DW", () => {
    const a1 = { ...abutmentFromBridge(F15E, r.run, 0, abutmentInputs({})), ...F15E_ABUTMENT(0) } as AbutmentInputs;
    const without = bearingFromBridge(F15E, r.run, 0, bearingInputs({}));
    const withD = bearingFromBridge(F15E, r.run, 0, bearingInputs({}), a1);
    // The diaphragm less the girders' ends and deck inside it, which their own reactions carry (counted once).
    const inside = girdersInside(F15E, r.run, 0, 4);
    expect(inside).toBeGreaterThan(0);
    expect(withD.DL - without.DL).toBeCloseTo((a1.gammaC * 7.83 * 4 * a1.length - inside) / 7, 0);
    // With the plans' 4 ft diaphragm (BX15) the dead load is within 3 % of the calcs' (which don't take the girders' ends out).
    const calc = F15E_CALC.bearing1.DC + F15E_CALC.bearing1.DW;
    expect(Math.abs((withD.DL + inside / 7) / calc - 1)).toBeLessThan(0.03); // with the ends put back, as the calcs count them
    expect(withD.DL).toBeLessThan(calc);
  });
});

describe("F-15-E's abutment micropiles in the 3D model", () => {
  it("the battered front row leans toward the bridge: its tip nearer the span's middle than its head, at both abutments", async () => {
    const { bridgeIfc } = await import("./ifc");
    const { runBridge } = await import("./bridge");
    const { abutmentInputs } = await import("../foundations/kinds");
    const { abutmentFromBridge } = await import("./loadpath");
    const run = runBridge(F15E, [F15E_GIRDER]);
    const abutments = Object.fromEntries([0, 1].map((k) => [k, { inputs: { ...abutmentFromBridge(F15E, run, k, abutmentInputs({})), ...F15E_ABUTMENT(k) } as AbutmentInputs }]));
    const m = bridgeIfc(F15E, run, { abutments });
    const all = m.elements.filter((e) => e.cls === "IfcPile");
    expect(all.length).toBe(45 + 26);
    // The span's middle in the model's plan, from the two abutments' first vertical piles.
    const at = (name: string) => all.find((e) => e.name === name)!;
    const mid = [0, 1].map((k) => (at(`Abutment 1 micropile 2-1`).origin[k] + at(`Abutment 2 micropile 2-1`).origin[k]) / 2);
    const d = (p: number[]) => Math.hypot(p[0] - mid[0], p[1] - mid[1]);
    for (const e of all.filter((x) => x.name.includes("micropile 1-"))) {
      const tip = [e.origin[0] + e.zdir[0] * e.depth, e.origin[1] + e.zdir[1] * e.depth];
      expect(d(tip), e.name).toBeLessThan(d(e.origin));
      expect(Math.atan2(Math.hypot(e.zdir[0], e.zdir[1]), -e.zdir[2]) * (180 / Math.PI)).toBeCloseTo(14.04, 2); // 4:1
    }
  });
});
