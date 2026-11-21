import { BEARING_DEFAULTS, PTFE_DEFAULTS, type BearingInputs } from "./bearings/elastomeric";
import { CBC_DEFAULTS, type CbcInputs } from "./culverts/cbc";
import { cleanWingwalls } from "./culverts/m601-20";

/** A culvert's excavation beyond M-206-1's trench, as saved. */
function cleanExcavation(v: unknown): CbcInputs["excavation"] {
  if (!v || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  const el = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : null);
  return { to: el(o.to), inletInvert: el(o.inletInvert), outletInvert: el(o.outletInvert), wingwalls: o.wingwalls !== false, depth: el(o.depth) };
}

/** A culvert extension's dowels as saved: none unless it has joints. */
function cleanExtension(v: unknown): CbcInputs["extension"] {
  if (!v || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  const n = (x: unknown, d: number) => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? x : d);
  const pieces = (Array.isArray(o.pieces) ? o.pieces : [])
    .slice(0, 4)
    .filter((p): p is Record<string, unknown> => !!p && typeof p === "object")
    .map((p, k) => ({ name: typeof p.name === "string" ? p.name.slice(0, 20) : `Piece ${k + 1}`, length: n(p.length, 0) }));
  return { pieces, bar: Math.round(n(o.bar, 5)), length: n(o.length, 36), spacing: n(o.spacing, 12) || 12, removalBackfill: n(o.removalBackfill, 0), waterproofJoints: o.waterproofJoints === true };
}
import { APPROACH_SLAB_DEFAULTS, type ApproachSlabInputs } from "./approach/approach-slab";
import { SLAB_BRIDGE_DEFAULTS, type SlabBridgeInputs } from "./slabs/slab-bridge";
import { HLMR_DEFAULTS, type HlmrInputs } from "./bearings/pot-disc";
import { FOUNDATION_INFO, FOUNDATION_KINDS, foundationInputs } from "./foundations/kinds";
import { DECK_DEFAULTS, RAIL_DEFAULT, type DeckInputs } from "./decks/deck";
import { STRIP_SEAL_DEFAULTS, type StripSealInputs } from "./joints/strip-seal";
import { SIGN_STEEL_DEFAULTS } from "./signs/structure";
import { SIGN_BRIDGE_DEFAULTS, type SignBridgeInputs } from "./signs/bridge";
import { SIGNAL_DEFAULTS, type SignalInputs } from "./signals/foundation";
import { SHORING_DEFAULTS, type ShoringInputs } from "./shoring/wall";
import { LRFR_DEFAULTS } from "./girders/lrfr";
import { MODULAR_DEFAULTS, type ModularJointInputs } from "./joints/modular";
import { FINGER_DEFAULTS, type FingerJointInputs } from "./joints/finger";
import { HAUNCH_DEFAULTS, type HaunchInputs } from "./girders/haunch";
import { GIRDER_DEFAULTS, type GirderInputs } from "./girders/prestressed";
import { SITE_WIND_DEFAULTS } from "./girders/substructure-loads";
import { applyRail, CROWN_DEFAULT, GIRDER_RAIL_DEFAULT } from "./girders/bridge-deck";
import { columnInputs } from "./piers/column";
import { DT_DEFAULTS, type DtInputs } from "./rating/double-tee";
import { legacySources } from "./rating/sources";
import { ZONE1_DEFAULTS, type Zone1Inputs } from "./seismic/zone1";
import { SIGN_DEFAULTS, type SignInputs } from "./signs/cantilever";
import { stmInputs } from "./stm/strut-tie";
import { TAKEOFF_KINDS, takeoffSettings } from "./takeoff/types";
import { CIP_DEFAULTS, DEFAULT_FACTORS, type CipInputs, type Combo } from "./walls/cip";
import { MSE_DEFAULTS, MSE_FACTORS, type MseInputs } from "./walls/mse";
import { WINGWALL_DEFAULTS, type WingwallInputs } from "./walls/wingwall";
import { steelGirderInputs } from "./girders/steel";

// The Design section's categories and design types: highway structures to AASHTO LRFD, grouped
// by element. What can be designed, and what's coming next.

export type DesignKind = "shoring-wall" | "signal-foundation" | "sign-bridge" | "modular-joint" | "finger-joint" | "lrfd-girder-check" | "steel-girder-check" | "slab-bridge" | "dt-load-rating" | "stm-d-region" | "cip-cantilever-wall" | "mse-wall" | "cantilever-wingwall" | "box-culvert" | "deck-slab" | "seismic-zone1" | "pier-column" | "camber-haunch" | "sign-cantilever" | "elastomeric-bearing" | "ptfe-bearing" | "pot-disc-bearing" | "strip-seal-joint" | "approach-slab" | "spread-footing" | "pile-foundation" | "drilled-shaft" | "micropile" | "abutment";

