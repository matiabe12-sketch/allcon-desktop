import { payItem, TOOL_PAY_ITEMS, type QuantityRole } from "../rebar/cdot-items";
import { unitWeight } from "../rebar/bars";
import { roundFor, type PayLine } from "../rebar/pay-lines";
import type { PaidWith } from "../rebar/schedule";
import type { CbcInputs } from "../culverts/cbc";
import type { DeckInputs } from "../decks/deck";
import { railDef } from "../decks/rails";
import type { GirderInputs } from "../girders/prestressed";
import type { ColumnInputs } from "../piers/column";
import { columnTakeoff as pierColumnTakeoff } from "../piers/column-detail";
import type { SignInputs } from "../signs/cantilever";
import type { SignBridgeInputs } from "../signs/bridge";
import { signBridgeTakeoff } from "../signs/bridge-detail";
import type { ApproachSlabInputs } from "../approach/approach-slab";
import { approachSlabTakeoff } from "../approach/approach-slab-detail";
import type { SlabBridgeInputs } from "../slabs/slab-bridge";
import { slabBridgeTakeoff } from "../slabs/slab-bridge-detail";
import type { HlmrInputs } from "../bearings/pot-disc";
import { hlmrTakeoff } from "../bearings/pot-disc-detail";
import type { AbutmentInputs } from "../foundations/abutment";
import { abutmentTakeoff, footingTakeoff, micropileTakeoff, pileTakeoff, shaftTakeoff as drilledShaftTakeoff } from "../foundations/detail";
import type { FootingInputs } from "../foundations/footing";
import { HP_PAY_ITEM } from "../foundations/hpile";
import type { MicropileInputs } from "../foundations/micropile";
import type { PileInputs } from "../foundations/piles";
import type { ShaftInputs } from "../foundations/shaft";
import type { SteelGirderInputs } from "../girders/steel";
import { steelTakeoff } from "../girders/steel-takeoff";
import type { StripSealInputs } from "../joints/strip-seal";
import type { ModularJointInputs } from "../joints/modular";
import type { FingerJointInputs } from "../joints/finger";
import { designModular } from "../joints/modular";
import { fingerTakeoff, modularTakeoff } from "../joints/detail";
import type { CipInputs } from "../walls/cip";
import type { MseInputs } from "../walls/mse";
import type { WingwallInputs } from "../walls/wingwall";
import { bearingTakeoff, cipWallTakeoff, culvertTakeoff, deckTakeoff, girderTakeoff, jointTakeoff, mseTakeoff, shaftTakeoff, wingwallTakeoff } from "./tools";
import type { Takeoff, TakeoffSettings } from "./types";

export * from "./types";

/** A design's take-off, from its inputs and its take-off settings; null for a kind without one. */
export function takeoffFor(kind: string, inputs: unknown, s?: TakeoffSettings): Takeoff | null {
  const L = s?.length;
  switch (kind) {
    case "box-culvert":
      return culvertTakeoff(inputs as CbcInputs, L ?? 40, { ground: s?.ground, angle: s?.angle });
    case "cip-cantilever-wall":
      return cipWallTakeoff(inputs as CipInputs, L ?? 50, { ground: s?.ground });
    case "cantilever-wingwall":
      return wingwallTakeoff(inputs as WingwallInputs);
    case "deck-slab":
      return deckTakeoff(inputs as DeckInputs, L ?? 100);
    case "mse-wall":
      return mseTakeoff(inputs as MseInputs, L ?? 100);
    case "pier-column":
      return pierColumnTakeoff(inputs as ColumnInputs, L);
    case "sign-bridge":
      return signBridgeTakeoff(inputs as SignBridgeInputs);
    case "sign-cantilever":
      return shaftTakeoff(inputs as SignInputs);
    case "lrfd-girder-check":
      return girderTakeoff(inputs as GirderInputs, L);
    case "elastomeric-bearing":
    case "ptfe-bearing":
      return bearingTakeoff(Math.max(1, Math.round(L ?? 1)), !!(inputs as { levelingPad?: boolean } | null)?.levelingPad);
    case "pot-disc-bearing":
      return hlmrTakeoff(inputs as HlmrInputs, L ?? 1);
    case "slab-bridge":
      return slabBridgeTakeoff(inputs as SlabBridgeInputs);
    case "approach-slab":
      return approachSlabTakeoff(inputs as ApproachSlabInputs, L ?? 2);
    case "spread-footing":
      return footingTakeoff(inputs as FootingInputs);
    case "pile-foundation":
      return pileTakeoff(inputs as PileInputs);
    case "drilled-shaft":
      return drilledShaftTakeoff(inputs as ShaftInputs);
    case "micropile":
      return micropileTakeoff(inputs as MicropileInputs, L ?? 1);
    case "abutment":
      return abutmentTakeoff(inputs as AbutmentInputs);
    case "steel-girder-check":
      return steelTakeoff(inputs as SteelGirderInputs, L);
    case "modular-joint":
      return modularTakeoff(inputs as ModularJointInputs, L ?? (inputs as ModularJointInputs).width);
    case "finger-joint":
      return fingerTakeoff(inputs as FingerJointInputs, L ?? (inputs as FingerJointInputs).width);
    case "strip-seal-joint":
      return jointTakeoff(inputs as StripSealInputs, L ?? 40);
    default:
      return null;
  }
}

