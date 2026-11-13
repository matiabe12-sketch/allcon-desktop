"use client";

import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist";
import { loadPdfjs } from "@/lib/pdf/client";
import type { Point } from "@/lib/takeoff";
import { SnapIndex, type Snap } from "./snaps";
import type { View } from "./view";

// The sheet viewer, fully local (the desktop app has no Autodesk Viewer): pdf.js renders the
// page onto a canvas, and lengths and areas are drawn and edited on an SVG layer here, in place of
// Edit2D. Everything else (counts, notes, arrows, clouds) is drawn by the workspace's overlay.
//
// Coordinates are PDF points (1/72 in), origin top-left, as pdf.js reports them. The view maps
// them to the container: screen = point * zoom + (tx, ty).

export type ShapeKind = "length" | "area";
export type ControllerTool = "select" | "pan" | "length" | "area" | "calibrate" | "click";

export type ControllerEvents = {
  onReady: () => void;
  onError: (message: string) => void;
  onView: (view: View) => void;
  /** A new length/area shape was finished; resolve with the saved markup id. */
  onShapeCreated: (kind: ShapeKind, points: Point[]) => Promise<string | null>;
  onShapeChanged: (markupId: string, points: Point[]) => void;
  onShapeDeleted: (markupId: string) => void;
  onCalibrationLine: (lengthInPoints: number) => void;
  onSelect: (markupId: string | null) => void;
  /** Clicks and moves for tools drawn by the overlay (count, note, arrow, cloud). */
  onClick: (point: Point, shift: boolean) => void;
  onMove: (point: Point | null, shift: boolean) => void;
  onDoubleClick: () => void;
};

type Shape = { id: string; kind: ShapeKind; points: Point[]; color: string };
type Drag =
  | { type: "pan"; x: number; y: number; tx: number; ty: number; moved: boolean }
  | { type: "vertex"; shape: Shape; index: number; moved: boolean }
  | { type: "body"; shape: Shape; start: Point; original: Point[]; moved: boolean };

const SVG_NS = "http://www.w3.org/2000/svg";
const HIT_PX = 7;
const MIN_ZOOM = 0.02;
const MAX_ZOOM = 40;

const dist = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const ortho = (from: Point, to: Point): Point =>
  Math.abs(to[0] - from[0]) >= Math.abs(to[1] - from[1]) ? [to[0], from[1]] : [from[0], to[1]];

function segmentDistance(p: Point, a: Point, b: Point) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len)) : 0;
  return dist(p, [a[0] + t * dx, a[1] + t * dy]);
}