export const CATEGORIES: { id: string; name: string; kinds: { id: DesignKind; name: string; short: string; description: string; available: boolean }[] }[] = [
  {
    id: "superstructures",
    name: "Superstructures",
    kinds: [
      { id: "lrfd-girder-check", name: "LRFD Bridge Design Check", short: "Precast prestressed girders: DFs, stresses, flexure, shear, camber", description: "A simple-span precast, pretensioned girder bridge with a composite deck (AASHTO I-beams, AASHTO-PCI bulb-tees, CDOT Colorado Bulb Tees or a custom section): live load distribution factors, HL-93 envelopes, prestress losses, stresses at release and service, flexure and shear at Strength I, interface shear, and camber, for the interior and exterior girders. AASHTO LRFD 4.6.2.2, 5.6, 5.7 and 5.9.", available: true },
      { id: "steel-girder-check", name: "Steel Girder Design Check", short: "Rolled and plate composite I-girders: flexure, shear, constructibility, service", description: "A straight composite steel I-girder line, simple or continuous over up to six spans: welded plate girders or rolled W shapes, AASHTO LRFD 10th Edition Article 6.10 (constructibility, service, positive and negative flexure, shear, ductility, proportions) with the girder's own stiffness along it and HL-93 by influence lines.", available: true },
      { id: "slab-bridge", name: "Slab Bridge", short: "Cast-in-place slab, one to four spans: strips, bars and checks", description: "A cast-in-place concrete slab bridge, simple or continuous over up to four spans, its main bars parallel to traffic: the HL-93 load on the influence lines over the equivalent strip and the edge strip, the bars' flexure, minimum, crack control and fatigue, shear, distribution and temperature bars, the least depth, live load deflection, and the supports' reactions for the substructure. AASHTO LRFD 2.5.2.6, 3.6.1, 4.6.2.3, 5.5.3, 5.6, 5.10.6, 5.12.2.1 and 9.7.3.2.", available: true },
      { id: "dt-load-rating", name: "Double-Tee Load Rating (LFR)", short: "Existing double-tee bridges, with or without plans: CDOT vehicles, posting", description: "Load Factor Rating of a simple-span bridge of adjacent precast, prestressed double tees, as AASHTOWare BrR rates one: CDOT's 13 vehicles moved along the span, every girder rated at the points of interest for flexure, service stresses and (optionally) shear, inventory and operating, and the posting check. Without plans the prestress is back-calculated so HS-20 rates 1.0 at inventory (CDOT BRM 1.7.2(A)). With the BrR input sheet and a comparison of BrR's results. AASHTO Standard Specifications (17th ed.), MBE 6B and the CDOT Bridge Rating Manual.", available: true },
    ],
  },
  {
    id: "substructures",
    name: "Substructures",
    kinds: [
      { id: "stm-d-region", name: "Strut-and-Tie Model", short: "Pier caps and abutments: struts, ties, nodes", description: "Planar strut-and-tie design of disturbed regions in reinforced concrete pier caps and abutments: the truss layout entered or found by optimization, solved in equilibrium for each load case; the 25° strut-tie angle limit, tie bars, node face strength with nonhydrostatic nodes and confinement, the crack-control grid, anchorage of the ties at the extended nodal zone, and the diagonal-cracking screen. Normalweight, nonprestressed concrete. AASHTO LRFD 5.8.2, 5.10.8.2 and C5.8.2.2.", available: true },
      { id: "pier-column", name: "Pier Column", short: "Round, rectangular or oblong: P–M, slenderness, collision", description: "A pier column under its cap: the forces from the cap's strut-and-tie design (the bent as a plane frame) with braking, wind and temperature along the bridge from the girder designs, or entered; slenderness by moment magnification, axial load with biaxial bending by strain compatibility, shear, bar and tie limits, the optional vehicle collision, and the bars detailed with their quantities. AASHTO LRFD 3.6.4, 3.6.5.1, 3.8, 3.12, 4.5.3.2.2b, 5.6.4 and 5.7.3.3.", available: true },
      { id: "abutment", ...FOUNDATION_INFO.abutment, available: true },
    ],
  },
  {
    id: "foundations",
    name: "Foundations",
    kinds: (["spread-footing", "pile-foundation", "drilled-shaft", "micropile"] as const).map((id) => ({ id, ...FOUNDATION_INFO[id], available: true })),
  },
  {
    id: "walls",
    name: "Walls",
    kinds: [
      { id: "cip-cantilever-wall", name: "CIP Cantilever Wall", short: "Stability, stem, heel, toe and shear key", description: "Cast-in-place cantilever retaining wall: stability, shear key, and stem, heel and toe design. AASHTO LRFD.", available: true },
      { id: "mse-wall", name: "MSE Wall", short: "External and internal stability, facing panel", description: "Mechanically stabilized earth wall: external and internal stability, and the precast facing panel. AASHTO LRFD.", available: true },
      { id: "cantilever-wingwall", name: "Cantilever Wingwall", short: "Off an abutment: earth pressure, bars, abutment forces", description: "Wingwall cantilevered off an abutment: at-rest earth pressure and surcharge on the retained face, the horizontal bars at the abutment face, and the forces handed to the abutment. AASHTO LRFD.", available: true },
      { id: "shoring-wall", name: "Soldier Pile and Sheet Pile Wall", short: "Cantilever or anchored: embedment, pile, lagging, anchors", description: "A soldier pile and lagging wall or a steel sheet pile wall, cantilevered (AASHTO LRFD 11.8) or with ground anchors (11.9, FHWA GEC 4): earth pressures (3.11.5.6, apparent pressures 3.11.5.7), embedment, anchor loads by the tributary area or hinge method, the pile or sheet in flexure, timber lagging, and the anchors' tendons, bond and unbonded lengths.", available: true },
    ],
  },
  {
    id: "culverts",
    name: "Culverts",
    kinds: [
      { id: "box-culvert", name: "Box Culvert", short: "One or more cells: frame analysis and member design", description: "Reinforced concrete box culvert, single or multiple cells: loads, 2D frame analysis with moving HL-93 live load, and the slabs and walls designed. AASHTO LRFD.", available: true },
    ],
  },
  {
    id: "bridge-components",
    name: "Bridge Components",
    kinds: [
      { id: "deck-slab", name: "Deck Slab", short: "Equivalent strips: bars and overhang", description: "Cast-in-place deck on parallel girders by the equivalent strip method: the strip analyzed as a continuous beam under dead loads and the design truck's axles, the top, bottom and longitudinal bars, and the overhang for vehicle collision. AASHTO LRFD 4.6.2.1, 9.7.3 and A13.4.", available: true },
      { id: "approach-slab", name: "Approach Slab", short: "On the abutment notch and a sleeper slab: bars and quantities", description: "A cast-in-place bridge approach slab anchored to the abutment and resting on a sleeper slab, designed as CDOT does for the span over which the fill may settle away (50% of its length, BDM 11.3.7): the axles over the equivalent strip of a slab-type bridge, the main bars (flexure, minimum, crack control, fatigue), shear, distribution and temperature bars, the dowels into the abutment, the sleeper slab's bearing and bars, and a barrier on its edge; with its bars detailed and its CDOT quantities. AASHTO LRFD 3.6.1.3.3, 4.6.2.3, 5.5.3, 5.6, 5.10.6 and 9.7.3.2.", available: true },
      { id: "camber-haunch", name: "Camber and Haunch", short: "Haunch at supports and midspan, camber tolerances", description: "A girder span's haunch (or adjacent box beams' deck thickness) at the supports and midspan, from the deck's profile over the girder (vertical curve, chorded girders on a horizontal curve, cross-slope) and the girder's camber and dead load deflection, with over- and under-camber tolerances.", available: true },
      { id: "elastomeric-bearing", name: "Elastomeric Bearing", short: "Plain or steel-reinforced pads", description: "Elastomeric bearing pads, plain or steel-reinforced, by Method A or B: compression, shear strains, deflection, stability, shims and anchorage. AASHTO LRFD 14.7.5 and 14.7.6.", available: true },
      { id: "ptfe-bearing", name: "PTFE Sliding Bearing", short: "Sliding surface on an elastomeric pad", description: "A steel-reinforced elastomeric pad with a PTFE sliding surface: contact stresses (average and edge), the pad's deformation to the first slip and the sliding beyond, with the pad's own checks. AASHTO LRFD 14.7.2 and 14.7.5.", available: true },
      { id: "pot-disc-bearing", name: "Pot or Disc Bearing", short: "High-load multirotational: pot or urethane disc, fixed, guided or free", description: "A pot bearing (AASHTO 14.7.4) or a disc bearing (14.7.8), fixed, guided or free: the design rotation (14.4.2.1), the elastomeric pad, sealing rings, pot wall, base and piston, or the urethane disc, its lift-off, deflection, shear pin and plates; the PTFE sliding surface (14.7.2) and guides (14.7.9); the masonry plate on the concrete (5.6.5), the anchor rods (14.8.3) and the sole plate. Sized from the loads, with its section and plan drawn and its parts in the Bridge's 3D model.", available: true },
      { id: "strip-seal-joint", name: "Strip Seal Expansion Joint", short: "Movement and seal size", description: "A strip seal deck joint: the movement from temperature, creep and shrinkage normal to the skewed joint against the seal's range, and the gap to set at each installation temperature. AASHTO LRFD 3.12.2 and 14.5.3.", available: true },
      { id: "modular-joint", name: "Modular Expansion Joint", short: "Over 4 in: seals, size, setting and blockout", description: "A modular bridge joint system sized for the plans: the movement normal to the skewed joint with the added range of AASHTO Table 14.5.6.9.2-1, the seals at 3 in each at most (14.5.3.2), the size in CDOT's 3 in steps (BDM 14.4.5), the opening to set at each installation temperature, the blockout and what the manufacturer designs to 14.5.6.9; with its section and plan drawn and its parts in the Bridge's 3D model.", available: true },
      { id: "finger-joint", name: "Finger Expansion Joint", short: "Cantilever finger plates: overlap, gaps, strength and fatigue", description: "A cantilever finger plate joint: the movement along the bridge, the fingers' overlap (1.5 in) and gaps (2 or 3 in) at the strength movement (AASHTO 14.5.3.2), the fingers and plate as cantilevers under the wheel at the strength limit state and for infinite fatigue life (14.5.3.4, 6.6.1.2), the plate's bolts (14.5.3.7), the setting by installation temperature; CDOT uses them only to replace existing finger joints (BDM 14.4.6).", available: true },
    ],
  },
  {
    id: "seismic",
    name: "Seismic",
    kinds: [
      { id: "seismic-zone1", name: "Seismic Zone 1 Check", short: "Connection forces, support lengths, confinement", description: "A bridge in Seismic Zone 1, where no seismic analysis is required: the zone, horizontal connection forces at each support, minimum support lengths, and confinement spirals in the columns' plastic hinge regions. AASHTO LRFD 3.10.6, 3.10.9.2, 4.7.4.4 and 5.11.", available: true },
    ],
  },
  {
    id: "signs",
    name: "Sign Structures",
    kinds: [
      { id: "sign-cantilever", name: "Cantilever Sign Foundation", short: "Wind loads and the drilled shaft", description: "A cantilever sign structure's drilled shaft: dead and wind loads on the pole, arm and panel by AASHTO LTS, and the shaft's axial, bending, shear and torsion checks by AASHTO LRFD, for a p–y analysis's lateral response.", available: true },
      { id: "sign-bridge", name: "Sign Bridge", short: "Monotube span on two posts, and their shafts", description: "A monotube sign bridge (CDOT S-614-50): the span and posts as a portal frame under dead load and wind, the round tubes (AASHTO LRFD-LTS Section 5), anchor bolts and flange bolts, fatigue from natural wind and truck-induced gusts at the welds (Section 11), the span's L/150 deflection (10.4.1), and each post's drilled shaft.", available: true },
      { id: "signal-foundation", name: "Traffic Signal Foundation", short: "CDOT's standard poles on a caisson for the site's soil", description: "The caisson under one of CDOT's standard traffic signal supports (S-614-40, S-614-40A, S-614-44): pick the pole and its arms, and the tool works out the dead load and wind on it (AASHTO LRFD-LTS 3.8, the wind turned round the pole), then checks the caisson for the site's clay or sand: embedment by Broms (LTS 13.6.1.1), torsion in the soil, and the caisson's bending, shear and torsion (AASHTO 5.6, 5.7), with the standard's own basis alongside.", available: true },
    ],
  },
];

