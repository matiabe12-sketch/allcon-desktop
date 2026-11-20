import type { SteelGirderInputs, SteelGirderResult } from "./steel";
import { plates } from "./steel-section";

// The girder's plan sheets as the check sees them: the girder elevation's field sections, plates,
// stiffeners, connection plates and studs, and the camber table at the tenth points (6.7.2).
// The field sections are taken at the plate transitions; their splices are not designed here.

const STEEL_PCF = 490;

/** A length in inches as a fraction to the nearest 1/16: 0.4375 → "7/16", 1.125 → "1 1/8". */
export function fracIn(x: number) {
  const n16 = Math.round(x * 16);
  const w = Math.floor(n16 / 16);
  let num = n16 - w * 16;
  let den = 16;
  if (num === 0) return String(w);
  while (num % 2 === 0) {
    num /= 2;
    den /= 2;
  }
  return `${w ? `${w} ` : ""}${num}/${den}`;
}

/** Feet as feet and inches to the nearest inch: 67.25 → 67'-3". */
export function ftIn(ft: number) {
  let f = Math.floor(ft + 1e-9);
  let i = Math.round((ft - f) * 12);
  if (i === 12) {
    f += 1;
    i = 0;
  }
  return `${f}'-${i}"`;
}

export type FieldSection = { letter: string; k: number; from: number; to: number; name: string; rolled: boolean; D: number; tw: number; top: { b: number; t: number }; bottom: { b: number; t: number }; weight: number };

const letterOf = (k: number) => (k < 26 ? String.fromCharCode(65 + k) : `${String.fromCharCode(64 + Math.floor(k / 26))}${String.fromCharCode(65 + (k % 26))}`);

/** The girder's field sections (one per segment), with their plates and their weight (kip, plates only). */
export function fieldSections(i: SteelGirderInputs, r: SteelGirderResult): FieldSection[] {
  return i.segments.map((s, k) => {
    const p = plates(s);
    const from = r.segmentStarts[k];
    const to = k + 1 < r.segmentStarts.length ? r.segmentStarts[k + 1] : r.total;
    const area = p.top.b * p.top.t + p.D * p.tw + p.bottom.b * p.bottom.t + p.fillet; // in²
    return { letter: letterOf(k), k, from, to, name: p.name, rolled: s.kind === "rolled", D: p.D, tw: p.tw, top: p.top, bottom: p.bottom, weight: ((area / 144) * STEEL_PCF * (to - from)) / 1000 };
  });
}

/** The splices between field sections: where the plates change. */
export const spliceLocations = (r: SteelGirderResult) => r.segmentStarts.slice(1);

/** The supports, ft from the girder's start. */
export const supportLocations = (r: SteelGirderResult) => r.spans.reduce((s, L) => [...s, s[s.length - 1] + L], [0]);

/** The cross-frames' connection plates: the brace points between the supports. */
export function connectionPlates(r: SteelGirderResult) {
  const sup = supportLocations(r);
  return r.braces.filter((b) => !sup.some((x) => Math.abs(x - b) < 1e-6));
}

/** The transverse stiffeners' locations, ft from the girder's start, from each zone's start at its spacing. */
export function transverseStiffeners(i: SteelGirderInputs) {
  const out: number[] = [];
  for (const z of i.stiffeners) {
    if (!(z.spacing > 0) || !(z.to > z.from)) continue;
    const s = z.spacing / 12;
    for (let x = z.from; x <= z.to + 1e-6 && out.length < 2000; x += s) out.push(x);
  }
  return [...new Set(out.map((x) => Math.round(x * 1e4) / 1e4))].sort((a, b) => a - b);
}

/** The points of dead load contraflexure (DC1 + DC2 + DW), interpolated between the stations. */
export function deadLoadContraflexure(r: SteelGirderResult) {
  const st = [...r.stations].sort((a, b) => a.X - b.X);
  const m = (s: (typeof st)[number]) => s.M.dc1 + s.M.dc2 + s.M.dw;
  const out: number[] = [];
  for (let k = 1; k < st.length; k++) {
    const a = m(st[k - 1]);
    const b = m(st[k]);
    if (a === 0 || b === 0 || Math.sign(a) === Math.sign(b) || st[k].X - st[k - 1].X < 1e-9) continue;
    // The moment is near parabolic between the stations: the root of the parabola through three of them.
    const j = k + 1 < st.length ? k + 1 : k - 2;
    const pts = j >= 0 && Math.abs(st[j].X - st[k].X) > 1e-9 && Math.abs(st[j].X - st[k - 1].X) > 1e-9 ? [st[k - 1], st[k], st[j]] : [st[k - 1], st[k]];
    const f = (x: number) => pts.reduce((s, p, n) => s + m(p) * pts.reduce((l, q, o) => (o === n ? l : (l * (x - q.X)) / (p.X - q.X)), 1), 0);
    let lo = st[k - 1].X;
    let hi = st[k].X;
    for (let it = 0; it < 60; it++) {
      const mid = (lo + hi) / 2;
      if (Math.sign(f(mid)) === Math.sign(a)) lo = mid;
      else hi = mid;
    }
    out.push((lo + hi) / 2);
  }
  return out;
}

/** The stud zones along the girder: the given zones' pitch, the general pitch elsewhere. */
export function studZones(i: SteelGirderInputs, r: SteelGirderResult) {
  const cuts = [0, r.total, ...i.studs.zones.flatMap((z) => [z.from, z.to])].filter((x) => x >= 0 && x <= r.total);
  const xs = [...new Set(cuts.map((x) => Math.round(x * 1e4) / 1e4))].sort((a, b) => a - b);
  const zones: { from: number; to: number; pitch: number }[] = [];
  for (let k = 1; k < xs.length; k++) {
    const mid = (xs[k - 1] + xs[k]) / 2;
    const z = i.studs.zones.find((q) => q.pitch > 0 && mid >= q.from && mid <= q.to);
    const pitch = z ? z.pitch : i.studs.pitch;
    const last = zones[zones.length - 1];
    if (last && Math.abs(last.pitch - pitch) < 1e-9) last.to = xs[k];
    else zones.push({ from: xs[k - 1], to: xs[k], pitch });
  }
  return zones;
}

export type CamberRow = { span: number; at: number; X: number; steel: number; deck: number; dc2: number; dw: number; camber: number };

/** The camber table: every span's tenth points, the supports at zero. The camber is the DC1 and DC2 deflection (the future wearing surface listed, not included). */
export function camberRows(r: SteelGirderResult): CamberRow[] {
  const sup = supportLocations(r);
  return r.spans.flatMap((_, j) => {
    const zero = (X: number, at: number): CamberRow => ({ span: j, at, X, steel: 0, deck: 0, dc2: 0, dw: 0, camber: 0 });
    const inner = r.camber.filter((c) => c.span === j).map((c): CamberRow => ({ span: j, at: c.at, X: c.X, steel: c.steel, deck: c.deck, dc2: c.dc2, dw: c.dw, camber: c.total }));
    return [zero(sup[j], 0), ...inner, zero(sup[j + 1], 1)];
  });
}
