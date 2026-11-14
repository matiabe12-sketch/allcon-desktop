import type { IfcElement, V3 } from "./ifc";
import { barArea, type IfcBarRole, type IfcBarSet, type IfcTendonSet } from "./ifc-rebar";
import type { RebarModel } from "./rebar-model";
import { elementFrame, type BarSet3D } from "./rebar3d";

// The IFC model's bars where the Rebar view puts them (phase 3): each element whose bars are placed from its
// design (rebar-model.ts) gets them in model coordinates instead of the schematic layout (ifc-rebar.ts), one
// IfcReinforcingBar per kind of bar on it. Its quantities are the design's bar schedule's (the calc's marks,
// counts, lengths with laps and weights), not the bars drawn, until the drawing matches the schedule bar for
// bar: each mark goes to the placed kind it fits. A girder's strands are IfcTendon (STRAND), a row or draped
// group each, a debonded strand drawn its full length (its debonded length in its properties).

const STRAND_AREA: Record<string, number> = { "0.5": 0.153, "0.6": 0.217, "0.7": 0.294 };
const r4 = (v: number) => Math.round(v * 1e4) / 1e4;

/**
 * A centreline a swept disk can follow: repeated points dropped, and a closed loop (a tie) left open by two bar
 * diameters where its hooks lap, as the schematic writer draws closed bars (a swept disk can't meet itself).
 */
export function sweepable(path: V3[], dia: number): V3[] {
  const d = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const pts = path.filter((q, k) => k === 0 || d(q, path[k - 1]) > 1e-4);
  const gap = (2 * dia) / 12;
  if (pts.length > 2 && d(pts[0], pts[pts.length - 1]) < gap) {
    pts.pop();
    const [a, b] = [pts[pts.length - 1], pts[0]];
    const L = d(a, b);
    if (L > gap) pts.push([0, 1, 2].map((k) => a[k] + ((b[k] - a[k]) * (L - gap)) / L) as V3);
  }
  return pts;
}

/** A set's centreline and places in model coordinates. */
function toModel(s: BarSet3D, e: IfcElement, path: V3[] = s.path): { path: V3[]; at: V3[] } {
  const line = sweepable(path, s.dia);
  if (s.frame === "world") return { path: line.map((q) => q.map(r4) as V3), at: s.at.map((q) => q.map(r4) as V3) };
  const f = elementFrame(e);
  const pt = (q: V3): V3 => [0, 1, 2].map((k) => r4(f.o[k] + f.x[k] * q[0] + f.y[k] * q[1] + f.z[k] * q[2])) as V3;
  const vec = (q: V3): V3 => [0, 1, 2].map((k) => r4(f.x[k] * q[0] + f.y[k] * q[1] + f.z[k] * q[2])) as V3;
  return { path: line.map(pt), at: s.at.map(vec) };
}

function roleOf(s: BarSet3D): IfcBarRole {
  if (s.role === "spiral") return "RING";
  if (s.role === "stirrup") return /tie|hoop/i.test(s.label) ? "LIGATURE" : "SHEAR";
  return /anchorage|dowel/i.test(s.label) ? "ANCHORING" : "MAIN";
}