export const kindInfo = (kind: string) => CATEGORIES.flatMap((c) => c.kinds).find((k) => k.id === kind);

/** A CIP wall's inputs as saved, filled in from the defaults (for fields added since, each load
 * group's factors too). */
export function cipInputs(saved: unknown): CipInputs {
  const s = (saved && typeof saved === "object" ? saved : {}) as Partial<CipInputs>;
  const factors = Object.fromEntries((Object.keys(DEFAULT_FACTORS) as Combo[]).map((c) => [c, { ...DEFAULT_FACTORS[c], ...(s.factors?.[c] ?? {}) }])) as CipInputs["factors"];
  return { ...CIP_DEFAULTS, ...s, factors };
}

/** An MSE wall's inputs as saved, filled in from the defaults. */
export function mseInputs(saved: unknown): MseInputs {
  const s = (saved && typeof saved === "object" ? saved : {}) as Partial<MseInputs>;
  return { ...MSE_DEFAULTS, ...s, factors: { ...MSE_FACTORS, ...(s.factors ?? {}) } };
}

/** A box culvert's inputs as saved, filled in from the defaults. Saved before bars were a choice:
 * precast with welded wire (as they were designed). */
export function cbcInputs(saved: unknown): CbcInputs {
  const s = (saved && typeof saved === "object" ? saved : {}) as Partial<CbcInputs>;
  const old = s.steel && !s.reinf ? ({ reinf: "wwr", construction: "precast" } as const) : {};
  return { ...CBC_DEFAULTS, ...old, ...s, steel: { ...CBC_DEFAULTS.steel, ...(s.steel ?? {}) }, bars: { ...CBC_DEFAULTS.bars, ...(s.bars ?? {}) }, wingwalls: cleanWingwalls(s.wingwalls), cornerBars: s.cornerBars === true, extension: cleanExtension(s.extension), excavation: cleanExcavation(s.excavation), ...(s.rating ? { rating: { ...LRFR_DEFAULTS, ...s.rating } } : {}) };
}

