import { describe, expect, it } from "vitest";
import { analyzeBridge, combinationsFor } from "./bridge";
import { BRIDGE_DEFAULTS, bridgeDefinition, supportsFor } from "./definition";
import { gradientOn, GRADIENT_ZONES } from "./generate";
import { emptyModel, type Model } from "./model";
import { analyze } from "./solver";
import { toBridgeInputs } from "./geometry";
import { gradientOnGirder } from "../design/girders/gradient";
import { designGirder, GIRDER_DEFAULTS } from "../design/girders/prestressed";

// The temperature gradient (AASHTO 3.12.3, Figure 3.12.3-2): its uniform and linear parts on a composite section,
// the frame's restraint of the curvature, and the Bridge's cases and Service combinations (C3.4.1: γTG 0.50 with live
// load, 0.0 at Strength).

describe("the temperature gradient on a section", () => {
  it("a 12 × 60 in girder under an 8 in deck (96 in wide, n 0.8), zone 1: hand integration of Figure 3.12.3-2", () => {
    // Composite: girder A 720, yb 30, I 216,000; deck 614.4 transformed at y 64.
    const Ad = 96 * 8 * 0.8;
    const A = 720 + Ad;
    const yb = (720 * 30 + Ad * 64) / A;
    const I = 216000 + 720 * (30 - yb) ** 2 + (96 * 0.8 * 8 ** 3) / 12 + Ad * (64 - yb) ** 2;
    const c = { beff: 96, A, I, yb };
    const r = gradientOn([[0, 6], [60, 6]], 60, 8, c, 0.8, 54, 14, 1);
    // ∫b·T dz from the top (z down): 0–4 in at 76.8 in wide (54 → 14 °F), 4–8 in at 76.8 (14 → 9.33), 8–16 in at 12 (9.33 → 0).
    const P = 76.8 * (54 * 4 - 5 * 16) + 76.8 * 14 * (4 - 16 / 24) + 12 * 14 * (8 - 128 / 24);
    const F = (z: number) => z * z / 2 - (z ** 3 / 3 - 2 * z * z) / 12; // ∫(1 − (z − 4)/12)·z dz
    const Q = 76.8 * (27 * 16 - (10 * 64) / 3) + 76.8 * 14 * (F(8) - F(4)) + 12 * 14 * (F(16) - F(8)); // ∫b·T·z dz
    const M = P * (68 - yb) - Q;
    expect(r.uniform).toBeCloseTo(P / A, 2);
    expect(r.gradient).toBeCloseTo((12 * M) / I, 2);
    expect(r.gradient).toBeGreaterThan(0); // the top warmer
    expect(GRADIENT_ZONES[1]).toEqual([54, 14]);
  });
});

describe("a free curvature in the frame", () => {
  const beam = (fixedMiddle: boolean) => {
    const m: Model = emptyModel();
    m.materials.push({ id: 1, name: "C", E: 576000, G: 240000, density: 0, alpha: 6e-6 });
    m.sections.push({ id: 1, name: "S", A: 5, Asy: 0, Asz: 0, J: 1, Iy: 3, Iz: 1 });
    for (let i = 0; i <= 8; i++) m.nodes.push({ id: i + 1, x: 12.5 * i, y: 0, z: 0 });
    for (let i = 0; i < 8; i++) m.elements.push({ id: i + 1, type: "beam", mat: 1, sec: 1, n1: i + 1, n2: i + 2 });
    const pin = [true, true, true, true, false, false] as [boolean, boolean, boolean, boolean, boolean, boolean];
    const roll = [false, true, true, false, false, false] as [boolean, boolean, boolean, boolean, boolean, boolean];
    m.supports.push({ node: 1, fixed: pin }, { node: 9, fixed: roll });
    if (fixedMiddle) m.supports.push({ node: 5, fixed: roll });
    m.loadCases.push({ name: "TG", type: "TG" });
    for (let i = 0; i < 8; i++) m.loads.push({ case: "TG", kind: "thermal", element: i + 1, dT: 0, gradient: 20 });
    return analyze(m);
  };
  it("a simple span bows freely: no moment", () => {
    expect(Math.abs(beam(false).forcesAt(0, 3, 1).My)).toBeLessThan(1e-6);
  });
  it("two equal spans: the pier holds the bow down, a sagging moment 1.5·E·I·α·gradient there", () => {
    const a = beam(true);
    const My = a.forcesAt(0, 3, 1).My;
    expect(Math.abs(My)).toBeCloseTo(1.5 * 576000 * 3 * 6e-6 * 20, 3);
  });
});

