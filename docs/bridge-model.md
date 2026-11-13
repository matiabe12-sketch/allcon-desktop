# The Bridge (phases 1 and 2 of the IFC bridge workflow)

One record that describes a whole girder bridge, entered the way PGSuper's Bridge Description and
Alignment dialogs ask for it, which every design tool reads from and the IFC generator (phase 2) and
reader (phase 3) translate to and from. Phase 1: the record and its editor, the geometry it implies,
the superstructure check run from it, and the loads passed down the load path to the abutments, the
piers and their foundations.

## The record (Design kind `bridge`, Bridges category)

Laid out after PGSuper (9.0, BridgeLink): its project file holds `AlignmentData` (reference station,
northing, easting, direction, horizontal curves), `ProfileData` (station, elevation, grade, vertical
curves), `Crown` (roadway section templates by station: left and right slopes, the ridge point's
offset), and `BridgeDescription` (girder family and type, girder count and spacing and where it's
measured, the bridge line's offset from the alignment, the slab offset, the deck edges, and each pier:
station, orientation, connection, girder end distance and bearing offset).

- **Alignment** (horizontal): a reference station with its northing and easting and the back tangent's
  bearing; horizontal curves by PI station, radius and the front tangent's bearing (circular; spirals
  in a later phase).
- **Profile** (vertical): a station, its elevation and the grade leaving it; vertical curves by PVI
  station, the grade leaving it and the curve's length (symmetric parabolas, AASHTO Green Book).
- **Roadway section** (crown): left and right cross slopes and the crown's offset from the alignment,
  constant along the bridge (superelevation transitions in a later phase).
- **Supports**: abutment, pier, …, abutment, each at a station with its orientation ("normal" or a skew
  angle, + to the right, as PGSuper's "15 L"/"15 R"), its type (integral or seat abutment; pier
  continuous, continuous after deck placement, or simple), the girders' end distance and the bearing
  offset from the support's line.
- **Superstructure**: the girder (the girder check's library), count, spacing (normal to the
  alignment at the abutments), the bridge line's offset from the alignment, deck edges (overhang),
  deck thickness, sacrificial depth, slab offset ("A" dimension) or haunch, the rail, the wearing
  surface, concrete. The girder's own details (strands, stirrups, handling, criteria) stay in a linked
  girder design, which the Bridge sets the layout of.
- **Components**: links to the designs built from it: the girder design, an abutment design at each
  end, and at each pier its cap (strut-and-tie), column and foundation designs.

## What it works out

- **Geometry**: each support's station, coordinates, bearing and skew; each span's length along the
  bridge line, bearing to bearing; the profile grade and elevation along it; the top of deck at each
  girder over each bearing (from the profile and the crown), and the girder's seat elevation below it
  (the slab offset and the girder's depth): the bearing seat elevations table PGSuper reports.
- **Superstructure**: the girder design run with the Bridge's layout: the spans (continuous over the
  piers that are), the largest skew, the spacing, overhang, deck, rail, crown and the profile's
  ordinate over each span (for the haunch), interior and exterior girders, all its checks.
- **Load path**:
  - Each support's reactions per girder: DC (girder, deck and haunch, diaphragms, barrier), DW, and the
    HL-93 lane reaction times the shear distribution factor, without and with IM (a continuous
    bridge's pier reactions from the girder check's continuous beam).
  - Abutments: the abutment design's bridge inputs (unit length to the nearest expansion joint, the
    grade, skew, curvature, girder count, spacing, reactions, braking, the abutment's length along its
    skew).
  - Piers: the cap's loads from the girder designs (the strut-and-tie tool's existing link), the
    column from the cap (existing link), and the foundation's load cases from the column's base forces
    (footing, pile group or drilled shaft).
  - Every push shows what changes and keeps the component's own details (bars, strands, soils).
- **Summary**: each component's verdict and governing check in one table, top to bottom.

## Sources

- PGSuper / BridgeLink 9.0 (WSDOT), its project file's alignment, profile, crown and bridge
  description; its User Guide (Bridge Description, Alignment).
- AASHTO A Policy on Geometric Design (Green Book): vertical curves.
- AASHTO LRFD 10th: 3.6.1 (HL-93, multiple presence), 3.6.2 (IM), 3.6.4 (braking), 4.6.2.2 (distribution
  factors), and the tools' own articles.
- CDOT BDM 11.3 (abutment loads: half the approach slab, IM in the cap but not the foundation).

## Later phases

3. IFC → the Bridge (classify, extract, confirm), then the same design run.
4. Curved girders, rebar and strands in IFC.

## Status (phase 1 built, 2026-11-13)

