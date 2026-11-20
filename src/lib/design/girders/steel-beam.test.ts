import { describe, expect, it } from "vitest";
import { continuousBeam } from "./continuous";
import { nonprismaticBeam } from "./steel-beam";

// The nonprismatic beam against closed forms and against the prismatic (three-moment) beam.

describe("nonprismatic continuous beam", () => {
  it("two equal spans, constant EI: the support moment under a uniform load is −wL²/8", () => {
    const b = nonprismaticBeam([100, 100], () => 1e6);
    expect(b.supports.uniformSupports[1] / (-(100 ** 2) / 8)).toBeCloseTo(1, 3); // within 0.05%
  });

  it("constant EI matches the three-moment beam's influence lines and live load envelope", () => {
    const spans = [90, 120, 90];
    const np = nonprismaticBeam(spans, () => 5e6);
    const pr = continuousBeam(spans);
    for (const X of [10, 45, 89, 130, 200, 260]) {
      expect(np.supports.supportIL(1, X)).toBeCloseTo(pr.influence(0, 90, "M")(X), 2);
      expect(np.supports.supportIL(2, X)).toBeCloseTo(pr.influence(1, 120, "M")(X), 2);
    }
    const a = np.beam.liveEnvelope(1, 60);
    const b = pr.liveEnvelope(1, 60);
    expect(a.Mpos).toBeCloseTo(b.Mpos, -1);
    const c = np.beam.liveEnvelope(0, 89.9);
    const d = pr.liveEnvelope(0, 89.9);
    expect(c.Mneg / d.Mneg).toBeCloseTo(1, 2);
  });

  it("a stiffer region over the pier draws more moment to it (two spans, EI doubled near the pier)", () => {
    const flat = nonprismaticBeam([100, 100], () => 1e6);
    const stepped = nonprismaticBeam([100, 100], (X) => (Math.abs(X - 100) < 30 ? 2e6 : 1e6));
    expect(stepped.supports.uniformSupports[1]).toBeLessThan(flat.supports.uniformSupports[1]); // more negative
  });

  it("deflection: a simple span's midspan deflection under a midspan load is PL³/48EI", () => {
    const b = nonprismaticBeam([80], () => 2e6, 80, [40]);
    expect(b.deflectionIL(0, 40)).toBeCloseTo(80 ** 3 / (48 * 2e6), 8);
  });
});
