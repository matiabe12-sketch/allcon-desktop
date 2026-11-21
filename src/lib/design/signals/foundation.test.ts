import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, evaluateSheet, type SheetItem } from "@/lib/calcs/evaluate";
import { layout } from "@/lib/calcs/library/templates";
import { readingOrder } from "@/lib/calcs/types";
import { signalInputs } from "../kinds";
import { Kz } from "../signs/cantilever";
import { broms, designSignal, SIGNAL_DEFAULTS, signalLoads, standardCaisson, torsionResistance, type SignalInputs } from "./foundation";
import { signalCalcLines, signalTakeoff } from "./detail";
import { signalStandard } from "./standards";

const onStandard = (id: string, soil: SignalInputs["soil"] = "cohesive"): SignalInputs => {
  const s = signalStandard(id);
  return { ...SIGNAL_DEFAULTS, standard: id, soil, arms: s.arms, ...standardCaisson(s, soil) };
};

describe("traffic signal foundation (CDOT S-614, LRFD-LTS 13.6)", () => {
  it("passes its checks with the defaults (S-614-40A, 35 ft arm, the sheet's clay)", () => {
    const r = designSignal(SIGNAL_DEFAULTS);
    expect(r.checks.filter((c) => !c.ok && !c.advisory).map((c) => c.id)).toEqual([]);
  });

  it("solves Broms in clay: the length below the largest moment carries it, Mu = 2.25 c D g² (Fig. C13.6.1.1-1)", () => {
    const b = broms("cohesive", 100, 5, 3, 0.75, 0, 0);
    const g = b.L - 1.5 * 3 - b.q;
    expect(b.q).toBeCloseTo(5 / (9 * 0.75 * 3), 12);
    expect(2.25 * 0.75 * 3 * g * g).toBeCloseTo(b.Mu, 9);
    expect(b.L).toBeCloseTo(9.678, 3);
  });

  it("solves Broms in sand: L is the root of Eq. C13.6.1.1-5", () => {
    const b = broms("cohesionless", 100, 5, 3, 0, 0.11, 30);
    expect(b.Kp).toBeCloseTo(3, 9);
    const k = 0.11 * b.Kp * 3;
    expect(b.L ** 3 - (2 * 5 * b.L) / k - (2 * 100) / k).toBeCloseTo(0, 8);
  });

  it("takes the soil's torsion as side resistance at D/2", () => {
    expect(torsionResistance("cohesive", 10, 3, 0.75, 0, 0, "cdot").Tn).toBeCloseTo(0.75 * Math.PI * 3 * 10 * 1.5, 9);
    // O'Neill–Reese β in sand: 1.5 − 0.135√z, here above 1.2 to z = 4.94 ft; Simpson's rule against a fine sum.
    const or = torsionResistance("cohesionless", 10, 3, 0, 0.11, 30, "cdot", 15);
    let sum = 0;
    for (let k = 0; k < 100000; k++) {
      const z = (k + 0.5) * 1e-4;
      sum += Math.min(1.2, Math.max(0.25, 1.5 - 0.135 * Math.sqrt(z))) * z * 1e-4;
    }
    expect(or.Tn).toBeCloseTo(0.11 * sum * Math.PI * 3 * 1.5, 4);
    expect(torsionResistance("cohesive", 10, 3, 0.75, 0, 0, "aashto").Tn).toBeCloseTo(0.55 * 0.75 * Math.PI * 3 * 10 * 1.5, 9);
    const sand = torsionResistance("cohesionless", 10, 3, 0, 0.11, 30);
    expect(sand.beta).toBeCloseTo(0.5 * Math.tan(Math.PI / 6), 12);
    expect(sand.Tn).toBeCloseTo(sand.beta * 0.11 * Math.PI * 3 * 50 * 1.5, 9);
  });

  it("puts a signal head's wind on the pole as torsion: q Cd A × its reach (LTS Eq. 3.8.1-1)", () => {
    const bare: SignalInputs = { ...SIGNAL_DEFAULTS, attachments: [], luminaire: false, camera: false, poleSignal: false };
    const one: SignalInputs = { ...bare, attachments: [{ name: "Signal head", at: 30, weight: 46, area: 10, Cd: 1.2, plate: false }] };
    const T = (i: SignalInputs) => Math.max(...signalLoads(i, i).dirs.map((d) => Math.abs(d.T)));
    const q = 0.00256 * Kz(bare.armHeight - 1.5) * bare.Kd * bare.G * bare.V ** 2;
    expect(T(one) - T(bare)).toBeCloseTo((q * 1.2 * 10 * 30) / 1000, 6);
  });

  it("reproduces CDOT's S-614-40 caisson depths within 6% on the standard's own basis (100 mph, F.S. 3.0, the sheet's clay)", () => {
    for (const id of ["40-30", "40-40", "40-50"]) {
      const r = designSignal(onStandard(id));
      const table = signalStandard(id).caisson.depthCohesive;
      expect(Math.abs(r.cdot!.L - table) / table).toBeLessThan(0.06); // 12.7 vs 12.5, 14.3 vs 14.5, 15.7 vs 16.5 ft
    }
  });

  it("carries every S-614-40 and 40A caisson in torsion on the standard's own basis with CDOT's method, not with AASHTO's current", () => {
    const ids = ["40A-25", "40A-35", "40A-45", "40A-55", "40-30", "40-40", "40-50", "40-65", "40-75", "40S-65", "40S-75"];
    for (const soil of ["cohesive", "cohesionless"] as const) {
      for (const id of ids) expect(designSignal({ ...onStandard(id, soil), torsionMethod: "cdot" }).checks.find((c) => c.id === "cdot-torsion")!.ok).toBe(true);
      expect(designSignal({ ...onStandard("40-75", soil), torsionMethod: "aashto" }).checks.find((c) => c.id === "cdot-torsion")!.ok).toBe(false);
    }
  });

  it("loads a second arm: more moment and torsion at the base than one", () => {
    const one = designSignal({ ...onStandard("40-50"), arms: 1 });
    const two = designSignal({ ...onStandard("40-50"), arms: 2, secondAngle: 90 });
    expect(two.extreme.M).toBeGreaterThan(one.extreme.M);
    expect(two.loads.W).toBeGreaterThan(one.loads.W);
  });

  it("scales a pedestal pole's service forces with V² and Kd", () => {
    const r = designSignal(onStandard("44-signal"));
    expect(r.extreme.M).toBeCloseTo(14.72 * (SIGNAL_DEFAULTS.V / 90) ** 2 * SIGNAL_DEFAULTS.Kd, 6);
    expect(r.checks.some((c) => c.id === "soil-torsion")).toBe(false);
  });

  it("takes off the caisson by its pay length, and parses saved inputs", () => {
    const t = signalTakeoff(SIGNAL_DEFAULTS);
    expect(t.quantities.shaft!.value).toBe(18.5);
    expect(signalInputs({ standard: "40-65" }).standard).toBe("40-65");
    expect(signalInputs({}).attachments).toBeNull();
  });

  for (const [what, i] of [
    ["clay, a single arm", SIGNAL_DEFAULTS],
    ["sand, a double arm", { ...onStandard("40-65", "cohesionless"), arms: 2 as const }],
    ["clay, AASHTO's torsion", { ...SIGNAL_DEFAULTS, torsionMethod: "aashto" as const }],
    ["sand, AASHTO's torsion", { ...onStandard("40A-25", "cohesionless"), torsionMethod: "aashto" as const }],
    ["a pedestal pole", onStandard("44-signal")],
  ] as const) {
    it(`works out its calc package with no errors (${what})`, () => {
      const regions = readingOrder(layout(signalCalcLines(i, "Test signal"), { x: 0, y: 0 }));
      const items = regions.flatMap((x): SheetItem[] => (x.kind === "text" || x.kind === "image" ? [] : [x as SheetItem]));
      const results = evaluateSheet(items, DEFAULT_SETTINGS, new Map());
      const errors = regions.flatMap((x) => (results.get(x.id)?.kind === "error" ? [`${x.kind === "math" ? x.latex : x.kind}: ${(results.get(x.id) as { message: string }).message}`] : []));
      expect(errors).toEqual([]);
    });
  }
});
