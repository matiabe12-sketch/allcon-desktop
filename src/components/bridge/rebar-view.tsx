"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import CameraControls from "camera-controls";
import { Loader2 } from "lucide-react";
import { bridgeRebarModel } from "@/app/actions/bridge";
import { OrientationCube, type OrientationCubeHandle } from "@/components/models/orientation-cube";
import type { RebarCategory, RebarElement, RebarModel } from "@/lib/design/bridge/rebar-model";
import type { BarRole, BarSet3D } from "@/lib/design/bridge/rebar3d";
import { elementFrame } from "@/lib/design/bridge/rebar3d";
import { cn } from "@/lib/utils";

// The workspace's Rebar view: the whole bridge from its IFC model (girders, deck, barriers, bearings,
// abutments, approach slabs, wingwalls, pier caps, columns, footings, piles and shafts), the concrete
// ghosted, and inside it every bar as a tube at its true diameter, where its element's linked design
// places it (rebar3d.ts, rebar3d-more.ts); any the IFC model has that aren't placed, schematic (faded). Toggles for the bar types and the concrete; a click on an element shows it
// alone, the list shows a support (cap, columns and foundations together) or the superstructure.

CameraControls.install({ THREE });

export const ROLE_COLOR: Record<BarRole, number> = { main: 0xc2410c, stirrup: 0x15803d, spiral: 0x84cc16, strand: 0x1e293b, sheathed: 0xdc2626 };
const ROLE_NAME: Record<BarRole, string> = { main: "Main bars", stirrup: "Stirrups and ties", spiral: "Spirals", strand: "Strands", sheathed: "Debonded (sheathed) lengths" };
const CONCRETE = 0xb8bec7;
const STEEL = 0x64748b;
const SUPER: RebarCategory[] = ["girder", "deck", "barrier", "bearing", "diaphragm", "joint"];

type Concrete = "ghost" | "solid" | "hidden";
type Show = { roles: Record<BarRole, boolean>; schematic: boolean; concrete: Concrete; superstructure: boolean };
type Alone = { kind: "element"; index: number; label: string } | { kind: "part"; key: string; label: string } | null;

export function RebarPanel({ bridgeId, dark }: { bridgeId: string; dark?: boolean }) {
  const [state, setState] = useState<{ version: number; model?: RebarModel; error?: string } | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let live = true;
    bridgeRebarModel(bridgeId)
      .then((model) => live && setState({ version, model }))
      .catch((e) => live && setState({ version, error: e instanceof Error ? e.message : "Could not build the bars" }));
    return () => {
      live = false;
    };
  }, [bridgeId, version]);
  if (!state || state.version !== version)
    return (
      <div className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Placing the bars from the linked designs
      </div>
    );
  if (state.error) return <p className="p-4 text-xs text-destructive">{state.error}</p>;
  return <RebarScene model={state.model!} dark={dark} onReload={() => setVersion((v) => v + 1)} />;
}

