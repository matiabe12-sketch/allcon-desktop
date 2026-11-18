import { describe, expect, it } from "vitest";
import { designMicropile, MICROPILE_DEFAULTS } from "./micropile";

// FHWA NHI-05-039 (Micropile Design and Construction Reference Manual, 2005), Appendix D, Sample Problem No. 1:
// micropiles under a bridge abutment. 141 mm × 9.5 mm casing (241 MPa), less 1.6 mm off its outside for corrosion,
// over a 43 mm Grade 520 bar; 34.5 MPa grout; a 191 mm hole bonded 7.5 m in dense gravel (Type B, 265 kPa);
// 4.6 m cased; 595 kN on the front pile. The manual works in allowable stresses, so its nominal values are compared:
// the structural formulas are AASHTO 10.9.3.10's with the manual's areas, and the bond and elastic shortening are its own.
const mm = 1 / 25.4;
const kN = 1 / 4.448222;
const mm2 = mm * mm;
const fhwa = designMicropile({
  ...MICROPILE_DEFAULTS,
  casingOD: 141 * mm,
  casingT: 9.5 * mm,
  casingFy: 241 * 0.1450377,
  threadReduction: 0,
  bar: 14,
  barFy: 520 * 0.1450377,
  fcGrout: 34.5 * 0.1450377,
  holeD: 191 * mm,
  cased: 4.6 / 0.3048,
  plunge: 0,
  bond: 7.5 / 0.3048,
  bondGround: "gravel",
  grouting: "B",
  alphaB: 265 * 0.0208854,
  aggressive: true,
  corrosionRate: 0.001,
  designLife: 1.6 * mm / 0.001, // 1.6 mm, the manual's loss
  coatingLife: 0,
  cases: [{ name: "Group I", limit: "service", compression: 595 * kN, tension: 0, H: 0 }],
});

describe("FHWA NHI-05-039 Sample Problem No. 1 (bridge abutment micropiles)", () => {
  it("the casing less 1.6 mm of corrosion off its outside: 3,224 mm²; grout 10,240 mm² inside it, 27,200 mm² in the hole", () => {
    expect(fhwa.Ac / mm2).toBeCloseTo(3224, -1);
    expect(fhwa.AgCased / mm2).toBeCloseTo(10240, -1);
    expect(fhwa.AgUncased / mm2 / 27200).toBeCloseTo(1, 2);
    expect(fhwa.Ab / mm2 / 1452).toBeCloseTo(1, 2);
  });
  it("one fy for the cased length, the casing's 241 MPa (strain compatibility)", () => {
    expect(fhwa.fyCased / 0.1450377).toBeCloseTo(241, 3);
    // 0.85·(0.85·f'c·Ag + fy·(Ab + Ac)) with the manual's areas: 1,213 kN.
    expect((fhwa.RnCC / kN) / (0.85 * (0.85 * 34.5 * 10240 + 241 * (1452 + 3224)) / 1000)).toBeCloseTo(1, 2);
  });
  it("tension: fy·(Ab + Ac) = 1,127 kN cased (the manual's allowable 620 kN at 0.55), fy·Ab = 755 kN uncased (415 kN at 0.55)", () => {
    expect((fhwa.RnTC / kN) * 0.55 / 620).toBeCloseTo(1, 2);
    expect((fhwa.RnTU / kN) * 0.55 / 415).toBeCloseTo(1, 2);
  });
  it("bond: 265 kPa·π·0.191 m·7.5 m = 1,193 kN nominal (the manual's 596 kN allowable at FS 2.0)", () => {
    expect((fhwa.Rs / kN) / 2 / 596).toBeCloseTo(1, 2);
  });
  it("elastic shortening at 595 kN: the manual's 2.2 + 2.0 = 4.2 mm, within 8% (grout E 57√f'c here against its 31 GPa)", () => {
    const d = fhwa.elastic!.d / mm;
    expect(Math.abs(d - 4.2) / 4.2).toBeLessThan(0.08);
  });
});

// FHWA NHI-05-039 Appendix E, Sample Problem No. 2: a 196.9 mm × 15.1 mm casing, 12.19 m long, in sand (φ 32°,
// 18.84 kN/m³, k 24,430 kN/m³ over the top 3.35 m; φ 30°, 17.64 kN/m³, k 16,287 kN/m³ below), 1,423 kN axial and
// 44.48 kN shear, fixed head. The manual's p–y run (Reese sand, its EI 7,844 kN·m² at that moment): 3.40 mm at the
// head and −37.29 kN·m there. Here the head is taken at the ground (the manual's head is 0.305 m under it).
import { analyzeLateral } from "./lateral";
import { toLayers } from "./piles";

describe("FHWA NHI-05-039 Sample Problem No. 2 (a laterally loaded micropile, fixed head)", () => {
  const pci = 1 / 271.447; // kN/m³ → lb/in³
  const r = analyzeLateral({
    length: 12.192 / 0.3048,
    D: 196.85 * mm,
    EI: 7844 * 348.459, // kN·m² → kip·in²
    Q: 1423.4 * kN,
    head: { kind: "fixed", H: 44.482 * kN },
    layers: toLayers([
      { name: "New fill", thickness: (3.048 + 0.305) / 0.3048 - 1, kind: "sand", gamma: 18.838 * 6.3659, phi: 32, k: 24430 * pci, su: 0, e50: 0, qu: 0, Em: 0, rqd: 0 },
      { name: "Existing fill", thickness: 40, kind: "sand", gamma: 17.644 * 6.3659, phi: 30, k: 16287 * pci, su: 0, e50: 0, qu: 0, Em: 0, rqd: 0 },
    ]),
  });
  it("the head's deflection and moment: 3.65 mm and 39.3 kN·m here, the manual's 3.40 mm and 37.29 kN·m (within 10%, on the conservative side)", () => {
    const y = r.y0 / mm;
    const M = Math.abs(r.M0) / 0.737562; // kip·ft → kN·m
    expect(y / 3.40).toBeGreaterThan(1);
    expect(y / 3.40).toBeLessThan(1.1);
    expect(M / 37.29).toBeGreaterThan(1);
    expect(M / 37.29).toBeLessThan(1.1);
  });
});
