import { DesignError, type Check } from "../walls/cip";
import type { TakeoffSettings } from "../takeoff/types";

// A geosynthetic reinforced soil (GRS) abutment by FHWA-HRT-11-026, the GRS-IBS Interim Implementation Guide (2012),
// Appendix C (LRFD), as CDOT BDM 11.3.5.2 requires, with CDOT's added rules (BDM 11.3.5.5):
// - the layout (Guide 4.3.4): spacing, strength, bearing width, setback, clear space, base width, the RSF;
// - external stability (C.2.1): direct sliding (φτ 1.0), bearing under the RSF (φbc 0.65), global stability by Bishop
//   circles passing under the RSF (Service I, φ 0.65);
// - internal stability (C.2.2): vertical capacity (φcap 0.45, analytical or empirical), deformations (Guide 4.3.7.2),
//   the required reinforcement strength layer by layer (Eqs. 84–93) and the bearing bed's depth.
// The Guide's units: lb, ft (psf for pressures), in. for Sv and dmax. x from the facing's front, y up from the top of
// the RSF (the base of the GRS mass).

export type GrsInputs = {
  H: number; // ft, the GRS wall's height including the clear space (Guide's H)
  dSup: number; // ft, the superstructure's depth, the girders' bottom to the roadway
  span: number; // ft
  b: number; // ft, the beam seat's width (bearing width)
  ab: number; // ft, setback, the facing's back to the seat
  de: number; // ft, clear space, the facing's top to the girders' bottom
  B: number; // ft, the reinforcement's length at the base, not counting the facing
  tf: number; // ft, the facing block's depth (an 8 in. CMU: 7.625 in.)
  faceW: number; // lb/ft per ft of height, the facing's weight
  // Loads (unfactored)
  qb: number; // psf, the bridge's dead load on the seat
  qLL: number; // psf, the bridge's live load on the seat
  qrb: number; // psf, the road base's dead load
  qt: number; // psf, the roadway live load surcharge
  // Reinforced fill and reinforcement
  gr: number; // pcf
  phir: number; // deg
  dmax: number; // in., the fill's largest grain
  Sv: number; // in., primary spacing
  Tf: number; // lb/ft, ultimate (wide width) strength
  T2: number; // lb/ft, the strength at 2% strain
  delta: number; // deg, the fill–geotextile interface friction angle (sliding)
  qTest: number; // psf, the ultimate capacity from a performance test (0: none, the analytical method)
  strain: number; // %, the vertical strain under qb from the project's test (0: the Guide's Figure 20 envelope)
  // Retained soil and foundation
  gb: number; // pcf
  phib: number; // deg
  gRSF: number; // pcf
  gf: number; // pcf
  cf: number; // psf
  phif: number; // deg
  takeoff?: TakeoffSettings;
};

export const GRS_DEFAULTS: GrsInputs = {
  H: 15.58,
  dSup: 2.5,
  span: 79,
  b: 4,
  ab: 1,
  de: 2,
  B: 6,
  tf: 0.64,
  faceW: 50,
  qb: 2600,
  qLL: 1400,
  qrb: 385,
  qt: 298,
  gr: 110,
  phir: 48,
  dmax: 0.5,
  Sv: 8,
  Tf: 4800,
  T2: 1370,
  delta: 39,
  qTest: 0,
  strain: 0,
  gb: 120,
  phib: 28,
  gRSF: 140,
  gf: 120,
  cf: 4000,
  phif: 0,
};

const rad = (d: number) => (d * Math.PI) / 180;
const Ka = (phi: number) => Math.tan(rad(45 - phi / 2)) ** 2;
const Kp = (phi: number) => Math.tan(rad(45 + phi / 2)) ** 2;

/** The Guide's Figure 20: the design envelope of vertical strain (%) under applied vertical stress (ksf), for 8 in.
 * spacing, AASHTO No. 89 fill (φ 48°) and 4,800 lb/ft woven polypropylene, read off the figure. */
export const STRAIN_ENVELOPE: [number, number][] = [
  [0, 0], [1.2, 0.1], [2.4, 0.23], [3.6, 0.36], [4.6, 0.49], [5.8, 0.62], [7.0, 0.79], [9.3, 1.13], [11.6, 1.52], [13.8, 1.91], [16.0, 2.35], [18.2, 2.83], [20.9, 3.6], [22.7, 4.21], [25.4, 4.83],
];
export function envelopeStrain(ksf: number) {
  const e = STRAIN_ENVELOPE;
  for (let k = 1; k < e.length; k++) if (ksf <= e[k][0]) return e[k - 1][1] + ((e[k][1] - e[k - 1][1]) * (ksf - e[k - 1][0])) / (e[k][0] - e[k - 1][0]);
  return Infinity; // beyond the test: the mass has failed
}

