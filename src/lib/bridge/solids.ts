import { barrierShape } from "../design/bridge/ifc";
import { deepestSteelShape } from "../design/girders/steel-section";
import { customShape, shapeById } from "../design/girders/sections";
import type { BridgeDefinition } from "./definition";
import type { Generated } from "./generate";
import type { Model } from "./model";

// The bridge as solids, for the workspace's 3D view: each member in its real shape (a girder's
// outline along its span, the deck slab, barriers, diaphragms, pier caps, columns, bearings), as
// professional analysis programs draw a model. Built from the definition and the generated model;
// an imported model's members are drawn as rectangles and rounds of their section's size. Feet.

export type Vec3 = [number, number, number];
export type SolidKind = "girder" | "deck" | "barrier" | "diaphragm" | "cap" | "column" | "bearing" | "member";

/** A prism along one or more segments end to end (a member and its elements), its section in the member's local y (across) and z (up). */
/** Which part of the bridge a solid is (a member's id, "deck", "barrier-left", "diaphragm-3", "bearing-12"…) and its name, for showing it alone. */
export type PartOf = { part?: string; label?: string };

export type Prism = PartOf & {
  type: "prism";
  kind: SolidKind;
  section: { outline: [number, number][] } | { radius: number };
  segments: { element?: number; a: Vec3; b: Vec3 }[];
  angle?: number;
};
/** A slab: an outline in plan between two levels. */
export type Slab = PartOf & { type: "slab"; kind: SolidKind; plan: [number, number][]; z0: number; z1: number };
export type Solid = Prism | Slab;

const rect = (width: number, depth: number, zCenter = 0): [number, number][] => [
  [-width / 2, zCenter - depth / 2],
  [width / 2, zCenter - depth / 2],
  [width / 2, zCenter + depth / 2],
  [-width / 2, zCenter + depth / 2],
];

