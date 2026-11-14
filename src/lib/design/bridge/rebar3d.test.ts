import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { placeIfcRebar } from "./ifc-placed";
import { buildChain } from "./chain.testkit";
import { F18Y, F18Y_ABUT_SOIL, F18Y_DIAPHRAGM_TOP, F18Y_GIRDER, F18Y_PAD, F18Y_SHAFT_LAYERS } from "./f18y.fixture";
import { bridgeIfc, type BridgeComponents } from "./ifc";
import { columnShaftConnection } from "../piers/column-shaft";
import { shaftCageOf } from "./loadpath";
import { attachRebar, rebarSources, type RebarDesigns } from "./ifc-rebar";
import { rebarModel } from "./rebar-model";
import { elementFrame, stirrupStations, type BarSet3D } from "./rebar3d";

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
  const ab = r.abutments;
  const comps: BridgeComponents = {
    foundations: { 1: { id: "s", kind: "drilled-shaft", inputs: p.shaft } },
    abutments: { 0: { id: "a0", inputs: ab[0].abutment }, 2: { id: "a2", inputs: ab[2].abutment } },
    approachSlabs: { 0: { id: "p0", inputs: ab[0].approach }, 2: { id: "p2", inputs: ab[2].approach } },
    wingwalls: { 0: { id: "w0", inputs: ab[0].wingwall }, 2: { id: "w2", inputs: ab[2].wingwall } },
    deckId: "d",
    ids: { girders: ["g"], caps: { 1: "c" }, columns: { 1: "k" } },
  };
  const els = bridgeIfc(F18Y, r.run, comps).elements;
  const m = rebarModel(F18Y, els, { girders: [F18Y_GIRDER], comps, rebar: { deck: { id: "d", inputs: r.deck }, caps: { 1: { id: "c", inputs: p.cap } }, columns: { 1: { id: "k", inputs: p.column } } } });
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
  it("the 48 in shafts are smaller than the 36 x 60 in columns: their bars run up into the columns, the columns' start at the shafts' tops (BDM Figure 11-13)", () => {
    const conn = columnShaftConnection(p.column, shaftCageOf(p.shaft));
    expect(conn.kind).toBe("undersized");
    for (const { k } of of("column")) {
      const main = setsOn(k).filter((s) => s.role === "main");
      expect(Math.min(...main.flatMap((s) => s.path.map((q) => q[2])))).toBeGreaterThanOrEqual(-1e-6);
    }
    for (const { k } of of("shaft").filter(({ e }) => e.part === "support-1")) {
      const bars = setsOn(k).find((s) => s.role === "main")!;
      // The shaft's z runs down: up into the column is negative.
      expect(bars.path[0][2]).toBeCloseTo(-conn.lap / 12, 3);
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

  // --- phase 2 ---
  const frames = (k: number) => elementFrame(m.elements[k]);
  /** A set's points in world coordinates. */
  const worldPts = (s: BarSet3D): [number, number, number][] => {
    if (s.frame === "world") return s.at.flatMap((a) => s.path.map((q) => [q[0] + a[0], q[1] + a[1], q[2] + a[2]] as [number, number, number]));
    const f = frames(s.host);
    return local(s).map(([x, y, z]) => [f.o[0] + f.x[0] * x + f.y[0] * y + f.z[0] * z, f.o[1] + f.x[1] * x + f.y[1] * y + f.z[1] * z, f.o[2] + f.x[2] * x + f.y[2] * y + f.z[2] * z]);
  };
  it("every element with a linked design gets its bars from it: nothing schematic is left", () => {
    expect(m.elements.filter((e) => e.bars === "schematic").map((e) => e.name)).toEqual([]);
    for (const cat of ["deck", "abutment", "approach", "wingwall", "barrier"]) expect(of(cat).some(({ e }) => e.bars === "design"), cat).toBe(true);
  });
  it("the deck's bars stay within its thickness below its top, the transverse bars at the design's spacing over both spans", () => {
    const decks = of("deck");
    expect(decks).toHaveLength(2);
    for (const { e, k } of decks) {
      const g = els.find((x) => x.name === e.name)!.grid!;
      const tops = g.top.flat().map((q) => q[2]);
      const [zTop, zBot] = [Math.max(...tops), Math.min(...tops) - 8 / 12];
      const sets = setsOn(k);
      for (const s of sets)
        for (const q of worldPts(s)) {
          expect(q[2]).toBeGreaterThan(zBot - 0.01);
          expect(q[2]).toBeLessThan(zTop + 0.01);
        }
      const across = sets.filter((s) => /transverse, top/.test(s.label)).length;
      // The span's 111.08 ft at the design's spacing, 2 in clear at the abutment end.
      const want = 111.08 / (r.deck.topBars.spacing / 12);
      expect(Math.abs(across - want)).toBeLessThan(2);
    }
  });
  it("the transverse bars run parallel to the 7.9° skew (BDM 9.8.1: 25° or less)", () => {
    const { k } = of("deck")[0];
    const s = setsOn(k).find((x) => /transverse, top/.test(x.label))!;
    const [a, b] = [s.path[0], s.path[s.path.length - 1]];
    const lineAz = r.run.layout.supports[0].lineAz;
    const barAz = (Math.atan2(b[0] - a[0], b[1] - a[1]) * 180) / Math.PI;
    const d = Math.abs(((barAz - lineAz + 540) % 180) - 0) % 180;
    expect(Math.min(d, 180 - d)).toBeLessThan(0.5);
  });
  it("the abutment's cap bars are inside its cap, the approach slab's inside the slab, the wingwalls' inside the walls", () => {
    for (const cat of ["abutment", "approach", "wingwall"])
      for (const { e, k } of of(cat)) {
        if (e.profile.kind === "rect" && !/diaphragm|backwall/.test(e.name)) {
          const prof = e.profile;
          for (const s of setsOn(k))
            for (const [x, y, z] of local(s)) {
              expect(Math.abs(x), e.name).toBeLessThanOrEqual(prof.x / 2 + 1e-3);
              // Anchorage bars run on into the abutment.
              if (!/anchorage/.test(s.label)) expect(Math.abs(y), `${e.name} ${s.label}`).toBeLessThanOrEqual(prof.y / 2 + 1e-3);
              if (!/anchorage/.test(s.label)) {
                expect(z, e.name).toBeGreaterThanOrEqual(-1e-3);
                expect(z, e.name).toBeLessThanOrEqual(e.depth + 1e-3);
              }
            }
        }
        if (cat === "wingwall") {
          // Its top level with the roadway, its bottom rising toward the tip (the design's H and h are depths below the top).
          const w = ab[0].wingwall;
          const prof = e.profile as { kind: "poly"; pts: [number, number][] };
          expect(prof.pts).toEqual([[0, 0], [w.L, w.H - w.h], [w.L, w.H], [0, w.H]]);
          for (const s of setsOn(k))
            for (const [x, y] of local(s)) {
              if (x < 0) continue; // into the abutment
              expect(y, s.label).toBeGreaterThanOrEqual(((w.H - w.h) * x) / w.L - 1e-3);
              expect(y, s.label).toBeLessThanOrEqual(w.H + 1e-3);
            }
        }
        if (cat === "wingwall")
          for (const s of setsOn(k))
            for (const [, , z] of local(s)) {
              expect(z).toBeGreaterThanOrEqual(-1e-3);
              expect(z).toBeLessThanOrEqual(e.depth + 1e-3);
            }
      }
    expect(of("wingwall")).toHaveLength(4);
    // Each runs from the abutment out beside its approach slab (high at the abutment, low at the tip by the sleeper slab).
    for (const { e } of of("wingwall")) {
      const slab = of("approach").find((x) => x.e.part === e.part)!.e;
      const cap = of("abutment").find((x) => x.e.part === e.part && /pile cap/.test(x.e.name))!.e;
      const L = ab[0].wingwall.L;
      const tip = [0, 1].map((k) => e.origin[k] + e.xdir[k] * L);
      const toTip = [tip[0] - cap.origin[0], tip[1] - cap.origin[1]];
      const toSlab = [slab.origin[0] - cap.origin[0], slab.origin[1] - cap.origin[1]];
      expect(toTip[0] * toSlab[0] + toTip[1] * toSlab[1], e.name).toBeGreaterThan(0);
    }
  });
  it("the bridge rail's bars sit in the barrier along both edges", () => {
    const rails = of("barrier").filter(({ e }) => e.bars === "design");
    expect(rails.length).toBe(4); // two edges, two spans
    expect(setsOn(rails[0].k).length).toBeGreaterThan(100);
  });

  // --- phase 3: the IFC model's bars where the view puts them ---
  const python = resolve("python/python.exe");
  it.skipIf(!existsSync(python))("writes them into the IFC model (IFC 4.3 and IFC4): bars and strands placed, valid, in their hosts", () => {
    // As the export does: each design's schedule on its elements (the quantities), then the bars where the view puts them.
    const designs: RebarDesigns = { deck: { id: "d", inputs: r.deck }, caps: { 1: { id: "c", inputs: p.cap } }, columns: { 1: { id: "k", inputs: p.column } } };
    const desc = attachRebar(bridgeIfc(F18Y, r.run, comps, "F-18-Y"), rebarSources(comps, designs));
    const scheduled = desc.elements.map((e) => e.rebar?.bars.reduce((t, x) => t + x.weight, 0) ?? 0);
    const placed = rebarModel(F18Y, desc.elements, { girders: [F18Y_GIRDER], comps, rebar: designs });
    placeIfcRebar(desc.elements, placed);
    const hosts = desc.elements.filter((e) => e.rebar);
    const sets = hosts.reduce((t, e) => t + e.rebar!.bars.length, 0);
    const tendons = hosts.reduce((t, e) => t + (e.rebar!.tendons?.length ?? 0), 0);
    const lb = hosts.reduce((t, e) => t + e.rebar!.bars.reduce((u, x) => u + x.weight, 0), 0);
    // The quantities are the schedules': element by element, the same weight as before the bars were placed.
    desc.elements.forEach((e, i) => expect(e.rebar?.bars.reduce((t, x) => t + x.weight, 0) ?? 0, e.name).toBeCloseTo(scheduled[i], 0));
    // Every scheduled mark is drawn where its design puts it (none left schematic) on F-18-Y.
    expect(hosts.flatMap((e) => e.rebar!.bars.filter((x) => !x.placed?.length).map((x) => `${e.name} ${x.use}`))).toEqual([]);
    // 18 girders, each: the straight rows at 2.25 (bonded and debonded), 4.25 and 6.25 in, and the six draped pairs.
    expect(tendons).toBe(18 * 10);
    const dir = mkdtempSync(join(tmpdir(), "allcon-ifc-placed-"));
    try {
      const file = join(dir, "bridge.json");
      const elements = desc.elements.map((e) => {
        const o = { ...e };
        delete o.grid;
        delete o.sweep;
        delete o.wing;
        return o;
      });
      writeFileSync(file, JSON.stringify({ ...desc, elements, project: "F-18-Y" }));
      const out = execFileSync(python, ["-I", resolve("scripts/ifc-rebar-check.py"), resolve("api"), file, join(dir, "bridge.ifc")], { encoding: "utf8", timeout: 600_000, maxBuffer: 1 << 26 });
      const x = JSON.parse(out.trim().split(/\r?\n/).pop()!);
      for (const schema of ["IFC4X3", "IFC4"] as const) {
        expect(x[schema].errors, `${schema}: ${JSON.stringify(x[schema].errors)}`).toEqual([]);
        expect(x[schema].unaggregated, schema).toBe(0);
        expect(x[schema].untyped, schema).toBe(0);
        expect(x[schema].withoutShape, schema).toBe(0);
      }
      expect(x.IFC4X3.bars).toBe(sets);
      expect(x.IFC4X3.tendons).toBe(tendons);
      expect(x.IFC4X3.tendonsUnaggregated).toBe(0);
      expect(x.IFC4X3.tendonsWithoutShape).toBe(0);
      expect(x.IFC4X3.weightKg / 0.45359237).toBeCloseTo(lb, -1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 600_000);
});
