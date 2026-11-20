import type { Check } from "../walls/cip";

// The steel of a cantilever sign structure above its shaft: the pole and the arm as round tapered tubes, their
// connections and their fatigue, AASHTO LRFD Specifications for Structural Supports for Highway Signs, Luminaires, and
// Traffic Signals, 1st Edition (LRFD-LTS-1, 2015). The loads are the Cantilever Sign Foundation's (cantilever.ts: dead
// loads 3.5, wind 3.8, load combinations Table 3.4-1); this adds:
// - the tubes (Section 5): the D/t class (Table 5.7.2-1), flexure (Table 5.8.2-1), compression (5.10.2), shear
//   (5.11.2.1.1) and torsion (5.11.3.1.1), combined by Eqs. 5.12.1-1 to -3 with the moment magnifier B;
// - the anchor bolts (5.16, by AISC Design Guide 1) and the base plate; the arm's bolted flange (5.15);
// - fatigue (Section 11): galloping, natural wind gust and truck-induced gust by the fatigue importance category
//   (Table 11.6-1), at the tube-to-transverse plate welds with their stress concentration factors (Eq. 11.9.3.1-1,
//   Table 11.9.3.1-2) and constant-amplitude fatigue thresholds (Table 11.9.3.1-1);
// - deflection (10.4.2): the pole's top under Service I, its slope under the arm's moment; the arm's tip under the
//   galloping and truck gust loads (8 in, C10.4.2.2).
// kip, ft, in, ksi.

export type Weld = "fillet" | "groove";

export type SignSteel = {
  Fy: number; // ksi, the tubes (ASTM A595 Grade A, 55 ksi)
  /** The sign's weight when it isn't a flat aluminum panel (a dynamic message sign), kip; 0: the panel's. */
  signWeight: number;
  /** A box sign's depth (a dynamic message sign), ft; 0: a flat panel. */
  signDepth: number;
  base: { plateT: number; plateW: number; opening: number; rods: number; rodD: number; rodCircle: number; rodFu: number; standoff: number }; // in; opening: the plate's concentric hole (groove welds)
  flange: { bolts: number; boltD: number; circle: number; plateT: number; opening: number; Fub: number }; // the arm's bolted connection to the pole
  fatigue: {
    category: "I" | "II" | "III";
    vMean: number; // mph, the site's yearly mean wind speed (C11.7.1.2: 11.2 mph unless known)
    galloping: boolean; // susceptible to galloping (flat panels, no damper)
    truck: boolean; // over a traffic lane (truck-induced gust, 11.7.1.3)
    clearance: number; // ft, the road to the sign's or arm's bottom
    poleWeld: Weld; // the pole to the base plate: a fillet-welded socket (detail 5.4) or a full-penetration groove weld (4.4–4.6)
    armWeld: Weld; // the arm to its flange plate
  };
};

export const SIGN_STEEL_DEFAULTS: SignSteel = {
  Fy: 55,
  signWeight: 0,
  signDepth: 0,
  base: { plateT: 2, plateW: 26, opening: 8, rods: 4, rodD: 1.5, rodCircle: 24, rodFu: 125, standoff: 1 },
  flange: { bolts: 6, boltD: 1, circle: 15, plateT: 1.5, opening: 5, Fub: 120 },
  fatigue: { category: "I", vMean: 11.2, galloping: true, truck: true, clearance: 17, poleWeld: "groove", armWeld: "groove" },
};

/** Fatigue importance factors IF for cantilevered sign structures (LRFD-LTS Table 11.6-1): galloping, natural wind, truck gust. */
export const IMPORTANCE: Record<"I" | "II" | "III", { G: number; NW: number; TG: number }> = { I: { G: 1, NW: 1, TG: 1 }, II: { G: 0.7, NW: 0.85, TG: 0.9 }, III: { G: 0.4, NW: 0.7, TG: 0.8 } };

/** A sign's drag coefficient by its aspect ratio (LRFD-LTS Table 3.8.7-1), interpolated. */
export function signCd(ratio: number) {
  const t = [[1, 1.12], [2, 1.19], [5, 1.2], [10, 1.23], [15, 1.3], [20, 1.38]];
  const r = Math.max(1, ratio);
  if (r >= 20) return 1.38;
  for (let k = 1; k < t.length; k++) if (r <= t[k][0]) return t[k - 1][1] + ((t[k][1] - t[k - 1][1]) * (r - t[k - 1][0])) / (t[k][0] - t[k - 1][0]);
  return 1.38;
}

