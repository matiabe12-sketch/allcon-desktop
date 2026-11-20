import { describe, expect, it } from "vitest";
import { designWingwall, pressureResultants, WINGWALL_DEFAULTS } from "./wingwall";

// Validation against a state DOT's worked example (a 10 ft cantilever wingwall, 20 ft long, off an
// abutment skewed 30°), and the closed-form pressure resultants against numerical integration.

const near = (a: number, b: number, tol = 1e-3) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol * Math.max(1, Math.abs(b)));
const r = designWingwall(WINGWALL_DEFAULTS);

describe("wingwall: pressure resultants", () => {
  it("agree with integrating W (z + S) over the trapezoidal face", () => {
    const [W, H, h, L, S] = [0.06, 12, 4, 18, 2.5];
    let P = 0, MA = 0, MC = 0;
    const N = 2000;
    for (let a = 0; a < N; a++) {
      const x = ((a + 0.5) / N) * L;
      const d = H + ((h - H) * x) / L;
      for (let b = 0; b < N; b++) {
        const z = ((b + 0.5) / N) * d;
        const dA = (L / N) * (d / N);
        const p = W * (z + S) * dA;
        P += p;
        MA += p * x;
        MC += p * z;
      }
    }
    const f = pressureResultants(W, H, h, L, S);
    near(f.P, P, 1e-5);
    near(f.MA, MA, 1e-5);
    near(f.MC, MC, 1e-5);
  });
});

describe("wingwall: a DOT worked example", () => {
  it("at-rest pressure", () => {
    near(r.soil.k, 0.4408);
    near(r.soil.W, 0.0573);
  });
  it("service moments, thrust and its location", () => {
    near(r.service.MA, 300.8508);
    near(r.service.MC, 188.4377);
    near(r.service.P, 41.4506);
    near(r.service.x, 7.2581);
    near(r.service.y, 4.5461);
  });
  it("strength (surcharge at 1.75, earth pressure at 1.35)", () => {
    near(r.strength.MA, 455.0488);
    near(r.strength.MC, 275.6319);
    near(r.strength.P, 61.918);
    near(r.strength.x, 7.3492);
    near(r.strength.y, 4.4516);
  });
  it("self weight and Section A per foot of height", () => {
    near(r.wall.Vs, 30);
    near(r.wall.Mu, 375);
    near(r.sectionA.Ms, 30.0851);
    near(r.sectionA.Mu, 45.5049);
  });
  it("Section B: the forces the abutment takes", () => {
    near(r.Askew, 3.4641);
    const s = r.sectionB.service;
    near(s.ex, 8.9901);
    near(s.ez, 0.4539);
    near(s.My, 372.6453);
    near(s.Mx, 18.8151);
    near(s.Tz, 351.9615);
    const u = r.sectionB.strength;
    near(u.My, 562.2939);
    near(u.Mx, 33.9579);
    near(u.Tz, 439.9519);
  });
  it("the #8 bars hooked into the abutment, epoxy coated (AASHTO 5.10.8.2.4, worked by hand)", () => {
    // Fh = db r ν f'c = 1 × 3.5 × 0.65 × 4 = 9.1 kip; ℓdb = 0.17 (60 − 9.1/0.79)² / (1.97 × 4^0.25)² = 51.479 in;
    // × min(1.7, 1.3 top × 1.2 epoxy) × λrc 0.4 (db/cb = 1/2.5) = 32.123, + r 3.5 + db/2 = 36.123 in,
    // against 3 ft / cos 30° − 2 in = 39.569 in.
    near(r.anchorage.hook.Fh, 9.1);
    near(r.anchorage.hook.basic, 51.479);
    near(r.anchorage.hook.required, 36.123);
    near(r.anchorage.available, 39.569);
    // The front face's #4: 0.17 × 0.5 (60/2.786)² = 39.424 in × 1.56 × 0.3 = 18.450 in, straight.
    near(r.anchorage.straight.required, 18.45);
    const ck = (id: string) => r.checks.find((c) => c.id === id)!;
    expect(ck("dev-retained").ok && ck("dev-front").ok).toBe(true);
    // Square to the abutment (no skew) there's only 34 in: the #8 hook falls short; #6 @ 4 in (about the same steel) fits.
    const square = designWingwall({ ...WINGWALL_DEFAULTS, skew: 0 });
    expect(square.checks.find((c) => c.id === "dev-retained")!.ok).toBe(false);
    expect(designWingwall({ ...WINGWALL_DEFAULTS, skew: 0, bars: { bar: 6, spacing: 4 } }).checks.find((c) => c.id === "dev-retained")!.ok).toBe(true);
  });
  it("shrinkage and temperature steel for each bar set (AASHTO 5.10.6)", () => {
    near(r.temperature.AsTemp, 0.11); // 1.3 × 36 × 12 / (2 × 48 × 60) = 0.0975, at least 0.11
    const wide = designWingwall({ ...WINGWALL_DEFAULTS, frontBars: { bar: 4, spacing: 24 }, vertBars: { bar: 3, spacing: 12 } });
    expect(wide.checks.find((c) => c.id === "temp-front")!.ok).toBe(false); // 0.10 in²/ft
    expect(wide.checks.find((c) => c.id === "temp-vert")!.ok).toBe(true); // 0.11 in²/ft
    expect(wide.checks.find((c) => c.id === "temp-spacing")!.ok).toBe(false); // 24 in > 18 in
  });
  it("self weight in the wall's plane", () => {
    // As = 10/4 × (0.20 + 1.58 × (1 − 45.505/59.285)) = 1.418 in², d = 105 in, a = 2.085 in: Mr = 663.41 kip·ft.
    near(r.inPlane.AsW, 1.4181);
    near(r.inPlane.MrW, 663.41);
    near(r.inPlane.VrW, 141.914);
  });
  it("reads a saved wingwall's single other bars as both the front and vertical bars", () => {
    const old = designWingwall({ ...WINGWALL_DEFAULTS, frontBars: undefined, vertBars: undefined, otherBars: { bar: 5, spacing: 10 } });
    expect(old.temperature.front).toEqual({ bar: 5, spacing: 10 });
    expect(old.temperature.vert).toEqual({ bar: 5, spacing: 10 });
  });
  it("the #8 bars at 6 in the example chose carry Section A", () => {
    expect(r.ok).toBe(true);
    expect(designWingwall({ ...WINGWALL_DEFAULTS, bars: { bar: 5, spacing: 12 } }).checks.find((c) => c.id === "a-flexure")!.ok).toBe(false);
  });
});

