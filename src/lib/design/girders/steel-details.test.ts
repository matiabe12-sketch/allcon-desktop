import { describe, expect, it } from "vitest";
import { designSteelGirder, STEEL_DEFAULTS, type SteelGirderInputs } from "./steel";
import { bearingStiffener, FATIGUE_CATEGORIES, fatigueResistance, STUD_FATIGUE, studResistance, studsAcross, transverseStiffener, webAtBearing } from "./steel-details";
import { ES, sectionProps } from "./steel-section";

const near = (a: number, b: number, tol: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol * Math.abs(b));

describe("fatigue resistance (6.6.1.2.5)", () => {
  it("gives the 75-year single-lane ADTT equivalent to infinite life of Table 6.6.1.2.3-1", () => {
    // The table's sixth column (Eq. C6.6.1.2.3-1; A computes to 691.6, listed as 690).
    for (const [c, adtt] of [["A", 690], ["B", 1120], ["C", 1680], ["C'", 975], ["D", 2450]] as const) near(fatigueResistance(FATIGUE_CATEGORIES[c], 1e9, 1).infinite, adtt, 0.005);
  });
  it("uses Fatigue I with the threshold above that ADTT, Fatigue II with (A/N)^(1/m) below it", () => {
    const hi = fatigueResistance(FATIGUE_CATEGORIES["C'"], 2000, 1);
    expect(hi.combo).toBe("Fatigue I");
    expect(hi.gamma).toBe(1.75);
    expect(hi.Fn).toBe(12);
    const lo = fatigueResistance(FATIGUE_CATEGORIES["C'"], 500, 1.5);
    expect(lo.combo).toBe("Fatigue II");
    near(lo.Fn, (44e8 / (365 * 75 * 1.5 * 500)) ** (1 / 3), 1e-12);
  });
  it("gives studs Zr from Condition 9.2 (slope 5) and Qn = 0.70 Asc Fu (10th Edition)", () => {
    const s = studResistance({ d: 0.875, perRow: 3, pitch: 10, height: 6, Fu: 60 }, 1000, 1);
    near(s.Qn, 0.7 * ((Math.PI * 0.875 ** 2) / 4) * 60, 1e-12);
    expect(s.Qr).toBe(s.Qn);
    near(s.Zr, (STUD_FATIGUE.A / (365 * 75 * 1000)) ** 0.2 * s.Asc, 1e-12);
    expect(studsAcross(14, 0.875)).toBe(4);
  });
});

describe("bearing stiffeners and the web at a bearing, FHWA Example 2A", () => {
  it("matches the abutment's 6 × 5/8 in pair (Section 8.5.1)", () => {
    const b = bearingStiffener({ bt: 6, tp: 0.625, Fys: 50, clip: 1.5, pairsEnd: 1, pairsPier: 1, gap: 8 }, 1, 42, 0.4375);
    near(b.Rr, 394, 0.002); // (Rsb)n = 1.4(5.63)(50)
    near(b.As, 10.95, 0.001);
    near(b.Is, 100.2, 0.001);
    near(b.r, 3.03, 0.002);
    near(b.btMax, 6 * (0.48 * 0.625 * Math.sqrt(ES / 50)) / 6, 1e-12);
    // The example prints Pe = 2,646 kip (a digit short of its own π²E As/(KL/r)² = 28,9xx) and so Pn = 502 kip;
    // with the right Pe, Pn = 0.658^(Po/Pe) Po = 543 kip.
    near(b.Pe, 28905, 0.002);
    near(b.Pn, 543, 0.002);
  });
  it("matches web local yielding and crippling (D6.5)", () => {
    const pier = webAtBearing({ N: 10, k: 1.5625, tw: 0.5, tf: 1.25, d: 44.375, Fyw: 50, end: false });
    near(pier.yielding, 445, 0.002);
    near(pier.crippling, 446, 0.003);
    const abut = webAtBearing({ N: 10, k: 1.5625, tw: 0.4375, tf: 1.25, d: 44.375, Fyw: 50, end: true });
    near(abut.yielding, 304, 0.002);
    near(abut.crippling, 179, 0.003);
  });
});

describe("transverse stiffeners (6.10.11.1)", () => {
  it("takes It about the web face for a single plate, J at least 0.5, and It2 for tension field", () => {
    const t = transverseStiffener({ st: { bt: 5.5, tp: 0.5, Fys: 50, pair: false }, D: 42, tw: 0.4375, do: 84, bfMax: 16, Fyw: 50, rhoW: 1, tensionField: true });
    near(t.It, (0.5 * 5.5 ** 3) / 3, 1e-12);
    near(t.It1, 42 * 0.4375 ** 3 * 0.5, 1e-12);
    near(t.It2, (42 ** 4 / 40) * (50 / ES) ** 1.5, 1e-12); // ρt = 1: Fcrs = 0.31E/(bt/tp)² ≥ Fys
    expect(t.required).toBe(Math.max(t.It1, t.It2));
    near(t.widthMin, Math.max(2 + 42 / 30, 4), 1e-12);
  });
});

