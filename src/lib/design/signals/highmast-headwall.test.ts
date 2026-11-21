import { describe, expect, it } from "vitest";
import { takeoffFor } from "../takeoff";
import { designHeadwall, HEADWALL_DEFAULTS, M10_FLEXIBLE, M10_RIGID } from "../culverts/headwall";
import { headwallCalcLines } from "../culverts/headwall-detail";
import { Kz, roundCd } from "../signs/cantilever";
import { designHighMast, HIGH_MAST_DEFAULTS, towerLoads } from "./highmast";
import { highMastCalcLines } from "./highmast-detail";

describe("pipe headwalls by CDOT M-601-12 and M-601-10", () => {
  it("M-601-12: H = D + 30, W = 3D + 18, T = 0.4H, B = 1.5D ≥ 30 in.; the table's concrete and outlet paving", () => {
    const r = designHeadwall({ ...HEADWALL_DEFAULTS, D: 36, pipes: 2 });
    expect(r.standard).toBe("M-601-12");
    expect(r.small).toEqual({ H: 66, W: 126, T: 26, B: 54, L: 180 });
    expect(r.cy).toBeCloseTo(3.6, 9); // double, rigid
    expect(r.pave).toBeCloseTo(2 * 7.8, 9); // 18 in. riprap at both pipes
    expect(designHeadwall({ ...HEADWALL_DEFAULTS, D: 18 }).small!.B).toBe(30); // the 30 in. minimum
    expect(designHeadwall({ ...HEADWALL_DEFAULTS, D: 24, rigid: false }).cy).toBeCloseTo(1.6, 9);
  });
  it("M-601-10: the tables follow the drawn formulas (rigid X = 1.5Ba + 24, y = Ba + 56; flexible X = Ba + 48, y = Ba + 52)", () => {
    for (const r of M10_RIGID) {
      expect(r.X).toBeCloseTo(1.5 * r.Ba + 24, 6);
      expect(r.y).toBe(r.Ba + 56);
      expect(r.X1 - 2.5 * r.Ba - 24).toBeCloseTo(Math.min(r.Ba / 2, 36), 6); // ▲
    }
    for (const r of M10_FLEXIBLE) {
      expect(r.X).toBe(r.Ba + 48);
      expect(r.y).toBe(r.Ba + 52);
      expect(r.X1 - 2 * r.Ba - 48).toBe(Math.min(r.Ba / 2, 36)); // ▲
    }
  });
  it("skew by cosec (M-601-10's table: 45° → 1.414) and the apron's 0.89·X lb", () => {
    const r = designHeadwall({ ...HEADWALL_DEFAULTS, D: 72, skew: 45, apron: true });
    expect(r.skewF).toBeCloseTo(1.414, 3);
    expect(r.cy).toBeCloseTo(2.85 * Math.SQRT2, 6);
    expect(r.lb).toBeCloseTo((270 + (0.89 * 132) / 12) * Math.SQRT2, 6);
    expect(() => designHeadwall({ ...HEADWALL_DEFAULTS, D: 63 })).toThrow();
  });
  it("take-off: two headwalls' Class B concrete, M-601-10's steel, the outlet paving's item", () => {
    const t = takeoffFor("pipe-headwall", { ...HEADWALL_DEFAULTS, D: 72 })!;
    expect(t.schedule.concreteTotal).toBeCloseTo(2 * 2.85, 6);
    expect(t.schedule.total).toBeCloseTo(2 * 270, 6);
    expect(takeoffFor("pipe-headwall", HEADWALL_DEFAULTS)!.quantities.outlet!.value).toBeCloseTo(7.8, 9);
    expect(headwallCalcLines(HEADWALL_DEFAULTS, "HW").length).toBeGreaterThan(5);
  });
});

describe("high-mast tower foundation (LRFD-LTS 13.6)", () => {
  it("the tower's wind by hand at the top: q = 0.00256·Kz·Kd·G·V², the luminaires by their EPA", () => {
    const i = HIGH_MAST_DEFAULTS;
    const t = towerLoads(i);
    const q = (0.00256 * Kz(100) * 0.95 * 1.14 * 115 ** 2) / 1000;
    expect(t.qTop).toBeCloseTo(q, 9);
    expect(t.Fl).toBeCloseTo(q * (6 * 3.3 + 8), 9);
    expect(roundCd(115 * 1.5)).toBeCloseTo(0.45, 9); // above Cv·V·d = 78
    expect(t.W).toBeGreaterThan((6 * 70 + 600) / 1000);
  });
  it("the supplier's reactions are used as given, and Broms' cubic is satisfied", () => {
    const r = designHighMast({ ...HIGH_MAST_DEFAULTS, fromSupplier: true, P: 8, M: 450, V: 6, T: 0 });
    expect(r.base).toEqual({ P: 8, M: 450, V: 6, T: 0 });
    const Kp = Math.tan(((45 + 16) * Math.PI) / 180) ** 2;
    const g = 0.12;
    const D = 4;
    const L = r.broms.L;
    expect(L ** 3 - ((2 * 6) / (g * Kp * D)) * L - (2 * 450) / (g * Kp * D)).toBeCloseTo(0, 6);
    expect(r.ok).toBe(true);
  });
  it("a short caisson fails embedment; the take-off is one foundation", () => {
    expect(designHighMast({ ...HIGH_MAST_DEFAULTS, shaftLength: 5 }).checks.find((c) => c.id === "embedment")!.ok).toBe(false);
    expect(takeoffFor("high-mast-foundation", HIGH_MAST_DEFAULTS)!.quantities.foundation!.value).toBe(1);
    expect(highMastCalcLines(HIGH_MAST_DEFAULTS, "HM").length).toBeGreaterThan(5);
  });
});
