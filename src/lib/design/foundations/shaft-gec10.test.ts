import { describe, expect, it } from "vitest";
import { shaftAxial, SHAFT_DEFAULTS, type ShaftLayer } from "./shaft";

// FHWA GEC 10 (Drilled Shafts, FHWA-NHI-18-024, 2018), Appendix A: an 8 ft shaft 201 ft below the mudline at Pier 2,
// Extreme Event I (no scour), Table A-5. Sand by the β method of Chen and Kulhawy (AASHTO 10.8.3.5.2b: φ' from N1,60,
// σ'p = 0.47·N60^0.6·pa); the tip in sand at 1.2·N60 ksf (10.8.3.5.2c, the manual's 0.6·N60 tsf). The clays are left
// out of the comparison: AASHTO 10th keeps α = 0.55 (10.8.3.5.1b), the manual's example 0.47 and 0.44.
const sand = (name: string, thickness: number, gammaSat: number, N60: number): ShaftLayer => ({ name, thickness, kind: "sand", axial: "beta", gamma: gammaSat - 62.4, phi: 0, k: 125, su: 0, e50: 0, qu: 0, Em: 0, rqd: 0, N60, quKsf: 0, qs: 0, qp: 0, phiQs: 0, phiQp: 0 });
const clay = (name: string, thickness: number, su: number): ShaftLayer => ({ name, thickness, kind: "stiff-clay", axial: "alpha", gamma: 110 - 62.4, phi: 0, k: 0, su, e50: 0.005, qu: 0, Em: 0, rqd: 0, N60: 0, quKsf: 0, qs: 0, qp: 0, phiQs: 0, phiQp: 0 });

describe("FHWA GEC 10 Appendix A: the Pier 2 shaft's axial resistance (Extreme Event I, no scour)", () => {
  const r = shaftAxial({
    ...SHAFT_DEFAULTS,
    D: 96,
    length: 201,
    topDepth: 0,
    layers: [sand("1", 25, 125, 17), sand("2", 40, 125, 75), sand("3", 20, 120, 30), clay("4", 15, 2057), sand("5", 10, 120, 36), clay("6", 80.5, 2523), sand("7", 22, 120, 41)],
  });
  const row = (n: string) => r.rows.find((x) => x.name === n)!;
  it("the sand layers' nominal side resistance, layer by layer (Table A-5: 525, 2,450, 965 and 575 kip; within 0.5%)", () => {
    expect(row("1").Rs / 524.776).toBeCloseTo(1, 2);
    expect(row("2").Rs / 2449.741).toBeCloseTo(1, 2);
    expect(row("3").Rs / 964.754).toBeCloseTo(1, 2);
    expect(row("5").Rs / 574.507).toBeCloseTo(1, 2);
  });
  it("layer 7, overconsolidation below 1: σ'p/σ'v taken as it is here (772 kip here, 843 in the manual, which floors it at 1)", () => {
    expect(row("7").Rs).toBeLessThan(843.239);
    expect(row("7").Rs / 843.239).toBeGreaterThan(0.9);
  });
  it("the tip in sand: 1.2·41 = 49.2 ksf over 50.3 ft², 2,473 kip", () => {
    expect(r.qp).toBeCloseTo(49.2, 6);
    expect(r.Rp / 2473.062).toBeCloseTo(1, 3);
  });
});
