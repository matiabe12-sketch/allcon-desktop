import { describe, expect, it } from "vitest";
import { Frame } from "../frame";
import { takeoffFor } from "../takeoff";
import { pipeCalcLines, pipePayItem, threeSidedCalcLines } from "./detail";
import { beddingFactors, designPipe, PIPE_DEFAULTS } from "./pipe";
import { designThreeSided, THREE_SIDED_DEFAULTS } from "./three-sided";

describe("reinforced concrete pipe, indirect design (AASHTO 12.10.4.3)", () => {
  const r = designPipe(PIPE_DEFAULTS); // 36 in., Wall B, Type 2, 2 to 15 ft, 120 pcf, full
  it("earth load WE = VAF·w·Bc·H and the bedding factors", () => {
    const deep = r.rcp!.cases[1];
    expect(r.rcp!.Bc).toBeCloseTo(44 / 12, 9);
    expect(deep.WE).toBeCloseTo(1.4 * 0.12 * (44 / 12) * 15, 9); // 9.24 kip/ft
    expect(beddingFactors(36, 2, 15).BFe).toBeCloseTo(2.9, 9); // Table 12.10.4.3.2a-1
    expect(beddingFactors(36, 1, 15).BFe).toBeCloseTo(4.0, 9);
    expect(beddingFactors(30, 2, 1).BFll).toBeCloseTo(2.2, 9); // Table 12.10.4.3.2c-1
  });
  it("D0.01 by hand at 15 ft (no live load: deeper than 8 ft and the span)", () => {
    const deep = r.rcp!.cases[1];
    expect(deep.WL).toBe(0);
    const WF = 62.4 * Math.PI * 1.5 ** 2; // lb/ft
    expect(deep.D01).toBeCloseTo((12 / 36) * ((9240 + WF) / 2.9), 6); // 1112.8 lb/ft/ft
    expect(r.rcp!.needClass).toBe(3);
    expect(r.checks.every((c) => c.ok)).toBe(true);
  });
  it("a shallow pipe under the truck needs more; Type 1 takes the 1.10 factor", () => {
    const shallow = r.rcp!.cases[0];
    expect(shallow.WL).toBeGreaterThan(0);
    const t1 = designPipe({ ...PIPE_DEFAULTS, installation: 1 });
    const c = t1.rcp!.cases[1];
    expect(c.D01).toBeCloseTo((12 / 36) * ((c.WE + t1.rcp!.WF) / c.BFe) * 1000 * 1.1, 6);
  });
  it("minimum cover Bc/8, at least 12 in.", () => {
    const thin = designPipe({ ...PIPE_DEFAULTS, minFill: 0.75 });
    expect(thin.checks.find((c) => c.id === "cover")!.ok).toBe(false);
  });
});

describe("the rest of a pipe's checks (AASHTO 12.6, 12.7.2.5)", () => {
  it("every fill from the least to the most: the governing D-load is the largest of them", () => {
    const r = designPipe({ ...PIPE_DEFAULTS, D: 24, minFill: 1, maxFill: 6 });
    const all = r.rcp!.all;
    expect(all.length).toBeGreaterThan(10);
    expect(r.rcp!.gov.D01).toBe(Math.max(...all.map((c) => c.D01)));
  });
  it("riveted seams by Table A12-7 with phi 0.67; a combination it doesn't list is refused", () => {
    const base = { ...PIPE_DEFAULTS, material: "csp" as const, D: 48, maxFill: 20, thickness: 0.079 };
    const one = designPipe({ ...base, seam: "riveted-single" });
    expect(one.checks.find((c) => c.id === "seam")!.capacity).toBeCloseTo(0.67 * 18.2, 9);
    expect(designPipe({ ...base, seam: "riveted-double" }).checks.find((c) => c.id === "seam")!.capacity).toBeCloseTo(0.67 * 29.8, 9);
    expect(designPipe(base).checks.some((c) => c.id === "seam")).toBe(false);
    expect(() => designPipe({ ...base, corrugation: "3x1", seam: "riveted-single" })).toThrow();
  });
  it("lines spaced by Table C12.6.7-1, the envelope by C12.6.6", () => {
    const r = designPipe({ ...PIPE_DEFAULTS, lines: 2, gap: 1 });
    expect(r.checks.find((c) => c.id === "spacing")!.demand).toBeCloseTo(1.5, 9); // D/2 for 36 in.
    expect(r.checks.find((c) => c.id === "spacing")!.ok).toBe(false);
    expect(r.site.envMin).toBe(2); // embankment, 24 to 144 in.
    const t = designPipe({ ...PIPE_DEFAULTS, trench: true });
    expect(t.site.envMin).toBeCloseTo((66 / 12 - 44 / 12) / 2, 9); // 1.5D + 12 in. overall
    expect(designPipe({ ...PIPE_DEFAULTS, trench: true, envelope: 0.5 }).checks.find((c) => c.id === "envelope")!.ok).toBe(false);
  });
  it("uplift of the empty pipe under water (12.6.2.3), by hand", () => {
    const Do = 44 / 12;
    const r = designPipe({ ...PIPE_DEFAULTS, water: Do + 2 }); // water at the ground
    const u = r.site.uplift!;
    expect(u.B).toBeCloseTo(0.0624 * Math.PI * (Do / 2) ** 2, 6);
    const pipe = (0.15 * Math.PI * (Do ** 2 - 3 ** 2)) / 4;
    expect(u.W).toBeCloseTo(pipe + Do * 2 * (0.12 - 0.0624), 6);
    expect(r.checks.find((c) => c.id === "uplift")!.ok).toBe(true);
  });
  it("cover is measured below a flexible pavement", () => {
    const r = designPipe({ ...PIPE_DEFAULTS, minFill: 1.5, pavementT: 8 });
    expect(r.checks.find((c) => c.id === "cover")!.capacity).toBeCloseTo(1.5 - 8 / 12, 9);
    expect(r.checks.find((c) => c.id === "cover")!.ok).toBe(false);
  });
});