const E = 29000;

/** A round tube's section and resistance (LRFD-LTS Section 5): D outside, t wall, in; L its length (ft) for shear and torsion buckling. */
export function roundTube(D: number, t: number, Fy: number, L: number) {
  const d = D - 2 * t;
  const A = (Math.PI * (D * D - d * d)) / 4;
  const I = (Math.PI * (D ** 4 - d ** 4)) / 64;
  const S = (2 * I) / D;
  const Z = (D ** 3 - d ** 3) / 6;
  const r = Math.sqrt(I / A);
  const lam = D / t;
  const EF = E / Fy;
  // Table 5.7.2-1: λp 0.07 E/Fy; λr 0.31 E/Fy in flexure (0.11 E/Fy in compression); at most 0.45 E/Fy.
  const cls = lam <= 0.07 * EF ? "compact" : lam <= 0.31 * EF ? "noncompact" : lam <= 0.45 * EF ? "slender" : "too slender";
  // Table 5.8.2-1: Mp; Mp (0.77 + 0.016 (E/Fy)/(D/t)); Mp 0.25 (E/Fy)/(D/t).
  const Mp = Fy * Z;
  const Mn = cls === "compact" ? Mp : cls === "noncompact" ? Mp * (0.77 + (0.016 * EF) / lam) : Mp * ((0.25 * EF) / lam); // kip·in
  // Shear (5.11.2.1.1) and torsion (5.11.3.1.1): the larger buckling stress, at most 0.6 Fy.
  const Lin = Math.max(1, L * 12);
  const Fnv = Math.min(0.6 * Fy, Math.max((1.6 * E) / (Math.sqrt(Lin / D) * lam ** 1.25), (0.78 * E) / lam ** 1.5));
  const Fnt = Math.min(0.6 * Fy, Math.max((1.23 * E) / (Math.sqrt(Lin / D) * lam ** 1.25), (0.6 * E) / lam ** 1.5));
  const Vn = (Fnv * A) / 2;
  const C = (Math.PI * (D - t) ** 2 * t) / 2;
  const Tn = Fnt * C; // kip·in
  // Compression (5.10.2): Q for a slender round tube (Eq. 5.10.2.2-1), flexural buckling of a cantilever (K = 2.1).
  const Q = lam > 0.11 * EF ? Math.min(1, (0.038 * EF) / lam + 0.67) : 1;
  const KLr = (2.1 * Lin) / r;
  const Fe = (Math.PI ** 2 * E) / KLr ** 2;
  const Fcr = KLr <= 4.71 * Math.sqrt(E / (Q * Fy)) ? Q * 0.658 ** ((Q * Fy) / Fe) * Fy : 0.877 * Fe;
  const Pn = Fcr * A;
  return { D, t, A, I, S, Z, lam, cls, Mp, Mn, Vn, Tn, Pn, Pe: Fe * A, Fnv, Fnt, C, Q };
}

/**
 * The tube-to-transverse plate weld's fatigue resistance (LRFD-LTS 11.9.3.1): KF (Table 11.9.3.1-2) and KI
 * (Eq. 11.9.3.1-1), and the constant-amplitude fatigue threshold for the nominal stress range by KI
 * (Table 11.9.3.1-1: detail 5.4 for a fillet-welded socket, 4.4–4.6 for a full-penetration groove weld).
 */
