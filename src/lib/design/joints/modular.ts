import { DesignError, type Check } from "../walls/cip";

// A modular bridge joint system (MBJS) sized for the plans, AASHTO LRFD 10th Edition and CDOT BDM 14.4.5: the movement
// normal to the skewed joint from temperature (3.12.2, with γTU) and creep and shrinkage, with the additional range
// Table 14.5.6.9.2-1 asks of an MBJS; the seals at 3.0 in each at most (14.5.3.2-2); the joint's size in CDOT's 3 in
// steps, 6 in the least; the opening to set at each installation temperature (14.5.5.1); the blockout; CDOT's rules
// on where a modular joint may go. The centerbeams, support bars, boxes and anchorage are the manufacturer's design to
// 14.5.6.9 (strength, fatigue and fracture), checked from the sealed calcs on the shop drawings (BDM 14.4.5, 14.6).
// Inches, feet and °F.

export type ModularJointInputs = {
  L: number; // ft, the length to the joint from the neutral point
  skew: number; // deg
  alpha: number; // per °F
  creepShrink: number; // creep and shrinkage strain still to come
  Tmax: number; // °F (3.12.2)
  Tmin: number; // °F
  gammaTU: number; // Table 3.4.1-1
  gap: number; // in, each seal's largest opening (3.0 in, 14.5.3.2-2)
  extra: number; // in, the added longitudinal range (Table 14.5.6.9.2-1: 1.0 in at least, 2.0 in at most)
  centerbeam: number; // in, each centerbeam's top width (the manufacturer's; for the blockout)
  edgebeam: number; // in, each edgebeam's top width
  edgeT: number; // in, the edgebeam's thickness (≥ 0.375 in, 14.5.6.9.7a)
  blockoutDepth: number; // in, the manufacturer's for this size (the support boxes under the edgebeams)
  blockoutClear: number; // in, beyond the edgebeams each side
  width: number; // ft, the deck's width square to the bridge (the joint runs across it, skewed)
  atApproachSlab: boolean; // at an end of an approach slab (CDOT: never)
  newBridge: boolean; // a new bridge (CDOT: the Unit Leader's approval)
  snow: boolean; // a snow region (14.5.1.2: the snowplow load where the skew passes 20°)
  Ti: number; // °F, planned installation temperature
  tableFrom: number;
  tableTo: number;
  tableStep: number;
};

/** The defaults: 400 ft of steel girders to the joint, skewed 15°. */
export const MODULAR_DEFAULTS: ModularJointInputs = {
  L: 400,
  skew: 15,
  alpha: 6.5e-6,
  creepShrink: 0,
  Tmax: 120,
  Tmin: -20,
  gammaTU: 1.2,
  gap: 3,
  extra: 1,
  centerbeam: 2.5,
  edgebeam: 3,
  edgeT: 0.5,
  blockoutDepth: 16,
  blockoutClear: 6,
  width: 44,
  atApproachSlab: false,
  newBridge: true,
  snow: true,
  Ti: 60,
  tableFrom: -20,
  tableTo: 120,
  tableStep: 10,
};

/** CDOT's sizes: 3 in steps, 6 in the least (BDM 14.4.5). */
export const modularSize = (range: number) => Math.max(6, Math.ceil(range / 3 - 1e-9) * 3);