/** A haunch design's inputs as saved, filled in from the defaults. */
export function haunchInputs(saved: unknown): HaunchInputs {
  const s = (saved && typeof saved === "object" ? saved : {}) as Partial<HaunchInputs>;
  return { ...HAUNCH_DEFAULTS, ...s };
}

/** A cantilever sign's inputs as saved, filled in from the defaults. */
export function signInputs(saved: unknown): SignInputs {
  const s = (saved && typeof saved === "object" ? saved : {}) as Partial<SignInputs>;
  // Designs saved before the steel was designed keep the shaft alone; a new design starts with the steel.
  const empty = Object.keys(s).length === 0;
  const st = s.steel ?? (empty ? SIGN_DEFAULTS.steel : undefined);
  const d = SIGN_STEEL_DEFAULTS;
  const { steel: _drop, ...rest } = { ...SIGN_DEFAULTS, ...s };
  void _drop;
  return { ...rest, ...(st ? { steel: { ...d, ...st, base: { ...d.base, ...(st.base ?? {}) }, flange: { ...d.flange, ...(st.flange ?? {}) }, fatigue: { ...d.fatigue, ...(st.fatigue ?? {}) } } } : {}) };
}

/** Seismic Zone 1 inputs as saved, filled in from the defaults. */
export function zone1Inputs(saved: unknown): Zone1Inputs {
  const s = (saved && typeof saved === "object" ? saved : {}) as Partial<Zone1Inputs>;
  return { ...ZONE1_DEFAULTS, ...s };
}

