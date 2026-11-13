"use client";

import type { PDFPageProxy } from "pdfjs-dist";
import type { Point } from "@/lib/takeoff";

// Snapping to a PDF page's linework, in place of Edit2D's: the page's vector paths are read from
// pdf.js's operator list (with the transforms in force), and measurements snap to their endpoints
// first, then to the nearest point along a line. Coordinates are PDF points, origin top-left.

type Seg = [number, number, number, number];
type Matrix = [number, number, number, number, number, number];

const MOVE = 0;
const LINE = 1;
const CURVE = 2;
const QUAD = 3;
const CLOSE = 4;
const CELL = 24; // grid cell, in points
const MAX_SEGMENTS = 400_000; // very dense sheets: stop collecting rather than stall

const mul = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];

export type Snap = { point: Point; kind: "end" | "line" };

export class SnapIndex {
  private grid = new Map<number, number[]>();
  private segs: Seg[] = [];
  private ends: Point[] = [];
  private endGrid = new Map<number, number[]>();

  private key = (cx: number, cy: number) => cx * 100_003 + cy;

  static async build(page: PDFPageProxy, OPS: Record<string, number>): Promise<SnapIndex> {
    const index = new SnapIndex();
    const list = await page.getOperatorList();
    const viewport = page.getViewport({ scale: 1 });
    let ctm = viewport.transform as Matrix;
    const stack: Matrix[] = [];

    for (let i = 0; i < list.fnArray.length && index.segs.length < MAX_SEGMENTS; i++) {
      const fn = list.fnArray[i];
      const args = list.argsArray[i] as unknown[];
      if (fn === OPS.save) stack.push(ctm);
      else if (fn === OPS.restore) ctm = stack.pop() ?? ctm;
      else if (fn === OPS.transform) ctm = mul(ctm, args as unknown as Matrix);
      else if (fn === OPS.paintFormXObjectBegin) {
        stack.push(ctm);
        const m = args?.[0] as Matrix | null;
        if (Array.isArray(m) || ArrayBuffer.isView(m)) ctm = mul(ctm, Array.from(m as ArrayLike<number>) as Matrix);
      } else if (fn === OPS.paintFormXObjectEnd) ctm = stack.pop() ?? ctm;
      else if (fn === OPS.constructPath) {
        const data = (args?.[1] as unknown[] | undefined)?.[0];
        if (data && (ArrayBuffer.isView(data) || Array.isArray(data))) index.addPath(data as ArrayLike<number>, ctm);
      }
    }
    return index;
  }

  private addPath(d: ArrayLike<number>, m: Matrix) {
    const tx = (x: number, y: number): Point => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
    let cur: Point | null = null;
    let start: Point | null = null;
    for (let i = 0; i < d.length; ) {
      const op = d[i++];
      if (op === MOVE) {
        cur = start = tx(d[i++], d[i++]);
        this.addEnd(cur);
      } else if (op === LINE) {
        const p = tx(d[i++], d[i++]);
        if (cur) this.addSeg(cur, p);
        this.addEnd(p);
        cur = p;
      } else if (op === CURVE) {
        const p = tx(d[i + 4], d[i + 5]);
        i += 6;
        this.addEnd(p);
        cur = p;
      } else if (op === QUAD) {
        const p = tx(d[i + 2], d[i + 3]);
        i += 4;
        this.addEnd(p);
        cur = p;
      } else if (op === CLOSE) {
        if (cur && start) this.addSeg(cur, start);
        cur = start;
      } else break; // unknown: stop reading this path
    }
  }

  private addEnd(p: Point) {
    const id = this.ends.length;
    this.ends.push(p);
    const k = this.key(Math.floor(p[0] / CELL), Math.floor(p[1] / CELL));
    const bucket = this.endGrid.get(k);
    if (bucket) bucket.push(id);
    else this.endGrid.set(k, [id]);
  }

  private addSeg(a: Point, b: Point) {
    if (a[0] === b[0] && a[1] === b[1]) return;
    const id = this.segs.length;
    this.segs.push([a[0], a[1], b[0], b[1]]);
    // Register the segment in every cell its bounding box touches (long lines: sampled cells).
    const x0 = Math.floor(Math.min(a[0], b[0]) / CELL);
    const x1 = Math.floor(Math.max(a[0], b[0]) / CELL);
    const y0 = Math.floor(Math.min(a[1], b[1]) / CELL);
    const y1 = Math.floor(Math.max(a[1], b[1]) / CELL);
    const cells = (x1 - x0 + 1) * (y1 - y0 + 1);
    if (cells <= 64) {
      for (let cx = x0; cx <= x1; cx++)
        for (let cy = y0; cy <= y1; cy++) this.push(this.key(cx, cy), id);
    } else {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const steps = Math.ceil(len / (CELL / 2));
      const seen = new Set<number>();
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const k = this.key(Math.floor((a[0] + t * (b[0] - a[0])) / CELL), Math.floor((a[1] + t * (b[1] - a[1])) / CELL));
        if (!seen.has(k)) {
          seen.add(k);
          this.push(k, id);
        }
      }
    }
  }

  private push(k: number, id: number) {
    const bucket = this.grid.get(k);
    if (bucket) bucket.push(id);
    else this.grid.set(k, [id]);
  }

  /** The snap point near `p` within `tol` points: an endpoint if there is one, else a line. */
  find(p: Point, tol: number): Snap | null {
    const r = Math.ceil(tol / CELL);
    const cx = Math.floor(p[0] / CELL);
    const cy = Math.floor(p[1] / CELL);
    let best: Point | null = null;
    let bestD = tol;
    for (let dx = -r; dx <= r; dx++)
      for (let dy = -r; dy <= r; dy++)
        for (const id of this.endGrid.get(this.key(cx + dx, cy + dy)) ?? []) {
          const e = this.ends[id];
          const d = Math.hypot(e[0] - p[0], e[1] - p[1]);
          if (d < bestD) {
            bestD = d;
            best = e;
          }
        }
    if (best) return { point: [best[0], best[1]], kind: "end" };

    bestD = tol * 0.75;
    const seen = new Set<number>();
    for (let dx = -r; dx <= r; dx++)
      for (let dy = -r; dy <= r; dy++)
        for (const id of this.grid.get(this.key(cx + dx, cy + dy)) ?? []) {
          if (seen.has(id)) continue;
          seen.add(id);
          const [ax, ay, bx, by] = this.segs[id];
          const vx = bx - ax;
          const vy = by - ay;
          const len = vx * vx + vy * vy;
          const t = Math.max(0, Math.min(1, ((p[0] - ax) * vx + (p[1] - ay) * vy) / len));
          const q: Point = [ax + t * vx, ay + t * vy];
          const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
          if (d < bestD) {
            bestD = d;
            best = q;
          }
        }
    return best ? { point: best, kind: "line" } : null;
  }
}
