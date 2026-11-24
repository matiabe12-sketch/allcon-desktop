import type { BridgeAnalysis, Selection } from "./bridge";
import { SCOUR_DEFAULTS } from "../design/scour/scour";
import type { BridgeDefinition } from "./definition";
import { spanGroups } from "../design/bridge/bridge";
import { geometryOf, toBridgeInputs } from "./geometry";
import type { LiveLoad } from "./moving";

// From the bridge model to the design tools: which parts of a bridge have a design tool, and the
// inputs each design starts with, taken from the model's geometry and its analysis (reactions,
// envelopes with their concurrent forces). The design tools' engines and checks are unchanged:
// a design started here is an ordinary design, with these values filled in.

export type DesignTarget = { key: string; label: string; tool: string; kind: string; from: string };

/** A support line's name: the bridge's own (its geometry's supports), else by its place. */
const lineName = (d: BridgeDefinition, k: number) => d.geometry?.supports[k]?.name || (k === 0 || k === d.supports.length - 1 ? `Abutment ${k + 1}` : `Pier ${k + 1}`);

export function designTargets(d: BridgeDefinition): DesignTarget[] {
  const slab = d.superstructure === "slab";
  const steel = d.girder.shape === "steel";
  const girderTool = steel ? { tool: "Steel Girder Design Check", kind: "steel-girder-check" } : { tool: "LRFD Bridge Design Check", kind: "lrfd-girder-check" };
  const out: DesignTarget[] = slab
    ? [{ key: "slab", label: "Slab", tool: "Slab Bridge", kind: "slab-bridge", from: "Spans, width, the deck's thickness as its depth, barriers and loads" }]
    : [
        { key: "girders", label: "Girders", ...girderTool, from: steel ? "Spans, the plates, girders, deck, cross-frames and loads" : "Spans, girders, deck and loads" },
        { key: "deck", label: "Deck", tool: "Deck Slab", kind: "deck-slab", from: "Girder spacing, overhang, deck, barrier" },
      ];
  d.supports.forEach((sl, k) => out.push(sl.bearingKind === "pot" || sl.bearingKind === "disc" ? { key: `bearing-${k}`, label: `${lineName(d, k)} ${sl.bearingKind} bearings`, tool: "Pot or Disc Bearing", kind: "pot-disc-bearing", from: "The service loads on the line, its share of the forces along the bridge, the movement" } : { key: `bearing-${k}`, label: `${lineName(d, k)} bearings`, tool: "Elastomeric Bearing", kind: "elastomeric-bearing", from: "The largest bearing reaction on the line, dead and live; the expansion length" }));
  if (d.piers.model) for (let k = 1; k < d.supports.length - 1; k++) out.push({ key: `column-${k}`, label: `${lineName(d, k)} columns`, tool: "Pier Column", kind: "pier-column", from: "Strength I forces at the top of the hardest-worked column, with their concurrent forces" });
  // The substructure and the load path (src/lib/design/bridge/load-path.server.ts): a second group of
  // girders past a joint, each abutment with its approach slab and wingwall, each pier's cap and foundation.
  const g = geometryOf(d);
  let groups = 1;
  try {
    groups = spanGroups(toBridgeInputs(d)).length;
  } catch {
    // laid out as one group
  }
  if (!slab && !steel) for (let gi = 1; gi < groups; gi++) out.splice(gi, 0, { key: `girders-${gi}`, label: `Girders, group ${gi + 1}`, ...girderTool, from: "The spans past the joint, girders, deck and loads" });
  g.supports.forEach((s, k) => {
    const name = s.name || lineName(d, k);
    if (k === 0 || k === g.supports.length - 1) {
      out.push({ key: `abutment-${k}`, label: name, tool: "Abutment", kind: "abutment", from: "Its type, the girders' reactions, the seat and skew" });
      out.push({ key: `approach-${k}`, label: `${name} approach slab`, tool: "Approach Slab", kind: "approach-slab", from: "The roadway's width, skew and the abutment" });
      out.push({ key: `wingwall-${k}`, label: `${name} wingwall`, tool: "Cantilever Wingwall", kind: "cantilever-wingwall", from: "The abutment's height and the fill" });
      const jk = d.supports[k]?.jointKind ?? "auto";
      const from = "The length from the bridge's neutral point (and the approach slab, at an integral abutment); the skew";
      out.push(jk === "modular" ? { key: `joint-${k}`, label: `${name} modular joint`, tool: "Modular Expansion Joint", kind: "modular-joint", from } : jk === "finger" ? { key: `joint-${k}`, label: `${name} finger joint`, tool: "Finger Expansion Joint", kind: "finger-joint", from } : jk === "strip-seal" ? { key: `joint-${k}`, label: `${name} expansion device`, tool: "Strip Seal Expansion Joint", kind: "strip-seal-joint", from } : { key: `joint-${k}`, label: `${name} expansion device`, tool: "Strip seal or modular joint (recommended)", kind: "strip-seal-joint", from: `${from}: a strip seal to 4 in, a modular joint above (CDOT BDM 14.4.4–14.4.5)` });
    } else if (s.pier && d.piers.model) {
      out.push({ key: `cap-${k}`, label: `${name} cap`, tool: "Strut-and-Tie Model", kind: "stm-d-region", from: "The pier's cap and columns, the girders' reactions at their bearings" });
      const f = s.pier.foundation;
      out.push({ key: `foundation-${k}`, label: `${name} foundation`, tool: f === "spread-footing" ? "Spread Footing" : f === "pile-foundation" ? "Pile Foundation" : "Drilled Shaft", kind: f, from: "The column's base forces (start the cap and column first)" });
    }
  });
  // Over water: the scour at each pier and abutment (Bridge Scour, HEC-18), its hydraulics from the hydraulic report; its
  // design flood's total scour goes to each pier's foundation.
  out.push({ key: "scour", label: "Scour", tool: "Bridge Scour", kind: "bridge-scour", from: "The piers' columns and the abutments (the floods' hydraulics from the hydraulic report)" });
  return out;
}

