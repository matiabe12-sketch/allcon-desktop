import { modulus } from "../design/girders/prestressed";
import { customShape, profileProps, shapeById, type GirderShape } from "../design/girders/sections";
import { bridgeLayout, type PierShape } from "../design/bridge/bridge";
import type { BridgeDefinition } from "./definition";
import { pierFrom, toBridgeInputs } from "./geometry";
import { emptyModel, ModelError, type Dof6, type Element, type Load, type Model, type Section } from "./model";

// The analysis model of a girder bridge from its definition, as midas Civil's Prestressed Composite
// Bridge Wizard builds its "All Frame" model: a grillage of beam elements. Each girder is a line of
// elements at the tenth points (and at the diaphragms), with the composite section's properties;
// transverse deck strips join the girders at every station; diaphragms are beams between them;
// bearings are elastic links down to the abutments (fixed supports) or to the pier caps, which
// stand on their columns.
//
// Two models, for the two states a girder bridge acts in (midas's composite section stages):
// - stage 1, the girders alone on simple spans, for their own weight, the deck, the haunch and the
//   diaphragms (the deck is wet concrete: it adds load, not stiffness);
// - stage 2, the composite grillage, continuous over the piers if the bridge is made so, for the
//   barriers, the wearing surface and everything after.
// Both number their nodes and elements alike, so results add up member by member.
//
// Axes: X along the bridge from the first support, Y across (the first girder at −Y), Z up; the
// girders' nodes at Z = 0. Units: kip, ft.

export type Member = {
  id: string;
  kind: "girder" | "cap" | "column";
  name: string;
  /** Element ids in order along the member. */
  elements: number[];
  girder?: number; // 1-based
  span?: number; // 1-based
  support?: number; // 1-based support line (caps and columns)
};

export type BearingRef = { link: number; support: number; girder: number; node: number };

export type Generated = {
  stage1: Model;
  stage2: Model;
  members: Member[];
  bearings: BearingRef[];
  /** Section properties as used, for the page and the calc (in, in², in⁴). */
  properties: {
    girder: { A: number; I: number; yb: number; weight: number }; // weight klf
    composite: { interior: Composite; exterior: Composite };
    n: number; // deck / girder modular ratio
    Ec: { girder: number; deck: number }; // ksi
  };
  /** Station positions along the bridge at the centerline (ft), and the stations at the supports. */
  stations: number[];
  supportStations: number[];
  /** Across the bridge: each girder's Y, the deck's edges, the roadway between the barriers; the skew's tangent; a girder element's id from its girder (0-based) and first station. */
  layout: {
    girderY: number[]; // at midspan of the first span (a flared bridge's change along it: girderYAt)
    deck: [number, number];
    roadway: [number, number];
    tan: number; // the first support's skew (each support's own: plan, locate)
    girderElement: (girder: number, station: number) => number;
    /** Each girder's Y where the bridge is at X (they change along a flared bridge). */
    girderYAt: (X: number) => number[];
    /** Where on its girder a point at X (along the bridge) on girder k falls: the element and the distance along it; null off the girder. */
    locate: (k: number, X: number) => { element: number; a: number } | null;
    /** Where a point S along the bridge (as its stations count) is at Y: between the support lines' crossings of that line. */
    laneX: (S: number, y: number) => number;
    /** The plan outline of the strip between Y = ya and yb, from the first support line to the last (each at its skew). */
    plan: (ya: number, yb: number) => [number, number][];
  };
};

/** Section ids: the girder (1), composite interior (2), exterior left (3) and right (4); diaphragm 20; each pier i's cap 30 + 2i and column 31 + 2i; deck strips from 100. */
export const isGirderSection = (sec: number) => sec >= 1 && sec <= 4;
export const isCapSection = (sec: number) => sec >= 30 && sec < 60 && sec % 2 === 0;
export const isColumnSection = (sec: number) => sec >= 30 && sec < 60 && sec % 2 === 1;

/** Each support line in the model's axes (X along the bridge from the first support, Y across from the bridge line): where it crosses each girder. */
type Line = { X: number; ends: { X: number; Y: number }[] };