export function bridgeSolids(d: BridgeDefinition, g: Generated): { solids: Solid[]; deckTop: number } {
  const model = g.stage2;
  const at = new Map(model.nodes.map((n) => [n.id, [n.x, n.y, n.z] as Vec3]));
  const shape = d.girder.shape === "steel" && d.girder.steel ? deepestSteelShape(d.girder.steel.segments) : d.girder.custom ? customShape(d.girder.custom.profile, d.girder.custom.web, d.girder.custom.topWidth) : shapeById(d.girder.shape);
  const solids: Solid[] = [];
  if (!shape) return { solids, deckTop: 0 };
  const yb = g.properties.girder.yb;
  const H = shape.depth;
  // The girder's outline about its centroid: up the right side, down the left.
  const p = shape.profile;
  const outline: [number, number][] = [...p.map(([y, h]) => [h / 12, (y - yb) / 12] as [number, number]), ...[...p].reverse().map(([y, h]) => [-h / 12, (y - yb) / 12] as [number, number])];
  const segmentsOf = (ids: number[]) => ids.flatMap((id) => {
    const e = model.elements.find((x) => x.id === id);
    const a = e && at.get(e.n1);
    const b = e && at.get(e.n2);
    return a && b ? [{ element: id, a, b }] : [];
  });
  // Each pier's cap and columns: its own (the geometry's pier at that support) or the wizard's one pier.
  const pierAt = (support?: number) => {
    const p = support ? d.geometry?.supports[support - 1]?.pier : undefined;
    if (!p) return { round: true, size: d.piers.columnDiameter, depth: d.piers.columnDiameter, capWidth: d.piers.capWidth, capDepth: d.piers.capDepth };
    const round = p.columnShape === "round";
    return { round, size: p.columnSize / 12, depth: (round ? p.columnSize : p.columnDepth) / 12, capWidth: p.capWidth / 12, capDepth: p.capDepth };
  };
  for (const m of g.members) {
    if (m.kind === "girder") solids.push({ type: "prism", kind: "girder", part: m.id, label: m.name, section: { outline }, segments: segmentsOf(m.elements) });
    if (m.kind === "column") {
      const p = pierAt(m.support);
      solids.push({ type: "prism", kind: "column", part: m.id, label: m.name, section: p.round ? { radius: p.size / 2 } : { outline: rect(p.size, p.depth) }, segments: segmentsOf(m.elements) });
    }
    if (m.kind === "cap") {
      // The cap runs a little past its end girders.
      const seg = segmentsOf(m.elements);
      if (seg.length) {
        const first = seg[0];
        const last = seg[seg.length - 1];
        const dir = (a: Vec3, b: Vec3): Vec3 => {
          const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) || 1;
          return [(b[0] - a[0]) / L, (b[1] - a[1]) / L, (b[2] - a[2]) / L];
        };
        const u0 = dir(first.a, first.b);
        const u1 = dir(last.a, last.b);
        const ext = 1.5;
        solids.push({
          type: "prism",
          kind: "cap",
          part: m.id,
          label: m.name,
          section: { outline: rect(pierAt(m.support).capWidth, pierAt(m.support).capDepth) },
          segments: [{ a: [first.a[0] - u0[0] * ext, first.a[1] - u0[1] * ext, first.a[2]], b: first.a }, ...seg, { a: last.b, b: [last.b[0] + u1[0] * ext, last.b[1] + u1[1] * ext, last.b[2]] }],
        });
      }
    }
  }
  // Diaphragms, between the girders at mid-depth.
  const dh = (0.75 * H) / 12;
  let nDia = 0;
  for (const e of model.elements)
    if (e.sec === 20) {
      const a = at.get(e.n1);
      const b = at.get(e.n2);
      if (a && b) solids.push({ type: "prism", kind: "diaphragm", part: `diaphragm-${nDia}`, label: `Diaphragm ${++nDia}`, section: { outline: rect(d.diaphragms.thickness, dh, (H / 2 - yb) / 12) }, segments: [{ a, b }] });
    }
  // Bearings, under the girders.
  const heightAt = new Map(g.bearings.map((b) => [b.link, Math.max(d.geometry?.supports[b.support - 1]?.bearingHeight ?? d.piers.bearingHeight, 1) / 12]));
  const lineName = (k: number) => d.geometry?.supports[k]?.name || (k === 0 ? "Abutment 1" : k === d.supports.length - 1 ? "Abutment 2" : `Pier ${k}`);
  const bearingOf = new Map(g.bearings.map((b) => [b.link, b]));
  for (const l of model.links) {
    const a = at.get(l.n1);
    const bh = heightAt.get(l.id) ?? Math.max(d.piers.bearingHeight, 1) / 12;
    const br = bearingOf.get(l.id);
    if (a) solids.push({ type: "slab", kind: "bearing", part: `bearing-${l.id}`, label: br ? `${lineName(br.support - 1)}, girder ${br.girder} bearing` : `Bearing ${l.id}`, plan: [[a[0] - 0.75, a[1] - 0.75], [a[0] + 0.75, a[1] - 0.75], [a[0] + 0.75, a[1] + 0.75], [a[0] - 0.75, a[1] + 0.75]], z0: -yb / 12 - bh, z1: -yb / 12 });
  }
  // The deck over the haunches, and a barrier along each edge.
  const { deck } = g.layout;
  const z0 = (H - yb + d.deck.haunch) / 12;
  const z1 = z0 + d.deck.thickness / 12;
  // Between two lines along the bridge, from the first support line to the last (each at its own skew).
  const strip = (ya: number, yc: number): [number, number][] => g.layout.plan(ya, yc);
  solids.push({ type: "slab", kind: "deck", part: "deck", label: "Deck", plan: strip(deck[0], deck[1]), z0, z1 });
  // The bridge rail along each edge in its own shape (a CDOT standard rail's outline, its steel tubes too;
  // otherwise a 42 in parapet the barrier's width at its base), span by span between the support lines.
  if (d.loads.barrierWidth > 0 && d.loads.barrierWeight > 0) {
    const rail = barrierShape({ rail: d.geometry?.rail, barrierWidth: d.loads.barrierWidth });
    const tubes = rail.def?.posts?.tubes ?? [];
    const lines = g.supportStations.map((_, sl) => sl);
    for (const [y, inward, side] of [[deck[0], 1, "left"], [deck[1], -1, "right"]] as const) {
      const part = { part: `barrier-${side}`, label: `${rail.def ? rail.name : "Barrier"}, ${side}` };
      // The outline across (y, inward from the edge) and up (z, from the deck's top), ft.
      const at = (pts: [number, number][]): [number, number][] => pts.map(([x, h]) => [(inward * x) / 12, h / 12]);
      const segments = lines.slice(1).map((sl) => ({ a: [g.layout.plan(y, y)[sl - 1][0], y, z1] as Vec3, b: [g.layout.plan(y, y)[sl][0], y, z1] as Vec3 }));
      solids.push({ type: "prism", kind: "barrier", ...part, section: { outline: at(rail.outline) }, segments });
      for (const t of tubes)
        solids.push({ type: "prism", kind: "barrier", ...part, section: { outline: at([[t.x0, t.y0], [t.x1, t.y0], [t.x1, t.y1], [t.x0, t.y1]]) }, segments });
    }
  }
  // Sidewalks inside the barriers, raised on the deck.
  const sw = d.sidewalks;
  if (sw && sw.depth > 0)
    for (const [side, a, c] of [["left", deck[0] + d.loads.barrierWidth, deck[0] + d.loads.barrierWidth + sw.left], ["right", deck[1] - d.loads.barrierWidth - sw.right, deck[1] - d.loads.barrierWidth]] as const)
      if (c - a > 1e-6) solids.push({ type: "slab", kind: "deck", part: `sidewalk-${side}`, label: `Sidewalk, ${side}`, plan: strip(a, c), z0: z1, z1: z1 + sw.depth / 12 });
  return { solids, deckTop: z1 };
}

