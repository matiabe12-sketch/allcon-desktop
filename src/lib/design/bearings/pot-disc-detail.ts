import type { Pt } from "../stm/geometry";
import { ftIn } from "../rebar/bars";
import type { DetailView, Takeoff } from "../takeoff/types";
import { schedule, type ConcreteItem } from "../rebar/schedule";
import { designHlmr, STAINLESS, type HlmrInputs } from "./pot-disc";

// A pot or disc bearing's parts, bottom to top, the one description its 2D details (a section along the bridge and
// the plan) and its 3D solids (the Bridge's model and its rebar view) are both drawn from. Inches; x along the bridge,
// y across it, z up from the masonry plate's bottom (the bearing seat).

export type BearingPart = {
  name: string;
  /** A box (B along x, L along y), a solid cylinder (D), or a ring (D outside, d inside), z0 up to z0 + h. */
  shape: { kind: "box"; B: number; L: number } | { kind: "cyl"; D: number } | { kind: "ring"; D: number; d: number };
  x: number; // its center
  y: number;
  z0: number;
  h: number;
  material: string;
};

const STEEL = "Structural steel, AASHTO M 270 Grade 50";

export function bearingParts(i: HlmrInputs): BearingPart[] {
  const r = designHlmr(i);
  const parts: BearingPart[] = [];
  const at = (name: string, shape: BearingPart["shape"], z0: number, h: number, material = STEEL, x = 0, y = 0) => parts.push({ name, shape, x, y, z0, h, material });
  const m = i.masonry;
  at("Masonry plate", { kind: "box", B: m.B, L: m.L }, 0, m.t);
  let z = m.t;
  let topD: number; // the top of the rotational element's diameter, for the sliding surface
  if (i.kind === "pot") {
    const p = i.pot;
    const D0 = p.Dp + 2 * p.tw;
    at("Pot base", { kind: "cyl", D: D0 }, z, p.tBase);
    at("Pot wall", { kind: "ring", D: D0, d: p.Dp }, z + p.tBase, p.cavity);
    const zPad = z + p.tBase;
    at("Elastomeric pad", { kind: "cyl", D: p.Dp }, zPad, p.hr, "Elastomer, 50–60 Shore A");
    const ringT = p.rings.type === "flat" ? p.rings.count * p.rings.thickness : p.rings.width;
    const ringW = p.rings.type === "flat" ? p.rings.width : p.rings.width;
    at(p.rings.type === "flat" ? `Sealing rings (${p.rings.count} flat brass)` : "Sealing ring (circular brass)", { kind: "ring", D: p.Dp, d: p.Dp - 2 * ringW }, zPad + p.hr - ringT, ringT, "Brass");
    const Dpiston = p.Dp - 2 * p.clearance;
    at("Piston", { kind: "cyl", D: Dpiston }, zPad + p.hr, p.tPiston);
    z = zPad + p.hr + p.tPiston;
    topD = Dpiston;
  } else {
    const d = i.disc;
    const D0 = d.Dd + 2;
    at("Lower steel plate", { kind: "box", B: D0, L: D0 }, z, d.tLower);
    z += d.tLower;
    at("Urethane disc", { kind: "ring", D: d.Dd, d: d.pin + 0.25 }, z, d.td, "Polyether urethane");
    at("Shear-restricting pin", { kind: "cyl", D: d.pin }, z - Math.min(d.tLower / 2, 0.5), d.td + Math.min(d.tLower, 1));
    z += d.td;
    at("Upper steel plate", { kind: "box", B: D0, L: D0 }, z, d.tUpper);
    z += d.tUpper;
    topD = D0;
  }
  if (i.fixity !== "fixed") {
    // The PTFE recessed half its thickness into the piston or upper plate; the stainless sheet on the sole plate above it.
    at("PTFE sliding surface (recessed)", { kind: "cyl", D: Math.min(i.ptfe.D, topD) }, z - i.ptfe.t / 2, i.ptfe.t, "PTFE, dimpled and lubricated");
    z += i.ptfe.t / 2;
    at("Stainless steel mating surface", { kind: "box", B: i.sole.L, L: i.sole.B }, z, STAINLESS, "Stainless steel, ASTM A240 Type 304");
    z += STAINLESS;
  }
  const solez = z;
  at("Sole plate", { kind: "box", B: i.sole.L, L: i.sole.B }, solez, i.sole.t);
  if (i.fixity === "guided") {
    // Two guide bars under the sole plate, along the movement (x), either side of the rotational element's top.
    const g = i.guides;
    const off = topD / 2 + g.b / 2 + 0.125;
    for (const s of [-1, 1]) at(`Guide bar (${s < 0 ? "left" : "right"})`, { kind: "box", B: g.L, L: g.b }, solez - g.h, g.h, STEEL, 0, s * off);
  }
  // The anchor rods through the masonry plate's corners, 12 in into the seat and 2 in above the plate (a nut).
  const n = Math.max(0, Math.round(i.anchors.n));
  const ex = m.B / 2 - Math.max(2, 2 * i.anchors.d);
  const ey = m.L / 2 - Math.max(2, 2 * i.anchors.d);
  const spots = n === 2 ? [[-ex, 0], [ex, 0]] : n === 4 ? [[-ex, -ey], [ex, -ey], [ex, ey], [-ex, ey]] : Array.from({ length: n }, (_, k) => [ex * Math.cos((2 * Math.PI * k) / n), ey * Math.sin((2 * Math.PI * k) / n)]);
  for (const [x, y] of spots) at("Anchor rod", { kind: "cyl", D: i.anchors.d }, -12, 12 + m.t + 2, `Anchor rod, ASTM F1554 (Fu ${i.anchors.Fu} ksi)`, x, y);
  void r;
  return parts;
}

