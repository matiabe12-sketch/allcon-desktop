"""
A Bridge as an IFC 4.3 model, from allcon's Bridge record (src/lib/design/bridge/ifc.ts builds the
description; this writes it with IfcOpenShell).

The model: the project in feet; the site with the first abutment's northing and easting; IfcBridge
with SUPERSTRUCTURE and SUBSTRUCTURE parts and an ABUTMENT or PIER part for each support; the
alignment (IfcAlignment by the PI method, its horizontal and vertical layouts and a STATION referent)
on the site; and each element as an extruded profile at its placement, with an ALLCON_Design property
set and a material. The description is data: numbers, names and a fixed set of classes; nothing in it
is run.
"""

import math

import ifcopenshell
import ifcopenshell.api
import ifcopenshell.api.aggregate
import ifcopenshell.api.alignment
import ifcopenshell.api.context
import ifcopenshell.api.project
import ifcopenshell.api.unit
import ifcopenshell.api.geometry
import ifcopenshell.api.material
import ifcopenshell.api.pset
import ifcopenshell.api.root
import ifcopenshell.api.style
import ifcopenshell.api.spatial
import ifcopenshell.util.alignment
import numpy

CLASSES = {"IfcBeam", "IfcBearing", "IfcColumn", "IfcFooting", "IfcPile", "IfcSlab", "IfcWall", "IfcMember", "IfcPlate", "IfcRailing"}
PART_TYPES = {"SUPERSTRUCTURE", "SUBSTRUCTURE", "ABUTMENT", "PIER", "FOUNDATION", "DECK"}
MAX_ELEMENTS = 5000


def _num(v, what):
    if not isinstance(v, (int, float)) or not math.isfinite(v):
        raise ValueError(f"{what} must be a number")
    return float(v)


def _vec(v, what):
    if not isinstance(v, (list, tuple)) or len(v) != 3:
        raise ValueError(f"{what} must be three numbers")
    return [_num(x, what) for x in v]


def _placement(origin, xdir, zdir):
    z = numpy.array(zdir, dtype=float)
    z /= numpy.linalg.norm(z)
    x = numpy.array(xdir, dtype=float)
    x -= z * x.dot(z)  # square to the sweep
    n = numpy.linalg.norm(x)
    if n < 1e-9:
        raise ValueError("an element's x direction runs along its sweep")
    x /= n
    y = numpy.cross(z, x)
    m = numpy.eye(4)
    m[:3, 0], m[:3, 1], m[:3, 2], m[:3, 3] = x, y, z, origin
    return m


def _profile(model, p):
    kind = p.get("kind")
    if kind == "rect":
        return model.createIfcRectangleProfileDef("AREA", None, None, _num(p["x"], "a width"), _num(p["y"], "a depth"))
    if kind == "circle":
        return model.createIfcCircleProfileDef("AREA", None, None, _num(p["r"], "a radius"))
    if kind == "ishape":
        return model.createIfcIShapeProfileDef(
            "AREA", None, None, _num(p["width"], "a flange width"), _num(p["depth"], "a depth"), _num(p["web"], "a web"), _num(p["flange"], "a flange")
        )
    if kind == "poly":
        pts = [(_num(a, "a point"), _num(b, "a point")) for a, b in p["pts"]]
        if len(pts) < 3:
            raise ValueError("an outline needs three points")
        points = model.createIfcCartesianPointList2D([list(q) for q in pts])
        curve = model.createIfcIndexedPolyCurve(points, None, False)
        # Closed: the last point back to the first.
        curve.Segments = [model.createIfcLineIndex(list(range(1, len(pts) + 1)) + [1])]
        return model.createIfcArbitraryClosedProfileDef("AREA", None, curve)
    raise ValueError(f"unknown profile '{kind}'")


def _mesh(model, p):
    pts = [_vec(v, "a point") for v in p.get("pts") or []]
    tris = p.get("tris") or []
    if len(pts) < 4 or len(tris) < 4:
        raise ValueError("a solid needs four points and four faces")
    index = []
    for t in tris:
        if len(t) != 3 or not all(isinstance(i, int) and 0 <= i < len(pts) for i in t):
            raise ValueError("a face must name three of the points")
        index.append([i + 1 for i in t])
    return model.createIfcTriangulatedFaceSet(model.createIfcCartesianPointList3D(pts), None, True, index, None)