describe("the girder's details", () => {
  // A prismatic two-span girder, so the fatigue truck's moment can be checked by the three-moment equation.
  const prismatic: SteelGirderInputs = { ...STEEL_DEFAULTS, segments: [{ ...STEEL_DEFAULTS.segments[0], length: 180 }] };

  it("places the fatigue truck: the moment range at 0.44L of a two-span girder", () => {
    const r = designSteelGirder(prismatic);
    const st = r.stations.find((s) => Math.abs(s.X - 40.5) < 1e-6)!;
    const L = 90;
    const x = 40.5;
    // Moment at x in span 1 from a unit load at a (from the start; > L in span 2), two equal prismatic spans.
    const il = (a: number) => {
      const b = a <= L ? a : 2 * L - a; // distance from the load's own end support
      const Mp = (-b * (L ** 2 - b ** 2)) / (4 * L ** 2);
      const simple = a <= L ? (a <= x ? (a * (L - x)) / L : (x * (L - a)) / L) : 0;
      return simple + (Mp * x) / L;
    };
    let hi = 0;
    let lo = 0;
    for (let pos = -50; pos <= 230; pos += 0.5)
      for (const dir of [1, -1]) {
        let M = 0;
        for (const [P, d] of [[8, 0], [32, 14], [32, 44]]) {
          const a = pos + dir * d;
          if (a >= 0 && a <= 2 * L) M += P * il(a);
        }
        hi = Math.max(hi, M);
        lo = Math.min(lo, M);
      }
    const f = 0.7 * 1.15; // one lane by the lever rule without the 1.2, and 15% IM
    near(st.fatigue!.Mmax, hi * f, 0.005);
    near(st.fatigue!.Mmin, lo * f, 0.01);
    expect(st.fatigue!.cycles).toBe(1);
    expect(r.stations.find((s) => Math.abs(s.X - 85.5) < 1e-6)!.fatigue!.cycles).toBe(1.5); // within 0.1L of the pier
  });

  it("gives the deck's dead load deflection of a simple span as 5wL⁴/384EI", () => {
    const i: SteelGirderInputs = { ...prismatic, spans: [100], segments: [{ ...prismatic.segments[0], length: 100 }] };
    const r = designSteelGirder(i);
    const mid = r.camber.find((c) => Math.abs(c.at - 0.5) < 1e-9)!;
    const I = sectionProps(i.segments[0], "steel", { beff: 1, ts: 1, tGross: 1, haunch: 0, n: 8, fc: 4, fy: 60, bars: [] }, 50, 50).I;
    const w = r.loads.dc1Deck / 12; // kip/in
    near(mid.deck, (5 * w * 1200 ** 4) / (384 * ES * I), 0.003);
  });

  it("checks Example 2A's details with no failures: B and C' attachments, 7/8 in studs at 10 in, 6 × 5/8 in bearing stiffeners", () => {
    const r = designSteelGirder(STEEL_DEFAULTS);
    const ids = (p: RegExp) => r.checks.filter((c) => p.test(c.id));
    expect(ids(/^fat-(bot|top)$/).length).toBe(2);
    expect(ids(/^stud-str/).length).toBe(4);
    expect(ids(/^brg-[wba]-/).length).toBe(9);
    for (const c of ids(/^(fat|stud|brg)/)) expect(c.ok || c.advisory, c.name).toBe(true);
    // The pier's reaction needs two pairs of bearing stiffeners; one pair fails bearing.
    const one = designSteelGirder({ ...STEEL_DEFAULTS, bearing: { ...STEEL_DEFAULTS.bearing, pairsPier: 1 } });
    expect(one.checks.find((c) => c.id === "brg-b-1")!.ok).toBe(false);
  });

  it("asks for bearing stiffeners on a plate girder, and checks a rolled beam's web at its bearings without them", () => {
    const plate = designSteelGirder({ ...STEEL_DEFAULTS, bearing: { ...STEEL_DEFAULTS.bearing, use: false } });
    expect(plate.checks.find((c) => c.id === "brg-req-0")?.ok).toBe(false);
    const rolled = designSteelGirder({ ...STEEL_DEFAULTS, spans: [60], segments: [{ length: 60, kind: "rolled", shape: "W36X150", D: 0, tw: 0, top: { b: 0, t: 0 }, bottom: { b: 0, t: 0 } }], bearing: { ...STEEL_DEFAULTS.bearing, use: false } });
    expect(rolled.checks.find((c) => c.id === "brg-req-0")).toBeUndefined();
    expect(rolled.checks.find((c) => c.id === "brg-y-0")).toBeDefined();
    expect(rolled.checks.find((c) => c.id === "brg-c-0")).toBeDefined();
  });

  it("checks a stiffened zone's stiffeners and the web's special fatigue requirement", () => {
    const r = designSteelGirder({ ...STEEL_DEFAULTS, stiffeners: [{ from: 70, to: 110, spacing: 84 }] });
    expect(r.checks.find((c) => c.id === "stf-i-0")).toBeDefined();
    expect(r.checks.find((c) => c.id === "fat-web")).toBeDefined();
  });
});
