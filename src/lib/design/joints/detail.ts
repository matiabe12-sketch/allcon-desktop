import type { Pt } from "../stm/geometry";
import { ftIn } from "../rebar/bars";
import { schedule } from "../rebar/schedule";
import type { DetailView, Takeoff } from "../takeoff/types";
import { designFinger, type FingerJointInputs } from "./finger";
import { designModular, type ModularJointInputs } from "./modular";
import { designStripSeal, type StripSealInputs } from "./strip-seal";

// The expansion joints' parts, the one description their 2D details (a section along the bridge and a plan) and their
// 3D solids in the Bridge's model are both drawn from. Inches. In a part: x along the bridge from the joint's middle
// (positive ahead), z its middle's height from the deck's top (negative down), w its size along the bridge, h its
// height; s0–s1 its extent along the joint from the joint's start (absent: the joint's whole length).

export type JointPart = { name: string; x: number; z: number; w: number; h: number; s0?: number; s1?: number; material: string; seal?: boolean };

const STEEL = "Structural steel, AASHTO M 270 Grade 50";
const SEAL = "Neoprene strip seal gland";
/** Typical depths (in): a strip seal's edge rail, a modular joint's edgebeam and centerbeam (C14.5.6.9.4), its support bars. */
const RAIL_H = 5;
const EDGE_H = 6;
const CB_H = 5;
const BAR_H = 3;
const BAR_SPACING = 48; // in, the support bars along the joint (the manufacturer's; about 4 ft, C14.5.6.9.4)

/** A strip seal at its gap A: the two edge rails and the gland between them. */
export function stripSealParts(i: StripSealInputs, A = designStripSeal(i).design.A): JointPart[] {
  return [
    { name: "Edge rail", x: -(A / 2 + i.rail / 2), z: -RAIL_H / 2, w: i.rail, h: RAIL_H, material: STEEL },
    { name: "Edge rail", x: A / 2 + i.rail / 2, z: -RAIL_H / 2, w: i.rail, h: RAIL_H, material: STEEL },
    { name: "Strip seal gland", x: 0, z: -1.75, w: A, h: 2.5, material: SEAL, seal: true },
  ];
}

/** A modular joint at its opening A (total): edgebeams, centerbeams, the seals between, and the support bars and boxes under them every 4 ft. */
export function modularParts(i: ModularJointInputs, lengthIn = 120, A = designModular(i).design.A): JointPart[] {
  const r = designModular(i);
  const gap = A / r.seals;
  const half = (A + r.centerbeams * i.centerbeam) / 2;
  const parts: JointPart[] = [];
  parts.push({ name: "Edgebeam", x: -(half + i.edgebeam / 2), z: -EDGE_H / 2, w: i.edgebeam, h: EDGE_H, material: STEEL });
  parts.push({ name: "Edgebeam", x: half + i.edgebeam / 2, z: -EDGE_H / 2, w: i.edgebeam, h: EDGE_H, material: STEEL });
  for (let k = 0; k < r.centerbeams; k++) parts.push({ name: "Centerbeam", x: -half + (k + 1) * gap + k * i.centerbeam + i.centerbeam / 2, z: -CB_H / 2, w: i.centerbeam, h: CB_H, material: STEEL });
  for (let k = 0; k < r.seals; k++) parts.push({ name: "Strip seal", x: -half + k * (gap + i.centerbeam) + gap / 2, z: -1.75, w: gap, h: 2.5, material: SEAL, seal: true });
  // The support bars span from box to box under the centerbeams; the boxes sit in the blockout under the edgebeams.
  const box = Math.max(4, i.blockoutClear + i.edgebeam - 1);
  const barW = 2 * (half + i.edgebeam) + 2 * (box - 1);
  const boxH = Math.max(2, i.blockoutDepth - EDGE_H - 2);
  for (let s = BAR_SPACING / 2; s < lengthIn; s += BAR_SPACING) {
    parts.push({ name: "Support bar", x: 0, z: -(CB_H + BAR_H / 2), w: barW, h: BAR_H, s0: s - 1.5, s1: s + 1.5, material: STEEL });
    for (const side of [-1, 1]) parts.push({ name: "Support box", x: side * (half + i.edgebeam + box / 2 - 1), z: -(EDGE_H + boxH / 2), w: box, h: boxH, s0: s - 4, s1: s + 4, material: STEEL });
  }
  return parts;
}