/** A deck's inputs as saved, filled in from the defaults. */
export function deckInputs(saved: unknown): DeckInputs {
  const s = (saved && typeof saved === "object" ? saved : {}) as Partial<DeckInputs>;
  return { ...DECK_DEFAULTS, ...s, rail: { ...RAIL_DEFAULT, ...(s.rail ?? {}) } };
}

/** A wingwall's inputs as saved, filled in from the defaults. */
export function wingwallInputs(saved: unknown): WingwallInputs {
  const s = (saved && typeof saved === "object" ? saved : {}) as Partial<WingwallInputs>;
  // Saved before the front face's and the vertical bars were entered apart: the single "other bars" fill in both.
  const other = s.otherBars ?? WINGWALL_DEFAULTS.frontBars!;
  return { ...WINGWALL_DEFAULTS, ...s, bars: { ...WINGWALL_DEFAULTS.bars, ...(s.bars ?? {}) }, frontBars: s.frontBars ?? other, vertBars: s.vertBars ?? other, otherBars: undefined, epoxy: s.epoxy !== false };
}

/** An elastomeric bearing's inputs as saved, filled in from the defaults. */
export function bearingInputs(saved: unknown): BearingInputs {
  const s = (saved && typeof saved === "object" ? saved : {}) as Partial<BearingInputs>;
  return { ...BEARING_DEFAULTS, ...s };
}

/** A PTFE sliding bearing's inputs as saved, filled in from its defaults. */
export function ptfeInputs(saved: unknown): BearingInputs {
  const s = (saved && typeof saved === "object" ? saved : {}) as Partial<BearingInputs>;
  return { ...PTFE_DEFAULTS, ...s, sliding: true };
}

/** An approach slab's inputs as saved, filled in from the defaults. */
export function approachSlabInputs(saved: unknown): ApproachSlabInputs {
  const s = (saved && typeof saved === "object" ? saved : {}) as Partial<ApproachSlabInputs>;
  // Saved before B-601-1EA: a strip seal is its 0–4" device; anything else B-601-1's poured joint.
  const was = (s as { joint?: string }).joint;
  const joint = was === "none" || was === "silicone" ? "none" : "device";
  return { ...APPROACH_SLAB_DEFAULTS, ...s, joint, sleeper: s.sleeper !== false, barrier: s.barrier === true };
}

/** A pot or disc bearing's inputs as saved, filled in from the defaults (each part's fields kept as saved). */
export function hlmrInputs(saved: unknown): HlmrInputs {
  const s = (saved && typeof saved === "object" ? saved : {}) as Partial<HlmrInputs>;
  const d = HLMR_DEFAULTS;
  return { ...d, ...s, kind: s.kind === "disc" ? "disc" : "pot", fixity: s.fixity === "fixed" || s.fixity === "free" ? s.fixity : "guided", pot: { ...d.pot, ...(s.pot ?? {}), rings: { ...d.pot.rings, ...(s.pot?.rings ?? {}) } }, disc: { ...d.disc, ...(s.disc ?? {}) }, ptfe: { ...d.ptfe, ...(s.ptfe ?? {}) }, guides: { ...d.guides, ...(s.guides ?? {}) }, masonry: { ...d.masonry, ...(s.masonry ?? {}) }, sole: { ...d.sole, ...(s.sole ?? {}) }, anchors: { ...d.anchors, ...(s.anchors ?? {}) } };
}