/** The elements' bars from the placement (changed in place): the IFC writer then draws each where its design puts it. */
export function placeIfcRebar(els: IfcElement[], model: RebarModel): IfcElement[] {
  els.forEach((e, i) => {
    if (model.elements[i]?.bars !== "design") return;
    const sets = model.bars.filter((s) => s.host === i);
    // Bars: one IfcReinforcingBar per kind on the element (its label, size and role).
    const kinds = new Map<string, BarSet3D[]>();
    for (const s of sets.filter((x) => x.role !== "strand" && x.role !== "sheathed")) {
      const k = `${s.label}|${s.size}|${s.role}`;
      kinds.set(k, [...(kinds.get(k) ?? []), s]);
    }
    // Quantities from the design's bar schedule (its calc), not from the bars drawn: each scheduled mark on this
    // element goes to the placed kind of its size that fits it best (its role, then the words of its use); a mark
    // with no placed bar of its size keeps its schematic drawing. A kind no mark fits is drawn with no quantity.
    const schedule = e.rebar?.bars ?? [];
    const list = [...kinds.values()];
    const words = (t: string) => new Set(t.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 2));
    const assigned = new Map<number, IfcBarSet[]>();
    const unplaced: IfcBarSet[] = [];
    for (const g of schedule) {
      const fits = list.map((k, j) => ({ j, k: k[0] })).filter((x) => x.k.size === g.size);
      if (!fits.length) {
        unplaced.push(g);
        continue;
      }
      const w = words(`${g.use} ${g.callout}`);
      const score = (k: BarSet3D) => (roleOf(k) === g.role ? 10 : 0) + [...words(k.label)].filter((x) => w.has(x)).length;
      const best = fits.reduce((p, q) => (score(q.k) > score(p.k) ? q : p));
      assigned.set(best.j, [...(assigned.get(best.j) ?? []), g]);
    }
    const included = /lrfd-girder-check/.test(String(e.psets.ALLCON_Design?.DesignKind ?? ""));
    const bars: IfcBarSet[] = list.map((sets, j) => {
      const s0 = sets[0];
      const placed = sets.map((s) => toModel(s, e));
      const drawn = placed.reduce((t, g) => t + g.at.length, 0);
      const marks = assigned.get(j) ?? [];
      const count = marks.reduce((t, g) => t + g.count, 0);
      const inches = marks.reduce((t, g) => t + g.count * g.length, 0);
      return {
        mark: marks.map((g) => g.mark).join(" ").slice(0, 20),
        size: s0.size,
        diameter: s0.dia,
        area: barArea(s0.size),
        count,
        length: count ? Math.round((inches / count) * 100) / 100 : 0,
        weight: Math.round(marks.reduce((t, g) => t + g.weight, 0) * 10) / 10,
        shape: marks.length === 1 ? marks[0].shape : "placed",
        dims: marks.length === 1 ? marks[0].dims : [],
        role: roleOf(s0),
        use: s0.label,
        callout: marks.length ? marks.map((g) => g.callout).join("; ") : s0.label,
        path: [],
        at: { origin: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0], step: [0, 0, 0], drawn },
        placed,
        note: marks.length
          ? `Drawn from its design (${drawn} bars); quantities from the design's bar schedule, marks ${marks.map((g) => g.mark).join(", ")}`
          : included
            ? `Drawn from its design (${drawn} bars); paid with the girder (618), not counted here`
            : e.cls === "IfcRailing"
              ? `Drawn from the rail's worksheet (${drawn} bars); paid with the bridge rail (606), not counted here`
              : `Drawn from its design (${drawn} bars); not in the design's bar schedule, not counted`,
      };
    });
    bars.push(...unplaced.map((g) => ({ ...g, note: "Schematic: no bar of its size placed yet; quantities from the design's bar schedule" })));
    // Strands: each row or draped group, a debonded one its full length.
    const tendons: IfcTendonSet[] = sets
      .filter((s) => s.role === "strand")
      .map((s) => {
        const deb = Number(/debonded ([\d.]+) ft/.exec(s.label)?.[1] ?? 0);
        const path = deb > 0 ? [[s.path[0][0], s.path[0][1], 0] as V3, [s.path[1][0], s.path[1][1], e.depth] as V3] : s.path;
        const kind = deb > 0 ? "debonded" : /harped/i.test(s.label) ? "harped" : "straight";
        return { label: s.label, kind, count: s.at.length, diameter: s.dia, area: STRAND_AREA[String(s.dia)] ?? (Math.PI / 4) * s.dia ** 2 * 0.72, debonded: deb, placed: [toModel(s, e, path)] };
      });
    const id = String(e.psets.ALLCON_Design?.DesignId ?? e.rebar?.designId ?? "");
    const kind = String(e.psets.ALLCON_Design?.DesignKind ?? e.rebar?.designKind ?? "");
    e.rebar = { designId: id, designKind: kind, bars, ...(tendons.length ? { tendons } : {}) };
  });
  return els;
}