- `lib/design/bridge/`: `alignment.ts` (stationing through tangents and circular curves, the inverse
  station and offset, the profile with parabolic vertical curves, the crown), `bridge.ts` (the record,
  `bridgeLayout`, `girderInputsFor`, `runBridge` with each support's reactions: simple ends at the
  abutments and simple piers; at a continuous pier the girder and deck simple, DC2 and DW on the
  continuous beam, the lane by its influence lines), `loadpath.ts`, `kinds.ts`; `app/actions/bridge.ts`
  (`syncBridge`: update the linked designs top to bottom, create the missing girder and abutment
  designs); `components/design/bridge-editor.tsx`, `bridge-sketch.tsx` (plan and profile).
- Piers (added 2026-11-13): each pier is described in the Bridge as PGSuper's physical pier model is
  (multicolumn bent or hammerhead; cap length, depth and width; columns, spacing and section; the top of
  the footing or shaft; the foundation's type). The cap is built from the standard pier cap template
  with those dimensions and its bearings where the Bridge's girders sit; the column's height runs from
  the cap's soffit (the lowest bearing seat less the cap's depth) to the foundation's top; "Create the
  missing designs" makes the cap, column and foundation.
- Service loads: the column's link from the cap carries a Service I case (each bearing's DC + DW + the
  most live load reaching it, with IM and the multiple presence factor, unfactored), shown in the
  column's rows but not held to its strength checks, so the footing's settlement and crack control and
  a pile group's deflection now run from the bridge's loads.
- Abutments also drive their approach slab (deck width, roadway between barriers, skew) and a
  wingwall (height at the abutment face, the abutment's width, skew, backfill).
- Not yet: curved girders (girders are chorded between supports, as precast girders are), a calc
  package for the Bridge itself.

## Status (phase 2 built, 2026-11-13): the Bridge → IFC 4.3

"Build the IFC model" in the Bridge editor writes an IFC 4.3 model of the bridge and saves it as a new
3D model in the Bridge's project (the Bridge must be in a project).

- `lib/design/bridge/ifc.ts` (`bridgeIfc`) describes the model: the alignment as its horizontal segments
  (LINE, CIRCULARARC, CLOTHOID, as IfcAlignmentHorizontalSegment takes them) and its PVIs, from 100 ft
  before the first abutment to 100 ft past the last (widened to take in whole spirals and vertical
  curves); the parts (IfcBridge → SUPERSTRUCTURE and SUBSTRUCTURE, an ABUTMENT or PIER part per support);
  and each element as a profile swept from a placement, with its class, predefined type, material and an
  `ALLCON_Design` property set (the design's kind, id, verdict, the CDOT pay item).
- `api/_bridge.py` writes it with IfcOpenShell (action `bridge` of the IFC worker): feet, the site's
  `ALLCON_Origin` (the first abutment's northing and easting: the model's (0, 0)), the alignment segment
  by segment with `create_layout_segment`, the vertical by `layout_vertical_alignment_by_pi_method`, the
  start station as a STATION referent. The description is data: a fixed set of classes, numbers, names.
- Elements: girders (IfcBeam GIRDER_SEGMENT, the girder's outline swept along its 3D chord, seated on its
  bearings); bearings (IfcBearing); the deck (IfcSlab FLOOR, a closed triangulated solid whose top follows
  the alignment, the profile, the crown and the superelevation exactly, the soffit the deck's thickness
  below); integral abutments (pile cap IfcFooting, end diaphragm, H-piles IfcPile DRIVEN or shafts BORED);
  seat abutments (stem, backwall, footing); approach slabs (IfcSlab APPROACH_SLAB); pier caps (IfcBeam
  PIERCAP), columns (IfcColumn), footings, pile caps and piles, or shafts. Sizes come from the linked
  designs, or their defaults when one isn't linked.
- Alignment items added with it: spirals (entry and exit clothoids per curve, PGSuper's spiral lengths;
  `alignment.ts`), superelevation transitions (roadway section templates by station, straight-line
  between them; `sectionAt`), and flared girders (a girder spacing per support, the girder lines straight
  between them; the girder design takes the widest spacing in its group).
- Checked: `ifc.test.ts` and `geometry.test.ts` (spiral T, p, k, Lc and continuity; superelevation;
  flare; the deck's volume; the haunch at every bearing). The written files pass IfcOpenShell's schema
  validation, every element tessellates, and IfcOpenShell's own evaluation of a spiral alignment lies
  within 0.0001 ft of ours.
- Not modelled yet: wingwalls, barriers, diaphragms at piers, rebar and strands, the deck's haunch.