function RebarScene({ model, dark, onReload }: { model: RebarModel; dark?: boolean; onReload: () => void }) {
  const [show, setShow] = useState<Show>({ roles: { main: true, stirrup: true, spiral: true, strand: true, sheathed: true }, schematic: false, concrete: "ghost", superstructure: true });
  const [alone, setAlone] = useState<Alone>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const cube = useRef<OrientationCubeHandle>(null);
  const three = useRef<{ renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; controls: CameraControls; group: THREE.Group; render: () => void; box: THREE.Box3; pickable: THREE.Mesh[] } | null>(null);
  const pickRef = useRef<(i: number | null, dbl: boolean) => void>(() => undefined);
  useEffect(() => {
    pickRef.current = (i, dbl) => {
      setPicked(i);
      if (dbl && i !== null) setAlone({ kind: "element", index: i, label: model.elements[i].name });
    };
  }, [model]);

  const counts = useMemo(() => {
    const c: Record<BarRole, number> = { main: 0, stirrup: 0, spiral: 0, strand: 0, sheathed: 0 };
    for (const s of model.bars) if (s.role !== "sheathed") c[s.role] += s.at.length;
    return c;
  }, [model]);

  const lookFrom = (direction: [number, number, number], jump = false) => {
    const s = three.current;
    if (!s || s.box.isEmpty()) return;
    const c = s.box.getCenter(new THREE.Vector3());
    const size = s.box.getSize(new THREE.Vector3());
    const span = Math.max(size.x, size.y, size.z, 1);
    const dir = new THREE.Vector3(...direction);
    if (Math.hypot(dir.x, dir.y) < 1e-6) dir.y = -0.001 * Math.sign(dir.z || 1);
    dir.normalize();
    // Far enough to see the box's corners across the view, as the analysis view frames its model.
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 0, 1), dir).normalize();
    const up = new THREE.Vector3().crossVectors(dir, right);
    let halfW = 0, halfH = 0, depth = 0;
    for (const x of [-0.5, 0.5]) for (const y of [-0.5, 0.5]) for (const z of [-0.5, 0.5]) {
      const v = new THREE.Vector3(x * size.x, y * size.y, z * size.z);
      halfW = Math.max(halfW, Math.abs(v.dot(right)));
      halfH = Math.max(halfH, Math.abs(v.dot(up)));
      depth = Math.max(depth, v.dot(dir));
    }
    const tan = Math.tan((s.camera.fov * Math.PI) / 360);
    const distance = depth + 1.15 * Math.max(halfW / (tan * Math.max(s.camera.aspect, 0.2)), halfH / tan, span * 0.05);
    const to = c.clone().addScaledVector(dir, distance);
    s.camera.near = span / 5000;
    s.camera.far = span * 100;
    s.camera.updateProjectionMatrix();
    s.controls.minDistance = span / 2000;
    s.controls.maxDistance = span * 20;
    void s.controls.setLookAt(to.x, to.y, to.z, c.x, c.y, c.z, !jump);
    s.render();
  };
  const iso: [number, number, number] = [-0.5, -0.8, 0.42];

  // The renderer, camera and controls: once.
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.domElement.style.cssText = "display:block;width:100%;height:100%";
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 1.5));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(-1, -2, 3);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0xffffff, 0.6);
    fill.position.set(2, 1.5, 0.5);
    scene.add(fill);
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100000);
    camera.up.set(0, 0, 1);
    const controls = new CameraControls(camera, renderer.domElement);
    controls.smoothTime = 0.2;
    controls.draggingSmoothTime = 0.08;
    controls.dollyToCursor = true;
    controls.infinityDolly = true;
    const group = new THREE.Group();
    scene.add(group);
    let dirty = true;
    const s = { renderer, scene, camera, controls, group, render: () => void (dirty = true), box: new THREE.Box3(), pickable: [] as THREE.Mesh[] };
    three.current = s;
    const turn = new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1);
    const seen = new THREE.Matrix4();
    const clock = new THREE.Clock();
    let frame = 0;
    const tick = () => {
      if (controls.update(clock.getDelta()) || dirty) {
        dirty = false;
        renderer.render(scene, camera);
        cube.current?.setCamera(seen.multiplyMatrices(camera.matrixWorldInverse, turn).elements);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const resize = () => {
      const { width, height } = el.getBoundingClientRect();
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      s.render();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    resize();
    const hit = (e: MouseEvent) => {
      const r = renderer.domElement.getBoundingClientRect();
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
      // Through the ghosted concrete: the nearest element whose bars come from its design, else the nearest.
      const hits = ray.intersectObjects(s.pickable, false);
      const h = hits.find((x) => x.object.userData.designed) ?? hits[0];
      return h ? (h.object.userData.index as number) : null;
    };
    let down: [number, number] | null = null;
    const onDown = (e: PointerEvent) => (down = [e.clientX, e.clientY]);
    const onUp = (e: PointerEvent) => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4) return;
      pickRef.current(hit(e), false);
    };
    const onDbl = (e: MouseEvent) => pickRef.current(hit(e), true);
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);
    renderer.domElement.addEventListener("dblclick", onDbl);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      renderer.domElement.removeEventListener("dblclick", onDbl);
      controls.dispose();
      renderer.dispose();
      el.removeChild(renderer.domElement);
      three.current = null;
    };
  }, []);

  // The scene: rebuilt when the model, the toggles or what's shown alone change.
  const framed = useRef("");
  useEffect(() => {
    const s = three.current;
    if (!s) return;
    s.group.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | undefined;
      mat?.dispose?.();
    });
    s.group.clear();
    s.pickable = [];
    const visible = (i: number) => {
      const e = model.elements[i];
      if (alone?.kind === "element") return i === alone.index;
      if (alone?.kind === "part") return alone.key === "super" ? e.part === "super" || SUPER.includes(e.category) : e.part === alone.key && !SUPER.includes(e.category);
      return show.superstructure || !SUPER.includes(e.category);
    };
    const frames = model.elements.map((e) => elementFrame(e));
    const box = new THREE.Box3();
    const all = new THREE.Box3();
    // Concrete (and steel) elements.
    model.elements.forEach((e, i) => {
      const geo = elementGeometry(e, frames[i]);
      if (!geo) return;
      geo.computeBoundingBox();
      all.union(geo.boundingBox!);
      if (!visible(i)) {
        geo.dispose();
        return;
      }
      box.union(geo.boundingBox!);
      const color = e.color ? new THREE.Color(...e.color) : new THREE.Color(e.concrete ? CONCRETE : STEEL);
      const ghost = show.concrete === "ghost";
      const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshLambertMaterial({ color, transparent: ghost || show.concrete === "hidden", opacity: show.concrete === "hidden" ? 0 : ghost ? (e.concrete ? 0.13 : 0.35) : 1, depthWrite: !ghost && show.concrete !== "hidden", side: THREE.DoubleSide }),
      );
      mesh.userData.index = i;
      mesh.userData.designed = e.bars === "design";
      mesh.renderOrder = 2;
      s.group.add(mesh);
      s.pickable.push(mesh);
      if (show.concrete !== "hidden") {
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), new THREE.LineBasicMaterial({ color: i === picked ? 0x2563eb : dark ? 0x94a3b8 : 0x64748b, transparent: true, opacity: i === picked ? 0.9 : 0.35 }));
        s.group.add(edges);
      }
    });
    // Bars: an instanced tube per segment, a mesh per role and look.
    const sets = model.bars.filter((b) => show.roles[b.role] && (show.schematic || b.placed === "design") && visible(b.host));
    const groups = new Map<string, BarSet3D[]>();
    for (const b of sets) {
      const key = `${b.role}:${b.placed}`;
      groups.set(key, [...(groups.get(key) ?? []), b]);
    }
    const unit = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const Y = new THREE.Vector3(0, 1, 0);
    const a = new THREE.Vector3();
    const b2 = new THREE.Vector3();
    const d = new THREE.Vector3();
    const toWorld = (set: BarSet3D, p: [number, number, number], off: [number, number, number], out: THREE.Vector3) => {
      const [x, y, z] = [p[0] + off[0], p[1] + off[1], p[2] + off[2]];
      if (set.frame === "world") return out.set(x, y, z);
      const f = frames[set.host];
      return out.set(f.o[0] + f.x[0] * x + f.y[0] * y + f.z[0] * z, f.o[1] + f.x[1] * x + f.y[1] * y + f.z[1] * z, f.o[2] + f.x[2] * x + f.y[2] * y + f.z[2] * z);
    };
    for (const [key, list] of groups) {
      const [role, placed] = key.split(":") as [BarRole, string];
      let n = 0;
      for (const set of list) n += set.at.length * Math.max(0, set.path.length - 1);
      if (!n) continue;
      const mesh = new THREE.InstancedMesh(unit.clone(), new THREE.MeshLambertMaterial({ color: ROLE_COLOR[role], transparent: placed === "schematic", opacity: placed === "schematic" ? 0.45 : 1 }), n);
      let k = 0;
      for (const set of list) {
        const r = Math.max(set.dia / 24, 0.012);
        for (const off of set.at)
          for (let j = 0; j < set.path.length - 1; j++) {
            toWorld(set, set.path[j], off, a);
            toWorld(set, set.path[j + 1], off, b2);
            d.subVectors(b2, a);
            const len = d.length();
            q.setFromUnitVectors(Y, len > 0 ? d.normalize() : Y);
            m4.compose(a.clone().add(b2).multiplyScalar(0.5), q, new THREE.Vector3(r, len, r));
            mesh.setMatrixAt(k++, m4);
          }
      }
      mesh.count = k;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.renderOrder = 1;
      s.group.add(mesh);
    }
    unit.dispose();
    s.box = box.isEmpty() ? all : box;
    const key = `${alone?.kind ?? ""}:${alone && "index" in alone ? alone.index : (alone?.key ?? "")}:${show.superstructure}`;
    if (framed.current !== key) {
      const first = framed.current === "";
      framed.current = key;
      lookFrom(iso, first);
    }
    s.render();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, show, alone, picked, dark]);

  const role = (r: BarRole) => (
    <label key={r} className="flex items-center gap-1.5">
      <input type="checkbox" checked={show.roles[r]} onChange={(e) => setShow((s) => ({ ...s, roles: { ...s.roles, [r]: e.target.checked } }))} />
      <span className="inline-block size-2.5 rounded-sm" style={{ background: `#${ROLE_COLOR[r].toString(16).padStart(6, "0")}` }} />
      {ROLE_NAME[r]}
      {r !== "sheathed" && <span className="text-muted-foreground tabular-nums">{counts[r].toLocaleString("en-US")}</span>}
    </label>
  );
  const pickedEl = picked !== null ? model.elements[picked] : null;
  const designed = model.elements.filter((e) => e.bars === "design").length;
  return (
    <div className="absolute inset-0">
      <div ref={host} className="absolute inset-0" />
      <div className="absolute top-2 left-3 w-60 space-y-2 rounded-md border bg-background/95 p-2 text-[11px] shadow-sm">
        <p className="font-semibold">Reinforcement</p>
        <div className="space-y-1">{(["main", "stirrup", "spiral", "strand", "sheathed"] as BarRole[]).map(role)}</div>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={show.schematic} onChange={(e) => setShow((s) => ({ ...s, schematic: e.target.checked }))} />
          Bars not yet placed (schematic, faded)
        </label>
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground">Concrete</span>
          {(["ghost", "solid", "hidden"] as Concrete[]).map((c) => (
            <button key={c} type="button" onClick={() => setShow((s) => ({ ...s, concrete: c }))} className={cn("rounded border px-1.5 py-0.5", show.concrete === c ? "bg-accent font-medium" : "hover:bg-accent")}>
              {c === "ghost" ? "Ghosted" : c === "solid" ? "Solid" : "Hidden"}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={show.superstructure} onChange={(e) => setShow((s) => ({ ...s, superstructure: e.target.checked }))} />
          Superstructure
        </label>
        <select
          value={alone?.kind === "part" ? alone.key : ""}
          onChange={(e) => {
            const p = model.parts.find((x) => x.key === e.target.value);
            setAlone(p ? { kind: "part", key: p.key, label: p.name } : null);
          }}
          className="h-6 w-full rounded border bg-background px-1"
          aria-label="Show a part alone"
        >
          <option value="">The whole bridge</option>
          {model.parts.map((p) => (
            <option key={p.key} value={p.key}>
              {p.name} alone
            </option>
          ))}
        </select>
        <p className="leading-snug text-muted-foreground">
          Each bar placed from its element&apos;s linked design ({designed} elements). Click an element to name it, double-click to see it alone.
        </p>
        {model.notes.map((t) => (
          <p key={t} className="leading-snug text-amber-700 dark:text-amber-400">
            {t}
          </p>
        ))}
        <button type="button" onClick={onReload} className="rounded border px-2 py-0.5 hover:bg-accent" title="Read the linked designs again">
          Refresh
        </button>
      </div>
      {(alone || pickedEl) && (
        <div className="absolute top-2 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full border bg-background/95 px-3 py-1 text-[11px] shadow-sm">
          {alone ? (
            <>
              <span>
                <span className="font-medium">{alone.label}</span> alone
              </span>
              <button type="button" onClick={() => setAlone(null)} className="rounded-full border px-2 py-0.5 font-medium hover:bg-accent">
                Show all
              </button>
            </>
          ) : (
            pickedEl && (
              <>
                <span className="font-medium">{pickedEl.name}</span>
                <span className="text-muted-foreground">{pickedEl.bars === "design" ? "bars from its design" : pickedEl.bars === "schematic" ? "bars schematic" : "no bars linked"}</span>
                <button type="button" onClick={() => setAlone({ kind: "element", index: picked!, label: pickedEl.name })} className="rounded-full border px-2 py-0.5 font-medium hover:bg-accent">
                  Show alone
                </button>
              </>
            )
          )}
        </div>
      )}
      <div className="absolute right-3 bottom-3">
        <OrientationCube ref={cube} onOrient={([x, y, z]) => lookFrom([x, -z, y])} onHome={() => lookFrom(iso)} />
      </div>
    </div>
  );
}

/** An element's solid in world coordinates: its profile (with a box girder's void) swept its depth, or its mesh. */
function elementGeometry(e: RebarElement, f: { o: [number, number, number]; x: [number, number, number]; y: [number, number, number]; z: [number, number, number] }): THREE.BufferGeometry | null {
  const p = e.profile;
  let geo: THREE.BufferGeometry;
  if (p.kind === "mesh") {
    geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(p.pts.flat(), 3));
    geo.setIndex(p.tris.flat());
  } else {
    const shape = new THREE.Shape();
    const poly = (pts: [number, number][], into: THREE.Shape | THREE.Path) => pts.forEach(([x, y], k) => (k ? into.lineTo(x, y) : into.moveTo(x, y)));
    if (p.kind === "rect") poly([[-p.x / 2, -p.y / 2], [p.x / 2, -p.y / 2], [p.x / 2, p.y / 2], [-p.x / 2, p.y / 2]], shape);
    else if (p.kind === "circle") shape.absarc(0, 0, p.r, 0, Math.PI * 2, false);
    else if (p.kind === "ishape") {
      const [w, h, tw, tf] = [p.width / 2, p.depth / 2, p.web / 2, p.flange];
      poly([[-w, -h], [w, -h], [w, -h + tf], [tw, -h + tf], [tw, h - tf], [w, h - tf], [w, h], [-w, h], [-w, h - tf], [-tw, h - tf], [-tw, -h + tf], [-w, -h + tf]], shape);
    } else poly(p.pts, shape);
    if (e.hole) {
      const hole = new THREE.Path();
      poly(e.hole, hole);
      shape.holes.push(hole);
    }
    geo = new THREE.ExtrudeGeometry(shape, { depth: e.depth, bevelEnabled: false, curveSegments: 24 });
  }
  const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(...f.x), new THREE.Vector3(...f.y), new THREE.Vector3(...f.z)).setPosition(...f.o);
  geo.applyMatrix4(m);
  geo.computeVertexNormals();
  return geo;
}