/** The pay item a shaft or girder quantity defaults to, from its size or shape (the code book's item, where there is one). */
function defaultFor(kind: string, role: QuantityRole, inputs: unknown): string | undefined {
  if (!inputs) return undefined;
  if (kind === "sign-bridge" && role === "shaft") {
    const code = `503-000${Math.round((inputs as SignBridgeInputs).shaftD)}`;
    return payItem(code) ? code : undefined;
  }
  if (kind === "sign-cantilever" && role === "shaft") {
    const d = (inputs as SignInputs).shaftD;
    const code = `503-000${Math.round(d)}`;
    return payItem(code) ? code : undefined;
  }
  if ((kind === "pile-foundation" || kind === "abutment") && role === "pile") return HP_PAY_ITEM[(inputs as PileInputs).section];
  if ((kind === "drilled-shaft" || kind === "abutment") && role === "shaft") {
    const code = `503-000${Math.round(kind === "abutment" ? (inputs as AbutmentInputs).shaftD : (inputs as ShaftInputs).D)}`;
    return payItem(code) ? code : undefined;
  }
  if ((kind === "micropile" || kind === "abutment" || kind === "pile-foundation") && role === "micropile") {
    // By the casing's nominal diameter: 6, 7, 8, 10 or 12 in.
    const od = kind === "micropile" ? (inputs as MicropileInputs).casingOD : ((inputs as { micropile?: Partial<MicropileInputs> | null }).micropile?.casingOD ?? 7);
    const d = Math.round(od);
    const code = d >= 12 ? "503-01120" : d >= 10 ? "503-01100" : `503-010${Math.min(8, Math.max(6, d))}0`;
    return payItem(code) ? code : undefined;
  }
  // A bearing with a PTFE sliding surface: Bearing Device (Type II); a pad alone, Type I.
  if (kind === "modular-joint" && role === "joint") {
    const code = `518-010${String(Math.min(12, designModular(inputs as ModularJointInputs).size)).padStart(2, "0")}`;
    return payItem(code) ? code : undefined;
  }
  if (kind === "elastomeric-bearing" && role === "bearing") return (inputs as { sliding?: boolean }).sliding ? "512-00102" : "512-00101";
  if ((kind === "deck-slab" || kind === "lrfd-girder-check") && role === "rail") {
    const r = railDef((inputs as DeckInputs | GirderInputs).rail?.type ?? "custom");
    return r?.payItem;
  }
  if (kind === "lrfd-girder-check" && role === "girder" && (inputs as GirderInputs).shape?.startsWith("box-")) {
    const depth = Number((inputs as GirderInputs).shape.slice(4).split("x")[0]);
    return depth < 32 ? "618-01992" : depth <= 48 ? "618-01994" : "618-01995";
  }
  if (kind === "lrfd-girder-check" && role === "girder") {
    const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9.]/g, "");
    const shape = norm((inputs as GirderInputs).shape);
    return (TOOL_PAY_ITEMS[kind].girder ?? []).find((c) => norm(payItem(c)!.description.match(/\(([^)]+)\)/)?.[1] ?? "") === shape);
  }
  return undefined;
}