/** The distance along the bridge from a support line to the nearest fixed line (the length that expands toward it). */
function expansionLength(d: BridgeDefinition, line: number): number {
  const x: number[] = [0];
  d.spans.forEach((L) => x.push(x[x.length - 1] + L));
  const fixed = d.supports.flatMap((s, k) => (s.bearing === "fixed" ? [x[k]] : []));
  return fixed.length ? Math.min(...fixed.map((f) => Math.abs(x[line] - f))) : x[x.length - 1];
}

const SERVICE: Selection = { kind: "combination", name: "Service I" };
const STRENGTH: Selection = { kind: "combination", name: "Strength I" };

/** The inputs a design for a target starts with (merged over the tool's defaults), and its name. */
export function designPrefill(target: DesignTarget, d: BridgeDefinition, a: BridgeAnalysis, live: LiveLoad): { inputs: Record<string, unknown>; name: string } {
  const name = target.label;
  if (target.kind === "bridge-scour") {
    // Each pier's columns (a bent of round columns, or a single one) and each abutment; the hydraulics left as the
    // tool's defaults until the hydraulic report's are entered.
    const g = geometryOf(d);
    const piers = g.supports.flatMap((s, k) => {
      if (k === 0 || k === g.supports.length - 1 || !s.pier) return [];
      const p = s.pier;
      const dia = p.columnSize / 12;
      const shape = p.columns > 1 ? "columns" : p.columnShape === "round" ? "circular" : "square";
      return [{ ...SCOUR_DEFAULTS.piers[0], name: s.name || lineName(d, k), support: k, shape, a: dia, L: p.columnShape === "round" ? dia : (p.columnDepth || p.columnSize) / 12, columns: { n: p.columns, spacing: p.columnSpacing } }];
    });
    const abutments = [0, g.supports.length - 1].map((k) => ({ ...SCOUR_DEFAULTS.abutments[0], name: g.supports[k].name || lineName(d, k), support: k }));
    return { inputs: { ...SCOUR_DEFAULTS, piers, abutments }, name };
  }
  if (target.kind === "steel-girder-check") {
    // The plates along the bridge (scaled to its length), the cross-frames at the diaphragms' places, the deck and loads.
    const st = d.girder.steel!;
    const total = d.spans.reduce((a, b) => a + b, 0);
    const sum = st.segments.reduce((a, s) => a + s.length, 0);
    const braces: number[] = [];
    let x0 = 0;
    for (const L of d.spans) {
      for (let k = 1; k <= d.diaphragms.perSpan; k++) braces.push(+(x0 + (L * k) / (d.diaphragms.perSpan + 1)).toFixed(3));
      x0 += L;
    }
    return {
      name,
      inputs: {
        spans: d.spans,
        nGirders: d.nGirders,
        S: d.spacing,
        overhang: d.overhang,
        barrierWidth: d.loads.barrierWidth,
        skew: d.skew,
        deckT: d.deck.thickness,
        sacrificial: d.deck.sacrificial,
        haunch: d.deck.haunch,
        fcDeck: d.deck.fc,
        wcDeck: d.deck.wc,
        Fyw: st.Fyw,
        Fyf: st.Fyf,
        segments: st.segments.map((s) => ({ ...s, length: +((s.length * total) / sum).toFixed(3) })),
        braces,
        loads: { mode: "computed", barrierWeight: d.loads.barrierWeight, fws: d.loads.wearingSurface, dc1: 0, dc2: 0, dw: 0, sip: 15, misc: 15, otherDC1: 0, otherDC2: 0 },
        wind: { V: d.environment?.wind ?? 0, exposure: d.environment?.exposure ?? "C", Z: Math.max(33, d.environment?.height ?? 33), lateral: true, construction: 0 },
      },
    };
  }
  if (target.kind === "lrfd-girder-check")
    return {
      name,
      inputs: {
        shape: d.girder.shape,
        ...(d.girder.custom ? { custom: d.girder.custom } : {}),
        L: d.spans[0],
        extraSpans: d.spans.slice(1).map((L) => ({ L, strands: null, harped: null })),
        nGirders: d.nGirders,
        S: d.spacing,
        overhang: d.overhang,
        barrierWidth: d.loads.barrierWidth,
        skew: d.skew,
        deckT: d.deck.thickness,
        sacrificial: d.deck.sacrificial,
        haunch: d.deck.haunch,
        fcDeck: d.deck.fc,
        wcDeck: d.deck.wc,
        fc: d.girder.fc,
        wc: d.girder.wc,
        diaphragms: d.diaphragms.perSpan,
        diaphragmWeight: d.diaphragms.weight,
        barrierWeight: d.loads.barrierWeight,
        fws: d.loads.wearingSurface,
      },
    };
  if (target.kind === "deck-slab")
    return { name, inputs: { nGirders: d.nGirders, S: d.spacing, overhang: d.overhang, t: d.deck.thickness - d.deck.sacrificial, fc: d.deck.fc, barrierWidth: d.loads.barrierWidth * 12, barrierWeight: d.loads.barrierWeight } };
  const line = Number(target.key.split("-")[1]);
  if (target.kind === "elastomeric-bearing") {
    // The bearing with the largest total reaction on the line: its permanent load, and its live load.
    // (The live load alone: Service I's envelope also carries the temperature and wind, which the bearing design takes itself.)
    const rows = a.bearings(SERVICE).filter((b) => b.support === line + 1).map((b) => ({ ...b, ll: live.bearing(b.link).max }));
    const worst = rows.reduce((p, b) => (b.vertical + b.ll > p.vertical + p.ll ? b : p));
    return { name, inputs: { DL: +worst.vertical.toFixed(1), LL: +worst.ll.toFixed(1), expansionLength: expansionLength(d, line), jointed: line === 0 || line === d.supports.length - 1 } };
  }
  if (target.kind === "pier-column") {
    // Each column's top (its element runs from the base up): Strength I, the permanent loads plus
    // 1.75 times the live loading that gives the most compression, and the ones for each moment.
    const columns = a.generated.members.filter((m) => m.kind === "column" && m.support === line + 1);
    const cases: { name: string; P: number; MT: number; ML: number; HT: number; HL: number; score: number }[][] = columns.map((m) => {
      const id = m.elements[m.elements.length - 1];
      const st = a.member(m, STRENGTH, 1);
      const perm = st[st.length - 1].forces;
      const gamma = a.liveFactor(STRENGTH);
      const of = (label: string, c: { N: number; Vy: number; Vz: number; My: number; Mz: number } | undefined) => {
        const f = c ?? { N: 0, Vy: 0, Vz: 0, My: 0, Mz: 0 };
        const P = -(perm.N + gamma * f.N); // compression +
        return { name: label, P: +P.toFixed(1), MT: +(perm.Mz + gamma * f.Mz).toFixed(1), ML: +(perm.My + gamma * f.My).toFixed(1), HT: +(perm.Vy + gamma * f.Vy).toFixed(1), HL: +(perm.Vz + gamma * f.Vz).toFixed(1), score: P };
      };
      return [
        of("Strength I, most axial load", live.at(id, 1, "N")?.min.concurrent),
        of("Strength I, least axial load", live.at(id, 1, "N")?.max.concurrent),
        of("Strength I, most moment along the bridge", ((e) => (e ? (Math.abs(e.max.value) > Math.abs(e.min.value) ? e.max.concurrent : e.min.concurrent) : undefined))(live.at(id, 1, "My"))),
        of("Strength I, most moment across the bridge", ((e) => (e ? (Math.abs(e.max.value) > Math.abs(e.min.value) ? e.max.concurrent : e.min.concurrent) : undefined))(live.at(id, 1, "Mz"))),
      ];
    });
    const worst = cases.reduce((p, c) => (c[0].score > p[0].score ? c : p));
    // This pier's own columns (the geometry's pier) and their height in the model.
    const pier = geometryOf(d).supports[line]?.pier;
    const col = columns[0] && a.generated.stage2.elements.find((e) => e.id === columns[0].elements[0]);
    const [n1, n2] = col ? [col.n1, col.n2].map((id) => a.generated.stage2.nodes.find((n) => n.id === id)) : [];
    const height = n1 && n2 ? +Math.abs(n2.z - n1.z).toFixed(2) : d.piers.columnHeight;
    const round = !pier || pier.columnShape === "round";
    return {
      name,
      inputs: {
        shape: round ? "round" : "rectangular",
        T: pier ? pier.columnSize : d.piers.columnDiameter * 12,
        W: pier ? (round ? pier.columnSize : pier.columnDepth) : d.piers.columnDiameter * 12,
        height,
        capDepth: pier ? pier.capDepth : d.piers.capDepth,
        fc: d.piers.fc,
        loads: "entered",
        cases: worst.map(({ score, ...c }) => (void score, c)),
        longitudinal: { bearings: d.supports[line].bearing },
      },
    };
  }
  return { name, inputs: { L: expansionLength(d, line), skew: Math.abs(d.skew) } };
}
