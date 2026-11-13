import { describe, expect, it } from "vitest";
import { analyzeBridge } from "./bridge";
import { BRIDGE_DEFAULTS, supportsFor, type BridgeDefinition } from "./definition";
import type { Member } from "./generate";
import { geometryOf, reconcile, withGeometry, type BridgeGeometry } from "./geometry";
import { movingLoad } from "./moving";

// The analysis model from the bridge's real geometry (phase 2): each support at its own skew, girders
// flared between supports, piers made continuous or not one by one, the bridge on a curve, and pier
// columns as tall as the profile and their foundations make them. Held to statics, and to the straight
// model where the geometry is the straight bridge.

const two: BridgeDefinition = { ...BRIDGE_DEFAULTS, spans: [100, 120], supports: supportsFor(2) };
const withGeo = (d: BridgeDefinition, edit: (g: BridgeGeometry) => BridgeGeometry = (g) => g) => withGeometry(d, edit(geometryOf(d)));
const girder = (members: Member[], g: number, span = 1) => members.find((m) => m.kind === "girder" && m.girder === g && m.span === span)!;
const maxMoment = (a: ReturnType<typeof analyzeBridge>, g: number, span: number, name: string) => Math.max(...a.member(girder(a.generated.members, g, span), { kind: "case", name }).map((s) => s.forces.My));
const allOk = (a: ReturnType<typeof analyzeBridge>) => expect(a.checks.filter((c) => !c.ok).map((c) => c.name)).toEqual([]);

