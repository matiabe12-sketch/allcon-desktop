import type { GirderInputs } from "../girders/prestressed";
import { girderShape } from "../girders/prestressed";
import type { ShaftInputs } from "../foundations/shaft";
import { spanGroups, type BridgeInputs } from "./bridge";
import type { BridgeComponents, IfcElement, Profile, V3 } from "./ifc";
import type { RebarDesigns } from "./ifc-rebar";
import { capBars, columnBars, girderBars, schematicBars, shaftBars, type BarSet3D } from "./rebar3d";
import { abutmentBars, approachBars, deckBars, footingBars, railBars, wingwallBars, type RailBarDef } from "./rebar3d-more";
import { railDef } from "../decks/rails";
import { columnShaftConnection } from "../piers/column-shaft";
import { shaftCageOf } from "./loadpath";
import { designWingwall } from "../walls/wingwall";
import { wingwallInputs } from "../kinds";
import { stemEndBarsOf } from "../foundations/abutment";

/** A wingwall's corner bars and their legs (in), as its design gives them; none where it can't be designed. */
function wingCorner(w: Parameters<typeof wingwallInputs>[0]) {
  try {
    const cn = designWingwall(wingwallInputs(w)).connection;
    return { bars: cn.abutBars, legAb: cn.legAb, legWing: cn.legWing };
  } catch {
    return null;
  }
}
import type { FootingInputs } from "../foundations/footing";
import type { PileInputs } from "../foundations/piles";

// What the workspace's Rebar view draws: the IFC model's elements (placement, profile, a box girder's
// void) grouped for its toggles, and every bar set (rebar3d.ts), the designs' placement where phase 1
// has it and the IFC model's schematic layout elsewhere.

export type RebarCategory = "girder" | "deck" | "barrier" | "bearing" | "diaphragm" | "cap" | "column" | "shaft" | "pile" | "footing" | "abutment" | "approach" | "wingwall" | "joint" | "other";
export type RebarElement = {
  name: string;
  part: string; // the support's key ("support-2") or "super"
  category: RebarCategory;
  origin: V3;
  xdir: V3;
  zdir: V3;
  profile: Profile;
  /** A hollow profile's void (a box girder), in the profile's x–y (ft). */
  hole?: [number, number][];
  depth: number;
  color?: [number, number, number];
  concrete: boolean;
  /** Its bars come from its design ("design"), the IFC model's schematic layout ("schematic"), or it has none linked. */
  bars: "design" | "schematic" | "none";
};
export type RebarModel = { elements: RebarElement[]; bars: BarSet3D[]; parts: { key: string; name: string }[]; notes: string[] };

function categoryOf(e: IfcElement): RebarCategory {
  const n = e.name.toLowerCase();
  if (e.type === "GIRDER_SEGMENT") return "girder";
  if (e.type === "EXPANSION_JOINT") return "joint";
  if (e.cls === "IfcBearing") return "bearing";
  if (e.cls === "IfcRailing") return "barrier";
  if (e.type === "PIERCAP") return "cap";
  if (e.cls === "IfcColumn") return "column";
  if (e.cls === "IfcPile") return e.type === "BORED" && /oncrete/.test(e.material) ? "shaft" : "pile";
  if (e.type === "APPROACH_SLAB") return "approach";
  if (/wing/.test(n)) return "wingwall";
  if (/diaphragm/.test(n)) return e.part === "super" ? "diaphragm" : "abutment";
  if (e.cls === "IfcFooting") return "footing";
  if (/deck/.test(n) || e.cls === "IfcSlab") return "deck";
  if (/barrier|parapet|rail/.test(n)) return "barrier";
  if (/stem|backwall|abutment/.test(n)) return "abutment";
  return "other";
}