/** A finger joint at its root-to-root opening D: the two plates, solid behind their fingers, and the fingers meshing. */
export function fingerParts(i: FingerJointInputs, lengthIn = 48, D = designFinger(i).design.D): JointPart[] {
  const parts: JointPart[] = [];
  const back = i.rootOffset + i.bolt.e + 3; // in, the plate behind the fingers' root: to the support's edge, the bolts and past them
  for (const side of [-1, 1]) parts.push({ name: side < 0 ? "Finger plate (back)" : "Finger plate (ahead)", x: side * (D / 2 + back / 2), z: -i.t / 2, w: back, h: i.t, material: STEEL });
  const pitch = 2 * (i.b + i.g);
  for (let s = i.g; s + i.b <= lengthIn; s += pitch) {
    parts.push({ name: "Finger (back plate)", x: -D / 2 + i.Lf / 2, z: -i.t / 2, w: i.Lf, h: i.t, s0: s, s1: s + i.b, material: STEEL });
    const s2 = s + i.b + i.g;
    if (s2 + i.b <= lengthIn) parts.push({ name: "Finger (ahead plate)", x: D / 2 - i.Lf / 2, z: -i.t / 2, w: i.Lf, h: i.t, s0: s2, s1: s2 + i.b, material: STEEL });
  }
  return parts;
}

const rect = (x0: number, z0: number, x1: number, z1: number): Pt[] => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
const partRect = (p: JointPart) => rect(p.x - p.w / 2, p.z - p.h / 2, p.x + p.w / 2, p.z + p.h / 2);

/** A modular joint's section along the bridge and its plan (a 10 ft length), with the blockouts. */
export function modularViews(i: ModularJointInputs): DetailView[] {
  const r = designModular(i);
  const A = r.design.A;
  const parts = modularParts(i, 120, A);
  const half = (A + r.centerbeams * i.centerbeam) / 2;
  const sec: DetailView = { title: `Section along the bridge (0–${r.size} in modular joint at ${i.Ti}°F)`, polys: [], lines: [], dots: [], labels: [] };
  const edge = half + i.edgebeam + i.blockoutClear; // the blockout's face
  const deckD = Math.max(9, i.blockoutDepth + 3);
  for (const side of [-1, 1]) {
    const far = side * (edge + 24);
    // The deck, its blockout's outline dashed (cast after the joint is set).
    sec.polys.push({ pts: side < 0 ? [[far, 0], [-edge, 0], [-edge, -i.blockoutDepth], [-half, -i.blockoutDepth], [-half, -deckD], [far, -deckD]] : [[half, -deckD], [half, -i.blockoutDepth], [edge, -i.blockoutDepth], [edge, 0], [far, 0], [far, -deckD]], style: "concrete" });
    sec.polys.push({ pts: side < 0 ? rect(-edge, -i.blockoutDepth, -half, 0) : rect(half, -i.blockoutDepth, edge, 0), style: "dashed" });
  }
  for (const p of parts.filter((q) => q.s0 === undefined || q.s0 < BAR_SPACING)) sec.polys.push({ pts: partRect(p), style: p.seal ? "dashed" : "void" });
  sec.labels!.push({ x: 0, y: 4, text: `${r.seals} seals, ${r.centerbeams} centerbeams; opening ${ftIn(A)} at ${i.Ti}°F (${ftIn(A / r.seals)} each)`, anchor: "middle" });
  sec.labels!.push({ x: 0, y: -deckD - 4, text: `Blockout ${ftIn(r.blockout.width)} wide × ${ftIn(i.blockoutDepth)} deep (the manufacturer's, to confirm)`, anchor: "middle" });
  const plan: DetailView = { title: "Plan (10 ft of the joint)", polys: [], lines: [], dots: [], labels: [] };
  for (const p of parts) {
    if (p.name === "Support box") continue;
    const s0 = p.s0 ?? 0;
    const s1 = p.s1 ?? 120;
    plan.polys.push({ pts: rect(p.x - p.w / 2, s0, p.x + p.w / 2, s1), style: p.name === "Support bar" ? "dashed" : p.seal ? "dashed" : "void" });
  }
  plan.labels!.push({ x: 0, y: -6, text: `Support bars at about ${ftIn(BAR_SPACING)} (the manufacturer's); joint length ${r.length.toFixed(1)} ft, one continuous unit`, anchor: "middle" });
  return [sec, plan];
}