describe("the analysis model from the bridge's geometry", () => {
  it("is the straight model when the geometry is the straight bridge", () => {
    const plain = analyzeBridge(two);
    const geo = analyzeBridge(withGeo(two));
    expect(geo.generated.stage2.nodes.length).toBe(plain.generated.stage2.nodes.length);
    for (const name of ["Girders", "Deck and haunch", "Barriers", "Wearing surface"])
      for (const [g, span] of [[1, 1], [3, 2]]) expect(maxMoment(geo, g, span, name)).toBeCloseTo(maxMoment(plain, g, span, name), 6);
  });

  it("puts each support line at its own skew", () => {
    const d = withGeo(two, (g) => ({ ...g, supports: g.supports.map((s, k) => ({ ...s, skew: [0, 20, 35][k] })) }));
    const a = analyzeBridge(d);
    allOk(a);
    const gm = a.generated;
    // The girder nodes at each support: along its line, at its skew.
    gm.supportStations.forEach((s, sl) => {
      const nodes = gm.stage2.nodes.filter((n) => n.id % 1000 === s && n.id >= 1000 && n.id < 100000).sort((p, q) => p.y - q.y);
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      // + clockwise: the line falls back along the bridge to the right.
      expect(-Math.atan2(last.x - first.x, last.y - first.y) * (180 / Math.PI)).toBeCloseTo([0, 20, 35][sl], 3);
    });
    // The girders' spans differ across a span between supports at different skews.
    const L = (k: number) => {
      const ids = girder(gm.members, k, 2).elements;
      return ids.reduce((sum, id) => {
        const e = gm.stage2.elements.find((x) => x.id === id)!;
        const [p, q] = [e.n1, e.n2].map((n) => gm.stage2.nodes.find((x) => x.id === n)!);
        return sum + Math.hypot(q.x - p.x, q.y - p.y);
      }, 0);
    };
    expect(Math.abs(L(1) - L(6))).toBeGreaterThan(1);
  });

  it("flares the girders between supports with different spacings, and loads each with the deck it carries", () => {
    const d = withGeo(two, (g) => ({ ...g, supports: g.supports.map((s, k) => ({ ...s, spacing: [8, 8, 10][k] })), leftEdge: g.leftEdge + 6, rightEdge: g.rightEdge + 6 }));
    const a = analyzeBridge(d);
    allOk(a);
    const y = (X: number) => a.generated.layout.girderYAt(X);
    expect(y(100)[5] - y(100)[0]).toBeCloseTo(5 * 8, 6);
    expect(y(220)[5] - y(220)[0]).toBeCloseTo(5 * 10, 6);
    // The deck's weight on all the girders is the deck's plan area × thickness × unit weight, plus the haunches.
    const applied = a.checks.find((c) => c.name === "Deck and haunch")!.applied;
    // The edges stay parallel to the bridge line: the deck's area is its width by its length.
    const area = 220 * (d.geometry!.leftEdge + d.geometry!.rightEdge);
    const slab = area * (d.deck.thickness / 12) * d.deck.wc;
    const haunch = 6 * 220 * ((42 * d.deck.haunch) / 144) * d.deck.wc; // six BT-72s: 42 in top flange by the haunch, over their lengths
    expect(Math.abs(applied)).toBeCloseTo(slab + haunch, 0);
  });

  it("makes each pier continuous or simple on its own", () => {
    const three: BridgeDefinition = { ...BRIDGE_DEFAULTS, spans: [90, 110, 90], supports: supportsFor(3) };
    const d = withGeo(three, (g) => ({ ...g, supports: g.supports.map((s, k) => (k === 2 ? { ...s, type: "simple-pier" } : s)) }));
    const a = analyzeBridge(d);
    allOk(a);
    const hinged = a.generated.stage2.elements.filter((e) => e.releases).map((e) => e.n2 % 1000);
    expect(new Set(hinged)).toEqual(new Set([a.generated.supportStations[2]])); // only at the second pier
    // Continuous over the first pier: hogging there under the wearing surface; simple at the second: none.
    const pierMoment = (span: number, end: "first" | "last") => {
      const st = a.member(girder(a.generated.members, 3, span), { kind: "case", name: "Wearing surface" });
      return (end === "first" ? st[0] : st[st.length - 1]).forces.My;
    };
    expect(pierMoment(1, "last")).toBeLessThan(-1);
    expect(Math.abs(pierMoment(2, "last"))).toBeLessThan(1e-6);
  });

  it("takes the piers' column heights from the profile and their foundations", () => {
    const d = withGeo(two, (g) => ({ ...g, supports: g.supports.map((s, k) => (k === 1 && s.pier ? { ...s, pier: { ...s.pier, foundationTop: 60 } } : s)) }));
    const a = analyzeBridge(d);
    const col = a.generated.members.find((m) => m.kind === "column")!;
    const e = a.generated.stage2.elements.find((x) => x.id === col.elements[0])!;
    const [foot, top] = [e.n1, e.n2].map((n) => a.generated.stage2.nodes.find((x) => x.id === n)!);
    // The profile is at 100 ft: the cap's soffit about 100 − deck − girder − bearing − cap; the column down to 60.
    expect(top.z - foot.z).toBeGreaterThan(20);
    expect(top.z - foot.z).toBeLessThan(40);
  });

  it("analyzes a bridge on a curve, skewed and superelevated, with the moving load", () => {
    const d = reconcile(
      withGeo(two, (g) => ({
        ...g,
        alignment: { ...g.alignment, curves: [{ pi: 110, radius: 1200, azimuth: 100, spiralIn: 0, spiralOut: 0 }] },
        profile: { ...g.profile, grade: 2, curves: [{ pvi: 110, grade: -1, length: 160 }] },
        roadway: { ...g.roadway, leftSlope: 0.04, rightSlope: -0.04 },
        supports: g.supports.map((s) => ({ ...s, skew: 10 })),
      })),
    );
    const a = analyzeBridge(d);
    allOk(a);
    const live = movingLoad(a.generated, a.stage(2));
    expect(live.lanes.length).toBeGreaterThan(0);
    const mid = a.member(girder(a.generated.members, 3, 2), { kind: "live" }, 4, live);
    expect(Math.max(...mid.map((s) => s.max!.My))).toBeGreaterThan(500);
  });
});