/** A slab bridge's inputs as saved, filled in from the defaults. */
export function slabBridgeInputs(saved: unknown): SlabBridgeInputs {
  const s = (saved && typeof saved === "object" ? saved : {}) as Partial<SlabBridgeInputs>;
  return { ...SLAB_BRIDGE_DEFAULTS, ...s, ...(s.rating ? { rating: { ...LRFR_DEFAULTS, ...s.rating } } : {}), spans: Array.isArray(s.spans) && s.spans.length ? s.spans.map(Number) : SLAB_BRIDGE_DEFAULTS.spans, edgeBars: s.edgeBars === null ? null : { ...SLAB_BRIDGE_DEFAULTS.edgeBars!, ...(s.edgeBars ?? {}) } };
}

/** A sign bridge's inputs as saved, filled in from the defaults. */
export function signBridgeInputs(saved: unknown): SignBridgeInputs {
  const s = (saved && typeof saved === "object" ? saved : {}) as Partial<SignBridgeInputs>;
  const d = SIGN_BRIDGE_DEFAULTS;
  return { ...d, ...s, signs: Array.isArray(s.signs) ? s.signs.slice(0, 6).map((x) => ({ ...d.signs[0], ...x })) : d.signs, base: { ...d.base, ...(s.base ?? {}) }, flange: { ...d.flange, ...(s.flange ?? {}) }, fatigue: { ...d.fatigue, ...(s.fatigue ?? {}) } };
}

/** A soldier pile or sheet pile wall's inputs as saved, filled in from the defaults. */
export function shoringInputs(saved: unknown): ShoringInputs {
  const s = (saved && typeof saved === "object" ? saved : {}) as Partial<ShoringInputs>;
  const d = SHORING_DEFAULTS;
  return { ...d, ...s, layers: Array.isArray(s.layers) && s.layers.length ? s.layers.slice(0, 6).map((l) => ({ ...d.layers[0], ...l })) : d.layers, anchors: Array.isArray(s.anchors) ? s.anchors.slice(0, 6).map((a) => ({ ...d.anchors[0], ...a })) : d.anchors };
}

/** A traffic signal foundation's inputs as saved, filled in from the defaults. */
export function signalInputs(saved: unknown): SignalInputs {
  const s = (saved && typeof saved === "object" ? saved : {}) as Partial<SignalInputs>;
  return { ...SIGNAL_DEFAULTS, ...s, attachments: Array.isArray(s.attachments) ? s.attachments.slice(0, 20) : null };
}

/** A modular joint's inputs as saved, filled in from the defaults. */
export function modularInputs(saved: unknown): ModularJointInputs {
  const s = (saved && typeof saved === "object" ? saved : {}) as Partial<ModularJointInputs>;
  return { ...MODULAR_DEFAULTS, ...s };
}

/** A finger joint's inputs as saved, filled in from the defaults. */
export function fingerInputs(saved: unknown): FingerJointInputs {
  const s = (saved && typeof saved === "object" ? saved : {}) as Partial<FingerJointInputs>;
  return { ...FINGER_DEFAULTS, ...s, bolt: { ...FINGER_DEFAULTS.bolt, ...(s.bolt ?? {}) } };
}

/** A strip seal joint's inputs as saved, filled in from the defaults. */
export function stripSealInputs(saved: unknown): StripSealInputs {
  const s = (saved && typeof saved === "object" ? saved : {}) as Partial<StripSealInputs>;
  return { ...STRIP_SEAL_DEFAULTS, ...s };
}

