import { describe, expect, it } from "vitest";
import { takeoffFor } from "../takeoff";
import { payItem } from "../rebar/cdot-items";
import { pipePayItem } from "../culverts/detail";
import { PIPE_DEFAULTS } from "../culverts/pipe";
import { bridgeLateral, designGrs, envelopeStrain, GRS_DEFAULTS } from "./abutment";
import { grsCalcLines } from "./detail";
import { collisionForce, designNoiseWall, kz, NOISE_WALL_DEFAULTS } from "../noisewall/wall";
import { noiseWallCalcLines } from "../noisewall/detail";

// FHWA-HRT-11-026 Appendix C.3: the Bowman Road Bridge, Defiance County, OH (LRFD).
const BOWMAN = { ...GRS_DEFAULTS, H: 15.58, B: 5.4, tf: 0.64, ab: 0.67, b: 4, de: 4 / 12, qb: 2600, qLL: 1400, qrb: 385, qt: 298, gr: 110, phir: 48, gb: 120, phib: 28, delta: 39, cf: 4000, phif: 0, Sv: 8, dmax: 0.5, Tf: 4800, T2: 1370 };

describe("GRS abutment against the Guide's Bowman Road example (Appendix C.3)", () => {
  const r = designGrs(BOWMAN);
  it("direct sliding: Fb, Frb, Ft, FR and RR (Eqs. 94–99)", () => {
    expect(r.sliding.Fb).toBeCloseTo(5258, -1);
    expect(r.sliding.Frb).toBeCloseTo(2165, -1);
    expect(r.sliding.Ft).toBeCloseTo(1676, -1);
    expect(r.sliding.FR / 14068).toBeCloseTo(1, 3);
    expect(r.sliding.RR / 15239).toBeCloseTo(1, 2);
  });
  it("bearing: σv against 7,862 psf, qn 20,740 psf (Eqs. 100–105)", () => {
    expect(r.bearing.sigma / 7862).toBeCloseTo(1, 1); // within 1% (the Guide's RSF 7.5 ft against 7.55)
    expect(r.bearing.qn).toBeCloseTo(20740, -1);
    expect(0.65 * r.bearing.qn).toBeCloseTo(13481, -1);
  });
  it("vertical capacity: Vapplied,f 5,700 psf, qn,an 18,781 psf (Eqs. 106–111)", () => {
    expect(r.capacity.Vapp).toBe(5700);
    expect(r.capacity.qnAn / 18781).toBeCloseTo(1, 1); // 0.5% high: the Guide rounded Sv to 0.67 ft
  });
  it("deformations at the Guide's 0.3% strain: Dv 0.047 ft, DL 0.028 ft (Eqs. 112–114)", () => {
    const d = designGrs({ ...BOWMAN, strain: 0.3 }).deform;
    expect(d.Dv).toBeCloseTo(0.047, 3);
    expect(d.DL).toBeCloseTo(0.028, 3);
    expect(envelopeStrain(2.6)).toBeGreaterThan(0.2);
    expect(envelopeStrain(2.6)).toBeLessThan(0.3);
  });
  it("Table 18: lateral stresses and the required strength at 0.67 and 5.33 ft", () => {
    const at = (z: number) => r.reinf.layers.find((l) => Math.abs(l.z - z) < 0.02)!;
    const top = at(0.667);
    expect(top.hBridge).toBeCloseTo(669, -1);
    expect(top.hRb).toBeCloseTo(85, 0);
    expect(top.hT).toBeCloseTo(77, 0);
    expect(top.hF).toBeCloseTo(845, -1);
    expect(top.Treqf).toBeCloseTo(1458, -1);
    expect(top.Treq).toBeCloseTo(1022, -1);
    expect(at(5.333).hBridge).toBeCloseTo(297, 0);
    expect(at(5.333).Treqf).toBeCloseTo(993, -1);
    expect(bridgeLateral(5700 - (1.5 * 385 + 1.75 * 298), 4, 5.3, 0.147)).toBeCloseTo(297, -1); // Eq. 118
    expect(r.reinf.TfF).toBe(1920);
    expect(r.reinf.bedLayers).toBe(5); // no layer fails at 8 in.: the minimum five
  });
  it("CDOT's rules flag the Guide's example: 4 in. clear space against 2 ft, the resultant 2.67 ft against 3 ft", () => {
    expect(r.checks.find((c) => c.id === "de")!.ok).toBe(false);
    expect(r.checks.find((c) => c.id === "resultant")!.ok).toBe(false);
    expect(designGrs(GRS_DEFAULTS).ok).toBe(true);
  });
  it("take-off and calc package", () => {
    const t = takeoffFor("grs-abutment", GRS_DEFAULTS, { length: 40 })!;
    expect(t.quantities["soil-reinforcement"]!.value).toBeCloseTo((6 * (15.58 - 2) * 40) / 27, 6);
    expect(grsCalcLines(GRS_DEFAULTS, "GRS").length).toBeGreaterThan(20);
  });
});

