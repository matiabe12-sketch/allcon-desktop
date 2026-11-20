import { describe, expect, it } from "vitest";
import { designSteelGirder, STEEL_DEFAULTS, steelGirderInputs } from "./steel";
import { anchorFu, connectionFactor, designSole, SOLE_DEFAULTS, type SoleSupport } from "./steel-sole";

// Sole plates and anchor bolts (AASHTO 14.8, CDOT BDM 14.5.7, CDOT Standard Specifications 512).

const base: SoleSupport = { label: "pier 2", pier: true, X: 0, fixed: true, bf: 16, tf: 1.25, Rperm: 100, Ru: 300, Hwind: 5, Hbrake: 10, Hseis: { across: 0, along: 0 }, slope: 0 };

describe("sole plates and anchor bolts", () => {
  it("CDOT BDM Example 9 (Zone 1, AS 0.165): 0.25 of the permanent reaction, 15.5 kip per bearing across at abutment 1, 88 kip along at the fixed pier", () => {
    expect(connectionFactor(0.165)).toBe(0.25);
    expect(connectionFactor(0.04)).toBe(0.15);
    expect(connectionFactor(0)).toBe(0);
    expect((connectionFactor(0.165) * 494) / 8).toBeCloseTo(15.4, 1); // the example rounds 123.5 to 124 kip: 15.5
    expect((connectionFactor(0.165) * 2814) / 8).toBeCloseTo(87.9, 1);
  });
  it("the plate: 2 in longer than the bearing, 3/4 in at least, beveled past 0.01 rad (14.8.2)", () => {
    const flat = designSole(SOLE_DEFAULTS, base);
    expect(flat.L).toBe(SOLE_DEFAULTS.padL + 2);
    expect(flat.tThin).toBeGreaterThanOrEqual(0.75);
    expect(flat.tapered).toBe(false);
    const steep = designSole(SOLE_DEFAULTS, { ...base, slope: 0.02 });
    expect(steep.tapered).toBe(true);
    expect(steep.tThick - steep.tThin).toBeGreaterThanOrEqual(0.02 * steep.L - 1e-9);
  });
  it("A449 bolts by diameter (CDOT 512.02); more or larger bolts until they and the concrete pass", () => {
    expect(anchorFu("A449", 1)).toBe(120);
    expect(anchorFu("A449", 1.25)).toBe(105);
    expect(anchorFu("A449", 2)).toBe(90);
    const big = designSole(SOLE_DEFAULTS, { ...base, Hseis: { across: 60, along: 30 } });
    expect(big.n * big.d).toBeGreaterThan(SOLE_DEFAULTS.anchors.n * SOLE_DEFAULTS.anchors.d);
    expect(big.checks.filter((c) => /anchor rods|breakout|pryout/.test(c.name) && c.demand > c.capacity).map((c) => c.name)).toEqual([]);
  });
  it("Example 2A: expansion abutments and a fixed pier, every check passing; none at integral abutments", () => {
    const r = designSteelGirder(STEEL_DEFAULTS);
    expect(r.soles!.supports.map((s) => `${s.label} ${s.fixed}`)).toEqual(["start abutment false", "pier 1 true", "end abutment false"]);
    expect(r.checks.filter((c) => c.id.startsWith("sole") && !c.ok).map((c) => c.name)).toEqual([]);
    const integral = designSteelGirder({ ...STEEL_DEFAULTS, endFrame: { ...STEEL_DEFAULTS.endFrame, abutment: "integral" } });
    expect(integral.soles!.supports.map((s) => s.label)).toEqual(["pier 1"]);
  });
  it("saved designs without sole plates keep them off", () => expect(steelGirderInputs({ spans: [90, 90] }).sole.check).toBe(false));
  it("at the piers, hairpins carry the shear toward the cap's faces in place of the concrete's breakout: 2A's fixed pier at AS 0.165", () => {
    const seis = { ...STEEL_DEFAULTS, sole: { ...STEEL_DEFAULTS.sole, AS: 0.165 } };
    const r = designSteelGirder(seis);
    const pier = r.soles!.supports.find((s) => s.pier)!;
    expect(pier.hairpin).not.toBeNull();
    expect(pier.hairpin!.R).toBeCloseTo(0.75 * pier.hairpin!.As * 60, 6);
    expect(pier.hairpin!.legs).toBeGreaterThanOrEqual(pier.hairpin!.ld);
    expect(pier.checks.some((c) => /breakout/.test(c.name))).toBe(false);
    expect(r.checks.filter((c) => c.id.startsWith("sole") && !c.ok).map((c) => c.name)).toEqual([]);
    // Without them, the concrete's breakout 18 in from the cap's face can't take Zone 1's longitudinal force.
    const bare = designSteelGirder({ ...seis, sole: { ...seis.sole, hairpins: { ...seis.sole.hairpins, use: false } } });
    expect(bare.checks.some((c) => c.id.startsWith("sole") && /breakout/.test(c.name) && !c.ok)).toBe(true);
  });
});