/** An imported model's members as solids: a rectangle with the section's area and depth (from its I), a round for a truss. */
export function modelSolids(model: Model): Solid[] {
  const at = new Map(model.nodes.map((n) => [n.id, [n.x, n.y, n.z] as Vec3]));
  const sec = new Map(model.sections.map((s) => [s.id, s]));
  const out: Solid[] = [];
  for (const e of model.elements) {
    const a = at.get(e.n1);
    const b = at.get(e.n2);
    const s = sec.get(e.sec);
    if (!a || !b || !s || !(s.A > 0)) continue;
    if (e.type === "truss" || !(s.Iy > 0)) {
      out.push({ type: "prism", kind: "member", section: { radius: Math.sqrt(s.A / Math.PI) }, segments: [{ element: e.id, a, b }] });
      continue;
    }
    const depth = Math.min(Math.max(Math.sqrt((12 * s.Iy) / s.A), 0.05), 50);
    out.push({ type: "prism", kind: "member", section: { outline: rect(Math.max(s.A / depth, 0.05), depth) }, segments: [{ element: e.id, a, b }], ...(e.angle ? { angle: e.angle } : {}) });
  }
  return out;
}

/** What a part is called in the exported model, and what it's made of. */
const PART: Record<SolidKind, { name: string; material?: string }> = {
  girder: { name: "Girder", material: "Girder concrete" },
  deck: { name: "Deck", material: "Deck concrete" },
  barrier: { name: "Barrier", material: "Deck concrete" },
  diaphragm: { name: "Diaphragm", material: "Deck concrete" },
  cap: { name: "Pier cap", material: "Pier concrete" },
  column: { name: "Pier column", material: "Pier concrete" },
  bearing: { name: "Bearing", material: "Elastomer" },
  member: { name: "Member" },
};

export type IfcElementSpec = { kind: string; name: string; material?: string } & ({ a: Vec3; b: Vec3; outline?: [number, number][]; radius?: number } | { plan: [number, number][]; z0: number; z1: number });

/** The bridge's solids as elements for the IFC engine: each member one extrusion from its first point to its last, named in order. */
export function ifcElements(d: BridgeDefinition, g: Generated): IfcElementSpec[] {
  const { solids } = bridgeSolids(d, g);
  const girders = g.members.filter((m) => m.kind === "girder");
  const columns = g.members.filter((m) => m.kind === "column");
  const caps = g.members.filter((m) => m.kind === "cap");
  const count: Partial<Record<SolidKind, number>> = {};
  return solids.flatMap((s): IfcElementSpec[] => {
    const n = (count[s.kind] = (count[s.kind] ?? 0) + 1);
    const part = PART[s.kind];
    const name = s.kind === "girder" ? (girders[n - 1]?.name ?? `Girder ${n}`) : s.kind === "column" ? (columns[n - 1]?.name ?? `Column ${n}`) : s.kind === "cap" ? (caps[n - 1]?.name ?? `Pier cap ${n}`) : s.kind === "deck" ? "Deck" : `${part.name} ${n}`;
    const material = s.kind === "girder" ? `Girder concrete, f'c ${d.girder.fc} ksi` : s.kind === "cap" || s.kind === "column" ? `Pier concrete, f'c ${d.piers.fc} ksi` : s.kind === "deck" || s.kind === "barrier" || s.kind === "diaphragm" ? `Deck concrete, f'c ${d.deck.fc} ksi` : part.material;
    if (s.type === "slab") return [{ kind: s.kind, name, material, plan: s.plan, z0: s.z0, z1: s.z1 }];
    if (!s.segments.length) return [];
    const a = s.segments[0].a;
    const b = s.segments[s.segments.length - 1].b;
    return [{ kind: s.kind, name, material, a, b, ...("radius" in s.section ? { radius: s.section.radius } : { outline: s.section.outline }) }];
  });
}
