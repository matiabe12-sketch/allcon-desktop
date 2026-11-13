import { describe, expect, it } from "vitest";
import { railDef } from "../design/decks/rails";
import { analyzeBridge } from "./bridge";
import { BRIDGE_DEFAULTS, supportsFor } from "./definition";
import { geometryOf, withGeometry } from "./geometry";
import { bridgeSolids } from "./solids";

// The 3D view's bridge rails: in their own shape along each edge, span by span.

const area = (pts: [number, number][]) => Math.abs(pts.reduce((s, p, k) => s + p[0] * pts[(k + 1) % pts.length][1] - pts[(k + 1) % pts.length][0] * p[1], 0)) / 2;
const two = { ...BRIDGE_DEFAULTS, spans: [100, 120], supports: supportsFor(2) };

describe("the bridge rails in 3D", () => {
  it("sweeps a CDOT Type 9 rail's outline along both edges, facing the roadway", () => {
    const d = withGeometry(two, { ...geometryOf(two), rail: { ...geometryOf(two).rail, type: "type9-4" } });
    const { solids } = bridgeSolids(d, analyzeBridge(d).generated);
    const rails = solids.filter((s) => s.kind === "barrier");
    expect(rails).toHaveLength(2);
    const def = railDef("type9-4")!;
    for (const r of rails) {
      if (r.type !== "prism" || !("outline" in r.section)) throw new Error("a prism");
      expect(area(r.section.outline)).toBeCloseTo(area(def.outline as [number, number][]) / 144, 6);
      expect(r.segments).toHaveLength(2); // a segment per span
    }
    // The left rail's outline runs inward (+y), the right one's the other way.
    const ys = rails.map((r) => (r.type === "prism" && "outline" in r.section ? r.section.outline.reduce((s, p) => s + p[0], 0) : 0));
    expect(ys[0]).toBeGreaterThan(0);
    expect(ys[1]).toBeLessThan(0);
  });

  it("draws a Type 10 MASH rail's steel tubes too", () => {
    const d = withGeometry(two, { ...geometryOf(two), rail: { ...geometryOf(two).rail, type: "type10-mash" } });
    const rails = bridgeSolids(d, analyzeBridge(d).generated).solids.filter((s) => s.kind === "barrier");
    expect(rails.length).toBe(2 * (1 + (railDef("type10-mash")!.posts?.tubes.length ?? 0)));
  });

  it("a bridge without a standard rail: a 42 in parapet", () => {
    const rails = bridgeSolids(two, analyzeBridge(two).generated).solids.filter((s) => s.kind === "barrier");
    const r = rails[0];
    if (r.type !== "prism" || !("outline" in r.section)) throw new Error("a prism");
    expect(Math.max(...r.section.outline.map((p) => p[1]))).toBeCloseTo(42 / 12, 9);
  });
});

describe("each solid's part, for showing it alone", () => {
  it("names every part: members by their name, the deck, each barrier (its tubes with it), diaphragms and bearings", () => {
    const d = withGeometry(two, { ...geometryOf(two), rail: { ...geometryOf(two).rail, type: "type10-mash" } });
    const g = analyzeBridge(d).generated;
    const { solids } = bridgeSolids(d, g);
    expect(solids.every((s) => !!s.part && !!s.label)).toBe(true);
    for (const m of g.members) expect(solids.filter((s) => s.part === m.id).map((s) => s.label)).toEqual([m.name]);
    expect(solids.filter((s) => s.part === "deck")).toHaveLength(1);
    expect(new Set(solids.filter((s) => s.kind === "barrier").map((s) => s.part))).toEqual(new Set(["barrier-left", "barrier-right"]));
    expect(solids.filter((s) => s.part === "barrier-left").length).toBe(1 + railDef("type10-mash")!.posts!.tubes.length);
    const bearings = solids.filter((s) => s.kind === "bearing");
    expect(new Set(bearings.map((s) => s.part)).size).toBe(bearings.length);
    expect(bearings[0].label).toMatch(/^Abutment 1, girder 1 bearing$/);
  });
});
