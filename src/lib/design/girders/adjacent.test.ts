import { describe, expect, it } from "vitest";
import { designGirder, GIRDER_DEFAULTS, type GirderInputs } from "./prestressed";
import { cdotBox, cdotSlab, profileProps, shapeById } from "./sections";

// CDOT's side-by-side boxes (sheet B-618-BX) and slab beams (B-618-SL) under a cast-in-place deck (AASHTO type (f)).

const close = (a: number, b: number, tol = 1e-6) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol * Math.max(1, Math.abs(b)));

describe("CDOT box and slab sections", () => {
  it("the box: 6 in walls, 4 in top and 6 in bottom slabs, its properties from the outline", () => {
    const b = cdotBox(33, 48);
    const A = 48 * 33 - (48 - 12) * (33 - 10);
    close(b.published!.A, A);
    close(profileProps(b.profile).A, A);
    expect(b.web).toBe(12);
  });

  it("the slab beam: solid W x D", () => {
    const s = cdotSlab(18, 48);
    close(s.published!.A, 864);
    close(s.published!.I, (48 * 18 ** 3) / 12);
    expect(s.family).toBe("Prestressed slab");
  });

  it("any size by id; the listed ones too; out of range none", () => {
    expect(shapeById("cdotbox-36-60")?.depth).toBe(36);
    expect(shapeById("slab-15-36")?.topWidth).toBe(36);
    expect(shapeById("slab-18-48")).toBeDefined();
    expect(shapeById("cdotbox-12-36")).toBeUndefined();
  });
});

describe("the girder check with side-by-side boxes and slab beams", () => {
  const slab: GirderInputs = { ...GIRDER_DEFAULTS, shape: "slab-18-48", L: 40, nGirders: 10, S: 4, overhang: 2, harped: { ...GIRDER_DEFAULTS.harped, count: 0 }, criteria: "cdot" };

  it("type (f) factors with a solid section's J = A⁴ / (40 Ip) (Eq. C4.6.2.2.1-3)", () => {
    const r = designGirder(slab);
    const df = r.spans[0].interior.df;
    expect(df.governs.moment).toContain("type (f)");
    const A = 864;
    const Ip = (48 * 18 ** 3) / 12 + (18 * 48 ** 3) / 12;
    const J = A ** 4 / (40 * Ip);
    const IJ = ((48 * 18 ** 3) / 12) / J;
    const k = Math.max(1.5, 2.5 * 10 ** -0.2);
    close(df.momentOne, k * (48 / (33.3 * 40)) ** 0.5 * IJ ** 0.25, 1e-9);
  });

  it("CDOT: a slab beam's camber at 90 days; boxes and slab beams have no harped strands", () => {
    const r = designGirder(slab);
    expect(r.spans[0].interior.camber.age).toBe(90);
    const h = designGirder({ ...slab, harped: { ...GIRDER_DEFAULTS.harped, count: 2, yEnd: 14, yHarp: 4 } });
    expect(h.spans[0].interior.checks.find((c) => c.id === "cdot-no-harp")?.ok).toBe(false);
  });
});