/** Bearing capacity factors (Table 4 of the Guide, as AASHTO Table 10.6.3.1.2a-1). */
export function bearingFactors(phi: number) {
  if (phi <= 0) return { Nc: 5.14, Nq: 1, Ng: 0 };
  const t = Math.tan(rad(phi));
  const Nq = Math.exp(Math.PI * t) * Math.tan(rad(45 + phi / 2)) ** 2;
  return { Nc: (Nq - 1) / t, Nq, Ng: 2 * (Nq + 1) * t };
}

/** The layout's derived dimensions. */
export function layoutOf(i: GrsInputs) {
  const Btot = i.B + i.tf;
  const BRSF = 1.25 * Btot;
  const DRSF = 0.25 * Btot;
  const xRSF = -0.25 * Btot; // the RSF's front
  const brb = Math.max(0, i.B - i.ab - i.b); // the road base over the GRS behind the seat
  const Htop = i.H + i.dSup; // the roadway
  const DH = Htop; // CDOT's design height, the leveling pad's top to the roadway
  return { Btot, BRSF, DRSF, xRSF, brb, Htop, DH };
}

type Circle = { xc: number; yc: number; R: number };

/** Bishop's simplified method for circles passing under the RSF, Service I (the Guide's C.2.1.3). */
export function globalStability(i: GrsInputs) {
  const L = layoutOf(i);
  const xEnd = L.Btot; // the reinforced mass's back
  const surface = (x: number) => (x < 0 ? 0 : x <= i.tf + i.ab + i.b ? i.H : L.Htop);
  const load = (x: number) => (x >= i.tf + i.ab && x <= i.tf + i.ab + i.b ? i.qb + i.qLL : x > i.tf + i.ab + i.b ? i.qrb + i.qt : 0);
  // The soil column's weight between y and the surface.
  const column = (x: number, y: number) => {
    let w = 0;
    const top = surface(x);
    if (x >= L.xRSF && x <= xEnd) {
      // under the RSF (the arc stays below it): foundation up to the RSF, the RSF, the GRS (or facing)
      w += i.gf * Math.max(0, -L.DRSF - y) + i.gRSF * L.DRSF;
      if (x >= 0) w += x <= i.tf ? (i.faceW / i.tf) * i.H : i.gr * top;
    } else {
      w += i.gf * Math.max(0, Math.min(0, top) - y);
      if (top > 0) w += i.gb * (top - Math.max(0, y));
      if (y > 0) w = i.gb * (top - y);
    }
    return w;
  };
  const fsOf = (c: Circle) => {
    const xa = c.xc - Math.sqrt(Math.max(0, c.R * c.R - c.yc * c.yc)); // exits at the front ground (y = 0)
    const xb = c.xc + Math.sqrt(Math.max(0, c.R * c.R - (L.Htop - c.yc) ** 2)); // and the roadway behind
    if (!(xa < L.xRSF && xb > xEnd)) return Infinity;
    const yAt = (x: number) => c.yc - Math.sqrt(Math.max(0, c.R * c.R - (x - c.xc) ** 2));
    if (yAt(L.xRSF) > -L.DRSF || yAt(xEnd) > -L.DRSF) return Infinity;
    const n = 60;
    const slices = Array.from({ length: n }, (_, k) => {
      const x0 = xa + ((xb - xa) * k) / n;
      const x1 = xa + ((xb - xa) * (k + 1)) / n;
      const xm = (x0 + x1) / 2;
      const y = yAt(xm);
      const alpha = Math.atan2(xm - c.xc, c.yc - y);
      const W = column(xm, y) * (x1 - x0) + load(xm) * (x1 - x0);
      const below = y < 0;
      return { b: x1 - x0, alpha, W, c: below ? i.cf : 0, phi: below ? i.phif : i.phib };
    });
    const drive = slices.reduce((s, q) => s + q.W * Math.sin(q.alpha), 0);
    if (drive <= 0) return Infinity;
    let FS = 1.5;
    for (let it = 0; it < 60; it++) {
      const res = slices.reduce((s, q) => {
        const t = Math.tan(rad(q.phi));
        const m = Math.cos(q.alpha) + (Math.sin(q.alpha) * t) / FS;
        return s + (q.c * q.b + q.W * t) / Math.max(0.2, m);
      }, 0);
      const next = res / drive;
      if (Math.abs(next - FS) < 1e-5) return next;
      FS = next;
    }
    return FS;
  };
  let best = { FS: Infinity, c: { xc: 0, yc: 0, R: 0 } as Circle };
  const span = L.Btot * 3 + L.Htop;
  for (let xc = L.xRSF - L.Htop; xc <= xEnd + L.Htop; xc += span / 30)
    for (let yc = L.Htop + 0.5; yc <= L.Htop * 3 + 10; yc += (2 * L.Htop + 10) / 20)
      for (let d = L.DRSF + 0.25; d <= L.DRSF + 1.5 * L.Htop; d += (1.5 * L.Htop) / 24) {
        const c = { xc, yc, R: yc + d };
        const FS = fsOf(c);
        if (FS < best.FS) best = { FS, c };
      }
  return best;
}