/** The bearing's height from the seat to the sole plate's top, in. */
export const bearingHeight = (i: HlmrInputs) => Math.max(...bearingParts(i).filter((p) => p.name !== "Anchor rod").map((p) => p.z0 + p.h));

/** The section along the bridge (x–z) and the plan (x–y), dimensioned. */
export function bearingViews(i: HlmrInputs): DetailView[] {
  const parts = bearingParts(i);
  const sec: DetailView = { title: `Section along the bridge (${i.kind} bearing, ${i.fixity})`, polys: [], lines: [], dots: [], labels: [] };
  const half = (p: BearingPart) => (p.shape.kind === "box" ? p.shape.B / 2 : p.shape.D / 2);
  for (const p of parts) {
    const x0 = p.x - half(p);
    const x1 = p.x + half(p);
    const rect: Pt[] = [[x0, p.z0], [x1, p.z0], [x1, p.z0 + p.h], [x0, p.z0 + p.h]];
    if (p.shape.kind === "ring") {
      const t = (p.shape.D - p.shape.d) / 2;
      sec.polys.push({ pts: [[x0, p.z0], [x0 + t, p.z0], [x0 + t, p.z0 + p.h], [x0, p.z0 + p.h]], style: "concrete" });
      sec.polys.push({ pts: [[x1 - t, p.z0], [x1, p.z0], [x1, p.z0 + p.h], [x1 - t, p.z0 + p.h]], style: "concrete" });
    } else if (p.name === "Anchor rod") sec.lines.push({ pts: [[p.x, p.z0], [p.x, p.z0 + p.h]], mark: "Anchor rod", kind: "main" });
    else sec.polys.push({ pts: rect, style: /Elastomer|urethane|PTFE/i.test(p.name) ? "dashed" : "concrete" });
  }
  sec.polys.push({ pts: [[-i.masonry.B / 2 - 6, -12], [i.masonry.B / 2 + 6, -12], [i.masonry.B / 2 + 6, 0], [-i.masonry.B / 2 - 6, 0]], style: "earth" });
  // Labels down the right: each part with its size.
  const right = Math.max(...parts.map((p) => p.x + half(p))) + 4;
  const named = parts.filter((p) => p.name !== "Anchor rod" && !/^Guide bar \(left/.test(p.name));
  named.forEach((p) => {
    const size = p.shape.kind === "box" ? `${ftIn(p.shape.B)} × ${ftIn(p.shape.L)} × ${ftIn(p.h)}` : p.shape.kind === "cyl" ? `⌀${ftIn(p.shape.D)} × ${ftIn(p.h)}` : `⌀${ftIn(p.shape.D)} / ⌀${ftIn(p.shape.d)} × ${ftIn(p.h)}`;
    sec.labels!.push({ x: right, y: p.z0 + p.h / 2, text: `${p.name.replace(/ \(right\)/, "s")}: ${size}`, anchor: "start" });
  });
  sec.labels!.push({ x: 0, y: -18, text: `Total height ${ftIn(bearingHeight(i))}; ${i.anchors.n} anchor rods ⌀${ftIn(i.anchors.d)}`, anchor: "middle" });
  const plan: DetailView = { title: "Plan", polys: [], lines: [], dots: [], labels: [] };
  const circlePts = (D: number, x = 0, y = 0): Pt[] => Array.from({ length: 48 }, (_, k) => [x + (D / 2) * Math.cos((2 * Math.PI * k) / 48), y + (D / 2) * Math.sin((2 * Math.PI * k) / 48)]);
  for (const p of parts) {
    if (p.name === "Anchor rod") {
      plan.dots.push({ x: p.x, y: p.y, d: (p.shape as { D: number }).D, mark: "Anchor rod" });
      continue;
    }
    if (p.shape.kind === "box") plan.polys.push({ pts: [[p.x - p.shape.B / 2, p.y - p.shape.L / 2], [p.x + p.shape.B / 2, p.y - p.shape.L / 2], [p.x + p.shape.B / 2, p.y + p.shape.L / 2], [p.x - p.shape.B / 2, p.y + p.shape.L / 2]], style: /Sole|Stainless/.test(p.name) ? "dashed" : "concrete" });
    else plan.polys.push({ pts: circlePts(p.shape.D, p.x, p.y), style: "dashed" });
  }
  plan.labels!.push({ x: 0, y: -i.masonry.L / 2 - 6, text: `Masonry plate ${ftIn(i.masonry.B)} × ${ftIn(i.masonry.L)}${i.fixity === "guided" ? "; guided along the bridge" : i.fixity === "free" ? "; free to slide" : "; fixed"}`, anchor: "middle" });
  return [sec, plan];
}

/** Steel's weight, lb/in³. */
const STEEL_LB = 0.2836;

/** The bearing's take-off: each bearing a pay item (Bearing Device, Special), its steel, elastomer or urethane, and PTFE for information. */
export function hlmrTakeoff(i: HlmrInputs, count = 1): Takeoff {
  const N = Math.max(1, Math.round(count));
  const parts = bearingParts(i);
  const vol = (p: BearingPart) => (p.shape.kind === "box" ? p.shape.B * p.shape.L : p.shape.kind === "cyl" ? (Math.PI * p.shape.D ** 2) / 4 : (Math.PI * (p.shape.D ** 2 - p.shape.d ** 2)) / 4) * p.h;
  const steel = parts.filter((p) => /Structural steel|Stainless/.test(p.material)).reduce((t, p) => t + vol(p) * STEEL_LB, 0);
  const concrete: ConcreteItem[] = [];
  const sch = schedule([], concrete);
  return {
    what: `${i.kind} bearing`,
    schedule: sch,
    quantities: { bearing: { value: N, basis: `${N} ${i.kind} bearing${N > 1 ? "s" : ""}, ${i.fixity}, ${Math.round(steel)} lb of steel each`, math: `${N}`, ref: "Bearing device (each), the manufacturer's design to the loads and rotation on the plans" } },
    views: bearingViews(i),
    notes: [
      `Plans give: the degree of fixity (${i.fixity}), the maximum vertical load ${Math.round((i.DL + i.LL) * 10) / 10} kip and the minimum ${i.minLoad} kip (Service I, with IM), the maximum horizontal load ${i.Hs} kip (service) and ${i.Hu} kip (factored), the design rotation, and the assumed bearing height ${ftIn(bearingHeight(i))} (WisDOT 27.2.2.3, AASHTO 14.4).`,
      ...parts.filter((p) => p.name !== "Anchor rod").map((p) => `${p.name}: ${p.material}`),
    ],
    length: { label: "Bearings", value: N, unit: "EA" },
  };
}
