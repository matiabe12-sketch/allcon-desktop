import { describe, expect, it } from "vitest";
import { flexure } from "./cip";
import { designWingwall, pressureResultants, WINGWALL_DEFAULTS, type WingwallInputs } from "./wingwall";

// Benchmark: FHWA NHI-04-041, "LRFD Design Example for Steel Girder Superstructure Bridge" (Michael Baker, 2003),
// Design Step 7, wingwall (pp. 7-98 to 7-119).
//
// The example's wingwall is a cantilever retaining wall on its own footing: the vertical bars at the stem's base
// carry the earth pressure. allcon's cantilever wingwall spans horizontally off the abutment, its horizontal bars
// at the abutment's face carrying it. The structural systems differ, so the design moments are not comparable.
// What is compared is what both share:
// - the earth pressure and live load surcharge resultants per foot of wall (the tool's pressureResultants() with a
//   constant height, and its base moment P·H − MC) against the example's REHstem, RLSstem and their moments;
// - the 38.5 in section with #9 @ 9 in and 2.5 in cover: de, a, dv (de − a/2 here) and the shear resistance
//   (β = 2), and the service steel stress through the shared flexure().
// 2nd Edition (the example) versus 10th Edition (the tool) differences:
// - n = Es/Ec = 8 then (Ec 3,640 ksi); about 6.8 now (Ec = 120,000 K1 wc² f'c^0.33, 5.4.2.4): the stress check
//   below uses the example's n.
// - Minimum steel: 1.2 Mcr then; the lesser of 1.33 Mu and γ3 γ1 fr Sc now (5.6.3.3). Crack control: Z then;
//   the spacing limit of 5.6.7 now. Not compared.
// - The example's backfill slopes at 18.5° (Rankine pressure parallel to the slope, its horizontal part × cos 18.5°);
//   the tool takes a level backfill with the coefficient entered. Compared on the horizontal parts.
// No discrepancy in what is shared.

const near = (v: number, ref: number, tol: number) => expect(Math.abs(v - ref) / Math.abs(ref)).toBeLessThanOrEqual(tol);
const cos = Math.cos((18.5 * Math.PI) / 180);

describe("Wingwall against FHWA NHI-04-041 Design Step 7 (wingwall)", () => {
  // The design section: 20.5 ft of stem plus 2 ft of earth above its top at the wall (p. 7-103), ka = 0.30, 0.120 kcf.
  const H = 22.5;
  const W = 0.3 * 0.12;

  it("earth pressure and surcharge resultants per foot (p. 7-103, 7-104)", () => {
    const earth = pressureResultants(W, H, H, 1, 0);
    const all = pressureResultants(W, H, H, 1, 2); // heq = 2.0 ft
    near(earth.P, 9.11, 0.001); // REHstem
    near(all.P - earth.P, 1.62, 0.001); // RLSstem
    near(earth.P * cos, 8.64, 0.001); // REHstemhoriz
    near((all.P - earth.P) * cos, 1.54, 0.003); // RLSstemhoriz (1.536, the example rounds)
  });

  it("their moments at the stem's base: Strength I 127.46, Strength III 97.22, Service I 82.10 kip·ft/ft (p. 7-107 to 7-109)", () => {
    const earth = pressureResultants(W, H, H, 1, 0);
    const all = pressureResultants(W, H, H, 1, 2);
    // Moment about the base = P·H − (moment about the top).
    const Me = (earth.P * H - earth.MC) * cos;
    const Ms = (all.P * H - all.MC - (earth.P * H - earth.MC)) * cos;
    near(Me / (earth.P * cos), 7.5, 1e-9); // H/3
    near(Ms / ((all.P - earth.P) * cos), 11.25, 1e-9); // H/2
    near(1.5 * Me, 97.22, 0.002);
    near(1.5 * Me + 1.75 * Ms, 127.46, 0.002);
    near(Me + Ms, 82.1, 0.002);
  });

  it("the 38.5 in section, #9 @ 9 in, 2.5 in cover: de, a, dv and Vr (p. 7-112, 7-117)", () => {
    const i: WingwallInputs = { ...WINGWALL_DEFAULTS, H, h: H, L: 10, t: 38.5, atRest: false, k: 0.3, gammaS: 0.12, heq: 2, gEH: 1.5, gLS: 1.75, fc: 4, fy: 60, bars: { bar: 9, spacing: 9 }, cover: 2.5, exposure: 2 };
    const r = designWingwall(i);
    near(r.sectionA.flex.de, 35.44, 0.001);
    near(r.sectionA.flex.a, 1.96, 0.002);
    near(r.sectionA.dv, 34.46, 0.001);
    near(r.sectionA.VR, 47.04, 0.002);
    expect(r.soil.k).toBe(0.3);
  });

  it("service steel stress at 82.10 kip·ft/ft with n = 8: 22.34 ksi (p. 7-116)", () => {
    const f = flexure({ Mu: 127.46, Ms: 82.1, h: 38.5, cover: 2.5, bars: { bar: 9, spacing: 9 }, fc: 4, fy: 60, Es: 29000, phiF: 0.9, exposure: 2, n: 8, beta1: 0.85 });
    near(f.k, 0.2, 0.01);
    near(f.fss, 22.34, 0.005);
  });
});