/** A girder design check's inputs as saved, filled in from the defaults (its lists kept as saved). */
export function girderInputs(saved: unknown): GirderInputs {
  const s = (saved && typeof saved === "object" ? saved : {}) as Partial<GirderInputs>;
  // Saved before Phase 2 (no loss method): kept as designed, with approximate losses and straight strands only.
  const phase1 = Object.keys(s).length > 0 && s.losses === undefined ? { losses: "approximate" as const, elasticGain: false, harped: { ...GIRDER_DEFAULTS.harped, count: 0 } } : {};
  // A standard rail sets the barrier: its width, weight and height (applyRail).
  return applyRail({
    ...GIRDER_DEFAULTS,
    ...phase1,
    ...s,
    harped: { ...GIRDER_DEFAULTS.harped, ...(phase1.harped ?? {}), ...(s.harped ?? {}) },
    bottomBars: { ...GIRDER_DEFAULTS.bottomBars, ...(s.bottomBars ?? {}) },
    pierBars: { ...GIRDER_DEFAULTS.pierBars, ...(s.pierBars ?? {}) },
    ...(s.rating ? { rating: { ...LRFR_DEFAULTS, ...s.rating } } : {}),
    connection: (() => {
      const c = { ...GIRDER_DEFAULTS.connection, ...(s.connection ?? {}) };
      const st = (s.connection as { strands?: unknown } | undefined)?.strands as { count?: unknown; length?: unknown; y?: unknown } | undefined;
      const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
      return st && typeof st === "object" ? { ...c, strands: { count: Math.max(0, Math.round(num(st.count, 0))), length: Math.max(0, num(st.length, 24)), y: num(st.y, 2.25) } } : { ...c, strands: undefined };
    })(),
    extraSpans: Array.isArray(s.extraSpans) ? s.extraSpans.slice(0, 4).map((x) => ({ L: Number(x?.L) || GIRDER_DEFAULTS.L, strands: Array.isArray(x?.strands) && x.strands.length ? x.strands : null, harped: x?.harped ? { ...GIRDER_DEFAULTS.harped, ...x.harped } : null })) : [],
    restraintMoments: s.restraintMoments === "positive" || s.restraintMoments === "none" ? s.restraintMoments : "all",
    criteria: s.criteria === "cdot" ? "cdot" : "aashto",
    continuity: s.continuity === "envelope" ? "envelope" : "auto",
    wcLoad: Number(s.wcLoad) > 0 ? Number(s.wcLoad) : undefined,
    wcDeckLoad: Number(s.wcDeckLoad) > 0 ? Number(s.wcDeckLoad) : undefined,
    haunchMode: s.haunchMode === "computed" || s.haunchMode === "supports" ? s.haunchMode : "given",
    haunchSupport: Number(s.haunchSupport) >= 0 && s.haunchSupport !== null && s.haunchSupport !== undefined ? Number(s.haunchSupport) : undefined,
    deckPanels: s.deckPanels === true,
    crossSlope: Number.isFinite(Number(s.crossSlope)) && s.crossSlope !== null && s.crossSlope !== undefined ? Number(s.crossSlope) : 0.02,
    profileOrdinate: Number(s.profileOrdinate) || 0,
    confinement: { ...GIRDER_DEFAULTS.confinement, ...(s.confinement ?? {}) },
    handling: { ...GIRDER_DEFAULTS.handling, ...(s.handling ?? {}), truck: { ...GIRDER_DEFAULTS.handling.truck, ...(s.handling?.truck ?? {}) } },
    custom: { ...GIRDER_DEFAULTS.custom, ...(s.custom ?? {}) },
    site: { ...SITE_WIND_DEFAULTS, ...(s.site ?? {}) },
    strands: Array.isArray(s.strands) && s.strands.length ? s.strands : GIRDER_DEFAULTS.strands,
    stirrups: Array.isArray(s.stirrups) && s.stirrups.length ? s.stirrups : GIRDER_DEFAULTS.stirrups,
    endBars: (() => {
      const e = (s as { endBars?: { count?: unknown; bar?: unknown } }).endBars;
      return e && typeof e.count === "number" && e.count > 0 && typeof e.bar === "number" ? { count: Math.round(e.count), bar: e.bar } : undefined;
    })(),
    crown: { ...CROWN_DEFAULT, ...(s.crown ?? {}) },
    rail: { ...GIRDER_RAIL_DEFAULT, ...(s.rail ?? {}) },
  });
}