/** A take-off's quantities as pay lines: each role with a quantity, under the chosen (or default) pay item. */
/**
 * `split`: concrete and bars another part of the bridge pays for (`paidWith`) as lines of their own, for a bridge's
 * summary of quantities; without it they stay in the design's own lines.
 */
export function takeoffPayLines(kind: string, t: Takeoff, chosen: Partial<Record<QuantityRole, string>> = {}, inputs?: unknown, opts: { split?: boolean } = {}): PayLine[] {
  const allowed = TOOL_PAY_ITEMS[kind] ?? {};
  const itemFor = (role: QuantityRole) => {
    const list = allowed[role];
    if (!list?.length) return undefined;
    return chosen[role] && list.includes(chosen[role]!) ? chosen[role] : (defaultFor(kind, role, inputs) ?? list[0]);
  };
  // Paid with another part of the bridge: kept apart, under the item it would have had here.
  const elsewhere = new Map<string, { role: QuantityRole; value: number; paidWith: PaidWith }>();
  const addElsewhere = (code: string | undefined, role: QuantityRole, v: number, paidWith: PaidWith) => {
    if (!code) return;
    const key = `${code}|${paidWith}`;
    elsewhere.set(key, { role, paidWith, value: (elsewhere.get(key)?.value ?? 0) + v });
  };
  const values: Partial<Record<QuantityRole, number>> = {};
  // Concrete and bars that name their own pay item go to it; the rest to the role's item.
  const own = new Map<string, { role: QuantityRole; value: number }>();
  const addOwn = (code: string, role: QuantityRole, v: number) => own.set(code, { role, value: (own.get(code)?.value ?? 0) + v });
  let concrete = 0;
  for (const c of t.schedule.concrete) if (opts.split && c.paidWith) addElsewhere(c.item && payItem(c.item) ? c.item : itemFor("concrete"), "concrete", c.cy, c.paidWith);
  else if (c.item && payItem(c.item)) addOwn(c.item, "concrete", c.cy);
  else concrete += c.cy;
  let rebar = t.schedule.total;
  for (const g of t.schedule.groups) {
    if (g.paid) continue;
    const w = ((g.count * g.length) / 12) * unitWeight(g.size);
    if (opts.split && g.paidWith) {
      addElsewhere(g.payAs && payItem(g.payAs) ? g.payAs : itemFor("rebar"), "rebar", w, g.paidWith);
      rebar -= w;
    } else if (g.payAs && payItem(g.payAs)) {
      addOwn(g.payAs, "rebar", w);
      rebar -= w;
    }
  }
  if (concrete > 0) values.concrete = concrete;
  if (rebar > 0.5) values.rebar = rebar;
  for (const [role, q] of Object.entries(t.quantities)) if (q && q.value > 0) values[role as QuantityRole] = q.value;
  const lines: PayLine[] = [];
  for (const [role, value] of Object.entries(values) as [QuantityRole, number][]) {
    const list = allowed[role];
    if (!list?.length) continue;
    const p = payItem(itemFor(role)!);
    if (p) lines.push({ ...p, quantity: roundFor(p.unit, value), role });
  }
  for (const [code, o] of own) {
    const p = payItem(code);
    const same = lines.find((l) => l.code === code);
    if (same) same.quantity = roundFor(same.unit, same.quantity + o.value);
    else if (p && o.value > 0) lines.push({ ...p, quantity: roundFor(p.unit, o.value), role: o.role });
  }
  for (const [key, o] of elsewhere) {
    const p = payItem(key.split("|")[0]);
    if (p && o.value > 0) lines.push({ ...p, quantity: roundFor(p.unit, o.value), role: o.role, paidWith: o.paidWith });
  }
  return lines;
}
