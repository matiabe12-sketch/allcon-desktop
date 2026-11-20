import { DesignError, type Check } from "../walls/cip";

// Pot and disc bearings (high-load multirotational), AASHTO LRFD 10th Edition: the pot bearing (14.7.4) and the disc
// bearing (14.7.8), fixed, guided (one direction free, guide bars) or free (non-guided), with the PTFE sliding surface
// on top where they slide (14.7.2), the guides (14.7.9), the masonry and sole plates and the anchor rods (14.8), and
// the concrete under the masonry plate (5.6.5). Design rotation by 14.4.2.1. The pot's method and its worked example
// are the AISI/NSBA Steel Bridge Bearing Design Guide's (Vol. II, Ch. 4); the shear restriction force WisDOT's reading of
// 14.7.8.4. Kip and inch.

export type HlmrInputs = {
  kind: "pot" | "disc";
  fixity: "fixed" | "guided" | "free";
  /** Service loads per bearing (kip): permanent (DC + DW), live with IM, and the least permanent load (for lift-off). */
  DL: number;
  LL: number;
  minLoad: number;
  /** Horizontal forces (kip): factored (Strength and Extreme Event, the largest) and at service. */
  Hu: number;
  Hs: number;
  /** rad: the largest rotation at the strength limit state, about any axis; the construction tolerance (14.4.2.1). */
  rotation: number;
  construction: number;
  Fy: number; // ksi, the steel (pot, piston, plates)
  fc: number; // ksi, the concrete under the masonry plate
  fcGirder: number; // ksi, a concrete girder over the sole plate (0: a steel girder)
  pot: {
    Dp: number; // in, the pot's inside diameter (the pad's)
    hr: number; // in, the elastomeric pad
    rings: { type: "flat" | "circular"; count: number; width: number; thickness: number }; // flat: width × thickness; circular: width = its diameter
    tw: number; // in, the pot wall
    tBase: number; // in, the pot's base
    cavity: number; // in, the pot's inside depth, base to the wall's top
    tPiston: number; // in
    rim: number; // in, the piston rim's contact width (its height against the wall)
    clearance: number; // in, the piston's rim to the wall
  };
  disc: {
    Dd: number; // in
    td: number; // in
    E: number; // ksi, the urethane's apparent compressive modulus (the manufacturer's)
    tUpper: number; // in, the upper steel plate
    tLower: number; // in, the lower steel plate
    pin: number; // in, the shear pin's diameter
  };
  /** The sliding surface (guided and free): PTFE recessed in the piston or upper plate, and the stainless plate above it. */
  ptfe: { D: number; t: number; mu: number; movement: number }; // in (PTFE disc), in, the friction coefficient, in (the total movement, ±)
  guides: { b: number; h: number; L: number }; // in, each guide bar's width, height and length
  masonry: { B: number; L: number; t: number; A2: number }; // in; A2 (in²) the supporting concrete's area for √(A2/A1)
  sole: { B: number; L: number; t: number }; // in
  anchors: { n: number; d: number; Fu: number }; // anchor rods through the masonry plate
};

export const HLMR_DEFAULTS: HlmrInputs = {
  kind: "pot",
  fixity: "guided",
  DL: 600,
  LL: 250,
  minLoad: 400,
  Hu: 75,
  Hs: 50,
  rotation: 0.01,
  construction: 0.005,
  Fy: 50,
  fc: 4,
  fcGirder: 0,
  pot: { Dp: 18, hr: 1.25, rings: { type: "flat", count: 3, width: 0.375, thickness: 0.0938 }, tw: 1.375, tBase: 1.375, cavity: 2.25, tPiston: 1.25, rim: 0.375, clearance: 0.03 },
  disc: { Dd: 16, td: 1.5, E: 60, tUpper: 1, tLower: 1, pin: 2.5 },
  ptfe: { D: 17, t: 0.1875, mu: 0.06, movement: 3 },
  guides: { b: 1.5, h: 2, L: 20 },
  masonry: { B: 28, L: 28, t: 1.75, A2: 42 * 42 },
  sole: { B: 24, L: 26, t: 1.5 },
  anchors: { n: 4, d: 1.25, Fu: 75 },
};

const PI = Math.PI;
/** in, the stainless sheet on the sole plate (16 gauge). */
export const STAINLESS = 0.0625;
const circle = (D: number) => (PI * D * D) / 4;