function insidePolygon(p: Point, pts: Point[]) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export class SheetController {
  private destroyed = false;
  private tool: ControllerTool = "select";
  private view: View = { zoom: 1, tx: 0, ty: 0 };
  private doc: PDFDocumentProxy | null = null;
  private page: PDFPageProxy | null = null;
  private pageW = 0;
  private pageH = 0;

  private canvas = document.createElement("canvas");
  private svg = document.createElementNS(SVG_NS, "svg");
  private base: HTMLCanvasElement | null = null; // the whole page, rendered once
  private baseScale = 1;
  private renderTask: RenderTask | null = null;
  private renderTimer: ReturnType<typeof setTimeout> | null = null;
  private crisp: { zoom: number; tx: number; ty: number } | null = null; // what the canvas shows sharply
  private resize: ResizeObserver | null = null;

  private shapes: Shape[] = [];
  private selected: string | null = null;
  private draft: Point[] = [];
  private cursor: Point | null = null;
  private shift = false;
  private drag: Drag | null = null;
  private spaceDown = false;
  private snaps: SnapIndex | null = null;
  private snapMark: Snap | null = null;

  constructor(
    private container: HTMLElement,
    private pdfUrl: string,
    private pageNumber: number,
    private sheetHeightPts: number,
    private events: ControllerEvents,
    /** Share pages: no editing, only pan and zoom. */
    private readOnly = false,
  ) {
    void this.start().catch((err) => !this.destroyed && events.onError(err?.message ?? "Could not load this sheet"));
  }

  // --- setup -----------------------------------------------------------------------

  private async start() {
    const pdfjs = await loadPdfjs();
    const doc = await pdfjs.getDocument({ url: this.pdfUrl, rangeChunkSize: 512 * 1024, disableAutoFetch: true }).promise;
    if (this.destroyed) return void doc.loadingTask.destroy();
    this.doc = doc;
    const page = await doc.getPage(this.pageNumber);
    this.page = page;
    const vp = page.getViewport({ scale: 1 });
    this.pageW = vp.width;
    this.pageH = vp.height || this.sheetHeightPts;

    const c = this.container;
    c.style.touchAction = "none";
    for (const el of [this.canvas, this.svg] as (HTMLElement | SVGElement)[]) {
      Object.assign(el.style, { position: "absolute", inset: "0", width: "100%", height: "100%" });
    }
    this.svg.style.pointerEvents = "none";
    this.svg.style.overflow = "visible";
    c.append(this.canvas, this.svg);

    // A whole-page bitmap shown at once while panning/zooming; sharper renders follow.
    const maxSide = 6000;
    this.baseScale = Math.min(3, maxSide / Math.max(this.pageW, this.pageH));
    const base = document.createElement("canvas");
    const bvp = page.getViewport({ scale: this.baseScale });
    base.width = Math.ceil(bvp.width);
    base.height = Math.ceil(bvp.height);
    const bctx = base.getContext("2d")!;
    bctx.fillStyle = "#fff";
    bctx.fillRect(0, 0, base.width, base.height);
    await page.render({ canvasContext: bctx, viewport: bvp, canvas: base } as Parameters<PDFPageProxy["render"]>[0]).promise;
    if (this.destroyed) return;
    this.base = base;
    // The page's linework, for snapping (read in the background; measuring works meanwhile).
    if (!this.readOnly) {
      void SnapIndex.build(page, pdfjs.OPS as unknown as Record<string, number>)
        .then((index) => (this.snaps = index))
        .catch(() => {});
    }

    c.addEventListener("pointerdown", this.onPointerDown);
    c.addEventListener("pointermove", this.onPointerMove);
    c.addEventListener("pointerup", this.onPointerUp);
    c.addEventListener("pointerleave", this.onPointerLeave);
    c.addEventListener("dblclick", this.onDoubleClick);
    c.addEventListener("wheel", this.onWheel, { passive: false });
    window.addEventListener("keydown", this.onKeyDown, true);
    window.addEventListener("keyup", this.onKeyUp);
    this.resize = new ResizeObserver(() => this.paint());
    this.resize.observe(c);

    this.fit();
    this.events.onReady();
  }

  // --- coordinates -------------------------------------------------------------

  private fromCanvas = (cx: number, cy: number): Point => [(cx - this.view.tx) / this.view.zoom, (cy - this.view.ty) / this.view.zoom];
  private toScreen = ([x, y]: Point): [number, number] => [x * this.view.zoom + this.view.tx, y * this.view.zoom + this.view.ty];
  private local(e: MouseEvent): [number, number] {
    const r = this.container.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  private setView(view: View) {
    view.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.zoom));
    this.view = view;
    this.paint();
    this.events.onView({ ...view });
  }

  // --- drawing -------------------------------------------------------------------

  private paint() {
    if (!this.base) return;
    const { width, height } = this.container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(width * dpr));
    const h = Math.max(1, Math.round(height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.crisp = null;
    }
    const ctx = this.canvas.getContext("2d")!;
    const { zoom, tx, ty } = this.view;
    const same = this.crisp && this.crisp.zoom === zoom && this.crisp.tx === tx && this.crisp.ty === ty;
    if (!same) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "#e2e8f0";
      ctx.fillRect(0, 0, w, h);
      ctx.imageSmoothingQuality = "high";
      const s = (zoom * dpr) / this.baseScale;
      ctx.setTransform(s, 0, 0, s, tx * dpr, ty * dpr);
      ctx.shadowColor = "rgba(0,0,0,0.25)";
      ctx.shadowBlur = 8;
      ctx.drawImage(this.base, 0, 0);
      ctx.shadowBlur = 0;
      this.crisp = null;
      this.scheduleCrisp();
    }
    this.drawShapes();
  }

  /** Re-renders what's on screen at full sharpness once the view settles. */
  private scheduleCrisp() {
    if (this.renderTimer) clearTimeout(this.renderTimer);
    this.renderTimer = setTimeout(() => void this.renderCrisp(), 150);
  }

  private async renderCrisp() {
    const page = this.page;
    if (!page || this.destroyed) return;
    const dpr = window.devicePixelRatio || 1;
    const { zoom, tx, ty } = this.view;
    // The base bitmap is sharp enough below its own scale.
    if (zoom * dpr <= this.baseScale) return;
    this.renderTask?.cancel();
    const off = document.createElement("canvas");
    off.width = this.canvas.width;
    off.height = this.canvas.height;
    const octx = off.getContext("2d")!;
    octx.fillStyle = "#e2e8f0";
    octx.fillRect(0, 0, off.width, off.height);
    // Only the visible part of the page: the page area clipped to the screen.
    const x0 = Math.max(0, tx * dpr);
    const y0 = Math.max(0, ty * dpr);
    const x1 = Math.min(off.width, (tx + this.pageW * zoom) * dpr);
    const y1 = Math.min(off.height, (ty + this.pageH * zoom) * dpr);
    if (x1 <= x0 || y1 <= y0) return;
    octx.fillStyle = "#fff";
    octx.fillRect(x0, y0, x1 - x0, y1 - y0);
    const viewport = page.getViewport({ scale: zoom * dpr });
    const task = page.render({
      canvasContext: octx,
      viewport,
      transform: [1, 0, 0, 1, tx * dpr, ty * dpr],
      canvas: off,
    } as Parameters<PDFPageProxy["render"]>[0]);
    this.renderTask = task;
    try {
      await task.promise;
    } catch {
      return; // cancelled by a newer view
    }
    if (this.destroyed || this.view.zoom !== zoom || this.view.tx !== tx || this.view.ty !== ty) return;
    const ctx = this.canvas.getContext("2d")!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(off, 0, 0);
    this.crisp = { zoom, tx, ty };
  }

  private drawShapes() {
    const svg = this.svg;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const el = (name: string, attrs: Record<string, string | number>) => {
      const n = document.createElementNS(SVG_NS, name);
      for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
      svg.appendChild(n);
      return n;
    };
    const pts = (ps: Point[]) => ps.map((p) => this.toScreen(p).join(",")).join(" ");

    for (const s of this.shapes) {
      const sel = s.id === this.selected;
      el(s.kind === "area" ? "polygon" : "polyline", {
        points: pts(s.points),
        fill: s.kind === "area" ? s.color : "none",
        "fill-opacity": s.kind === "area" ? 0.15 : 0,
        stroke: s.color,
        "stroke-width": sel ? 3 : 2,
        "stroke-linejoin": "round",
      });
      if (sel && !this.readOnly) {
        for (const p of s.points) {
          const [x, y] = this.toScreen(p);
          el("rect", { x: x - 4, y: y - 4, width: 8, height: 8, fill: "#fff", stroke: s.color, "stroke-width": 1.5 });
        }
      }
    }

    // The shape being drawn.
    if (this.draft.length && (this.tool === "length" || this.tool === "area" || this.tool === "calibrate")) {
      const color = this.tool === "calibrate" ? "#d97706" : "#2563eb";
      const all = this.cursor ? [...this.draft, this.cursor] : this.draft;
      el(this.tool === "area" && all.length > 2 ? "polygon" : "polyline", {
        points: pts(all),
        fill: this.tool === "area" ? color : "none",
        "fill-opacity": this.tool === "area" ? 0.12 : 0,
        stroke: color,
        "stroke-width": 2,
        "stroke-dasharray": "6 4",
      });
      for (const p of this.draft) {
        const [x, y] = this.toScreen(p);
        el("circle", { cx: x, cy: y, r: 3.5, fill: color });
      }
    }

    // Snap marker: a square on an endpoint, a cross-hair diamond on a line.
    const measuring = this.tool === "length" || this.tool === "area" || this.tool === "calibrate" || this.drag?.type === "vertex";
    if (measuring && this.snapMark) {
      const [x, y] = this.toScreen(this.snapMark.point);
      if (this.snapMark.kind === "end") el("rect", { x: x - 6, y: y - 6, width: 12, height: 12, fill: "none", stroke: "#16a34a", "stroke-width": 2 });
      else el("polygon", { points: `${x},${y - 7} ${x + 7},${y} ${x},${y + 7} ${x - 7},${y}`, fill: "none", stroke: "#16a34a", "stroke-width": 2 });
    }
  }

  /**
   * Where a measuring click lands: with Shift, square to the last point; otherwise snapped to the
   * drawing's linework when close (endpoints first). Remembers the snap for the marker.
   */
  private measurePoint(p: Point, shift: boolean): Point {
    const last = this.draft[this.draft.length - 1];
    if (shift && last) {
      this.snapMark = null;
      return ortho(last, p);
    }
    const snap = this.snaps?.find(p, 10 / this.view.zoom) ?? null;
    this.snapMark = snap;
    return snap ? snap.point : p;
  }

  // --- hit testing ------------------------------------------------------------------

  private hitShape(p: Point): Shape | null {
    const tol = HIT_PX / this.view.zoom;
    for (let i = this.shapes.length - 1; i >= 0; i--) {
      const s = this.shapes[i];
      const ring = s.kind === "area" ? [...s.points, s.points[0]] : s.points;
      for (let k = 1; k < ring.length; k++) if (segmentDistance(p, ring[k - 1], ring[k]) <= tol) return s;
      if (s.kind === "area" && insidePolygon(p, s.points)) return s;
    }
    return null;
  }

  private hitVertex(p: Point): { shape: Shape; index: number } | null {
    const shape = this.shapes.find((s) => s.id === this.selected);
    if (!shape) return null;
    const tol = (HIT_PX + 2) / this.view.zoom;
    const index = shape.points.findIndex((q) => dist(p, q) <= tol);
    return index >= 0 ? { shape, index } : null;
  }

  // --- input --------------------------------------------------------------------------

  private selectShape(id: string | null, notify = true) {
    if (this.selected === id) return;
    this.selected = id;
    this.drawShapes();
    if (notify) this.events.onSelect(id);
  }

  private onPointerDown = (e: PointerEvent) => {
    if (e.button === 2) return; // the context menu
    const [cx, cy] = this.local(e);
    const p = this.fromCanvas(cx, cy);
    const panning = e.button === 1 || this.tool === "pan" || this.spaceDown || this.readOnly;
    this.container.setPointerCapture(e.pointerId);

    if (panning) {
      this.drag = { type: "pan", x: e.clientX, y: e.clientY, tx: this.view.tx, ty: this.view.ty, moved: false };
      this.container.style.cursor = "grabbing";
      return;
    }
    if (e.button !== 0) return;

    if (this.tool === "select") {
      const vertex = this.hitVertex(p);
      if (vertex) return void (this.drag = { type: "vertex", ...vertex, moved: false });
      const shape = this.hitShape(p);
      if (shape) {
        this.selectShape(shape.id);
        this.drag = { type: "body", shape, start: p, original: shape.points.map((q) => [...q] as Point), moved: false };
        return;
      }
      // Empty paper: deselect, and drag to pan (as in the Autodesk viewer).
      this.selectShape(null);
      this.drag = { type: "pan", x: e.clientX, y: e.clientY, tx: this.view.tx, ty: this.view.ty, moved: false };
      return;
    }

    if (this.tool === "click") return void this.events.onClick(p, e.shiftKey);

    // length / area / calibrate: click to add a point.
    const last = this.draft[this.draft.length - 1];
    // An area closes when its first point is clicked again.
    if (this.tool === "area" && this.draft.length >= 3 && dist(this.draft[0], p) * this.view.zoom <= HIT_PX + 2) return void this.finishDraft();
    const point = this.measurePoint(p, e.shiftKey);
    if (last && dist(last, point) * this.view.zoom < 2) return; // the double-click's second click
    this.draft = [...this.draft, point];
    if (this.tool === "calibrate" && this.draft.length === 2) return void this.finishDraft();
    this.drawShapes();
  };

  private onPointerMove = (e: PointerEvent) => {
    const [cx, cy] = this.local(e);
    const p = this.fromCanvas(cx, cy);
    this.shift = e.shiftKey;
    const d = this.drag;
    if (d?.type === "pan") {
      d.moved = true;
      this.setView({ zoom: this.view.zoom, tx: d.tx + e.clientX - d.x, ty: d.ty + e.clientY - d.y });
      return;
    }
    if (d?.type === "vertex") {
      d.moved = true;
      d.shape.points[d.index] = this.measurePoint(p, false);
      return this.drawShapes();
    }
    if (d?.type === "body") {
      const dx = p[0] - d.start[0];
      const dy = p[1] - d.start[1];
      if (!d.moved && Math.hypot(dx, dy) * this.view.zoom < 3) return;
      d.moved = true;
      d.shape.points = d.original.map(([x, y]) => [x + dx, y + dy] as Point);
      return this.drawShapes();
    }
    if (this.tool === "click") return this.events.onMove(p, e.shiftKey);
    if (this.tool === "length" || this.tool === "area" || this.tool === "calibrate") {
      const q = this.measurePoint(p, e.shiftKey);
      this.cursor = this.draft.length ? q : null;
      this.drawShapes();
    }
    if (this.tool === "select") {
      this.container.style.cursor = this.hitVertex(p) ? "move" : this.hitShape(p) ? "pointer" : "default";
    }
  };

  private onPointerUp = (e: PointerEvent) => {
    const d = this.drag;
    this.drag = null;
    if (d?.type === "vertex") this.snapMark = null;
    if (this.container.hasPointerCapture(e.pointerId)) this.container.releasePointerCapture(e.pointerId);
    this.applyCursor();
    if ((d?.type === "vertex" || d?.type === "body") && d.moved) this.events.onShapeChanged(d.shape.id, d.shape.points.map((q) => [...q] as Point));
  };

  private onPointerLeave = () => {
    if (this.tool === "click") this.events.onMove(null, false);
    this.cursor = null;
    this.snapMark = null;
    this.drawShapes();
  };

  private onDoubleClick = () => {
    if (this.tool === "click") return this.events.onDoubleClick();
    if (this.tool === "length" || this.tool === "area") this.finishDraft();
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const [cx, cy] = this.local(e);
    const factor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015));
    this.zoomAt(cx, cy, factor);
  };

  private onKeyDown = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (e.key === " ") {
      this.spaceDown = true;
      this.container.style.cursor = "grab";
      return;
    }
    if (this.draft.length) {
      if (e.key === "Escape") return this.stop(e, () => this.cancelDraft());
      if (e.key === "Enter") return this.stop(e, () => this.finishDraft());
      if (e.key === "Backspace") return this.stop(e, () => ((this.draft = this.draft.slice(0, -1)), this.drawShapes()));
    }
    if ((e.key === "Delete" || e.key === "Backspace") && this.selected && this.tool === "select" && !this.readOnly) {
      const id = this.selected;
      if (!this.shapes.some((s) => s.id === id)) return;
      this.stop(e, () => {
        this.shapes = this.shapes.filter((s) => s.id !== id);
        this.selectShape(null);
        this.events.onShapeDeleted(id);
      });
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    if (e.key === " ") {
      this.spaceDown = false;
      this.applyCursor();
    }
  };

  private stop(e: KeyboardEvent, fn: () => void) {
    e.preventDefault();
    e.stopPropagation();
    fn();
  }

  private applyCursor() {
    this.container.style.cursor =
      this.tool === "pan" || this.readOnly ? "grab" : this.tool === "select" ? "default" : "crosshair";
  }

  private cancelDraft() {
    this.draft = [];
    this.cursor = null;
    this.drawShapes();
  }

  private finishDraft() {
    const pts = this.draft;
    const tool = this.tool;
    this.cancelDraft();
    if (tool === "calibrate") {
      if (pts.length === 2) this.events.onCalibrationLine(dist(pts[0], pts[1]));
      return;
    }
    if (tool !== "length" && tool !== "area") return;
    if ((tool === "length" && pts.length < 2) || (tool === "area" && pts.length < 3)) return;
    const temp: Shape = { id: `pending-${Math.random()}`, kind: tool, points: pts, color: "#2563eb" };
    this.shapes.push(temp);
    this.drawShapes();
    void this.events.onShapeCreated(tool, pts).then((id) => {
      this.shapes = this.shapes.filter((s) => s !== temp);
      if (id && !this.shapes.some((s) => s.id === id)) this.shapes.push({ ...temp, id });
      this.drawShapes();
    });
  }

  // --- public API ---------------------------------------------------------------------

  /** Puts saved lengths and areas on the layer. */
  loadShapes(markups: { id: string; kind: string; points: Point[]; color: string }[]) {
    for (const m of markups) {
      if (m.kind !== "length" && m.kind !== "area") continue;
      this.shapes = this.shapes.filter((s) => s.id !== m.id);
      this.shapes.push({ id: m.id, kind: m.kind, points: m.points.map((p) => [...p] as Point), color: m.color });
    }
    this.drawShapes();
  }

  setColor(markupId: string, color: string) {
    const s = this.shapes.find((x) => x.id === markupId);
    if (!s) return;
    s.color = color;
    this.drawShapes();
  }

  /** Removes a shape the app deleted (e.g. from the side panel), without echoing a delete. */
  removeShape(markupId: string) {
    this.shapes = this.shapes.filter((s) => s.id !== markupId);
    if (this.selected === markupId) this.selected = null;
    this.drawShapes();
  }

  select(markupId: string | null) {
    this.selectShape(markupId && this.shapes.some((s) => s.id === markupId) ? markupId : null, false);
  }

  setTool(tool: ControllerTool) {
    this.tool = this.readOnly ? "pan" : tool;
    this.cancelDraft();
    if (tool !== "select") this.selected = null;
    this.applyCursor();
    this.drawShapes();
  }

  /** The sheet point under a screen position. */
  sheetPointAt(clientX: number, clientY: number): Point {
    const rect = this.container.getBoundingClientRect();
    return this.fromCanvas(clientX - rect.left, clientY - rect.top);
  }

  /** The markup whose length/area shape is under a screen position, if any. */
  markupAt(clientX: number, clientY: number): string | null {
    return this.hitShape(this.sheetPointAt(clientX, clientY))?.id ?? null;
  }

  private zoomAt(cx: number, cy: number, factor: number) {
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.view.zoom * factor));
    const k = zoom / this.view.zoom;
    this.setView({ zoom, tx: cx - (cx - this.view.tx) * k, ty: cy - (cy - this.view.ty) * k });
  }

  /** Zooms about the centre of the view. */
  zoom(factor: number) {
    const { width, height } = this.container.getBoundingClientRect();
    this.zoomAt(width / 2, height / 2, factor);
  }

  /** Brings sheet points into view: pans when they're off-screen, zooms out if they don't fit. */
  reveal(points: Point[]) {
    if (!points.length) return;
    const { width, height } = this.container.getBoundingClientRect();
    const xs = points.map(([x]) => this.view.tx + x * this.view.zoom);
    const ys = points.map(([, y]) => this.view.ty + y * this.view.zoom);
    const margin = 40;
    const [left, right, top, bottom] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    if (left >= margin && right <= width - margin && top >= margin && bottom <= height - margin) return;
    if (right - left <= width - 2 * margin && bottom - top <= height - 2 * margin) {
      this.setView({ zoom: this.view.zoom, tx: this.view.tx + width / 2 - (left + right) / 2, ty: this.view.ty + height / 2 - (top + bottom) / 2 });
      return;
    }
    const px = points.map(([x]) => x);
    const py = points.map(([, y]) => y);
    const pad = 0.2 * Math.max(Math.max(...px) - Math.min(...px), Math.max(...py) - Math.min(...py));
    this.fitBox(Math.min(...px) - pad, Math.min(...py) - pad, Math.max(...px) + pad, Math.max(...py) + pad);
  }

  /** Zooms to a box on the sheet with some room around it (a source a link points to). */
  focusBox([x0, y0, x1, y1]: [number, number, number, number]) {
    const room = Math.max(120, 2 * Math.max(x1 - x0, y1 - y0));
    this.fitBox(x0 - room, y0 - room, x1 + room, y1 + room);
  }

  private fitBox(x0: number, y0: number, x1: number, y1: number) {
    const { width, height } = this.container.getBoundingClientRect();
    if (!width || !height) return;
    const zoom = Math.min(width / (x1 - x0), height / (y1 - y0));
    this.setView({ zoom, tx: (width - (x1 - x0) * zoom) / 2 - x0 * zoom, ty: (height - (y1 - y0) * zoom) / 2 - y0 * zoom });
  }

  fit() {
    const m = Math.max(this.pageW, this.pageH) * 0.02;
    this.fitBox(-m, -m, this.pageW + m, this.pageH + m);
  }

  destroy() {
    this.destroyed = true;
    const c = this.container;
    c.removeEventListener("pointerdown", this.onPointerDown);
    c.removeEventListener("pointermove", this.onPointerMove);
    c.removeEventListener("pointerup", this.onPointerUp);
    c.removeEventListener("pointerleave", this.onPointerLeave);
    c.removeEventListener("dblclick", this.onDoubleClick);
    c.removeEventListener("wheel", this.onWheel);
    window.removeEventListener("keydown", this.onKeyDown, true);
    window.removeEventListener("keyup", this.onKeyUp);
    this.resize?.disconnect();
    if (this.renderTimer) clearTimeout(this.renderTimer);
    this.renderTask?.cancel();
    this.canvas.remove();
    this.svg.remove();
    void this.doc?.loadingTask.destroy();
  }
}