/** The support lines from the bridge's geometry (geometry.ts): each girder's ends where the skewed support lines cross the (flared) girder lines, in stations and offsets along the alignment. */
function geometryLines(d: BridgeDefinition): { lines: Line[]; columnHeights: (number | null)[] } {
  const b = toBridgeInputs(d);
  let lay: ReturnType<typeof bridgeLayout>;
  try {
    lay = bridgeLayout(b);
  } catch (e) {
    throw new ModelError(e instanceof Error ? e.message : "The bridge can't be laid out.");
  }
  const s0 = lay.supports[0].station;
  return {
    lines: lay.supports.map((s) => ({ X: s.station - s0, ends: s.ends.map((e) => ({ X: e.station - s0, Y: e.offset - b.bridgeLineOffset })) })),
    columnHeights: lay.supports.map((_, k) => lay.piers[k]?.columnHeight ?? null),
  };
}

type Composite = { beff: number; A: number; I: number; yb: number };

const IN2 = 1 / 144;
const IN4 = 1 / 20736;
const STIFF = 1e7; // kip/ft and kip·ft/rad: a bearing's stiff directions
const FIXED: Dof6<boolean> = [true, true, true, true, true, true];

/** Torsion constant of an I-shaped girder (in⁴): its flanges and web as thin rectangles, Σ b·t³/3 with the end correction. */
function torsionConstant(shape: GirderShape): number {
  const p = shape.profile;
  const tw = shape.web;
  const rect = (b: number, t: number) => (t <= 0 || b <= 0 ? 0 : b > t ? (b * t ** 3 * (1 - (0.63 * t) / b)) / 3 : (t * b ** 3 * (1 - (0.63 * b) / t)) / 3);
  // A flange: the part of the outline wider than twice the web, from the bottom up or the top down.
  const flange = (pts: typeof p) => {
    let area = 0;
    let width = 0;
    for (let k = 1; k < pts.length; k++) {
      const [y0, h0] = pts[k - 1];
      const [y1, h1] = pts[k];
      if (2 * Math.max(h0, h1) <= 2 * tw + 1e-9) break;
      area += Math.abs(y1 - y0) * (h0 + h1);
      width = Math.max(width, 2 * h0, 2 * h1);
    }
    return { area, width, t: width ? area / width : 0 };
  };
  const bottom = flange(p);
  const top = flange([...p].reverse());
  const web = Math.max(0, shape.depth - bottom.t - top.t);
  return rect(bottom.width, bottom.t) + rect(top.width, top.t) + rect(web, tw);
}

/** A rectangle's torsion constant (the wider side b, the thinner t). */
const rectJ = (a: number, c: number) => {
  const b = Math.max(a, c);
  const t = Math.min(a, c);
  return b * t ** 3 * (1 / 3 - 0.21 * (t / b) * (1 - t ** 4 / (12 * b ** 4)));
};

function compositeProps(g: { A: number; I: number; yb: number }, H: number, beff: number, ts: number, n: number): Composite {
  const Ad = beff * ts * n;
  const yd = H + ts / 2;
  const A = g.A + Ad;
  const yb = (g.A * g.yb + Ad * yd) / A;
  const I = g.I + g.A * (g.yb - yb) ** 2 + (beff * n * ts ** 3) / 12 + Ad * (yd - yb) ** 2;
  return { beff, A, I, yb };
}