/** The design rotation (14.4.2.1): the strength rotation, 0.005 rad for uncertainty and the construction tolerance. */
export const designRotation = (i: Pick<HlmrInputs, "rotation" | "construction">) => Math.abs(i.rotation) + 0.005 + Math.max(0, i.construction);

/** The least pot or disc that meets the provisions for these loads, rounded up to ⅛ in (the plates to the next ¼ in). */
export function sizeHlmr(i: HlmrInputs): HlmrInputs {
  const up = (v: number, s = 0.125) => Math.ceil(v / s - 1e-9) * s;
  const P = i.DL + i.LL;
  const Pu = 1.25 * i.DL + 1.75 * i.LL;
  const tu = designRotation(i);
  const out: HlmrInputs = structuredClone(i);
  if (i.kind === "pot") {
    const Dp = up(Math.sqrt((4 * P) / (PI * 3.5)), 0.25);
    const hr = up(Math.max(3.33 * tu * Dp, 0.5));
    const w = up(Math.max(0.02 * Dp, 0.25), 0.0625);
    const rings = i.pot.rings.type === "flat" ? { type: "flat" as const, count: 3, width: w, thickness: up(0.2 * w, 0.03125) } : { type: "circular" as const, count: 1, width: up(Math.max(0.0175 * Dp, 0.375), 0.0625), thickness: 0 };
    const su = Pu / circle(Dp);
    const tw = up(Math.max((Dp * su) / (2 * 0.9 * i.Fy), Math.sqrt((40 * Math.max(i.Hu, 0) * tu) / i.Fy), 0.5));
    const rim = up(Math.max((2.5 * i.Hu) / (Dp * i.Fy), 0.25), 0.0625);
    const clearance = Math.max(0.02, tu * (rim - (tu * Dp) / 2));
    const cavity = up(hr + 0.5 * tu * Dp + rim + 0.125);
    out.pot = { Dp, hr, rings, tw, tBase: up(Math.max(tw, 0.06 * Dp, 0.75)), cavity, tPiston: up(Math.max(0.06 * Dp, 0.75)), rim, clearance: Math.ceil(clearance * 100) / 100 };
  } else {
    const Dd = up(Math.sqrt((4 * P) / (PI * 5)), 0.25);
    // Thick enough that the minimum load keeps it compressed at its edge through θu, thin enough for 10% at full load.
    const td = up(Math.max(1, (tu * Dd * i.disc.E) / (2 * Math.max(1e-6, i.minLoad / circle(Dd)))), 0.125);
    const H = Math.max(i.Hu, 0.15 * P);
    const pin = up(Math.sqrt((4 * H) / (PI * 0.58 * i.Fy)), 0.25);
    out.disc = { ...i.disc, Dd, td, tUpper: up(0.045 * Dd, 0.25), tLower: up(0.06 * Dd, 0.25), pin };
  }
  const D0 = i.kind === "pot" ? out.pot.Dp + 2 * out.pot.tw : out.disc.Dd + 2;
  const A1 = Pu / (0.7 * 0.85 * i.fc * Math.min(2, Math.sqrt(Math.max(1, i.masonry.A2 / Math.max(1, D0 * D0)))));
  const side = up(Math.max(Math.sqrt(A1), D0 + 6), 1);
  const q = Pu / (side * side);
  const c = (side - D0) / 2;
  out.masonry = { ...i.masonry, B: side, L: side, t: up(Math.max(c * Math.sqrt((2 * q) / (0.9 * i.Fy)), 1), 0.25) };
  if (i.fixity !== "fixed") out.ptfe = { ...i.ptfe, D: up(Math.max(Math.sqrt((4 * P) / (PI * 4.5)), Math.sqrt((4 * i.DL) / (PI * 3.0))), 0.25) };
  // The sole plate long enough for the stainless over the PTFE's travel, and wide enough for it.
  if (i.fixity !== "fixed") out.sole = { ...i.sole, L: Math.max(i.sole.L, up(out.ptfe.D + 2 * i.ptfe.movement + 2, 1)), B: Math.max(i.sole.B, up(out.ptfe.D + 2, 1)) };
  return out;
}

