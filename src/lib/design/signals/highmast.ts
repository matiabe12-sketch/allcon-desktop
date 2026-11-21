import { DesignError, type Check } from "../walls/cip";
import type { TakeoffSettings } from "../takeoff/types";
import { designShaft, Kz, roundCd, type ShaftGroup, type ShaftPart } from "../signs/cantilever";
import { broms, torsionResistance, type SoilKind, type TorsionMethod } from "./foundation";

// The drilled shaft (caisson) under a high-mast lighting tower. CDOT buys the tower on a performance specification and
// shows its foundation on the plans (project special detail D-613-2, 120 ft mounting height at most); the tower's
// supplier gives the base reactions. This tool designs the caisson for them, as the Traffic Signal Foundation tool does
// for CDOT's standard signals (LRFD-LTS-1):
// - the loads at the shaft's top: the supplier's base reactions (Extreme I, wind, unfactored), or an estimate from the
//   tower: a tapered round tube and the luminaire ring at the top under P = 0.00256·Kz·Kd·G·V²·Cd (psf, LTS Eq.
//   3.8.1-1), Kz by height (Eq. C3.8.4-1), Cd by Cv·V·d (Table 3.8.7-1), the luminaires by their EPA;
// - the load groups of LTS Table 3.4-1 (Strength I 1.25 DC; Extreme I 1.1 or 0.9 DC + 1.0 W);
// - embedment by Broms (LTS 13.6.1.1), the soil's torsion resistance round the shaft against any twist the supplier
//   gives, and the shaft as a concrete member (13.6.2, AASHTO Section 5: axial and bending, shear, ties).
// kip, ft, in.; soil in psf and pcf.

export type HighMastInputs = {
  // Loads: from the supplier, or estimated from the tower
  fromSupplier: boolean;
  P: number; // kip, the tower's dead load at the base
  M: number; // kip·ft, the wind's base moment (Extreme I, unfactored)
  V: number; // kip, the wind's base shear
  T: number; // kip·ft, any twist at the base
  // The tower (for the estimate)
  H: number; // ft, mounting height
  dBase: number; // in., the tube's diameter at its base
  dTop: number; // in.
  wall: number; // in.
  luminaires: number;
  epa: number; // ft², each luminaire's effective projected area
  lumWt: number; // lb, each luminaire
  ringEpa: number; // ft², the ring and the lowering device
  ringWt: number; // lb
  wind: number; // mph, LTS Figure 3.8-1 (the 1700-year map for high-mast towers)
  Kd: number; // LTS Table 3.8.5-1
  G: number; // LTS 3.8.5
  // Anchor bolts (from the supplier)
  boltCircle: number; // in.
  // Shaft
  shaftD: number; // in.
  shaftLength: number; // ft
  bars: number;
  bar: number;
  spiral: number;
  pitch: number; // in.
  cover: number; // in.
  fc: number; // ksi
  fy: number; // ksi
  soil: SoilKind;
  c: number; // psf
  phi: number; // deg
  gamma: number; // pcf
  N60: number;
  phiLateral: number;
  phiTorsion: number;
  torsionMethod: TorsionMethod;
  takeoff?: TakeoffSettings;
};

export const HIGH_MAST_DEFAULTS: HighMastInputs = {
  fromSupplier: false,
  P: 0,
  M: 0,
  V: 0,
  T: 0,
  H: 100,
  dBase: 24,
  dTop: 9,
  wall: 0.3125,
  luminaires: 6,
  epa: 3.3,
  lumWt: 70,
  ringEpa: 8,
  ringWt: 600,
  wind: 115,
  Kd: 0.95,
  G: 1.14,
  boltCircle: 30,
  shaftD: 48,
  shaftLength: 22,
  bars: 16,
  bar: 9,
  spiral: 4,
  pitch: 6,
  cover: 3,
  fc: 4.5,
  fy: 60,
  soil: "cohesionless",
  c: 1500,
  phi: 32,
  gamma: 120,
  N60: 20,
  phiLateral: 1,
  phiTorsion: 0.8,
  torsionMethod: "cdot",
};

/** The tower's dead load and wind at its base, from its tube and luminaire ring (LTS 3.5, 3.8). */
export function towerLoads(i: HighMastInputs) {
  const n = 40;
  const dz = i.H / n;
  let W = 0;
  let F = 0;
  let M = 0;
  const parts: { z: number; d: number; q: number; Cd: number; F: number }[] = [];
  for (let k = 0; k < n; k++) {
    const z = (k + 0.5) * dz;
    const d = (i.dBase + ((i.dTop - i.dBase) * z) / i.H) / 12; // ft
    const qz = 0.00256 * Kz(z) * i.Kd * i.G * i.wind ** 2 / 1000; // ksf without Cd
    const Cd = roundCd(i.wind * d);
    const f = qz * Cd * d * dz;
    F += f;
    M += f * z;
    W += (Math.PI * d * 12 * i.wall * 490 * dz) / 144 / 1000; // kip (the wall's area, in², × 490 pcf)
    if (k % 8 === 0) parts.push({ z, d, q: qz, Cd, F: f });
  }
  const qTop = 0.00256 * Kz(i.H) * i.Kd * i.G * i.wind ** 2 / 1000;
  const Fl = qTop * (i.luminaires * i.epa + i.ringEpa); // the luminaires' EPA includes their drag
  F += Fl;
  M += Fl * i.H;
  W += (i.luminaires * i.lumWt + i.ringWt) / 1000;
  return { W, F, M, Fl, qTop, parts };
}