export function designModular(i: ModularJointInputs) {
  if (i.L <= 0) throw new DesignError("The joint needs a length to it from the bridge's neutral point.");
  if (!(i.gap > 0)) throw new DesignError("Give each seal's largest opening.");
  const checks: Check[] = [];
  const add = (c: Omit<Check, "ok"> & { ok?: boolean }) => checks.push({ ...c, ok: c.ok ?? c.demand <= c.capacity + 1e-9 });
  const cos = Math.cos((i.skew * Math.PI) / 180);
  const move = (dT: number, strain: number) => i.L * 12 * (i.gammaTU * dT * i.alpha + strain) * cos; // in, normal to the joint
  const total = move(i.Tmax - i.Tmin, i.creepShrink);
  const extra = Math.min(2, Math.max(1, i.extra));
  const range = total + extra;
  const size = modularSize(range);
  const seals = Math.max(2, Math.round(size / i.gap));
  const centerbeams = seals - 1;
  add({ id: "range", name: `Movement with the added range within the joint (0–${size} in, ${seals} seals)`, demand: range, capacity: seals * i.gap, unit: "in", ref: "AASHTO 14.5.6.9.2, CDOT BDM 14.4.5" });

  /** The opening at an installation temperature: midway, with half the added range kept each way (14.5.6.9.2). */
  const at = (Ti: number) => {
    const cold = move(Ti - i.Tmin, i.creepShrink);
    const hot = move(i.Tmax - Ti, -i.creepShrink);
    const Amax = seals * i.gap - cold - extra / 2;
    const Amin = hot + extra / 2;
    const A = (Amax + Amin) / 2;
    const status = Amin > Amax ? "too small" : Ti < i.Tmin || Ti > i.Tmax ? "outside" : "ok";
    return { Ti, cold, hot, Amax, Amin, A, perGap: A / seals, status };
  };
  const design = at(i.Ti);
  add({ id: "fits", name: `At ${i.Ti}°F: the openings fit (Amin ≤ Amax)`, demand: design.Amin, capacity: design.Amax, unit: "in", ref: "AASHTO 14.5.5.1" });
  const coldGap = (design.A + design.cold) / seals;
  add({ id: "gap", name: "Each seal's surface gap at the coldest (strength movement)", demand: coldGap, capacity: 3, unit: "in", ref: "AASHTO 14.5.3.2-2" });
  add({ id: "edge-t", name: "Edgebeam thickness", demand: 0.375, capacity: i.edgeT, unit: "in", ref: "AASHTO 14.5.6.9.7a" });
  add({ id: "approach", name: "Not at an end of an approach slab", demand: i.atApproachSlab ? 1 : 0, capacity: 0, unit: "", ref: "CDOT BDM 14.4.5" });
  // Advisories: the strip seal where it fits; approval on new bridges; the plow's skew; the snowplow load; one unit.
  if (total <= 4 && i.skew <= 25) add({ id: "strip-seal", name: "A strip seal takes this movement (4 in or less, skew 25° or less): use it instead", demand: total, capacity: 4, unit: "in", ref: "CDOT BDM 14.4.4", ok: false, advisory: true });
  if (i.newBridge) add({ id: "approval", name: "A modular joint on a new bridge needs the Unit Leader's approval (avoid it with several strip seals where possible)", demand: 0, capacity: 0, unit: "", ref: "CDOT BDM 14.4.5", ok: false, advisory: true });
  if (i.snow && Math.abs(i.skew) > 20) add({ id: "snowplow", name: "Edgebeams and anchors for the snowplow load, 0.12 kip/in over 10 ft (skew over 20°): on the plans", demand: Math.abs(i.skew), capacity: 20, unit: "deg", ref: "AASHTO 14.5.1.2, 14.5.3.6", ok: false, advisory: true });
  if (i.snow && Math.abs(i.skew) >= 27 && Math.abs(i.skew) <= 38) add({ id: "plow-skew", name: "Skew within 3° of the plow's angle (30–35°): plows may drop between centerbeams", demand: Math.abs(i.skew), capacity: 27, unit: "deg", ref: "AASHTO C14.5.1.2", ok: false, advisory: true });
  const length = i.width / Math.max(0.05, cos); // ft, along the joint
  if (length > 60) add({ id: "splice", name: `Over 60 ft long (${length.toFixed(1)} ft): one continuous unit, a field splice only with approval, welded or hybrid`, demand: length, capacity: 60, unit: "ft", ref: "AASHTO 14.5.5.3, CDOT BDM 14.4.5", ok: false, advisory: true });

  // The blockout: the joint at its widest, the edgebeams and centerbeams, and the clearance each side.
  const widest = seals * i.gap + 2 * i.edgebeam + centerbeams * i.centerbeam;
  const blockout = { width: widest + 2 * i.blockoutClear, depth: i.blockoutDepth, perSide: (widest + 2 * i.blockoutClear) / 2 };
  /** What the plans give the manufacturer (Table 14.5.6.9.2-1 and 14.5.6.9.4). */
  const plans = {
    longitudinal: range,
    transverse: 1,
    vertical: 1,
    rotLongitudinal: 1,
    rotTransverse: 1,
    rotVertical: 0.5,
  };
  const table = [];
  for (let T = i.tableFrom; T <= i.tableTo + 1e-9 && table.length < 60; T += Math.max(i.tableStep, 1)) table.push(at(T));
  return { ok: checks.every((c) => c.ok || c.advisory), checks, cos, total, extra, range, size, seals, centerbeams, design, coldGap, blockout, length, plans, table };
}

export type ModularResult = ReturnType<typeof designModular>;