describe("wingwall: the connection to the abutment", () => {
  const cn = r.connection;
  it("corner bars (the retained face's #8 @ 6 in by default) take the root moment over the 3 ft abutment", () => {
    expect(cn.abutBars).toEqual({ bar: 8, spacing: 6 });
    // As 1.58 in²/ft, d = 36 − 2 − 1.0/2 = 33.5 in, a = 1.58 × 60 / (0.85 × 4 × 12) = 2.324 in.
    const a = (1.58 * 60) / (0.85 * 4 * 12);
    near(cn.flex.MR, (0.9 * 1.58 * 60 * (33.5 - a / 2)) / 12, 1e-3);
    const c = r.checks.find((x) => x.id === "conn-abut-flex")!;
    near(c.demand, r.sectionA.Mu, 1e-9);
    expect(c.ok).toBe(true);
    expect(r.checks.find((x) => x.id === "conn-abut-crack")!.ok).toBe(true);
    // The legs: ℓd and the cover along the abutment; through the abutment along the skew, then 1.3 ℓd.
    expect(cn.legAb).toBe(Math.ceil(cn.dev.required + 2));
    expect(cn.legWing).toBe(Math.ceil(36 / Math.cos(Math.PI / 6) - 2 + cn.lap));
  });
  it("the abutment's own #5 @ 12 in alone would crack: why the corner bars are there", () => {
    const thin = designWingwall({ ...WINGWALL_DEFAULTS, cornerBars: { bar: 5, spacing: 12 } });
    expect(thin.checks.find((x) => x.id === "conn-abut-crack")!.ok).toBe(false);
  });
  it("shear friction across the joint: the thrust and weight together, the front face's #4 @ 12 in clamping", () => {
    // Acv = 12 × 120 = 1,440 in², Avf = 0.20 × 10 = 2.0 in²; roughened: 0.24 × 1,440 + 1.0 × 2.0 × 60 = 465.6 kip.
    const c = r.checks.find((x) => x.id === "conn-friction")!;
    near(c.capacity, 0.9 * 465.6, 1e-9);
    near(c.demand, Math.hypot(r.strength.P, r.wall.Vu), 1e-9);
    expect(c.ok).toBe(true);
    const mono = designWingwall({ ...WINGWALL_DEFAULTS, joint: "monolithic" }).checks.find((x) => x.id === "conn-friction")!;
    near(mono.capacity, 0.9 * Math.min(0.4 * 1440 + 1.4 * 2 * 60, 0.25 * 4 * 1440), 1e-9);
    // vui well under 0.210 ksi: the minimum steel across the joint may be waived (5.7.4.2).
    expect(r.checks.find((x) => x.id === "conn-friction-min")!.ok).toBe(true);
    expect(cn.waived).toBe(true);
  });
});

