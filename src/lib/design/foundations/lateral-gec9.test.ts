import { describe, expect, it } from "vitest";
import { analyzeLateral } from "./lateral";
import { toLayers, type SoilLayer } from "./piles";

// FHWA GEC 9 (Design and Analysis of Laterally Loaded Deep Foundations, FHWA-HIF-18-031, 2018), Example B.1: a 54 in
// shaft, 45 ft, its top 1.5 ft above the ground, free head; Reese sand (φ 30°, 115 pcf and k 90 pci, then 52.6 pcf
// and 60 pci below the water), 10 ft of Matlock soft clay (300 psf, ε50 0.02), Reese sand (57.6 pcf, 80 pci).
// The manual's p–y run: 727 kip·ft and 35.5 kip under Strength (672 kip·ft, 14 kip, 12 kip axial), 0.03 in at the
// top under Service (144 kip·ft, 3 kip, 9 kip). Here the shaft is uncracked, Ec·Ig.
const L = (name: string, thickness: number, kind: SoilLayer["kind"], gamma: number, k: number, su = 0, e50 = 0): SoilLayer => ({ name, thickness, kind, gamma, phi: 30, k, su, e50, qu: 0, Em: 0, rqd: 0 });

describe("FHWA GEC 9 Example B.1 (a single shaft, free head)", () => {
  const EI = 57 * Math.sqrt(4000) * ((Math.PI * 54 ** 4) / 64);
  const layers = [{ thickness: 1.5, model: { kind: "none" as const } }, ...toLayers([L("1", 13.5, "sand", 115, 90), L("2", 15, "sand", 52.6, 60), L("3", 10, "soft-clay", 47.6, 0, 300, 0.02), L("4", 10, "sand", 57.6, 80)])];
  const strength = analyzeLateral({ length: 45, D: 54, EI, Q: 12, head: { kind: "free", H: 14, M: 672 }, layers });
  const service = analyzeLateral({ length: 45, D: 54, EI, Q: 9, head: { kind: "free", H: 3, M: 144 }, layers });
  it("Strength: the largest moment 735 kip·ft (727 in the manual) and shear 37.7 kip (35.5)", () => {
    expect(strength.Mmax / 727).toBeGreaterThan(1);
    expect(strength.Mmax / 727).toBeLessThan(1.03);
    expect(strength.Vmax / 35.5).toBeGreaterThan(1);
    expect(strength.Vmax / 35.5).toBeLessThan(1.08);
  });
  it("Service: 0.035 in at the top (the manual's 0.03, to two places)", () => {
    expect(service.y0).toBeGreaterThan(0.025);
    expect(service.y0).toBeLessThan(0.04);
  });
});