describe("the Bridge's temperature gradient", () => {
  const two = { ...BRIDGE_DEFAULTS, spans: [100, 100], supports: supportsFor(2), piers: { ...BRIDGE_DEFAULTS.piers, model: false } };
  it("not considered by default (CDOT BDM 14.3: where appropriate)", () => {
    const a = analyzeBridge(bridgeDefinition(two));
    expect(a.cases.some((c) => c.type === "TG")).toBe(false);
  });
  it("zone 1: positive and negative are alternatives; the pier's moment sags for positive, the negative −0.30 of it", () => {
    const a = analyzeBridge(bridgeDefinition({ ...two, environment: { ...BRIDGE_DEFAULTS.environment, gradientZone: 1 } }));
    expect(a.ok).toBe(true);
    expect(a.cases.filter((c) => c.group === "TG").map((c) => c.name)).toEqual(["Temperature gradient, positive", "Temperature gradient, negative"]);
    const pier = (name: string) =>
      [1, 2, 3, 4, 5].reduce((t, g) => {
        const m = a.generated.members.find((x) => x.id === `G${g}-S1`);
        if (!m) return t;
        const st = a.member(m, { kind: "case", name }, 1);
        return t + st[st.length - 1].forces.My;
      }, 0);
    const pos = pier("Temperature gradient, positive");
    const dead = pier("Barriers");
    expect(Math.sign(pos)).toBe(-Math.sign(dead));
    expect(pier("Temperature gradient, negative") / pos).toBeCloseTo(-0.3, 6);
    const asphalt = analyzeBridge(bridgeDefinition({ ...two, environment: { ...BRIDGE_DEFAULTS.environment, gradientZone: 1, asphalt: true } }));
    expect(asphalt.cases.find((c) => c.name === "Temperature gradient, negative")!.description).toContain("0.20");
  });
  it("Service I and III take 0.50 TG; Strength none (C3.4.1)", () => {
    const c = combinationsFor();
    expect(c.find((x) => x.name === "Service I")!.factors.TG).toBe(0.5);
    expect(c.find((x) => x.name === "Service III")!.factors.TG).toBe(0.5);
    expect(c.filter((x) => x.name.startsWith("Strength")).every((x) => x.factors.TG === 0)).toBe(true);
  });
});

describe("the gradient in the precast girder check (3.12.3, 4.6.6)", () => {
  it("a rectangular section's self-equilibrating stresses: by hand", () => {
    const Ad = 96 * 8 * 0.8;
    const A = 720 + Ad;
    const yb = (720 * 30 + Ad * 64) / A;
    const I = 216000 + 720 * (30 - yb) ** 2 + (96 * 0.8 * 8 ** 3) / 12 + Ad * (64 - yb) ** 2;
    const r = gradientOnGirder({ profile: [[0, 6], [60, 6]], H: 60, hh: 0, topWidth: 12, ts: 8, beff: 96, n: 0.8 }, { A, I, yb }, 4000, 1);
    const on = gradientOn([[0, 6], [60, 6]], 60, 8, { beff: 96, A, I, yb }, 0.8, 54, 14, 1);
    expect(r.Tu).toBeCloseTo(on.uniform, 2);
    expect(r.G * 12).toBeCloseTo(on.gradient, 2);
    const a = 6e-6;
    expect(r.deck).toBeCloseTo(0.8 * 4000 * a * (54 - r.Tu - r.G * (68 - yb)), 9);
    expect(r.bot).toBeCloseTo(4000 * a * (0 - r.Tu - r.G * (0 - yb)), 9);
    expect(r.deck).toBeGreaterThan(0); // the warm top held: compression
  });
  it("a simple span: Service I's tops and Service III's bottom take 0.50 of the worse gradient", () => {
    const base = { ...GIRDER_DEFAULTS, L: 100 };
    const r0 = designGirder(base).interior;
    const r1 = designGirder({ ...base, gradient: { zone: 1, asphalt: false } }).interior;
    const mid = (r: typeof r0) => r.stations.reduce((p, s) => (Math.abs(s.x - 50) < Math.abs(p.x - 50) ? s : p));
    const m1 = mid(r1);
    expect(m1.tg).toBeDefined();
    expect(m1.tg!.Mt).toBe(0);
    expect(m1.tg!.neg.deck / m1.tg!.pos.deck).toBeCloseTo(-0.3, 9);
    expect(m1.service.topTotal - mid(r0).service.topTotal).toBeCloseTo(m1.tg!.top, 9);
    expect(m1.service.deckTotal - mid(r0).service.deckTotal).toBeCloseTo(m1.tg!.deck, 9);
    expect(m1.service.botIII - mid(r0).service.botIII).toBeCloseTo(m1.tg!.bot, 9);
    expect(m1.tg!.deck).toBeCloseTo(0.5 * Math.max(0, m1.tg!.pos.deck, m1.tg!.neg.deck), 9);
    expect(mid(r0).tg).toBeUndefined();
  });
  it("two continuous spans: the positive gradient's restraint sags at the pier", () => {
    const base = { ...GIRDER_DEFAULTS, L: 100, extraSpans: [{ L: 100, strands: null, harped: null }] };
    const r = designGirder({ ...base, gradient: { zone: 1, asphalt: false } });
    const atPier = r.spans[0].interior.stations.find((s) => s.pier && s.x > 1)!;
    expect(atPier.tg!.Mt).toBeGreaterThan(0);
    const start = r.spans[0].interior.stations[0];
    expect(Math.abs(start.tg!.Mt)).toBeLessThan(atPier.tg!.Mt);
  });
  it("the Bridge passes its choice to the girder designs", () => {
    const d = bridgeDefinition({ ...BRIDGE_DEFAULTS, spans: [100], environment: { ...BRIDGE_DEFAULTS.environment, gradientZone: 2, asphalt: true } });
    expect(toBridgeInputs(d).gradient).toEqual({ zone: 2, asphalt: true });
  });
});