export function designHlmr(i: HlmrInputs) {
  const checks: Check[] = [];
  const add = (c: Omit<Check, "ok"> & { ok?: boolean }) => checks.push({ ...c, ok: c.ok ?? c.demand <= c.capacity + 1e-9 });
  if (!(i.DL > 0)) throw new DesignError("Give the bearing's permanent load.");
  const P = i.DL + i.LL; // kip, service
  const Pu = 1.25 * i.DL + 1.75 * i.LL; // kip, Strength I (DC and DW taken at 1.25 together, LL with IM at 1.75)
  const tu = designRotation(i);
  const sliding = i.fixity !== "fixed";
  let pot: null | { A: number; s: number; su: number; hrMin: number; ringMin: { width: number; thickness: number }; twV: number; twH: number; baseMin: number; pistonMin: number; rimMin: number; clearMin: number; cavityMin: number; D0: number; height: number } = null;
  let disc: null | { A: number; s: number; defl: number; dmin: number; edge: number; H: number; pinR: number; upperMin: number; lowerMin: number; D0: number; height: number } = null;

  if (i.kind === "pot") {
    const p = i.pot;
    if (!(p.Dp > 0 && p.hr > 0 && p.tw > 0)) throw new DesignError("Give the pot's diameter, the pad's depth and the wall's thickness.");
    const A = circle(p.Dp);
    const s = P / A;
    const su = Pu / A;
    add({ id: "pot-stress", name: "Elastomer: average compressive stress at service", demand: s, capacity: 3.5, unit: "ksi", ref: "AASHTO 14.7.4.3" });
    add({ id: "pot-min-load", name: "Minimum vertical load: at least 20% of the vertical design load", demand: 0.2 * P, capacity: i.minLoad, unit: "kip", ref: "AASHTO 14.7.4.1" });
    const hrMin = 3.33 * tu * p.Dp;
    add({ id: "pot-hr", name: `Elastomeric pad's depth, 3.33 θu Dp (θu ${tu.toFixed(4)} rad)`, demand: hrMin, capacity: p.hr, unit: "in", ref: "AASHTO 14.7.4.3" });
    const r = p.rings;
    const ringMin = r.type === "flat" ? { width: Math.max(0.02 * p.Dp, 0.25), thickness: 0.2 * Math.max(0.02 * p.Dp, 0.25) } : { width: Math.max(0.0175 * p.Dp, 0.375), thickness: 0 };
    add({ id: "pot-ring-width", name: r.type === "flat" ? `Sealing rings: ${r.count} flat brass rings' width` : "Sealing ring: the circular brass ring's diameter", demand: ringMin.width, capacity: r.width, unit: "in", ref: "AASHTO 14.7.4.5" });
    if (r.type === "flat") {
      add({ id: "pot-ring-thick", name: "Sealing rings: each flat ring's thickness, 0.2 of its width", demand: 0.2 * r.width, capacity: r.thickness, unit: "in", ref: "AASHTO 14.7.4.5" });
      add({ id: "pot-ring-recess", name: "Sealing rings: their recess no more than a third of the pad (the strain under it)", demand: r.count * r.thickness, capacity: p.hr / 3, unit: "in", ref: "Steel Bridge Bearing Design Guide, C14.7.4.5", advisory: true });
    }
    const twV = (p.Dp * su) / (2 * 0.9 * i.Fy);
    const twH = Math.sqrt((40 * Math.max(0, i.Hu) * tu) / i.Fy);
    add({ id: "pot-wall", name: "Pot wall: the pad's pressure, Dp σu / (2 φ Fy)", demand: twV, capacity: p.tw, unit: "in", ref: "AASHTO 14.7.4.6" });
    if (i.fixity !== "free") add({ id: "pot-wall-h", name: "Pot wall: the horizontal force, √(40 Hu θu / Fy)", demand: twH, capacity: p.tw, unit: "in", ref: "AASHTO 14.7.4.6" });
    const baseMin = Math.max(0.06 * p.Dp, 0.75, p.tw);
    add({ id: "pot-base", name: "Pot base: at least 0.06 Dp and ¾ in (on the masonry plate's bedding), and the wall's thickness", demand: baseMin, capacity: p.tBase, unit: "in", ref: "AASHTO 14.7.4.6" });
    const pistonMin = 0.06 * p.Dp;
    add({ id: "pot-piston", name: "Piston: at least 0.06 Dp", demand: pistonMin, capacity: p.tPiston, unit: "in", ref: "AASHTO 14.7.4.7" });
    const rimMin = (2.5 * Math.max(0, i.Hu)) / (p.Dp * i.Fy);
    if (i.fixity !== "free") add({ id: "pot-rim", name: "Piston rim: contact width for the horizontal force, 2.5 Hu / (Dp Fy)", demand: rimMin, capacity: p.rim, unit: "in", ref: "AASHTO 14.7.4.7" });
    const clearMin = Math.max(0.02, tu * (p.rim - (tu * p.Dp) / 2));
    add({ id: "pot-clearance", name: "Piston rim to the pot wall: clearance for the rotation, θu (w − θu Dp / 2), at least 0.02 in", demand: clearMin, capacity: p.clearance, unit: "in", ref: "AASHTO 14.7.4.7" });
    const ringsT = r.type === "flat" ? r.count * r.thickness : r.width;
    const cavityMin = p.hr + 0.5 * tu * p.Dp + p.rim + 0.125;
    add({ id: "pot-cavity", name: "Pot's depth: the pad, ½ θu Dp, the piston's rim and ⅛ in (the piston can't leave the pot)", demand: cavityMin, capacity: p.cavity, unit: "in", ref: "AASHTO C14.7.4.3" });
    const D0 = p.Dp + 2 * p.tw;
    const height = p.tBase + p.cavity + Math.max(0, p.tPiston - (p.cavity - p.hr)) + (sliding ? i.ptfe.t / 2 + STAINLESS : 0);
    void ringsT;
    pot = { A, s, su, hrMin, ringMin, twV, twH, baseMin, pistonMin, rimMin, clearMin, cavityMin, D0, height };
  } else {
    const d = i.disc;
    if (!(d.Dd > 0 && d.td > 0 && d.E > 0)) throw new DesignError("Give the disc's diameter, thickness and modulus.");
    const A = circle(d.Dd);
    const s = P / A;
    add({ id: "disc-stress", name: "Urethane disc: average compressive stress", demand: s, capacity: 5.0, unit: "ksi", ref: "AASHTO 14.7.8.3" });
    const defl = (s * d.td) / d.E;
    add({ id: "disc-deflection", name: `Urethane disc: instantaneous deflection under the total load (E ${d.E} ksi)`, demand: defl, capacity: 0.1 * d.td, unit: "in", ref: "AASHTO 14.7.8.3" });
    const dmin = ((i.minLoad / A) * d.td) / d.E; // the disc's compression under the least load
    const edge = (tu * d.Dd) / 2; // the edge's movement from the rotation
    add({ id: "disc-liftoff", name: "No lift-off: the least load's compression at least the rotation's θu Dd / 2 at the edge", demand: edge, capacity: dmin, unit: "in", ref: "AASHTO 14.7.8.3" });
    const H = Math.max(i.Hu, 0.15 * P);
    const pinR = 1.0 * 0.58 * i.Fy * circle(d.pin);
    add({ id: "disc-pin", name: `Shear-restricting pin, ${d.pin} in: the larger of Hu and 15% of the service vertical load`, demand: H, capacity: pinR, unit: "kip", ref: "AASHTO 14.7.8.4, 6.10.9.2 (0.58 Fy)" });
    const upperMin = 0.045 * d.Dd;
    const lowerMin = 0.06 * d.Dd;
    add({ id: "disc-upper", name: "Upper steel plate: at least 0.045 Dd (on steel)", demand: upperMin, capacity: d.tUpper, unit: "in", ref: "AASHTO 14.7.8.5" });
    add({ id: "disc-lower", name: "Lower steel plate: at least 0.06 Dd (on grout or the masonry plate's bedding)", demand: lowerMin, capacity: d.tLower, unit: "in", ref: "AASHTO 14.7.8.5" });
    const D0 = d.Dd + 2; // the plates past the disc
    disc = { A, s, defl, dmin, edge, H, pinR, upperMin, lowerMin, D0, height: d.tLower + d.td + d.tUpper + (sliding ? i.ptfe.t / 2 + STAINLESS : 0) };
  }
  const D0 = pot ? pot.D0 : disc!.D0;

  // --- the sliding surface (guided, free) -----------------------------------------------------------------------------
  let slide: null | { A: number; sDead: number; sAll: number; F: number; stainless: number } = null;
  if (sliding) {
    const A = circle(i.ptfe.D);
    const sDead = i.DL / A;
    const sAll = P / A;
    add({ id: "ptfe-dead", name: "PTFE: average contact stress, permanent loads (recessed)", demand: sDead, capacity: 3.0, unit: "ksi", ref: "AASHTO Table 14.7.2.4-1" });
    add({ id: "ptfe-all", name: "PTFE: average contact stress, all loads (recessed)", demand: sAll, capacity: 4.5, unit: "ksi", ref: "AASHTO Table 14.7.2.4-1" });
    add({ id: "ptfe-thick", name: "PTFE: recessed sheet at least 3/16 in thick", demand: 0.1875, capacity: i.ptfe.t, unit: "in", ref: "AASHTO 14.7.2.2" });
    const stainless = i.ptfe.D + 2 * i.ptfe.movement + 2; // in, along the movement: the PTFE, its travel each way and 1 in beyond
    add({ id: "ptfe-stainless", name: "Stainless mating surface: covers the PTFE at its full movement", demand: stainless, capacity: i.sole.L, unit: "in", ref: "AASHTO 14.7.2.6" });
    slide = { A, sDead, sAll, F: i.ptfe.mu * P, stainless };
  }

  // --- guides (guided) ------------------------------------------------------------------------------------------------
  let guide: null | { M: number; Z: number; Mr: number; s: number } = null;
  if (i.fixity === "guided") {
    const g = i.guides;
    const M = (i.Hu * g.h) / 2; // kip·in, the force at the bar's contact mid-height
    const Z = (g.L * g.b * g.b) / 4; // in³, plastic, bending across the bar
    const Mr = 0.9 * i.Fy * Z;
    add({ id: "guide-flexure", name: "Guide bar: bending under the horizontal force", demand: M, capacity: Mr, unit: "kip·in", ref: "AASHTO 14.7.9, 6.12.2" });
    const s = i.Hu / (g.L * g.h);
    add({ id: "guide-ptfe", name: "Guide bar's PTFE: contact stress under the horizontal force", demand: s, capacity: 4.5, unit: "ksi", ref: "AASHTO 14.7.9, Table 14.7.2.4-1" });
    guide = { M, Z, Mr, s };
  }

  // --- the masonry plate on the concrete, its thickness, the anchor rods, the sole plate ----------------------------
  const m = i.masonry;
  const A1 = m.B * m.L;
  const mm = Math.min(2, Math.sqrt(Math.max(1, m.A2 / A1)));
  const Pr = 0.7 * 0.85 * i.fc * A1 * mm;
  add({ id: "masonry-bearing", name: "Masonry plate on the concrete: bearing (φ 0.70, √(A2/A1) ≤ 2)", demand: Pu, capacity: Pr, unit: "kip", ref: "AASHTO 5.6.5" });
  const q = Pu / A1;
  const c = Math.max((m.B - D0) / 2, (m.L - D0) / 2, 0);
  const tMas = c * Math.sqrt((2 * q) / (0.9 * i.Fy));
  add({ id: "masonry-t", name: "Masonry plate: thickness as a cantilever from the bearing's edge (plastic, φ 0.90)", demand: tMas, capacity: m.t, unit: "in", ref: "AASHTO 6.12.2 (base plate)" });
  const Ab = circle(i.anchors.d);
  const Hrod = sliding ? Math.max(i.fixity === "guided" ? i.Hu : 0, slide!.F * 1.0) : i.Hu;
  const Rr = 0.75 * i.anchors.n * 0.5 * Ab * i.anchors.Fu;
  add({ id: "anchors", name: `Anchor rods: ${i.anchors.n} of ${i.anchors.d} in in shear (the bearing's horizontal force)`, demand: Hrod, capacity: Rr, unit: "kip", ref: "AASHTO 14.8.3.1, 6.13.2.12" });
  if (i.fcGirder > 0) {
    const A = i.sole.B * i.sole.L;
    add({ id: "sole-bearing", name: "Sole plate on the concrete girder: bearing (φ 0.70)", demand: Pu, capacity: 0.7 * 0.85 * i.fcGirder * A, unit: "kip", ref: "AASHTO 5.6.5" });
  }

  const height = m.t + (pot ? pot.height : disc!.height) + i.sole.t; // in, the whole assembly
  return { ok: checks.every((c) => c.ok || c.advisory), checks, P, Pu, tu, pot, disc, slide, guide, masonry: { A1, m: mm, Pr, q, c, tMas }, anchors: { Ab, H: Hrod, Rr }, D0, height };
}

export type HlmrResult = ReturnType<typeof designHlmr>;