export function generate(d: BridgeDefinition): Generated {
  const shape = d.girder.custom ? customShape(d.girder.custom.profile, d.girder.custom.web, d.girder.custom.topWidth) : shapeById(d.girder.shape);
  if (!shape) throw new ModelError("Pick a girder section.");
  if (d.supports.length !== d.spans.length + 1) throw new ModelError("The bridge needs a support line at each end of every span.");
  const nG = d.nGirders;
  const g = profileProps(shape.profile);
  const EcG = modulus(1, d.girder.wc, d.girder.fc);
  const EcD = modulus(1, d.deck.wc, d.deck.fc);
  const EcP = modulus(1, 0.15, d.piers.fc);
  const n = EcD / EcG;
  const ts = d.deck.thickness - d.deck.sacrificial; // in, structural
  const Jg = torsionConstant(shape);
  const tan = Math.tan((d.skew * Math.PI) / 180);
  const yOf = (k: number) => (k - (nG - 1) / 2) * d.spacing;

  // The support lines: from the bridge's geometry (each support's station, skew and girder spacing), or
  // straight across at the one skew; and the deck's edges from the bridge line. A skew is + clockwise
  // (as PGSuper and the geometry take it): the line falls back along the bridge to the right (+Y).
  const supportX: number[] = [0];
  d.spans.forEach((L) => supportX.push(supportX[supportX.length - 1] + L));
  const geo = d.geometry ? geometryLines(d) : null;
  const lines: Line[] = geo ? geo.lines : supportX.map((X) => ({ X, ends: Array.from({ length: nG }, (_, k) => ({ X: X - yOf(k) * tan, Y: yOf(k) })) }));
  const leftEdge = d.geometry ? d.geometry.leftEdge : -yOf(0) + d.overhang;
  const rightEdge = d.geometry ? d.geometry.rightEdge : yOf(nG - 1) + d.overhang;
  const ovL = leftEdge + yOf(0);
  const ovR = rightEdge - yOf(nG - 1);
  const comp = { interior: compositeProps(g, shape.depth, d.spacing * 12, ts, n), exterior: compositeProps(g, shape.depth, (d.spacing / 2 + ovL) * 12, ts, n), right: compositeProps(g, shape.depth, (d.spacing / 2 + ovR) * 12, ts, n) };
  const twoSides = Math.abs(ovL - ovR) > 1e-6;

  // Stations along the bridge: each span's divisions and its diaphragms; the supports' stations.
  const stations: number[] = [0];
  const supportStations: number[] = [0];
  const diaphragmStations = new Set<number>();
  let x0 = 0;
  for (const L of d.spans) {
    const local = new Set<number>();
    for (let k = 1; k <= d.divisions; k++) local.add(+((L * k) / d.divisions).toFixed(6));
    const dia: number[] = [];
    for (let k = 1; k <= d.diaphragms.perSpan; k++) dia.push(+((L * k) / (d.diaphragms.perSpan + 1)).toFixed(6));
    dia.forEach((v) => local.add(v));
    const sorted = [...local].sort((a, b) => a - b).filter((v, k, a) => k === 0 || v - a[k - 1] > 1e-4);
    for (const v of sorted) {
      stations.push(x0 + v);
      if (dia.some((t) => Math.abs(t - v) < 1e-4)) diaphragmStations.add(stations.length - 1);
    }
    x0 += L;
    supportStations.push(stations.length - 1);
  }
  const nS = stations.length;
  /** The span a station is in (a support's station: the span it ends), and how far along it. */
  const spanAt = (s: number) => {
    let j = 0;
    while (j < d.spans.length - 1 && supportStations[j + 1] < s) j++;
    return { j, t: (stations[s] - supportX[j]) / d.spans[j] };
  };
  /** Girder k's point at station s: between the support lines' crossings of its line. */
  const pointOn = (k: number, s: number) => {
    const { j, t } = spanAt(s);
    const a = lines[j].ends[k];
    const b = lines[j + 1].ends[k];
    return { X: a.X + t * (b.X - a.X), Y: a.Y + t * (b.Y - a.Y) };
  };
  /** Support line k's X where it reaches Y (straight through its first and last girders' crossings). */
  const lineX = (sl: number, y: number) => {
    const e = lines[sl].ends;
    const a = e[0];
    const b = e[e.length - 1];
    return Math.abs(b.Y - a.Y) < 1e-9 ? a.X : a.X + ((y - a.Y) * (b.X - a.X)) / (b.Y - a.Y);
  };
  /** The deck girder k carries at station s (half to each neighbour, the overhang at the edges), ft. */
  const tributeAt = (k: number, s: number) => {
    const y = pointOn(k, s).Y;
    const lo = k > 0 ? (y - pointOn(k - 1, s).Y) / 2 : y + leftEdge;
    const hi = k < nG - 1 ? (pointOn(k + 1, s).Y - y) / 2 : rightEdge - y;
    return { width: lo + hi, overhang: k === 0 ? y + leftEdge : k === nG - 1 ? rightEdge - y : 0 };
  };
  const girderNode = (k: number, s: number) => 1000 * (k + 1) + s;
  const girderElement = (k: number, s: number) => 10000 * (k + 1) + s;

  const base = emptyModel();
  base.materials.push(
    { id: 1, name: `Girder concrete, f'c ${d.girder.fc} ksi`, E: EcG * 144, G: (EcG * 144) / 2.4, density: d.girder.wc, alpha: 6e-6 },
    { id: 2, name: `Deck concrete, f'c ${d.deck.fc} ksi`, E: EcD * 144, G: (EcD * 144) / 2.4, density: 0, alpha: 6e-6 },
    { id: 3, name: `Pier concrete, f'c ${d.piers.fc} ksi`, E: EcP * 144, G: (EcP * 144) / 2.4, density: 0.15, alpha: 6e-6 },
  );
  const shearArea = shape.web * shape.depth * IN2;
  const sections: Section[] = [
    { id: 1, name: `${shape.name}`, A: g.A * IN2, Asy: 0, Asz: shearArea, J: Jg * IN4, Iy: g.I * IN4, Iz: g.Iy * IN4 },
    ...((twoSides ? ["interior", "exterior", "right"] : ["interior", "exterior"]) as ("interior" | "exterior" | "right")[]).map((side, k) => {
      const c = comp[side];
      const label = side === "exterior" && twoSides ? "exterior, left" : side === "right" ? "exterior, right" : side;
      return { id: 2 + k, name: `${shape.name} composite, ${label}`, A: c.A * IN2, Asy: 0, Asz: shearArea, J: (Jg + (n * c.beff * ts ** 3) / 6) * IN4, Iy: c.I * IN4, Iz: (g.Iy + (n * ts * c.beff ** 3) / 12) * IN4 };
    }),
  ];
  // Diaphragm: a rectangle three quarters of the girder's depth.
  const dh = (0.75 * shape.depth) / 12;
  const dt = d.diaphragms.thickness;
  sections.push({ id: 20, name: "Diaphragm", A: dh * dt, Asy: 0, Asz: (5 / 6) * dh * dt, J: rectJ(dh, dt), Iy: (dt * dh ** 3) / 12, Iz: (dh * dt ** 3) / 12 });
  // Each pier: its cap and columns, from the geometry's pier (its own shape and column height) or the wizard's one pier.
  type PierModel = { cap: [number, number]; columns: number; spacing: number; round: boolean; size: number; depth: number; height: number; capSec: number; colSec: number; capArea: number; colArea: number };
  const pierModels = new Map<number, PierModel>();
  d.supports.forEach((_, sl) => {
    if (sl === 0 || sl === d.supports.length - 1) return;
    const i = sl - 1;
    const p: PierShape = d.geometry ? (d.geometry.supports[sl]?.pier ?? pierFrom(d)) : { ...pierFrom(d), capWidth: d.piers.capWidth * 12, columnSize: d.piers.columnDiameter * 12, columnDepth: d.piers.columnDiameter * 12, columnSpacing: d.piers.columnSpacing, columns: d.piers.columns };
    // A foundation top of 0 means none given: the wizard's column height, as before the geometry.
    const height = (geo && p.foundationTop !== 0 ? geo.columnHeights[sl] : null) ?? d.piers.columnHeight;
    const [cb, cd] = [p.capWidth / 12, p.capDepth];
    const round = p.columnShape === "round";
    const [cs, cdp] = [p.columnSize / 12, (round ? p.columnSize : p.columnDepth) / 12];
    const m: PierModel = { cap: [cb, cd], columns: p.columns, spacing: p.columnSpacing, round, size: cs, depth: cdp, height: Math.max(3, height), capSec: 30 + 2 * i, colSec: 31 + 2 * i, capArea: cb * cd, colArea: round ? (Math.PI * cs ** 2) / 4 : cs * cdp };
    pierModels.set(sl, m);
    sections.push({ id: m.capSec, name: d.supports.length > 3 ? `Pier ${sl} cap` : "Pier cap", A: cb * cd, Asy: (5 / 6) * cb * cd, Asz: (5 / 6) * cb * cd, J: rectJ(cb, cd), Iy: (cb * cd ** 3) / 12, Iz: (cd * cb ** 3) / 12 });
    const Ic = round ? (Math.PI * cs ** 4) / 64 : (cs * cdp ** 3) / 12;
    const Iz = round ? Ic : (cdp * cs ** 3) / 12;
    sections.push({ id: m.colSec, name: d.supports.length > 3 ? `Pier ${sl} column` : "Pier column", A: m.colArea, Asy: 0.9 * m.colArea, Asz: 0.9 * m.colArea, J: round ? 2 * Ic : rectJ(cs, cdp), Iy: Ic, Iz });
  });
  // Deck strips: a slab the width of the stretch of girder each one stands for (their torsion
  // halved, as a grillage's slab members are: the girders' sections carry the other half).
  const stripSection = new Map<string, number>();
  const strip = (width: number) => {
    const key = width.toFixed(4);
    let id = stripSection.get(key);
    if (!id) {
      id = 100 + stripSection.size;
      stripSection.set(key, id);
      const t = ts / 12;
      sections.push({ id, name: `Deck strip, ${+width.toFixed(2)} ft`, A: width * t, Asy: 0, Asz: 0, J: (width * t ** 3) / 6, Iy: (width * t ** 3) / 12, Iz: (t * width ** 3) / 12 });
    }
    return id;
  };
  base.sections = sections;

  // The girders.
  const members: Member[] = [];
  for (let k = 0; k < nG; k++)
    for (let s = 0; s < nS; s++) {
      const p = pointOn(k, s);
      base.nodes.push({ id: girderNode(k, s), x: p.X, y: p.Y, z: 0 });
    }
  for (let k = 0; k < nG; k++)
    for (let sp = 0; sp < d.spans.length; sp++) {
      const ids: number[] = [];
      for (let s = supportStations[sp]; s < supportStations[sp + 1]; s++) ids.push(girderElement(k, s));
      members.push({ id: `G${k + 1}-S${sp + 1}`, kind: "girder", name: `Girder ${k + 1}, span ${sp + 1}`, elements: ids, girder: k + 1, span: sp + 1 });
    }

  // Bearings and what they stand on.
  const bearings: BearingRef[] = [];
  const substructure: Element[] = [];
  let linkId = 1;
  let subId = 500000;
  d.supports.forEach((line, sl) => {
    const s = supportStations[sl];
    const pm = pierModels.get(sl);
    const onCap = !!pm && d.piers.model;
    const zBearing = -(g.yb + (d.geometry?.supports[sl]?.bearingHeight ?? d.piers.bearingHeight)) / 12;
    const zCap = zBearing - (pm?.cap[1] ?? 0) / 2;
    const z = onCap ? zCap : zBearing;
    const xLine = (y: number) => lineX(sl, y);
    const below = (k: number) => 200000 + 1000 * sl + k;
    for (let k = 0; k < nG; k++) {
      const e = lines[sl].ends[k];
      base.nodes.push({ id: below(k), x: e.X, y: e.Y, z });
      // Link axes (vertical, the girder's node first): x down, y across the bridge, z along it.
      const fixedLine = line.bearing === "fixed";
      base.links.push({ id: linkId, n1: girderNode(k, s), n2: below(k), k: [STIFF, STIFF, fixedLine ? STIFF : 0, 0, 0, STIFF] });
      bearings.push({ link: linkId++, support: sl + 1, girder: k + 1, node: girderNode(k, s) });
      if (!onCap) base.supports.push({ node: below(k), fixed: FIXED });
    }
    if (!onCap || !pm) return;
    // The cap: through the points under the girders and over the columns; the columns to their bases.
    const nc = pm.columns;
    const colY = Array.from({ length: nc }, (_, c) => (c - (nc - 1) / 2) * pm.spacing);
    const points: { y: number; node: number }[] = Array.from({ length: nG }, (_, k) => ({ y: lines[sl].ends[k].Y, node: below(k) }));
    const capIds: number[] = [];
    colY.forEach((y, c) => {
      let top = points.find((p) => Math.abs(p.y - y) < 1e-3)?.node;
      if (!top) {
        top = 300000 + 1000 * sl + c;
        base.nodes.push({ id: top, x: xLine(y), y, z: zCap });
        points.push({ y, node: top });
      }
      const foot = 400000 + 1000 * sl + c;
      base.nodes.push({ id: foot, x: xLine(y), y, z: zCap - pm.cap[1] / 2 - pm.height });
      base.supports.push({ node: foot, fixed: FIXED });
      const id = subId++;
      substructure.push({ id, type: "beam", mat: 3, sec: pm.colSec, n1: foot, n2: top });
      members.push({ id: `P${sl}-C${c + 1}`, kind: "column", name: `Pier ${sl}, column ${c + 1}`, elements: [id], support: sl + 1 });
    });
    points.sort((a, b) => a.y - b.y);
    for (let p = 1; p < points.length; p++) {
      const id = subId++;
      substructure.push({ id, type: "beam", mat: 3, sec: pm.capSec, n1: points[p - 1].node, n2: points[p].node });
      capIds.push(id);
    }
    members.push({ id: `P${sl}-cap`, kind: "cap", name: `Pier ${sl} cap`, elements: capIds, support: sl + 1 });
  });

  // Load cases and loads.
  const loads: { stage: 1 | 2; load: Load }[] = [];
  const stage1Cases = [
    { name: "Girders", type: "DC" as const, description: "The girders' own weight" },
    { name: "Deck and haunch", type: "DC" as const, description: "The deck as cast and the haunches, on the girders alone" },
    { name: "Diaphragms", type: "DC" as const, description: "Intermediate diaphragms" },
    ...(substructure.length ? [{ name: "Substructure", type: "DC" as const, description: "Pier caps and columns" }] : []),
  ];
  const stage2Cases = [
    { name: "Barriers", type: "DC" as const, description: "Barriers, on the composite bridge" },
    { name: "Wearing surface", type: "DW" as const, description: "Future wearing surface" },
  ];
  const wGirder = g.A * IN2 * d.girder.wc;
  const interiorStations = new Set(supportStations);
  for (let k = 0; k < nG; k++) {
    const edge = k === 0 || k === nG - 1;
    for (let s = 0; s < nS - 1; s++) {
      const element = girderElement(k, s);
      // The deck it carries here: the mean of its two ends' widths (a flared bridge's change along the span).
      const width = (tributeAt(k, s).width + tributeAt(k, s + 1).width) / 2;
      const wDeck = width * (d.deck.thickness / 12) * d.deck.wc + shape.topWidth * d.deck.haunch * IN2 * d.deck.wc;
      const wWearing = ((edge ? width - d.loads.barrierWidth : width) * d.loads.wearingSurface) / 1000;
      loads.push({ stage: 1, load: { case: "Girders", kind: "uniform", element, dir: "GZ", w: -wGirder } });
      loads.push({ stage: 1, load: { case: "Deck and haunch", kind: "uniform", element, dir: "GZ", w: -wDeck } });
      if (wWearing > 0) loads.push({ stage: 2, load: { case: "Wearing surface", kind: "uniform", element, dir: "GZ", w: -wWearing } });
      if (edge && d.loads.barrierWeight > 0) loads.push({ stage: 2, load: { case: "Barriers", kind: "uniform", element, dir: "GZ", w: -d.loads.barrierWeight } });
    }
    // A barrier stands outside its girder: its weight's moment about the girder, at the stations.
    if (edge && d.loads.barrierWeight > 0) {
      for (let s = 0; s < nS; s++) {
        const arm = (k === 0 ? -1 : 1) * Math.max(0, tributeAt(k, s).overhang - d.loads.barrierWidth / 2);
        const length = ((s > 0 ? stations[s] - stations[s - 1] : 0) + (s < nS - 1 ? stations[s + 1] - stations[s] : 0)) / 2;
        if (arm) loads.push({ stage: 2, load: { case: "Barriers", kind: "nodal", node: girderNode(k, s), F: [0, 0, 0, -arm * d.loads.barrierWeight * length, 0, 0] } });
      }
    }
    for (const s of diaphragmStations)
      if (!interiorStations.has(s) && d.diaphragms.weight > 0) loads.push({ stage: 1, load: { case: "Diaphragms", kind: "nodal", node: girderNode(k, s), F: [0, 0, -(edge ? 0.5 : 1) * d.diaphragms.weight, 0, 0, 0] } });
  }
  const areaOf = new Map<number, number>();
  for (const pm of pierModels.values()) areaOf.set(pm.capSec, pm.capArea).set(pm.colSec, pm.colArea);
  for (const e of substructure) loads.push({ stage: 1, load: { case: "Substructure", kind: "uniform", element: e.id, dir: "GZ", w: -(areaOf.get(e.sec) ?? 0) * 0.15 } });

  const none: Dof6<boolean> = [false, false, false, false, false, false];
  const hinge: Dof6<boolean> = [false, false, false, false, true, false];
  // Each pier's station, and whether its girders are made continuous (the geometry's pier type, or the wizard's continuity).
  const pierSimple = new Map<number, boolean>(supportStations.slice(1, -1).map((s, i) => [s, d.geometry ? d.geometry.supports[i + 1]?.type === "simple-pier" : d.continuity === "simple"]));
  const build = (stage: 1 | 2): Model => {
    const m: Model = { ...base, nodes: base.nodes, elements: [], loadCases: stage === 1 ? stage1Cases : stage2Cases, loads: loads.filter((l) => l.stage === stage).map((l) => l.load) };
    for (let k = 0; k < nG; k++) {
      const sec = stage === 1 ? 1 : k === 0 ? 3 : k === nG - 1 ? (twoSides ? 4 : 3) : 2;
      for (let s = 0; s < nS - 1; s++)
        m.elements.push({
          id: girderElement(k, s),
          type: "beam",
          mat: 1,
          sec,
          n1: girderNode(k, s),
          n2: girderNode(k, s + 1),
          // Simple spans: a hinge in the girder just before each pier they're simple at (every pier, for the girders alone).
          ...(pierSimple.has(s + 1) && (stage === 1 || pierSimple.get(s + 1)) ? { releases: { i: none, j: hinge } } : {}),
        });
    }
    if (stage === 2) {
      let id = 600000;
      for (let s = 0; s < nS; s++) {
        const width = ((s > 0 ? stations[s] - stations[s - 1] : 0) + (s < nS - 1 ? stations[s + 1] - stations[s] : 0)) / 2;
        const atSupport = interiorStations.has(s);
        const diaphragm = atSupport ? d.diaphragms.atSupports : diaphragmStations.has(s);
        for (let k = 0; k < nG - 1; k++) {
          m.elements.push({ id: id++, type: "beam", mat: 2, sec: strip(width), n1: girderNode(k, s), n2: girderNode(k + 1, s) });
          if (diaphragm) m.elements.push({ id: id++, type: "beam", mat: 2, sec: 20, n1: girderNode(k, s), n2: girderNode(k + 1, s) });
        }
      }
    }
    m.elements.push(...substructure);
    return m;
  };
  const stage2 = build(2); // first: it makes the deck strips' sections
  const stage1 = build(1);
  return {
    stage1,
    stage2,
    members,
    bearings,
    properties: { girder: { A: g.A, I: g.I, yb: g.yb, weight: wGirder }, composite: comp, n, Ec: { girder: EcG, deck: EcD } },
    stations,
    supportStations,
    layout: {
      girderY: girderYAt(d.spans[0] / 2),
      deck: [-leftEdge, rightEdge],
      roadway: [-leftEdge + d.loads.barrierWidth, rightEdge - d.loads.barrierWidth],
      tan,
      girderElement,
      girderYAt,
      locate,
      laneX: (S: number, y: number) => {
        let j = 0;
        while (j < d.spans.length - 1 && S > supportX[j + 1]) j++;
        const a = lineX(j, y);
        return a + ((S - supportX[j]) / d.spans[j]) * (lineX(j + 1, y) - a);
      },
      plan: (ya: number, yb: number) => [...lines.map((_, sl) => [lineX(sl, ya), ya] as [number, number]), ...lines.map((_, sl) => [lineX(sl, yb), yb] as [number, number]).reverse()],
    },
  };

  /** Each girder's Y at X along the bridge (between the support lines' crossings of its line). */
  function girderYAt(X: number): number[] {
    return Array.from({ length: nG }, (_, k) => {
      for (let j = 0; j < d.spans.length; j++) {
        const a = lines[j].ends[k];
        const b = lines[j + 1].ends[k];
        if (X <= b.X + 1e-9 || j === d.spans.length - 1) return a.Y + (Math.abs(b.X - a.X) < 1e-9 ? 0 : (Math.min(Math.max(X, a.X), b.X) - a.X) / (b.X - a.X)) * (b.Y - a.Y);
      }
      return lines[0].ends[k].Y;
    });
  }

  function locate(k: number, X: number): { element: number; a: number } | null {
    for (let j = 0; j < d.spans.length; j++) {
      const a = lines[j].ends[k];
      const b = lines[j + 1].ends[k];
      if (X < a.X - 1e-9 || X > b.X + 1e-9) continue;
      const S = supportX[j] + (Math.abs(b.X - a.X) < 1e-9 ? 0 : (X - a.X) / (b.X - a.X)) * d.spans[j];
      let st = supportStations[j];
      while (st < supportStations[j + 1] - 1 && stations[st + 1] <= S) st++;
      const p = pointOn(k, st);
      const q = pointOn(k, st + 1);
      const len = Math.hypot(q.X - p.X, q.Y - p.Y);
      const f = Math.min(Math.max((S - stations[st]) / (stations[st + 1] - stations[st]), 0), 1);
      return { element: girderElement(k, st), a: f * len };
    }
    return null;
  }
}