/** A finger joint's section along the bridge through a finger, and its plan (a 4 ft length), at the installation temperature. */
export function fingerViews(i: FingerJointInputs): DetailView[] {
  const r = designFinger(i);
  const D = r.design.D;
  const sec: DetailView = { title: `Section along the bridge through a finger, at ${i.Ti}°F`, polys: [], lines: [], dots: [], labels: [] };
  const face = D / 2 + i.rootOffset; // the supports' edges
  const deckD = 12;
  for (const side of [-1, 1]) sec.polys.push({ pts: side < 0 ? rect(-face - 36, -deckD, -face, -i.t) : rect(face, -deckD, face + 36, -i.t), style: "concrete" });
  for (const p of fingerParts(i, 2 * (i.b + i.g) + i.g + 0.01, D)) sec.polys.push({ pts: partRect(p), style: p.name === "Finger (ahead plate)" ? "dashed" : "void" });
  for (const side of [-1, 1]) sec.lines.push({ pts: [[side * (face + i.bolt.e), 1], [side * (face + i.bolt.e), -deckD + 2]], mark: `${i.bolt.d} in bolt`, kind: "main" });
  // The trough under the opening, carrying the water away.
  if (i.trough) sec.polys.push({ pts: [[-face, -deckD], [-face + 2, -deckD - 8], [face - 2, -deckD - 8], [face, -deckD], [face - 0.5, -deckD], [face - 2.4, -deckD - 7.4], [-face + 2.4, -deckD - 7.4], [-face + 0.5, -deckD]], style: "dashed" });
  sec.labels!.push({ x: 0, y: 4, text: `Root to root ${ftIn(D)} at ${i.Ti}°F; ${ftIn(r.D.cold)} coldest, ${ftIn(r.D.hot)} hottest`, anchor: "middle" });
  sec.labels!.push({ x: 0, y: -deckD - 12, text: `Plates ${ftIn(i.t)}; fingers ${ftIn(i.b)} wide × ${ftIn(i.Lf)} long, ${ftIn(i.g)} apart; ${i.trough ? "trough under" : "no trough"}`, anchor: "middle" });
  const plan: DetailView = { title: "Plan (4 ft of the joint)", polys: [], lines: [], dots: [], labels: [] };
  for (const p of fingerParts(i, 48, D)) plan.polys.push({ pts: rect(p.x - p.w / 2, p.s0 ?? 0, p.x + p.w / 2, p.s1 ?? 48), style: p.name.startsWith("Finger (ahead") || p.name.endsWith("(ahead)") ? "dashed" : "void" });
  for (let s = i.bolt.spacing / 2; s < 48; s += i.bolt.spacing) for (const side of [-1, 1]) plan.dots.push({ x: side * (face + i.bolt.e), y: s, d: i.bolt.d, mark: "Bolt" });
  plan.labels!.push({ x: 0, y: -6, text: `Overlap ${ftIn(2 * i.Lf - r.D.cold)} coldest; tips tapered for the plows (CDOT BDM 14.4.6)`, anchor: "middle" });
  return [sec, plan];
}

/** A modular joint's take-off: the device by the foot along the skewed joint, its size's pay item. */
export function modularTakeoff(i: ModularJointInputs, widthFt = i.width): Takeoff {
  const r = designModular({ ...i, width: widthFt });
  return {
    what: `0–${r.size} in modular expansion joint`,
    schedule: schedule([], []),
    quantities: { joint: { value: r.length, basis: `${widthFt} ft of deck, skewed ${i.skew}°, a 0–${r.size} in modular joint (${r.seals} seals)`, ...(i.skew > 0 ? { math: `\\frac{${widthFt}\\mathrm{ft}}{\\cos\\left(${i.skew}\\mathrm{deg}\\right)}`, ref: "the deck's square width ÷ cos(skew)" } : { math: `${widthFt}\\mathrm{ft}`, ref: "the deck's width, square" }) } },
    views: modularViews({ ...i, width: widthFt }),
    notes: [
      `Plans give: the size (0–${r.size} in), the movements and rotations for the manufacturer (along ${ftIn(r.plans.longitudinal)} with the 1 in added, across ±${r.plans.transverse / 2} in, vertical ±${r.plans.vertical / 2} in, ±0.5° about the two horizontal axes, ±0.25° about the vertical; AASHTO Table 14.5.6.9.2-1), the opening by installation temperature, and the blockout.`,
      "The manufacturer designs the centerbeams, support bars, boxes and anchorage to AASHTO 14.5.6.9 (strength, fatigue and fracture) and submits calcs sealed by a Colorado PE with the shop drawings (CDOT BDM 14.4.5, 14.6).",
    ],
    length: { label: "Deck width (square)", value: widthFt, unit: "ft" },
  };
}

/** A finger joint's take-off: the device by the foot along the joint (Type 1). */
export function fingerTakeoff(i: FingerJointInputs, widthFt = i.width): Takeoff {
  const r = designFinger({ ...i, width: widthFt });
  return {
    what: "finger plate expansion joint",
    schedule: schedule([], []),
    quantities: { joint: { value: r.length, basis: `${widthFt} ft of deck, skewed ${i.skew}°, finger plates with a trough`, ...(i.skew > 0 ? { math: `\\frac{${widthFt}\\mathrm{ft}}{\\cos\\left(${i.skew}\\mathrm{deg}\\right)}`, ref: "the deck's square width ÷ cos(skew)" } : { math: `${widthFt}\\mathrm{ft}`, ref: "the deck's width, square" }) } },
    views: fingerViews(i),
    notes: [`Sections of ${i.sectionLength} ft at most, fingers tapered, high-strength bolts fully torqued and cast-in anchors (AASHTO 14.5.3.7), the trough paid with the device. CDOT uses finger joints only to replace existing ones (BDM 14.4.6).`],
    length: { label: "Deck width (square)", value: widthFt, unit: "ft" },
  };
}
