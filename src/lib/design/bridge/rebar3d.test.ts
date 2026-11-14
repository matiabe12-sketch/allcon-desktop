import { describe, expect, it } from "vitest";
import { buildChain } from "./chain.testkit";
import { F18Y, F18Y_ABUT_SOIL, F18Y_DIAPHRAGM_TOP, F18Y_GIRDER, F18Y_PAD, F18Y_SHAFT_LAYERS } from "./f18y.fixture";
import { bridgeIfc, type BridgeComponents } from "./ifc";
import { rebarModel } from "./rebar-model";
import { stirrupStations, type BarSet3D } from "./rebar3d";

// The Rebar view's bars on CDOT F-18-Y: every bar placed from its design sits in its concrete.

describe("F-18-Y's bars in 3D", async () => {
  const r = await buildChain({
    title: "F-18-Y",
    b: F18Y,
    girder: F18Y_GIRDER,
    pad: F18Y_PAD,
    abutment: () => ({ type: "integral-piles", section: "HP12x74", nPiles: 13, pileLength: 30, embed: 12, capWidth: 2.5, capDepth: 4, soil: F18Y_ABUT_SOIL, prebore: 0, Rn: 18 * 21.8, phiDyn: 1 }),
    cap: { topBars: { size: 10, count: 12 }, bottomBars: { size: 10, count: 14 }, stirrups: { size: 5, legs: 4, spacing: 6 }, diaphragmTop: F18Y_DIAPHRAGM_TOP },
    column: { bar: 10, bars: 24, barsT: 8, barsL: 6, tieBar: 4, tieSpacing: 12 },
    shaft: { D: 48, length: 47, topDepth: 0, layers: F18Y_SHAFT_LAYERS, bar: 10, bars: 30 },
  });
  const p = r.piers[1];
  const comps: BridgeComponents = { foundations: { 1: { id: "s", kind: "drilled-shaft", inputs: p.shaft } }, ids: { girders: ["g"], caps: { 1: "c" }, columns: { 1: "k" } } };
  const els = bridgeIfc(F18Y, r.run, comps).elements;
  const m = rebarModel(F18Y, els, { girders: [F18Y_GIRDER], comps, rebar: { caps: { 1: { id: "c", inputs: p.cap } }, columns: { 1: { id: "k", inputs: p.column } } } });
  const of = (cat: string) => m.elements.map((e, k) => ({ e, k })).filter(({ e }) => e.category === cat);
  const setsOn = (k: number) => m.bars.filter((b) => b.host === k);
  const copies = (sets: BarSet3D[]) => sets.reduce((t, s) => t + s.at.length, 0);
  const local = (s: BarSet3D) => s.at.flatMap((a) => s.path.map((q) => [q[0] + a[0], q[1] + a[1], q[2] + a[2]]));

  it("every girder gets its 46 strands and its stirrups from the design", () => {
    const girders = of("girder");
    expect(girders).toHaveLength(18);
    for (const { e, k } of girders) {
      expect(e.bars).toBe("design");
      const sets = setsOn(k);
      expect(copies(sets.filter((s) => s.role === "strand"))).toBe(46);
      expect(copies(sets.filter((s) => s.role === "stirrup"))).toBe(stirrupStations(F18Y_GIRDER, e.depth).length);
    }
  });
  it("the strands stay inside the CBT 54, the harped ones no higher than 52.25 in", () => {
    const { e, k } = of("girder")[0];
    for (const s of setsOn(k).filter((s) => s.role === "strand"))
      for (const [x, y, z] of local(s)) {
        expect(Math.abs(x)).toBeLessThanOrEqual(19.75 / 12);
        expect(y).toBeGreaterThan(0);
        expect(y).toBeLessThanOrEqual(52.25 / 12 + 1e-4);
        expect(z).toBeGreaterThanOrEqual(-1e-6);
        expect(z).toBeLessThanOrEqual(e.depth + 1e-6);
      }
  });
  it("the cap's bars are inside the cap: its length, width and depth", () => {
    const [{ e, k }] = of("cap");
    expect(e.bars).toBe("design");
    const prof = e.profile as { kind: "rect"; x: number; y: number };
    const sets = setsOn(k);
    expect(sets.some((s) => s.role === "main")).toBe(true);
    expect(sets.some((s) => s.role === "stirrup")).toBe(true);
    for (const s of sets)
      for (const [x, y, z] of local(s)) {
        expect(Math.abs(x)).toBeLessThanOrEqual(prof.x / 2 + 1e-6);
        expect(Math.abs(y)).toBeLessThanOrEqual(prof.y / 2 + 1e-6);
        expect(z).toBeGreaterThanOrEqual(-1e-6);
        expect(z).toBeLessThanOrEqual(e.depth + 1e-6);
      }
    // 12 top and 14 bottom bars across.
    const across = (word: string) => copies(sets.filter((s) => s.role === "main" && s.label.includes(word)));
    expect(across("top")).toBe(12);
    expect(across("bottom")).toBe(14);
  });
  it("each column's 24 bars are inside its section, and run up into the cap", () => {
    const cols = of("column");
    expect(cols).toHaveLength(3);
    for (const { e, k } of cols) {
      const prof = e.profile as { kind: "rect"; x: number; y: number };
      const main = setsOn(k).filter((s) => s.role === "main");
      expect(copies(main)).toBe(24);
      for (const s of main)
        for (const a of s.at) {
          expect(Math.abs(a[0])).toBeLessThan(prof.x / 2);
          expect(Math.abs(a[1])).toBeLessThan(prof.y / 2);
        }
      expect(Math.max(...main.flatMap((s) => s.path.map((q) => q[2])))).toBeGreaterThan(e.depth);
    }
  });
  it("each shaft's cage: 30 bars and a spiral inside its 48 in", () => {
    const shafts = of("shaft").filter(({ e }) => e.part === "support-1");
    expect(shafts).toHaveLength(3);
    for (const { k } of shafts) {
      const sets = setsOn(k);
      expect(copies(sets.filter((s) => s.role === "main"))).toBe(30);
      for (const s of sets) for (const [x, y] of local(s)) expect(Math.hypot(x, y)).toBeLessThan(24 / 12);
    }
  });
});