export function tubeToPlate(weld: Weld, tube: { D: number; t: number }, plate: { t: number; circle: number; opening: number }) {
  const CBC = plate.circle / tube.D;
  const COP = plate.opening / tube.D;
  const KF =
    weld === "fillet"
      ? 2.2 + 4.6 * (15 * tube.t + 2) * (tube.D ** 1.2 - 10) * (CBC ** 0.03 - 1) * plate.t ** -2.5 // Eq. 11.9.3.1-2
      : 1.35 + 16 * (15 * tube.t + 1) * (tube.D - 5) * ((CBC ** 0.02 - 1) / (4 * COP ** -0.7 - 3)) * plate.t ** -2; // Eq. 11.9.3.1-3
  const KI = (1.76 + 1.83 * tube.t - 4.76 * 0.22 ** KF) * KF; // Eq. 11.9.3.1-1
  const bands = weld === "fillet" ? [[4.0, 7.0], [6.5, 4.5], [7.7, 2.6]] : [[3.0, 10.0], [4.0, 7.0], [6.5, 4.5]];
  const band = bands.find(([k]) => KI <= k + 1e-9);
  const valid = weld === "fillet" ? tube.t >= 0.179 && tube.t <= 0.5 && tube.D >= 8 && tube.D <= 50 && plate.t >= 1.5 && plate.t <= 4 && CBC >= 1.25 && CBC <= 2.5 : tube.t >= 0.179 && tube.t <= 0.625 && tube.D >= 8 && tube.D <= 50 && plate.t >= 1.5 && plate.t <= 4 && CBC >= 1.25 && CBC <= 2.5 && COP >= 0.3 && COP <= 0.9;
  // Outside the equations' range of validity: the detail's lowest threshold (conservative).
  const CAFT = !valid ? bands[bands.length - 1][1] : band ? band[1] : 0;
  return { CBC, COP, KF, KI, CAFT, permitted: !valid || !!band, valid, detail: weld === "fillet" ? "5.4" : "4.4" };
}

export type SignLoads = {
  DC: number;
  pole: { weight: number };
  arm: { weight: number; centroid: number; projCentroid: number; projected: number };
  sign: number; // kip, with its supports
  signOffset: number; // ft
  signArea: number; // ft²
  zArm: number; // ft
  poleLength: number;
  armLength: number;
  Wsign: number;
  Warm: number;
  Wpole: number;
  polePC: number; // ft, the pole's wind centroid
  CdMember: number;
  CdSign: number;
  signLength: number;
  signHeight: number;
};