/** A double-tee rating's inputs as saved, filled in from the defaults. */
export function dtRatingInputs(saved: unknown): DtInputs {
  const s = (saved && typeof saved === "object" ? saved : {}) as Partial<DtInputs>;
  const d = DT_DEFAULTS;
  const o = s.options ?? ({} as Partial<DtInputs["options"]>);
  const out: DtInputs = {
    ...d,
    ...s,
    bridge: { ...d.bridge, ...(s.bridge ?? {}) },
    units: { ...d.units, ...(s.units ?? {}), layout: Array.isArray(s.units?.layout) && s.units.layout.length ? s.units.layout : null },
    deck: { ...d.deck, ...(s.deck ?? {}) },
    roadway: { ...d.roadway, ...(s.roadway ?? {}) },
    loads: {
      ...d.loads,
      ...(s.loads ?? {}),
      sidewalks: Array.isArray(s.loads?.sidewalks)
        ? s.loads.sidewalks.map((x: { width: number; thk: number; curb?: boolean }) => ({ width: Number(x.width) || 0, thk: Number(x.thk) || 0, ...(x.curb === true ? { curb: true } : {}) }))
        : [],
      railComponents: Array.isArray(s.loads?.railComponents) ? s.loads.railComponents : [],
      utilities: Array.isArray(s.loads?.utilities) ? s.loads.utilities : [],
    },
    materials: { ...d.materials, ...(s.materials ?? {}) },
    prestress: (() => {
      const p = { ...d.prestress, ...(s.prestress ?? {}) };
      const h = p.harp;
      const ok = h && typeof h === "object" && [h.end, h.mid, h.at].every((v) => typeof v === "number" && Number.isFinite(v)) && h.at > 0 && h.at <= 0.5;
      return { mode: p.mode === "known" ? "known" : "back-calculate", strands: Number(p.strands) || 0, harp: ok ? { end: h.end, mid: h.mid, at: h.at } : null } as DtInputs["prestress"];
    })(),
    options: {
      ...d.options,
      ...o,
      stirrups: { ...d.options.stirrups, ...(o.stirrups ?? {}) },
      dfOverride: o.dfOverride ? { ...o.dfOverride } : null,
      tensionLimit: typeof o.tensionLimit === "number" ? o.tensionLimit : o.tensionLimit === null ? null : d.options.tensionLimit,
      ignoreTension: o.ignoreTension === true,
    },
    brrDf: Object.fromEntries((["intSingle", "intMulti", "extSingle", "extMulti"] as const).map((k) => [k, typeof s.brrDf?.[k] === "number" && s.brrDf[k]! > 0 ? s.brrDf[k] : null])) as DtInputs["brrDf"],
    review: { ...d.review, ...(s.review ?? {}), items: Array.isArray(s.review?.items) ? s.review.items : [] },
    notes: s.notes && typeof s.notes === "object" ? s.notes : {},
    brrResults: typeof s.brrResults === "string" ? s.brrResults : "",
    sketch:
      s.sketch && typeof s.sketch === "object" && Array.isArray(s.sketch.pages)
        ? {
            name: String(s.sketch.name ?? "Sketch"),
            pages: s.sketch.pages
              .filter((p) => p && typeof p.key === "string" && /^designs\/[\w-]+\/attachments\/[\w-]+\.(png|jpg|webp)$/.test(p.key))
              .slice(0, 6)
              .map((p) => ({ key: p.key, width: Number(p.width) || 0, height: Number(p.height) || 0 })),
            ...(Array.isArray(s.sketch.text) ? { text: s.sketch.text.filter((l): l is string => typeof l === "string").slice(0, 600).map((l) => l.slice(0, 400)) } : {}),
          }
        : null,
    dimsChecked: s.dimsChecked === true,
    sources: {},
    blankStart: true,
  };
  // Sources: kept as saved; a new design starts blank; one saved before sources were kept gets them worked out.
  const KINDS = new Set(["sia", "sketch", "brm", "file", "standard", "entered", "assumed", "confirmed"]);
  if (s.sources && typeof s.sources === "object") {
    out.sources = Object.fromEntries(
      Object.entries(s.sources)
        .filter(([, v]) => v && typeof v === "object" && KINDS.has((v as { kind: string }).kind))
        .map(([k, v]) => [k, { kind: (v as DtInputs["sources"][string]).kind, ...(typeof v.note === "string" ? { note: v.note.slice(0, 500) } : {}) }]),
    );
    out.blankStart = s.blankStart !== false;
  } else if (Object.keys(s).length > 0) {
    out.sources = legacySources(out);
    out.blankStart = false;
  }
  return out;
}

/** A design's inputs as saved, filled in from its kind's defaults, with its take-off settings kept. */
export function designInputs(kind: string, saved: unknown) {
  const parsed = parseInputs(kind, saved);
  const t = TAKEOFF_KINDS.includes(kind) ? takeoffSettings((saved as Record<string, unknown> | null)?.takeoff) : undefined;
  return (t ? { ...parsed, takeoff: t } : parsed) as typeof parsed;
}

function parseInputs(kind: string, saved: unknown) {
  if ((FOUNDATION_KINDS as readonly string[]).includes(kind)) return foundationInputs(kind, saved)!;
  if (kind === "lrfd-girder-check") return girderInputs(saved);
  if (kind === "steel-girder-check") return steelGirderInputs(saved);
  if (kind === "dt-load-rating") return dtRatingInputs(saved);
  if (kind === "stm-d-region") return stmInputs(saved);
  if (kind === "pier-column") return columnInputs(saved);
  return kind === "mse-wall" ? mseInputs(saved) : kind === "box-culvert" ? cbcInputs(saved) : kind === "elastomeric-bearing" ? bearingInputs(saved) : kind === "cantilever-wingwall" ? wingwallInputs(saved) : kind === "deck-slab" ? deckInputs(saved) : kind === "seismic-zone1" ? zone1Inputs(saved) : kind === "camber-haunch" ? haunchInputs(saved) : kind === "sign-cantilever" ? signInputs(saved) : kind === "ptfe-bearing" ? ptfeInputs(saved) : kind === "strip-seal-joint" ? stripSealInputs(saved) : kind === "approach-slab" ? approachSlabInputs(saved) : kind === "slab-bridge" ? slabBridgeInputs(saved) : kind === "pot-disc-bearing" ? hlmrInputs(saved) : kind === "modular-joint" ? modularInputs(saved) : kind === "sign-bridge" ? signBridgeInputs(saved) : kind === "signal-foundation" ? signalInputs(saved) : kind === "shoring-wall" ? shoringInputs(saved) : kind === "finger-joint" ? fingerInputs(saved) : cipInputs(saved);
}