export function rebarModel(b: BridgeInputs, els: IfcElement[], d: { girders: (GirderInputs | null)[]; comps: BridgeComponents; rebar: RebarDesigns }): RebarModel {
  const groups = spanGroups(b);
  const bars: BarSet3D[] = [];
  const notes: string[] = [];
  const missing = new Set<string>();
  const supportOf = (e: IfcElement) => {
    const m = /^support-(\d+)$/.exec(e.part);
    return m ? Number(m[1]) : null;
  };
  const deck = d.rebar.deck?.inputs ?? null;
  const rail = b.rail ? railDef(b.rail.type) : null;
  const nSpans = b.supports.length - 1;
  // Each pier's column-to-shaft connection, from its two designs (CDOT BDM Figure 11-13).
  const connectionAt = (k: number) => {
    const col = d.rebar.columns?.[k]?.inputs;
    const f = d.comps.foundations?.[k];
    if (!col || col.base !== "shaft" || f?.kind !== "drilled-shaft" || !f.inputs) return null;
    try {
      return columnShaftConnection(col, shaftCageOf(f.inputs as ShaftInputs));
    } catch {
      return null;
    }
  };
  const elements: RebarElement[] = els.map((e, host) => {
    let category = categoryOf(e);
    const k = supportOf(e);
    if (k !== null && b.supports[k]?.type.endsWith("abutment") && (category === "footing" || category === "other")) category = "abutment";
    const concrete = /oncrete/.test(e.material);
    let placed: BarSet3D[] = [];
    let hole: [number, number][] | undefined;
    let profile = e.profile;
    try {
      if (category === "girder") {
        const span = Number(/span (\d+)/.exec(e.name)?.[1] ?? 1) - 1;
        const gi = groups.findIndex((g) => g.includes(span));
        const i = gi >= 0 ? d.girders[gi] : null;
        if (i) {
          const shape = girderShape(i);
          if (shape.family === "Prestressed box") {
            // The box as it is: its outline and its void (the section library's profile folds the void into the walls).
            const p = shape.profile;
            const [half, tb, tw, top] = [p[0][1] / 12, p[1][0] / 12, p[2][1] / 12, p[3][0] / 12];
            profile = { kind: "poly", pts: [[-half, 0], [half, 0], [half, shape.depth / 12], [-half, shape.depth / 12]] };
            hole = [[-(half - tw), tb], [half - tw, tb], [half - tw, top], [-(half - tw), top]];
          }
          const pos = groups[gi].indexOf(span);
          const extra = pos > 0 ? i.extraSpans?.[pos - 1] : undefined;
          placed = girderBars(host, e, i, { strands: extra?.strands ?? i.strands, harped: extra ? (extra.harped ?? i.harped) : i.harped }, b.deckT);
        } else missing.add("girders");
      } else if (category === "cap" && k !== null) {
        const c = d.rebar.caps?.[k];
        if (c) placed = capBars(host, e, c.inputs);
        else missing.add(`${b.supports[k].name} cap`);
      } else if (category === "column" && k !== null) {
        const c = d.rebar.columns?.[k];
        if (c) placed = columnBars(host, e, c.inputs, b.supports[k].pier?.capDepth ?? 4, connectionAt(k));
        else missing.add(`${b.supports[k].name} columns`);
      } else if (category === "deck" && e.grid) {
        const span = Number(/span (\d+)/.exec(e.name)?.[1] ?? 1) - 1;
        if (deck) placed = deckBars(host, e.grid, deck, Math.max(Math.abs(b.supports[span]?.skew ?? 0), Math.abs(b.supports[span + 1]?.skew ?? 0)), { start: span === 0, end: span === nSpans - 1 });
        else missing.add("the deck");
      } else if (category === "barrier" && e.sweep && /oncrete/.test(e.material)) {
        if (rail && deck) placed = railBars(host, e.sweep, rail as unknown as RailBarDef, deck.coverTop + 1.5);
      } else if ((category === "abutment" || category === "approach" || category === "wingwall") && k !== null) {
        const back = (k === 0 ? -1 : 1) as 1 | -1; // the approach's side, in the support's frame
        const n = e.name.toLowerCase();
        if (category === "approach") {
          const ap = d.comps.approachSlabs?.[k]?.inputs;
          if (ap && e.grid) placed = approachBars(host, e.grid, ap);
          else missing.add(`${b.supports[k].name} approach slab`);
        } else if (category === "wingwall") {
          const w = d.comps.wingwalls?.[k]?.inputs;
          if (w && e.wing) placed = wingwallBars(host, w, e.wing.inward, wingCorner(w));
        } else {
          const a = d.comps.abutments?.[k]?.inputs;
          const which = /pile cap/.test(n) ? "cap" : /diaphragm/.test(n) ? "diaphragm" : /stem/.test(n) ? "stem" : /backwall/.test(n) ? "backwall" : /footing/.test(n) ? "footing" : null;
          if (a && which) placed = abutmentBars(host, e, which, which === "stem" ? { ...a, stemEnd: stemEndBarsOf(a) } : a, back);
          else if (!a) missing.add(`${b.supports[k].name}`);
        }
      } else if (category === "footing" && k !== null) {
        const f = d.comps.foundations?.[k];
        if (f?.inputs && (f.kind === "spread-footing" || f.kind === "pile-foundation")) placed = footingBars(host, e, f.inputs as FootingInputs | PileInputs);
        else missing.add(`${b.supports[k].name} footings`);
      } else if (category === "shaft" && k !== null && !b.supports[k].type.endsWith("abutment")) {
        const f = d.comps.foundations?.[k];
        if (f?.kind === "drilled-shaft" && f.inputs) placed = shaftBars(host, e, f.inputs as ShaftInputs, connectionAt(k));
        else missing.add(`${b.supports[k].name} shafts`);
      }
    } catch (err) {
      notes.push(`${e.name}: its bars couldn't be placed (${err instanceof Error ? err.message : "error"}).`);
      placed = [];
    }
    let kind: RebarElement["bars"] = "none";
    if (placed.length) {
      bars.push(...placed);
      kind = "design";
    } else if (e.rebar?.bars.length) {
      bars.push(...schematicBars(host, e.rebar.bars));
      kind = "schematic";
    }
    return { name: e.name, part: e.part, category, origin: e.origin, xdir: e.xdir, zdir: e.zdir, profile, ...(hole ? { hole } : {}), depth: e.depth, ...(e.color ? { color: e.color } : {}), concrete, bars: kind };
  });
  if (missing.size) notes.push(`No linked design for: ${[...missing].join(", ")} (their concrete only).`);
  const parts = [{ key: "super", name: "Superstructure" }, ...b.supports.map((s, k) => ({ key: `support-${k}`, name: s.name }))];
  return { elements, bars, parts, notes };
}