describe("noise wall (AASHTO 15, 3.8.1)", () => {
  it("Kz at 33 ft, exposure C, is 1.0; the wind pressure by hand", () => {
    expect(kz(16, "C")).toBeCloseTo(1.0, 2);
    expect(kz(33, "B")).toBeCloseTo(0.71, 2); // Table C3.8.1.2.1-1
    expect(kz(33, "D")).toBeCloseTo(1.15, 2);
    const r = designNoiseWall(NOISE_WALL_DEFAULTS);
    expect(r.wind.Pz).toBeCloseTo(2.56e-6 * 115 ** 2 * kz(33, "C") * 0.85 * 1.2, 9);
    expect(r.wind.Fw).toBeCloseTo(r.wind.Pz * 16 * 20, 9);
    expect(r.wind.Ps).toBeCloseTo(0.0125 * 1.2, 3); // Table C3.8.1.2.1-2, Service I
  });
  it("collision by setback: Cases 1 to 4 (15.8.4)", () => {
    expect(collisionForce(0.5, 3)).toMatchObject({ F: 54, h: 4, case: 1 });
    expect(collisionForce(4, 4)).toMatchObject({ F: 4, h: 14, case: 2 });
    expect(collisionForce(2.5, 4)).toMatchObject({ F: 29, h: 10, case: 3 });
    expect(collisionForce(6, 3)).toBeNull();
  });
  it("Broms' embedment with φ 0.75 on the passive resistance, by hand", () => {
    const r = designNoiseWall(NOISE_WALL_DEFAULTS);
    const s = r.shaft.cases[0];
    const Kp = Math.tan(((45 + 32 / 2) * Math.PI) / 180) ** 2;
    const g = 0.75 * 0.12;
    const D = 2.5;
    // L³ − (2V/γKpD)·L − 2M/(γKpD) = 0
    expect(s.b.L ** 3 - ((2 * s.V) / (g * Kp * D)) * s.b.L - (2 * s.M) / (g * Kp * D)).toBeCloseTo(0, 6);
    expect(r.ok).toBe(true);
    expect(noiseWallCalcLines(NOISE_WALL_DEFAULTS, "NW").length).toBeGreaterThan(15);
  });
  it("shafts under 18 in. fail CDOT's minimum; the take-off counts shafts and area", () => {
    expect(designNoiseWall({ ...NOISE_WALL_DEFAULTS, shaftD: 15 }).checks.find((c) => c.id === "shaft-min")!.ok).toBe(false);
    const t = takeoffFor("noise-wall", NOISE_WALL_DEFAULTS, { length: 200 })!;
    expect(t.quantities.wall!.value).toBe(3200);
    expect(t.quantities.shaft!.value).toBe(11 * 14);
  });
});

describe("pipe pay items from CDOT's item book", () => {
  it("odd sizes and steel end sections", () => {
    expect(pipePayItem({ ...PIPE_DEFAULTS, D: 66 }, "pipe")).toBe("603-01665");
    expect(pipePayItem({ ...PIPE_DEFAULTS, material: "csp", D: 36 }, "end-section")).toBe("603-30036");
    expect(payItem("603-30036")!.description).toBe("36 Inch Steel End Section");
    expect(pipePayItem({ ...PIPE_DEFAULTS, D: 90 }, "end-section")).toBeUndefined();
  });
});
