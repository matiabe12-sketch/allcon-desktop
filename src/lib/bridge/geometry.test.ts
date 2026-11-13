import { describe, expect, it } from "vitest";
import { BRIDGE_DEFAULTS as DESIGN_DEFAULTS, bridgeLayout } from "../design/bridge/bridge";
import { BRIDGE_DEFAULTS, bridgeDefinition, supportsFor, type BridgeDefinition } from "./definition";
import { applyEdit, geometryOf, reconcile, toBridgeInputs, withGeometry, type BridgeGeometry } from "./geometry";

// The Bridge section's geometry (the alignment, profile, roadway and supports by station) and how it
// stays in step with the spans, skew, overhang and haunch the wizard enters.

const materialized = (d: BridgeDefinition) => reconcile({ ...d, geometry: geometryOf(d) });

/** The Bridge design's default bridge (a sag curve, integral abutments, a continuous pier) as a Bridge section definition. */
function fromDesign(): BridgeDefinition {
  const b = DESIGN_DEFAULTS;
  const g: BridgeGeometry = { alignment: b.alignment, profile: b.profile, roadway: b.roadway, supports: b.supports, bridgeLineOffset: b.bridgeLineOffset, leftEdge: b.leftEdge, rightEdge: b.rightEdge, slabOffset: b.slabOffset, rail: { type: "custom", testLevel: "TL-5", steel: "A1035" } };
  const spans = b.supports.slice(1).map((s, k) => s.station - b.supports[k].station);
  return reconcile({ ...BRIDGE_DEFAULTS, girder: { ...BRIDGE_DEFAULTS.girder, shape: b.shape }, nGirders: b.nGirders, spacing: b.spacing, deck: { ...BRIDGE_DEFAULTS.deck, thickness: b.deckT, sacrificial: b.sacrificial, fc: b.fcDeck }, loads: { ...BRIDGE_DEFAULTS.loads, barrierWidth: b.barrierWidth, wearingSurface: b.fws }, spans, supports: supportsFor(spans.length), geometry: g });
}

describe("the Bridge section's geometry", () => {
  it("works one out from the spans when there's none: straight, level, the supports at the spans' ends", () => {
    const d = { ...BRIDGE_DEFAULTS, spans: [100, 120], supports: supportsFor(2), skew: 15 };
    const g = geometryOf(d);
    expect(g.supports.map((s) => s.station)).toEqual([0, 100, 220]);
    expect(g.supports.map((s) => s.type)).toEqual(["seat-abutment", "continuous-pier", "seat-abutment"]);
    expect(g.supports.every((s) => s.skew === 15)).toBe(true);
    expect(g.leftEdge).toBeCloseTo(2.5 * 8 + 3.5, 9); // half the girders' spread plus the overhang
    expect(g.slabOffset).toBe(d.deck.thickness + d.deck.haunch);
    expect(g.supports[1].pier?.columns).toBe(d.piers.columns);
  });

  it("keeps the stations and spans in step: the spans lead, a station moves the spans beside it", () => {
    const d = materialized({ ...BRIDGE_DEFAULTS, spans: [100, 120], supports: supportsFor(2) });
    // Three spans: a pier added, the last abutment still last.
    const three = applyEdit(d, { ...d, spans: [100, 120, 90], supports: supportsFor(3, d.supports) });
    expect(three.geometry!.supports.map((s) => s.name)).toEqual(["Abutment 1", "Pier 1", "Pier 2", "Abutment 2"]);
    expect(three.geometry!.supports.map((s) => s.station)).toEqual([0, 100, 220, 310]);
    expect(three.geometry!.supports[3].type).toBe("seat-abutment");
    // The pier moved 10 ft up station: span 1 longer, span 2 shorter.
    const g = three.geometry!;
    const moved = withGeometry(three, { ...g, supports: g.supports.map((s, k) => (k === 1 ? { ...s, station: 110 } : s)) });
    expect(moved.spans).toEqual([110, 110, 90]);
  });

  it("carries the wizard's skew, continuity, overhang, haunch and bearing height into the geometry", () => {
    const d = materialized({ ...BRIDGE_DEFAULTS, spans: [100, 120], supports: supportsFor(2) });
    const e = applyEdit(d, { ...d, skew: 20, continuity: "simple", overhang: 4, deck: { ...d.deck, haunch: 3 }, piers: { ...d.piers, bearingHeight: 4 } });
    const g = e.geometry!;
    expect(g.supports.every((s) => s.skew === 20 && s.bearingHeight === 4)).toBe(true);
    expect(g.supports[1].type).toBe("simple-pier");
    expect(g.leftEdge).toBeCloseTo(20 + 4, 9);
    expect(g.slabOffset).toBe(d.deck.thickness + 3);
    // More girders keep each side's overhang.
    const wider = applyEdit(e, { ...e, nGirders: 7 });
    expect(wider.geometry!.leftEdge).toBeCloseTo(24 + 4, 9);
    expect(wider.overhang).toBeCloseTo(4, 9);
  });

  it("reads the wizard's values back from a geometry, and survives saving", () => {
    const d = fromDesign();
    expect(d.spans).toEqual([122, 122]);
    expect(d.continuity).toBe("continuous");
    expect(d.deck.haunch).toBeCloseTo(DESIGN_DEFAULTS.slabOffset - DESIGN_DEFAULTS.deckT, 9);
    const again = bridgeDefinition(JSON.parse(JSON.stringify(d)));
    expect(again.geometry).toEqual(d.geometry);
    expect(again.spans).toEqual(d.spans);
  });

  it("is the Bridge design's description: the same layout, girder by girder", () => {
    const own = bridgeLayout(DESIGN_DEFAULTS);
    const ours = bridgeLayout(toBridgeInputs(fromDesign()));
    expect(ours.spans.length).toBe(own.spans.length);
    ours.spans.forEach((sp, j) =>
      sp.girders.forEach((g, k) => {
        expect(g.L).toBeCloseTo(own.spans[j].girders[k].L, 9);
        expect(g.start.seat).toBeCloseTo(own.spans[j].girders[k].start.seat, 9);
      }),
    );
  });
});