export function designHighMast(i: HighMastInputs) {
  if (!(i.shaftD > 0 && i.shaftLength > 0)) throw new DesignError("The caisson needs a diameter and a length.");
  if (!i.fromSupplier && !(i.H > 0 && i.dBase > 0)) throw new DesignError("The tower needs a height and a base diameter.");
  const checks: Check[] = [];
  const add = (c: Omit<Check, "ok"> & { ok?: boolean }) => checks.push({ ...c, ok: c.ok ?? c.demand <= c.capacity });
  const D = i.shaftD / 12;
  const c = i.c / 1000;
  const gamma = i.gamma / 1000;
  const est = towerLoads(i);
  const base = i.fromSupplier ? { P: i.P, M: i.M, V: i.V, T: i.T } : { P: est.W, M: est.M, V: est.F, T: 0 };

  // LTS Table 3.4-1 at the shaft's top.
  const groups = [
    { name: "Strength I", gDC: 1.25, gW: 0 },
    { name: "Extreme I (max)", gDC: 1.1, gW: 1 },
    { name: "Extreme I (min)", gDC: 0.9, gW: 1 },
  ].map((g) => ({ ...g, P: g.gDC * base.P, M: g.gW * base.M, V: g.gW * base.V, T: g.gW * base.T }));
  const ext = groups[1];

  // Embedment (Broms, LTS 13.6.1.1), the soil's strength × φ.
  const br = broms(i.soil, ext.M, ext.V, D, c * i.phiLateral, gamma * i.phiLateral, i.phi);
  add({ id: "embedment", name: `Embedment for overturning (Broms, ${i.soil} soil)`, demand: br.L, capacity: i.shaftLength, unit: "ft", ref: "LRFD-LTS 13.6.1.1, Eq. C13.6.1.1-" + (i.soil === "cohesive" ? "1" : "5") });
  const tor = torsionResistance(i.soil, i.shaftLength, D, c, gamma, i.phi, i.torsionMethod, i.N60);
  if (base.T > 0) add({ id: "soil-torsion", name: "Torsion: the soil's side resistance round the shaft", demand: ext.T, capacity: i.phiTorsion * tor.Tn, unit: "kip·ft", ref: i.torsionMethod === "cdot" ? "As CDOT's standard caissons" : "AASHTO 10.8.3.5" });

  const part: ShaftPart = {
    shaftD: i.shaftD,
    shaftLength: i.shaftLength,
    cover: i.cover,
    bars: i.bars,
    bar: i.bar,
    tieBar: i.spiral,
    tieSpacing: i.pitch,
    fc: i.fc,
    fy: i.fy,
    phiM: 0.75,
    qp: i.soil === "cohesive" ? 9 * c : Math.min(1.2 * i.N60, 60),
    qs: tor.qs,
    phiQp: 0.4,
    phiQs: 0.45,
    sideLength: i.shaftLength,
    pyMoment: br.Mu,
    pyShear: ext.V,
  };
  const sg: ShaftGroup[] = groups.map((g) => ({ gW: g.gW, P: g.P, M: g.M, T: g.T, V: g.V }));
  const shaft = designShaft(part, sg);
  checks.push(...shaft.checks.map((x) => (x.id === "axial" ? { ...x, name: "Axial resistance (tip and side)" } : x)));
  // The anchor bolts sit inside the cage with room: the bolt circle at least 6 in. inside the shaft's face each side.
  add({ id: "bolts", name: "Anchor bolt circle + 2 × 6 in. ≤ the shaft's diameter", demand: i.boltCircle + 12, capacity: i.shaftD, unit: "in.", ref: "Detailing (the bolts inside the cage)", advisory: true });
  add({ id: "height", name: "Mounting height ≤ 120 ft (CDOT D-613-2)", demand: i.fromSupplier ? 0 : i.H, capacity: 120, unit: "ft", ref: "CDOT D-613-2", advisory: true });

  return { ok: checks.every((x) => x.ok || x.advisory), checks, est, base, groups, broms: br, torsionSoil: tor, shaft: shaft.shaft };
}

export type HighMastResult = ReturnType<typeof designHighMast>;