/** The lateral stress under the seat's centerline at depth z from the bridge load (the Guide's Eqs. 88, 91, 92). */
export const bridgeLateral = (q: number, b: number, z: number, Kar: number) => {
  const beta = Math.atan(-b / (2 * z));
  const alpha = Math.atan(b / (2 * z)) - beta;
  return (q / Math.PI) * (alpha + Math.sin(alpha) * Math.cos(alpha + 2 * beta)) * Kar;
};

export function designGrs(i: GrsInputs) {
  if (!(i.H > 0 && i.B > 0 && i.b > 0 && i.Sv > 0 && i.Tf > 0)) throw new DesignError("The abutment needs a height, a base, a seat and its reinforcement.");
  const checks: Check[] = [];
  const add = (c: Omit<Check, "ok"> & { ok?: boolean }) => checks.push({ ...c, ok: c.ok ?? c.demand <= c.capacity });
  const L = layoutOf(i);
  const Kab = Ka(i.phib);
  const Kar = Ka(i.phir);
  const Kpr = Kp(i.phir);

  // --- layout (Guide 4.3.4; BDM 11.3.5.5) ------------------------------------------------------------------------
  add({ id: "sv", name: "Reinforcement spacing Sv ≤ 12 in.", demand: i.Sv, capacity: 12, unit: "in.", ref: "Guide 4.3.4 step 5; BDM 11.3.5" });
  add({ id: "tf", name: "Ultimate strength Tf ≥ 4,800 lb/ft for abutments", demand: 4800, capacity: i.Tf, unit: "lb/ft", ref: "Guide C.2.2.3" });
  const bMin = i.span >= 25 ? 2.5 : 2.0;
  add({ id: "b", name: `Bearing width b ≥ ${bMin} ft (span ${i.span >= 25 ? "25 ft or more" : "under 25 ft"})`, demand: bMin, capacity: i.b, unit: "ft", ref: "Guide 4.3.4 step 2" });
  add({ id: "ab", name: "Setback ab ≥ 8 in.", demand: 8 / 12, capacity: i.ab, unit: "ft", ref: "Guide 4.3.4 step 3" });
  const deMin = Math.max(3 / 12, 0.02 * i.H, 2);
  add({ id: "de", name: "Clear space: the larger of 3 in. and 2% of H (Guide), and 2 ft from the facing's top to the girders (CDOT)", demand: deMin, capacity: i.de, unit: "ft", ref: "Guide 4.3.4 step 3; BDM 11.3.5.5f" });
  const BtMin = Math.max(i.span >= 25 ? 6 : 5, 0.3 * i.H, 0.35 * L.DH);
  add({ id: "base", name: `Base width with the facing ≥ ${i.span >= 25 ? 6 : 5} ft, 0.3H and 0.35·DH (CDOT's truncated base)`, demand: BtMin, capacity: L.Btot, unit: "ft", ref: "Guide 4.3.4 step 4; BDM 11.3.5.5l" });
  const xRes = i.ab + i.b / 2; // the Service I resultant of the seat's load, behind the facing's back
  const resMin = Math.max((i.de + i.dSup) / 3, 3); // the seat bears at the facing's top: its bottom to the roadway is de + dSup
  add({ id: "resultant", name: "Seat resultant behind the facing's back ≥ H/3 (the seat's bottom to the roadway) and 3 ft", demand: resMin, capacity: xRes, unit: "ft", ref: "BDM 11.3.5.5c" });

  // --- external: direct sliding (C.2.1.1) --------------------------------------------------------------------------
  const W = i.gr * i.H * i.B; // the GRS mass
  const WRSF = i.gRSF * L.BRSF * L.DRSF;
  const Wface = i.faceW * i.H;
  const Fb = 0.5 * i.gb * Kab * i.H ** 2; // Eq. 94
  const Frb = i.qrb * Kab * i.H; // Eq. 95
  const Ft = i.qt * Kab * i.H; // Eq. 96
  const FR = 1.5 * Fb + 1.5 * Frb + 1.75 * Ft; // Eq. 70: γEH 1.5 (active), γES 1.5, γLS 1.75
  const WtR = 1.0 * W + 0.9 * i.qb * i.b + 0.75 * i.qrb * L.brb; // Eq. 72: γEV,min 1.0, γDC,min 0.9, γES,min 0.75
  const RR = 1.0 * WtR * Math.tan(rad(i.delta)); // Eq. 71
  add({ id: "sliding", name: "Direct sliding: FR ≤ φτ·Wt,R·tan δ (φτ 1.0)", demand: FR, capacity: RR, unit: "lb/ft", ref: "Guide Eqs. 70–73" });

  // --- external: bearing (C.2.1.2) ---------------------------------------------------------------------------------
  const xC = L.xRSF + L.BRSF / 2; // the RSF's center
  const MD = 1.5 * Fb * (i.H / 3) + 1.5 * Frb * (i.H / 2) + 1.75 * Ft * (i.H / 2);
  const seatV = 1.25 * i.qb * i.b + 1.75 * i.qLL * i.b;
  const roadV = (1.75 * i.qt + 1.5 * i.qrb) * L.brb;
  const MR = seatV * (i.tf + i.ab + i.b / 2 - xC) + roadV * (i.tf + i.ab + i.b + L.brb / 2 - xC) + 1.35 * W * (i.tf + i.B / 2 - xC) + 1.25 * Wface * (i.tf / 2 - xC);
  const VR = 1.35 * W + 1.35 * WRSF + 1.25 * Wface + roadV + seatV; // Eq. 75
  const eB = (MD - MR) / VR; // Eq. 76
  const Beff = L.BRSF - 2 * Math.max(0, eB);
  const sigma = VR / Beff; // Eq. 74
  const bf = bearingFactors(i.phif);
  const qn = i.cf * bf.Nc + 0.5 * Beff * i.gf * bf.Ng + i.gf * L.DRSF * bf.Nq; // Eq. 77, Df = DRSF
  add({ id: "bearing", name: `Bearing under the RSF (B′ = ${Beff.toFixed(2)} ft, e = ${eB.toFixed(2)} ft): σv ≤ φbc·qn (φbc 0.65)`, demand: sigma, capacity: 0.65 * qn, unit: "psf", ref: "Guide Eqs. 74–78" });

  // --- external: global stability (C.2.1.3), Service I, φ 0.65 -------------------------------------------------------
  const glob = globalStability(i);
  add({ id: "global", name: "Global stability, circles under the RSF (Service I): FS ≥ 1/0.65", demand: 1 / 0.65, capacity: glob.FS, unit: "", ref: "Guide C.2.1.3; AASHTO 11.6.3.7" });

  // --- internal: vertical capacity (C.2.2.1) -----------------------------------------------------------------------
  const Vapp = 1.25 * i.qb + 1.75 * i.qLL; // Eqs. 79, 82
  const svFt = i.Sv / 12;
  const red = 0.7 ** (i.Sv / (6 * i.dmax));
  const qnAn = red * (i.Tf / svFt) * Kpr; // Eq. 81
  const qnUse = Math.min(i.qTest > 0 ? i.qTest : qnAn, 14000); // CDOT's 14 ksf cap on the nominal (BDM 11.3.5.5b)
  add({ id: "capacity", name: `Vertical capacity, ${i.qTest > 0 ? "empirical (performance test)" : "analytical"}${qnUse === 14000 ? ", nominal capped at 14 ksf (CDOT)" : ""}: Vapplied,f ≤ 0.45·qn`, demand: Vapp, capacity: 0.45 * qnUse, unit: "psf", ref: `Guide Eqs. ${i.qTest > 0 ? "79–80" : "81–83"}; BDM 11.3.5.5b` });
  add({ id: "pressure", name: "Service bearing pressure on the seat ≤ 4,000 psf (the Guide's recommendation without a performance test)", demand: i.qb + i.qLL, capacity: 4000, unit: "psf", ref: "Guide 4.1", advisory: true });
  add({ id: "height", name: "GRS height ≤ 30 ft (the Guide's method)", demand: i.H, capacity: 30, unit: "ft", ref: "Guide 4.1", advisory: true });
  add({ id: "span", name: "Span ≤ about 140 ft (the Guide's recommendation)", demand: i.span, capacity: 140, unit: "ft", ref: "Guide 4.1", advisory: true });

  // --- internal: deformations (Guide 4.3.7.2) ---------------------------------------------------------------------
  const ev = i.strain > 0 ? i.strain : envelopeStrain(i.qb / 1000); // %
  const Dv = (ev / 100) * i.H; // Eq. 59
  const bqvol = i.b + i.ab;
  const DL = (2 * bqvol * Dv) / i.H; // Eq. 29
  const eL = 2 * ev; // Eq. 30
  add({ id: "strain-v", name: `Vertical strain under the bridge's dead load (${i.strain > 0 ? "the project's test" : "the Guide's Figure 20 envelope"}) ≤ 0.5%`, demand: ev, capacity: 0.5, unit: "%", ref: "Guide 4.3.7.2.1" });
  add({ id: "strain-l", name: "Lateral strain εL = 2·εv ≤ 1%", demand: eL, capacity: 1, unit: "%", ref: "Guide Eq. 30" });

  // --- internal: required reinforcement strength (C.2.2.3) --------------------------------------------------------
  const TfF = (0.9 * i.Tf) / 2.25; // Eq. 93 (errata)
  const qBridgeF = Vapp - (1.5 * i.qrb + 1.75 * i.qt); // the equivalent bridge load (C.3.7.3)
  const qBridge = i.qb + i.qLL - (i.qrb + i.qt);
  const layers: { z: number; hBridge: number; hRb: number; hT: number; hW: number; hF: number; h: number; Treqf: number; Treq: number }[] = [];
  for (let z = svFt; z < i.H - 1e-9; z += svFt) {
    const hBridge = bridgeLateral(qBridgeF, i.b, z, Kar);
    const hRb = 1.5 * i.qrb * Kar;
    const hT = 1.75 * i.qt * Kar;
    const hW = 1.35 * i.gr * z * Kar;
    const hF = hBridge + hRb + hT + hW;
    const h = bridgeLateral(qBridge, i.b, z, Kar) + i.qrb * Kar + i.qt * Kar + i.gr * z * Kar;
    layers.push({ z, hBridge, hRb, hT, hW, hF, h, Treqf: (hF / red) * svFt, Treq: (h / red) * svFt });
  }
  const worstF = layers.reduce((a, l) => (l.Treqf > a.Treqf ? l : a), layers[0]);
  const worst = layers.reduce((a, l) => (l.Treq > a.Treq ? l : a), layers[0]);
  // The bearing bed: Sv/2 under the seat down to the deepest layer that fails at the primary spacing, at least 5 layers.
  const failing = layers.filter((l) => l.Treqf > TfF || l.Treq > i.T2);
  const bedDepth = Math.max(failing.length ? Math.max(...failing.map((l) => l.z)) : 0, (5 * svFt) / 2);
  const bedLayers = Math.ceil(bedDepth / (svFt / 2) - 1e-9);
  // With the bearing bed, the spacing halves there: the requirement is checked at the spacing each layer has.
  const redHalf = 0.7 ** (i.Sv / 2 / (6 * i.dmax));
  const TreqfDesign = Math.max(...layers.map((l) => (l.z <= bedDepth + 1e-9 ? (l.hF / redHalf) * (svFt / 2) : l.Treqf)));
  const TreqDesign = Math.max(...layers.map((l) => (l.z <= bedDepth + 1e-9 ? (l.h / redHalf) * (svFt / 2) : l.Treq)));
  add({ id: "treq", name: `Required strength, factored, with the bearing bed (${bedLayers} layers at ${i.Sv / 2} in. to ${bedDepth.toFixed(2)} ft): Treq,f ≤ 0.9·Tf/2.25`, demand: TreqfDesign, capacity: TfF, unit: "lb/ft", ref: "Guide Eqs. 84, 86–93" });
  add({ id: "t2", name: "Required strength, unfactored: Treq ≤ T at 2% strain", demand: TreqDesign, capacity: i.T2, unit: "lb/ft", ref: "Guide Eq. 85, C.2.2.3" });

  return {
    ok: checks.every((c) => c.ok || c.advisory),
    checks,
    layout: L,
    K: { Kab, Kar, Kpr },
    sliding: { W, Fb, Frb, Ft, FR, WtR, RR },
    bearing: { WRSF, Wface, MD, MR, VR, eB, Beff, sigma, qn, ...bf },
    global: glob,
    capacity: { Vapp, red, qnAn, qnUse },
    deform: { ev, Dv, bqvol, DL, eL },
    reinf: { TfF, layers, worstF, worst, bedDepth, bedLayers, TreqfDesign, TreqDesign },
    xRes,
  };
}

export type GrsResult = ReturnType<typeof designGrs>;
