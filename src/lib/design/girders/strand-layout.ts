import { debondSets, type HarpedStrands, type StrandRow } from "./prestressed";
import { isAdjacent, type GirderShape } from "./sections";

// Where each strand of a girder design sits: its place on the 2 in strand grid across the section and its
// height along the girder, so the strands can be drawn in elevation and in section at any cut.
//
// The grid (2 in each way, no strand on the centerline, so a row holds pairs at x = ±1, ±3, … in):
// - CDOT Colorado Bulb Tee, sheet B-618-CBT2 (CBT 90 detail, the bottom flange the same for every depth):
//   18 strands in the rows at 2.25 and 4.25 in, 12 at 6.25 in, 6 at 8.25 in, then a pair (x = ±1 in) up the
//   web; the harped strands no higher than 6 in below the top (the sheet's designer note).
// - Prestressed box, sheet B-618-BX: rows across the bottom slab, the outermost strand 2.75 in from the
//   side as the CBT's (the BX sheet draws them at the 2 in grid without dimensioning the edge); the
//   exterior strands are placed first, against the walls' anchor stirrups (the sheet's note, and its
//   designer note that exterior strands aren't debonded).
// - Other shapes: the 2 in grid with the outermost strand 2.75 in inside the face at its height, a pair
//   up the web.
// The harped strands are pairs at x = ±1 in, 2 in apart vertically about the group's centroid (as the
// girder check takes them); at the harp point they take those grid places, so a straight row leaves them.
// Straight strands fill a row from the centerline out (I and bulb tee) or from the sides in (box); the
// debonded ones are the row's innermost, the outermost bonded (AASHTO 5.9.4.3.3 I).

export const STRAND_PITCH = 2; // in

export type PlacedStrand = {
  x: number; // in from the girder's centerline
  kind: "straight" | "harped";
  /** Straight: its height. Harped: its height at the harp points. */
  y: number;
  /** Harped: its height at the girder's ends. */
  yEnd?: number;
  /** ft from each end of the girder with the strand debonded (0 if bonded throughout). */
  debondLength: number;
  /** Outside the grid's places for its row (the row holds more strands than the grid has room for). */
  offGrid?: boolean;
};

export type StrandLayout = {
  strands: PlacedStrand[];
  Lg: number; // ft, girder length
  harpPoint: number; // fraction of Lg from each end
  fill: "center-out" | "sides-in";
  grid: string; // where the grid comes from
  notes: string[]; // anything that doesn't fit the grid
};

const oddFloor = (v: number) => {
  const n = Math.floor(v + 1e-9);
  return n % 2 === 0 ? n - 1 : n;
};

/** The outermost grid place (in, odd) a strand can take at height y; 0 for none. */
export function gridHalfWidth(shape: GirderShape, y: number): number {
  if (shape.family === "CDOT Colorado Bulb Tee") {
    if (y <= 4.25 + 0.5) return 17;
    if (y <= 6.25 + 0.5) return 11;
    if (y <= 8.25 + 0.5) return 5;
    return y <= shape.depth - 6 + 1e-6 ? 1 : 0;
  }
  if (shape.family === "Prestressed slab") return y <= shape.depth - 2 ? Math.max(1, oddFloor(shape.topWidth / 2 - 2.75)) : 0; // the whole width, 2 in cover
  if (shape.family === "Prestressed box") {
    const tb = shape.profile[1][0];
    return y <= tb - 1.5 ? Math.max(1, oddFloor(shape.topWidth / 2 - 2.75)) : 0;
  }
  // The narrowest width within the strand's diameter of its height.
  const hw = Math.min(...[-0.3, 0, 0.3].map((d) => halfWidthAt(shape, Math.min(shape.depth, Math.max(0, y + d)))));
  const m = hw - 2.75;
  return m >= 1 ? oddFloor(m) : hw >= 2.5 ? 1 : 0;
}

function halfWidthAt(shape: GirderShape, y: number): number {
  const p = shape.profile;
  for (let k = 0; k < p.length - 1; k++) {
    const [y0, w0] = p[k];
    const [y1, w1] = p[k + 1];
    if (y >= y0 && y <= y1) return y1 === y0 ? Math.min(w0, w1) : w0 + ((w1 - w0) * (y - y0)) / (y1 - y0);
  }
  return 0;
}

/** The harped strands: pairs about the centroid, 2 in apart, the last one alone when the count is odd. */
export function harpedStrands(h: HarpedStrands | null | undefined): PlacedStrand[] {
  if (!h || h.count <= 0) return [];
  const pairs = Math.ceil(h.count / 2);
  const out: PlacedStrand[] = [];
  for (let r = 0; r < pairs; r++) {
    const dy = STRAND_PITCH * r - (pairs - 1);
    const n = r === pairs - 1 && h.count % 2 ? 1 : 2;
    for (const x of n === 2 ? [-1, 1] : [1]) out.push({ x, kind: "harped", y: h.yHarp + dy, yEnd: h.yEnd + dy, debondLength: 0 });
  }
  return out;
}

