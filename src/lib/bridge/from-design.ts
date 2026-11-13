import type { BridgeInputs } from "../design/bridge/bridge";
import { GIRDER_RAIL_DEFAULT } from "../design/girders/bridge-deck";
import type { GirderInputs } from "../design/girders/prestressed";
import { BRIDGE_DEFAULTS, bridgeDefinition, supportsFor, type BridgeDefinition } from "./definition";
import type { BridgeGeometry } from "./geometry";
import { linksFrom, LOAD_PATH_KINDS } from "./load-links";

// A Bridge design (the Design list's "bridge", src/lib/design/bridge) as a Bridge section bridge: its
// alignment, profile, roadway and supports as the section's geometry, its girders, deck and loads as the
// definition's values (the girder concrete and the barrier's weight from its girder design), and its
// linked designs as the section's design links. The section's description of it (toBridgeInputs) is the
// design's own, so its layout, load path, IFC model and calc package are the same.

export function definitionFromBridge(b: BridgeInputs, girder?: GirderInputs | null): BridgeDefinition {
  const st = b.supports.map((s) => s.station);
  const spans = st.slice(1).map((v, k) => +(v - st[k]).toFixed(6));
  const piers = b.supports.slice(1, -1);
  const pier = piers.find((s) => s.pier)?.pier;
  const half = ((b.nGirders - 1) * b.spacing) / 2;
  const d = BRIDGE_DEFAULTS;
  const geometry: BridgeGeometry = {
    alignment: b.alignment,
    profile: b.profile,
    roadway: b.roadway,
    supports: b.supports,
    bridgeLineOffset: b.bridgeLineOffset,
    leftEdge: b.leftEdge,
    rightEdge: b.rightEdge,
    slabOffset: b.slabOffset,
    rail: { ...GIRDER_RAIL_DEFAULT, ...(b.rail ?? {}) },
  };
  const def: BridgeDefinition = {
    ...d,
    spans,
    skew: b.supports[0]?.skew ?? 0,
    supports: supportsFor(spans.length),
    continuity: piers.length && piers.every((p) => p.type === "simple-pier") ? "simple" : "continuous",
    girder: { shape: b.shape, fc: girder?.fc ?? d.girder.fc, wc: girder?.wc ?? d.girder.wc },
    nGirders: b.nGirders,
    spacing: b.spacing,
    overhang: Math.max(0, (b.leftEdge - half + (b.rightEdge - half)) / 2),
    deck: { thickness: b.deckT, sacrificial: b.sacrificial, haunch: Math.max(0, b.slabOffset - b.deckT), fc: b.fcDeck, wc: girder?.wcDeck ?? d.deck.wc },
    piers: {
      ...d.piers,
      model: true,
      ...(pier ? { capWidth: pier.capWidth / 12, capDepth: pier.capDepth, columns: pier.columns, columnDiameter: pier.columnSize / 12, columnSpacing: pier.columnSpacing } : {}),
      bearingHeight: Math.max(...b.supports.map((s) => s.bearingHeight)),
    },
    loads: { barrierWeight: girder?.barrierWeight ?? d.loads.barrierWeight, barrierWidth: b.barrierWidth, wearingSurface: b.fws },
    designs: linksFrom(b, [], LOAD_PATH_KINDS),
    geometry,
  };
  // As it's saved and read back.
  return bridgeDefinition(JSON.parse(JSON.stringify(def)));
}