describe("corrugated steel pipe (AASHTO 12.7)", () => {
  const r = designPipe({ ...PIPE_DEFAULTS, material: "csp", D: 48, maxFill: 20, thickness: 0.079 });
  const c = r.csp!;
  it("thrust TL = 1.95·γ·H·S/2 under deep fill", () => {
    expect(c.gov.TL).toBeCloseTo((1.95 * 0.12 * 20 * 4) / 2, 9); // 9.36 kip/ft
  });
  it("buckling by Eq. 12.7.2.4-1 and the flexibility factor", () => {
    const k = 0.22;
    expect(c.fcr).toBeCloseTo(45 - (45 ** 2 / (48 * 29000)) * ((k * 48) / 0.1721) ** 2, 6); // 39.5 ksi
    expect(c.FF).toBeCloseTo(48 ** 2 / (29000 * 2.392e-3), 6); // 33.2 in/kip
    expect(c.FFlim).toBe(43);
  });
});

describe("three-sided culvert (AASHTO 12.14)", () => {
  it("the frame solver against Kleinlogel's pinned portal: M = wL²/(4(2k + 3))", () => {
    const L = 20, h = 10;
    const nodes = [{ x: 0, y: 0 }, { x: 0, y: h }, { x: L / 2, y: h }, { x: L, y: h }, { x: L, y: 0 }];
    const f = new Frame(nodes, [0, 1, 2, 3].map((k) => ({ i: k, j: k + 1, A: 1e4, I: 1 })), [{ node: 0, ux: true, uy: true }, { node: 4, ux: true, uy: true }]);
    const ef = f.solve({ dist: [1, 2].map((el) => ({ el, dir: "y" as const, s0: 0, s1: L / 2, q0: -1, q1: -1 })) });
    expect(ef[1].Mi).toBeCloseTo(-(L * L) / (4 * (2 * (h / L) + 3)), 4);
    expect(ef[1].Mj).toBeCloseTo((L * L) / 8 - (L * L) / (4 * (2 * (h / L) + 3)), 4);
  });
  const r = designThreeSided(THREE_SIDED_DEFAULTS);
  it("EV with Fe (12.11.2.2.1) and statics at the legs", () => {
    const i = THREE_SIDED_DEFAULTS;
    const Bc = i.span + (2 * i.tw) / 12;
    expect(r.geometry.Fe).toBeCloseTo(1 + (0.2 * i.fill) / Bc, 9);
    expect(r.unit.EV.N).toBeCloseTo((r.geometry.Fe * 0.12 * i.fill * r.geometry.L) / 2, 4);
    expect(r.unit.DC.N).toBeCloseTo((0.15 * (i.ts / 12) * r.geometry.L) / 2, 4);
    // a symmetric frame under a uniform load: midspan plus the corner's magnitude is wL²/8
    const w = r.geometry.Fe * 0.12 * i.fill;
    expect(r.unit.EV.mid - r.unit.EV.corner).toBeCloseTo((w * r.geometry.L ** 2) / 8, 2);
    expect(r.geometry.k0).toBeCloseTo(1 - Math.sin((34 * Math.PI) / 180), 9);
  });
  it("IM through 3 ft of fill and every default check passing", () => {
    expect(r.live.IM).toBeCloseTo(0.33 * (1 - 0.125 * 3), 9);
    expect(r.checks.filter((c) => !c.ok).map((c) => c.id)).toEqual([]);
  });
  it("a thin slab fails flexure; earth pressure relieves the midspan", () => {
    const thin = designThreeSided({ ...THREE_SIDED_DEFAULTS, ts: 10, slabBottom: { bar: 6, spacing: 9 } });
    expect(thin.checks.find((c) => c.id === "slabMid-flexure")!.ok).toBe(false);
    expect(r.unit.EH.mid).toBeLessThan(r.unit.EV.mid);
  });
});

describe("take-offs, pay items and calc packages", () => {
  it("pipe by the foot, two end sections, CDOT items by size", () => {
    const t = takeoffFor("pipe-culvert", PIPE_DEFAULTS, { length: 80 })!;
    expect(t.quantities.pipe!.value).toBe(80);
    expect(t.quantities["end-section"]!.value).toBe(2);
    expect(pipePayItem(PIPE_DEFAULTS, "pipe")).toBe("603-01360");
    expect(pipePayItem({ ...PIPE_DEFAULTS, material: "csp", D: 18 }, "pipe")).toBe("603-10180");
    expect(pipePayItem(PIPE_DEFAULTS, "end-section")).toBe("603-05036");
  });
  it("three-sided footings: concrete and excavation", () => {
    const i = THREE_SIDED_DEFAULTS;
    const t = takeoffFor("three-sided-culvert", i, { length: 40 })!;
    expect(t.schedule.concreteTotal).toBeCloseTo((2 * i.footW * (i.footT / 12) * 40) / 27, 6);
    expect(t.quantities.excavation!.value).toBeCloseTo((2 * (i.footW + 3) * i.footDepth * 40) / 27, 6);
    expect(t.schedule.total).toBeGreaterThan(0);
  });
  it("calc packages build", () => {
    expect(pipeCalcLines(PIPE_DEFAULTS, "Pipe").length).toBeGreaterThan(10);
    expect(pipeCalcLines({ ...PIPE_DEFAULTS, material: "csp" }, "Pipe").length).toBeGreaterThan(10);
    expect(threeSidedCalcLines(THREE_SIDED_DEFAULTS, "Three-sided").length).toBeGreaterThan(10);
  });
});