/** The steel's checks: the pole at its base and the arm at the pole, their connections, fatigue and deflection. */
export function designSignSteel(st: SignSteel, L: SignLoads, tubes: { poleBase: number; poleTop: number; poleWall: number; armBase: number; armEnd: number; armWall: number }) {
  const checks: Check[] = [];
  const add = (c: Omit<Check, "ok"> & { ok?: boolean }) => checks.push({ ...c, ok: c.ok ?? c.demand <= c.capacity + 1e-9 });
  const pole = roundTube(tubes.poleBase, tubes.poleWall, st.Fy, L.poleLength);
  const arm = roundTube(tubes.armBase, tubes.armWall, st.Fy, L.armLength);
  const phi = { f: 0.9, c: 0.9, v: 0.9, T: 0.95 }; // 5.5.3.2

  // --- forces at the pole's base and the arm's root, per combination (Table 3.4-1) ---
  const armDead = L.arm.weight * L.arm.centroid + L.sign * L.signOffset; // kip·ft, about the pole
  const Mwind = (L.Wsign + L.Warm) * L.zArm + L.Wpole * L.polePC; // kip·ft
  const Twind = L.Wsign * L.signOffset + L.Warm * L.arm.projCentroid;
  const armWind = L.Wsign * L.signOffset + L.Warm * L.arm.projCentroid; // the arm bent horizontally at the pole
  const groups = [
    { name: "Strength I", gDC: 1.25, gW: 0 },
    { name: "Extreme I", gDC: 1.1, gW: 1 },
    { name: "Extreme I (min DC)", gDC: 0.9, gW: 1 },
  ];
  const at = groups.map((g) => {
    const P = g.gDC * L.DC;
    const M = Math.hypot(g.gW * Mwind, g.gDC * armDead); // Eq. 5.12.1-4
    const V = g.gW * (L.Wsign + L.Warm + L.Wpole);
    const T = g.gW * Twind;
    const Ma = Math.hypot(g.gDC * armDead, g.gW * armWind);
    const Va = Math.hypot(g.gDC * (L.arm.weight + L.sign), g.gW * (L.Wsign + L.Warm));
    return { ...g, P, M, V, T, Ma, Va };
  });

  /** Eqs. 5.12.1-1 to -3: with torsion over 0.2 of its resistance, the full interaction; otherwise shear and torsion ignored. */
  const interaction = (P: number, BM: number, V: number, T: number, t: ReturnType<typeof roundTube>) => {
    const Pr = phi.c * t.Pn;
    const Mr = phi.f * t.Mn;
    const Tr = phi.T * t.Tn;
    if (T / Tr > 0.2) return P / Pr + BM / Mr + (V / (phi.v * t.Vn) + T / Tr) ** 2;
    return P / Pr >= 0.2 ? P / Pr + (8 / 9) * (BM / Mr) : P / (2 * Pr) + BM / Mr;
  };

  // --- the pole and the arm ---
  add({ id: "pole-class", name: `Pole at its base: D/t ${pole.lam.toFixed(1)}, ${pole.cls}`, demand: pole.lam, capacity: (0.45 * E) / st.Fy, unit: "", ref: "LRFD-LTS Table 5.7.2-1" });
  add({ id: "arm-class", name: `Arm at the pole: D/t ${arm.lam.toFixed(1)}, ${arm.cls}`, demand: arm.lam, capacity: (0.45 * E) / st.Fy, unit: "", ref: "LRFD-LTS Table 5.7.2-1" });
  let poleWorst = { ratio: 0, name: "", B: 1 };
  let armWorst = { ratio: 0, name: "" };
  for (const g of at) {
    const B = 1 / Math.max(0.05, 1 - g.P / pole.Pe); // the moment magnifier for a prismatic member in compression (5.12.1)
    const r = interaction(g.P, B * g.M * 12, g.V, g.T * 12, pole);
    if (r > poleWorst.ratio) poleWorst = { ratio: r, name: g.name, B };
    const ra = interaction(0, g.Ma * 12, g.Va, 0, arm);
    if (ra > armWorst.ratio) armWorst = { ratio: ra, name: g.name };
  }
  add({ id: "pole-combined", name: `Pole at its base: axial, flexure, shear and torsion (${poleWorst.name}, B ${poleWorst.B.toFixed(3)})`, demand: poleWorst.ratio, capacity: 1, unit: "", ref: "LRFD-LTS Eqs. 5.12.1-1 to -3" });
  add({ id: "arm-combined", name: `Arm at the pole: flexure and shear (${armWorst.name})`, demand: armWorst.ratio, capacity: 1, unit: "", ref: "LRFD-LTS Eqs. 5.12.1-1 to -3" });

  // --- the anchor bolts (5.16: AISC Design Guide 1) and the base plate ---
  const b = st.base;
  const nt = Math.max(4.5, Math.round((13 / (b.rodD + 0.5)) * 2) / 2 + 2); // threads per inch
  const An = 0.7854 * (b.rodD - 0.9743 / nt) ** 2;
  const Ab = (Math.PI * b.rodD ** 2) / 4;
  const ext = at[1];
  const rodT = (4 * ext.M * 12) / (b.rods * b.rodCircle) - ext.P / b.rods; // kip, the farthest rod (elastic, circular pattern)
  const rodC = (4 * ext.M * 12) / (b.rods * b.rodCircle) + ext.P / b.rods;
  const rodV = ext.V / b.rods + (ext.T * 12) / (b.rods * (b.rodCircle / 2));
  const Rnt = 0.75 * b.rodFu * An; // φ 0.75, fracture in the net section (5.5.3.2)
  const Rnv = 0.75 * 0.45 * b.rodFu * Ab; // threads included
  add({ id: "rod-tension", name: `Anchor bolts: ${b.rods} of ${b.rodD} in on a ${b.rodCircle} in circle, tension`, demand: Math.max(0, rodT), capacity: Rnt, unit: "kip", ref: "LRFD-LTS 5.16.3 (AISC Design Guide 1)" });
  add({ id: "rod-compression", name: "Anchor bolts: compression (double-nut, leveling nuts)", demand: rodC, capacity: Rnt, unit: "kip", ref: "LRFD-LTS 5.16.3" });
  add({ id: "rod-combined", name: "Anchor bolts: tension and shear", demand: (Math.max(0, rodT) / Rnt) ** 2 + (rodV / Rnv) ** 2, capacity: 1, unit: "", ref: "LRFD-LTS 5.16.3 (AISC Design Guide 1)" });
  add({ id: "rod-standoff", name: "Leveling nut stand-off at most the bolt's diameter (bolts not in bending)", demand: b.standoff, capacity: b.rodD, unit: "in", ref: "Good practice (FHWA); LRFD-LTS Figure C5.16-1", advisory: true, ok: b.standoff <= b.rodD });
  // The base plate: each bolt's force bending the plate about the pole's face over its share of the circle.
  const arm2 = Math.max(0.5, (b.rodCircle - pole.D) / 2);
  const beff = Math.min((Math.PI * b.rodCircle) / b.rods, 2 * arm2 + pole.D / 2);
  const tReq = Math.sqrt((4 * Math.max(rodT, rodC) * arm2) / (0.9 * st.Fy * Math.max(1, beff)));
  add({ id: "base-plate", name: `Base plate thickness (bolts' force about the pole's face, over ${beff.toFixed(1)} in)`, demand: tReq, capacity: b.plateT, unit: "in", ref: "LRFD-LTS 5.16.3 (AISC Design Guide 1), φ 0.90" });
  // A square plate with the bolts on its diagonals: each bolt's distance from the center along a side, plus 1.5 d.
  add({ id: "base-width", name: "Base plate: the bolts' edge distance (1.5 d) inside the square plate", demand: b.rodCircle / (2 * Math.SQRT2) + 1.5 * b.rodD, capacity: b.plateW / 2 + 1e-6, unit: "in", ref: "Detailing" });

  // --- the arm's flange bolts (5.15: LRFD Design 6.13.2) ---
  const f = st.flange;
  const boltT = (4 * Math.max(...at.map((g) => g.Ma)) * 12) / (f.bolts * f.circle);
  const boltV = Math.max(...at.map((g) => g.Va)) / f.bolts;
  const fbAb = (Math.PI * f.boltD ** 2) / 4;
  const Rt = 0.8 * 0.76 * f.Fub * fbAb; // AASHTO LRFD 6.13.2.10.2
  const Rv = 0.8 * 0.45 * f.Fub * fbAb; // 6.13.2.12, threads included
  add({ id: "flange-bolts", name: `Arm flange: ${f.bolts} bolts of ${f.boltD} in, tension and shear`, demand: (boltT / Rt) ** 2 + (boltV / Rv) ** 2, capacity: 1, unit: "", ref: "LRFD-LTS 5.15, AASHTO LRFD 6.13.2.11" });

  // --- fatigue (Section 11): stress ranges at the welds against the thresholds by KI ---
  const F = st.fatigue;
  const IF = IMPORTANCE[F.category];
  const depth = Math.max(0, st.signDepth);
  // Natural wind gust (11.7.1.2, Eq. C11.7.1.2-1): 5.2 Cd IF (Vmean/11.2)² psf, horizontal, on every member and the sign.
  const pNW = (Cd: number) => 5.2 * Cd * IF.NW * (F.vMean / 11.2) ** 2;
  const NWsign = (pNW(L.CdSign) * L.signArea) / 1000;
  const NWarm = (pNW(L.CdMember) * L.arm.projected) / 1000;
  const NWpole = (pNW(L.CdMember) * (((tubes.poleBase + tubes.poleTop) / 24) * L.poleLength)) / 1000;
  const MNWpole = (NWsign + NWarm) * L.zArm + NWpole * L.polePC;
  const MNWarm = NWsign * L.signOffset + NWarm * L.arm.projCentroid;
  // Galloping (11.7.1.1): 21 IF psf, vertical, on the sign's area in elevation (flat panels).
  const Gv = F.galloping && depth === 0 ? (21 * IF.G * L.signArea) / 1000 : 0;
  const MGarm = Gv * L.signOffset;
  // Truck-induced gust (11.7.1.3): 18.8 Cd IF psf, vertical, on the horizontal projection over any 12 ft (here the
  // arm's end), full to 20 ft above the road and none at 33 ft.
  const red = F.truck ? Math.max(0, Math.min(1, (33 - F.clearance) / (33 - 20))) : 0;
  const strip = Math.min(12, L.signLength);
  const CdTG = depth > 0 ? signCd(L.signLength / depth) : L.CdMember;
  const TGsign = (18.8 * CdTG * IF.TG * red * strip * Math.max(depth, tubes.armEnd / 12)) / 1000;
  const MTGarm = TGsign * (L.signOffset + (L.signLength - strip) / 2);
  const poleWeld = tubeToPlate(F.poleWeld, { D: tubes.poleBase, t: tubes.poleWall }, { t: b.plateT, circle: b.rodCircle, opening: b.opening });
  const armWeld = tubeToPlate(F.armWeld, { D: tubes.armBase, t: tubes.armWall }, { t: f.plateT, circle: f.circle, opening: f.opening });
  const weldName = (w: ReturnType<typeof tubeToPlate>, weld: Weld) => `${weld === "fillet" ? "fillet-welded socket" : "groove weld"}, KI ${w.KI.toFixed(2)}`;
  if (!poleWeld.valid) add({ id: "fat-pole-range", name: "Pole's base plate weld: outside the stress concentration factor's range of validity", demand: 1, capacity: 0, unit: "", ref: "LRFD-LTS Table 11.9.3.1-2", ok: false, advisory: true });
  if (!armWeld.valid) add({ id: "fat-arm-range", name: "Arm's flange weld: outside the stress concentration factor's range of validity", demand: 1, capacity: 0, unit: "", ref: "LRFD-LTS Table 11.9.3.1-2", ok: false, advisory: true });
  const fat = [
    { name: "Natural wind gust", pole: MNWpole, arm: MNWarm },
    { name: "Galloping", pole: MGarm, arm: MGarm },
    { name: "Truck-induced gust", pole: MTGarm, arm: MTGarm },
  ].filter((x) => x.arm > 0 || x.pole > 0);
  for (const x of fat) {
    add({ id: `fat-pole-${x.name}`, name: `Fatigue, ${x.name.toLowerCase()}: pole at its base plate (${weldName(poleWeld, F.poleWeld)})`, demand: (x.pole * 12) / pole.S, capacity: poleWeld.CAFT, unit: "ksi", ref: `LRFD-LTS 11.7, Table 11.9.3.1-1 detail ${poleWeld.detail}` });
    add({ id: `fat-arm-${x.name}`, name: `Fatigue, ${x.name.toLowerCase()}: arm at its flange plate (${weldName(armWeld, F.armWeld)})`, demand: (x.arm * 12) / arm.S, capacity: armWeld.CAFT, unit: "ksi", ref: `LRFD-LTS 11.7, Table 11.9.3.1-1 detail ${armWeld.detail}` });
  }

  // --- deflection (10.4.2) ---
  const armI = roundTube((tubes.armBase + tubes.armEnd) / 2, tubes.armWall, st.Fy, L.armLength).I; // the tapered tubes at their mean diameter
  const poleI = roundTube((tubes.poleBase + tubes.poleTop) / 2, tubes.poleWall, st.Fy, L.poleLength).I;
  const Hp = L.zArm * 12;
  // The pole's top under Service I (dead load and wind): 2.5% of the height (10.4.2.1).
  const dPole = ((L.Wsign + L.Warm) * Hp ** 3) / (3 * E * poleI) + (L.Wpole * (L.poleLength * 12) ** 3) / (8 * E * poleI);
  add({ id: "pole-deflection", name: "Pole's top under Service I wind", demand: dPole, capacity: 0.025 * L.poleLength * 12, unit: "in", ref: "LRFD-LTS 10.4.2.1 (2.5% of the height)" });
  // Its slope under the arm's dead load moment: 0.35 in/ft (10.4.2.1).
  const slope = ((armDead * 12 * Hp) / (E * poleI)) * 12; // in/ft
  add({ id: "pole-slope", name: "Pole's slope at its top under the arm's moment", demand: slope, capacity: 0.35, unit: "in/ft", ref: "LRFD-LTS 10.4.2.1" });
  // The arm's tip under the galloping and truck gust loads: 8 in vertically (C10.4.2.2, NCHRP Report 412).
  const La = L.armLength * 12;
  const tip = (P: number, a: number) => (P * (a * 12) ** 2 * (3 * La - a * 12)) / (6 * E * armI);
  const dVib = Math.max(tip(Gv, L.signOffset), tip(TGsign, L.signOffset + (L.signLength - strip) / 2));
  if (dVib > 0) add({ id: "arm-vibration", name: "Arm's tip under galloping or truck gust, vertical", demand: dVib, capacity: 8, unit: "in", ref: "LRFD-LTS C10.4.2.2 (NCHRP Report 412)", advisory: true, ok: dVib <= 8 });
  // The arm's dead load deflection, for its camber (no limit, C10.4.2.2).
  const dArm = (L.sign * (L.signOffset * 12) ** 2 * (3 * La - L.signOffset * 12)) / (6 * E * armI) + (L.arm.weight * La ** 3) / (8 * E * armI);

  return { ok: checks.every((c) => c.ok || c.advisory), checks, pole, arm, at, rods: { An, Ab, rodT, rodC, rodV, Rnt, Rnv, tReq, beff }, flange: { boltT, boltV, Rt, Rv }, fatigue: { IF, NWsign, NWarm, NWpole, MNWpole, MNWarm, Gv, MGarm, TGsign, MTGarm, red, CdTG, poleWeld, armWeld }, deflection: { dPole, slope, dVib, dArm } };
}