export function strandLayout(shape: GirderShape, d: { strands: StrandRow[]; harped: HarpedStrands | null }, Lg: number): StrandLayout {
  const box = isAdjacent(shape);
  const notes: string[] = [];
  const harped = harpedStrands(d.harped);
  const strands: PlacedStrand[] = [...harped];
  for (const row of [...d.strands].sort((a, b) => a.y - b.y)) {
    if (row.count <= 0) continue;
    const m = gridHalfWidth(shape, row.y);
    // The grid's places on one side, less those the harped strands take at the harp point.
    const taken = (x: number) => harped.some((h) => Math.abs(h.x - x) < 0.5 && Math.abs(h.y - row.y) < STRAND_PITCH - 0.4);
    let side: number[] = [];
    for (let x = 1; x <= m; x += 2) side.push(x);
    side = box ? side.reverse() : side;
    const places: number[] = [];
    for (const x of side) {
      if (!taken(-x)) places.push(-x);
      if (!taken(x)) places.push(x);
    }
    // Pairs first; an odd strand takes the next place on the right.
    const xs = places.slice(0, row.count);
    if (row.count % 2 && row.count <= places.length) {
      const pairs = xs.slice(0, row.count - 1);
      const next = places.slice(row.count - 1).find((x) => x > 0) ?? places[row.count - 1];
      xs.splice(0, xs.length, ...pairs, next);
      notes.push(`The row at ${row.y} in has an odd count (${row.count}): one strand sits off the centerline's symmetry on the 2 in grid.`);
    }
    const extra = row.count - xs.length;
    if (extra > 0) {
      notes.push(`The row at ${row.y} in holds ${row.count} strands; the grid has ${places.length} places there${box ? "" : " (with the harped strands at the harp point)"}: ${extra} drawn outside it.`);
      const far = Math.max(m, ...xs.map(Math.abs), 0);
      for (let k = 0; k < extra; k++) xs.push((k % 2 ? 1 : -1) * (far + STRAND_PITCH * (1 + Math.floor(k / 2))));
    }
    // The debonded ones: the innermost of the row, the longest debonding innermost (pairs about the centerline).
    const lengths = debondSets(row).sort((a, b) => b.length - a.length).flatMap((d) => Array<number>(d.count).fill(d.length));
    const order = [...xs].sort((a, b) => Math.abs(a) - Math.abs(b) || a - b);
    const lenAt = new Map(order.slice(0, lengths.length).map((x, k) => [x, lengths[k]]));
    xs.forEach((x, k) => strands.push({ x, kind: "straight", y: row.y, debondLength: lenAt.get(x) ?? 0, ...(k >= xs.length - extra && extra > 0 ? { offGrid: true } : {}) }));
  }
  if (shape.family === "CDOT Colorado Bulb Tee" && harped.length) {
    const top = Math.max(...harped.map((h) => h.yEnd!));
    if (top > shape.depth - 6 + 1e-6) notes.push(`The top harped strands are ${top} in up at the ends, above the ${shape.depth - 6} in the CBT sheet allows (6 in from the top).`);
  }
  return {
    strands,
    Lg,
    harpPoint: d.harped?.harpPoint ?? 0.4,
    fill: box ? "sides-in" : "center-out",
    grid: shape.family === "CDOT Colorado Bulb Tee" ? "CDOT sheet B-618-CBT2" : box ? "CDOT sheet B-618-BX" : "the 2 in grid within the section",
    notes,
  };
}

/** A strand's height at x ft from the girder's end. */
export function strandY(s: PlacedStrand, layout: StrandLayout, x: number): number {
  if (s.kind === "straight" || s.yEnd === undefined) return s.y;
  const d = Math.max(0, Math.min(x, layout.Lg - x));
  const xh = layout.harpPoint * layout.Lg;
  return d >= xh || xh <= 0 ? s.y : s.yEnd + ((s.y - s.yEnd) * d) / xh;
}

/** The strands at a cut x ft from the girder's end: each one's place, whether it's bonded there, and the centroids. */
export function strandsAt(layout: StrandLayout, x: number) {
  const d = Math.max(0, Math.min(x, layout.Lg - x));
  const at = layout.strands.map((s) => ({ ...s, yAt: strandY(s, layout, x), bonded: d >= s.debondLength }));
  const bonded = at.filter((s) => s.bonded);
  const cg = (list: typeof at) => (list.length ? list.reduce((t, s) => t + s.yAt, 0) / list.length : 0);
  return { strands: at, n: at.length, nBonded: bonded.length, cgAll: cg(at), cgBonded: cg(bonded) };
}