def build(params):
    """The IFC model for a Bridge description (see ifc.ts BridgeIfc). Returns (model, handles)."""
    api = ifcopenshell.api
    elements = params.get("elements") or []
    if len(elements) > MAX_ELEMENTS:
        raise ValueError(f"at most {MAX_ELEMENTS} elements")
    model = api.project.create_file(version="IFC4X3")
    project = api.root.create_entity(model, ifc_class="IfcProject", name=params.get("project") or "Project")
    length = api.unit.add_conversion_based_unit(model, name="foot")
    area = api.unit.add_si_unit(model, unit_type="AREAUNIT")
    volume = api.unit.add_si_unit(model, unit_type="VOLUMEUNIT")
    api.unit.assign_unit(model, units=[length, area, volume])
    model3d = api.context.add_context(model, context_type="Model")
    body = api.context.add_context(model, context_type="Model", context_identifier="Body", target_view="MODEL_VIEW", parent=model3d)
    api.context.add_context(model, context_type="Model", context_identifier="Axis", target_view="GRAPH_VIEW", parent=model3d)

    site = api.root.create_entity(model, ifc_class="IfcSite", name="Site")
    api.aggregate.assign_object(model, products=[site], relating_object=project)
    origin = params.get("origin") or {}
    pset = api.pset.add_pset(model, product=site, name="ALLCON_Origin")
    api.pset.edit_pset(
        model,
        pset=pset,
        properties={
            "Northing": _num(origin.get("northing", 0), "the northing"),
            "Easting": _num(origin.get("easting", 0), "the easting"),
            "Note": "The model's (0, 0) is this point in the project's coordinates; z is the elevation.",
        },
    )
    bridge = api.root.create_entity(model, ifc_class="IfcBridge", name=params.get("name") or "Bridge")
    api.aggregate.assign_object(model, products=[bridge], relating_object=site)
    for product in (site, bridge):
        api.geometry.edit_object_placement(model, product=product, matrix=numpy.eye(4), is_si=False)

    # The alignment: the horizontal layout segment by segment (lines, circular arcs, clothoids), the
    # vertical by its PVIs, the start station as a STATION referent.
    al = params.get("alignment") or {}
    segments = al.get("segments") or []
    alignment = None
    if segments:
        vp = [(_num(d, "a PVI"), _num(z, "a PVI")) for d, z in al.get("vpoints") or []]
        lengths = [_num(v, "a curve length") for v in al.get("lengths") or []]
        vertical = len(vp) >= 2
        name = al.get("name") or "Alignment"
        alignment = ifcopenshell.api.alignment.create(model, name, include_vertical=vertical)
        layout = ifcopenshell.api.alignment.get_horizontal_layout(alignment)
        for g in segments:
            if g.get("type") not in ("LINE", "CIRCULARARC", "CLOTHOID"):
                raise ValueError(f"unknown alignment segment '{g.get('type')}'")
            x, y = g["start"]
            params_ = model.createIfcAlignmentHorizontalSegment(
                StartTag=None,
                EndTag=None,
                StartPoint=model.createIfcCartesianPoint((_num(x, "a point"), _num(y, "a point"))),
                StartDirection=_num(g["dir"], "a direction"),
                StartRadiusOfCurvature=_num(g["r0"], "a radius"),
                EndRadiusOfCurvature=_num(g["r1"], "a radius"),
                SegmentLength=_num(g["length"], "a length"),
                GravityCenterLineHeight=None,
                PredefinedType=g["type"],
            )
            ifcopenshell.api.alignment.create_layout_segment(model, layout, params_)
        if vertical:
            ifcopenshell.api.alignment.layout_vertical_alignment_by_pi_method(model, ifcopenshell.api.alignment.get_vertical_layout(alignment), vp, lengths)
        start = _num(al.get("startStation", 0), "the start station")
        ifcopenshell.api.alignment.add_stationing_referent(model, f"{name} {ifcopenshell.util.alignment.station_as_string(model, start)}", alignment, 0.0, start)
        # The alignment belongs to the site; IfcOpenShell may have put it under the project.
        for rel in list(alignment.Decomposes or []):
            if rel.RelatingObject != site:
                api.aggregate.unassign_object(model, products=[alignment])
        if not alignment.Decomposes:
            api.aggregate.assign_object(model, products=[alignment], relating_object=site)

    # The spatial parts.
    parts = {}
    for p in params.get("parts") or []:
        if p.get("type") not in PART_TYPES:
            raise ValueError(f"unknown bridge part '{p.get('type')}'")
        part = api.root.create_entity(model, ifc_class="IfcBridgePart", name=p.get("name"), predefined_type=p["type"])
        parent = parts.get(p.get("parent")) or bridge
        api.aggregate.assign_object(model, products=[part], relating_object=parent)
        api.geometry.edit_object_placement(model, product=part, matrix=numpy.eye(4), is_si=False)
        part.UsageType = "LATERAL" if p["type"] in ("ABUTMENT", "PIER") else "LONGITUDINAL"
        parts[p.get("key")] = part

    materials = {}
    styles = {}
    counts = {}
    for e in elements:
        cls = e.get("cls")
        if cls not in CLASSES:
            raise ValueError(f"unknown element class '{cls}'")
        try:
            element = api.root.create_entity(model, ifc_class=cls, name=e.get("name"), predefined_type=e.get("type") or None)
        except Exception:
            # A predefined type the schema doesn't have for this class: USERDEFINED with its name.
            element = api.root.create_entity(model, ifc_class=cls, name=e.get("name"), predefined_type="USERDEFINED")
            if hasattr(element, "ObjectType"):
                element.ObjectType = e.get("type")
        container = parts.get(e.get("part")) or bridge
        api.spatial.assign_container(model, products=[element], relating_structure=container)
        m = _placement(_vec(e["origin"], "an origin"), _vec(e["xdir"], "an x direction"), _vec(e["zdir"], "a direction"))
        api.geometry.edit_object_placement(model, product=element, matrix=m, is_si=False)
        profile = e.get("profile") or {}
        if profile.get("kind") == "mesh":
            rep = model.createIfcShapeRepresentation(body, "Body", "Tessellation", [_mesh(model, profile)])
        else:
            solid = model.createIfcExtrudedAreaSolid(
                _profile(model, profile),
                model.createIfcAxis2Placement3D(model.createIfcCartesianPoint((0.0, 0.0, 0.0))),
                model.createIfcDirection((0.0, 0.0, 1.0)),
                max(1e-3, _num(e.get("depth"), "a depth")),
            )
            rep = model.createIfcShapeRepresentation(body, "Body", "SweptSolid", [solid])
        api.geometry.assign_representation(model, product=element, representation=rep)
        color = e.get("color")
        if isinstance(color, (list, tuple)) and len(color) == 3:
            key = tuple(round(min(1.0, max(0.0, _num(v, "a colour"))), 3) for v in color)
            if key not in styles:
                style = api.style.add_style(model, name=f"ALLCON {key[0]:.2f} {key[1]:.2f} {key[2]:.2f}")
                api.style.add_surface_style(model, style=style, ifc_class="IfcSurfaceStyleShading", attributes={"SurfaceColour": {"Name": None, "Red": key[0], "Green": key[1], "Blue": key[2]}, "Transparency": 0.0})
                styles[key] = style
            api.style.assign_representation_styles(model, shape_representation=rep, styles=[styles[key]])
        name = str(e.get("material") or "")
        if name:
            if name not in materials:
                materials[name] = api.material.add_material(model, name=name, category="concrete" if "oncrete" in name else "steel" if "Steel" in name else None)
            api.material.assign_material(model, products=[element], material=materials[name])
        for pset_name, props in (e.get("psets") or {}).items():
            if not isinstance(props, dict):
                continue
            ps = api.pset.add_pset(model, product=element, name=str(pset_name)[:60])
            api.pset.edit_pset(model, pset=ps, properties={str(k)[:60]: v for k, v in props.items() if isinstance(v, (str, int, float, bool))})
        counts[cls] = counts.get(cls, 0) + 1

    handles = {
        "project": project.id(),
        "site": site.id(),
        "facility": bridge.id(),
        "alignment": alignment.id() if alignment else None,
        "parts": {k: v.id() for k, v in parts.items()},
        "body_context": body.id(),
        "counts": counts,
    }
    return model, handles
