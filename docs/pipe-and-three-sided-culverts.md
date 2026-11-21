# Pipe and three-sided culverts (plan and status)

**Status (2026-11-20): built.** Kinds `pipe-culvert` and `three-sided-culvert` under Culverts; engines in
`src/lib/design/culverts/pipe.ts` and `three-sided.ts`, drawings, take-offs and calc packages in `culverts/detail.ts`,
tests in `culverts/pipe-three-sided.test.ts`. Pay items by diameter from CDOT's item book (`PIPE_ITEMS` in rebar/cdot-items.ts):
RCP 603-01xxx, CSP 603-10xxx, concrete end sections 603-050DD, steel end sections 603-300DD; the three-sided footings in 601-03000, 602-00000, 206-00000 and 206-00100. The
precast units are noted, not given a pay item: CDOT pays them under a project special item.

The next tool on the schedule (Fri 2026-12-11 slot): **pipe culverts** (reinforced concrete and corrugated steel) and
**precast three-sided culverts**, by AASHTO LRFD Section 12. Two tools under Culverts; the box culvert tool (M-601-1)
already exists.

## Pipe Culvert (AASHTO 12.6, 12.7, 12.10)

**Reinforced concrete pipe (RCP), the indirect design method (12.10.4.3):**
- Earth load WE = Fe·w·Bc·H, with Fe = VAF for the standard installation (Table 12.10.2.1-3: 1.35, 1.40, 1.40, 1.45),
  w ≥ 110 pcf (Eq. 12.10.2.1-1).
- Fluid load WF, a full pipe (12.10.2.2).
- Live load WL: HL-93 truck and tandem wheels through the fill (3.6.1.2.6), with IM (3.6.2.2) and m = 1.2 (12.10.2.3).
- Bedding factors BFE (Table 12.10.4.3.2a-1) and BFLL (Table 12.10.4.3.2c-1).
- D0.01 = (12/Si)·((WE + WF)/BFE + WL/BFLL), × 1.10 for Type 1 (Eq. 12.10.4.3.1-1), checked at the least and the most
  fill against the class's D-load (ASTM C76: II 1000, III 1350, IV 2000, V 3000 lb/ft/ft).
- Minimum cover (Table 12.6.6.3-1): Bc/8 ≥ 12 in., or 9 in. under rigid pavement.

**Corrugated steel pipe (CSP), helical lock seam (12.7):**
- Thrust TL = PFD·S/2 + PFL·CL·F1/2 (Eqs. 12.7.2.2-1 to -4), EV γ 1.95 (Table 3.4.1-2), LL γ 1.75.
- Wall area φ·Fy·A (12.7.2.3); buckling fcr (Eqs. 12.7.2.4-1, -2, k = 0.22).
- Flexibility factor FF = S²/(E·I) against Table 12.5.6.1-1.
- Minimum cover S/8 ≥ 12 in.
- Sections from Table A12-1 (2⅔ × ½, 3 × 1, 5 × 1 in.).

**Outputs:**
- the installation drawn (bedding, haunch, lower side, overfill and cover zones of Table 12.10.2.1-1) and the pipe's wall;
- the calc package;
- quantities: pipe LF by size (CDOT 603-01xx0 RCP, 603-10xx0 CSP) and end sections (603-05xx).

**Also checked (added 2026-11-20):**
- every fill from the least to the most by 0.5 ft, the worst reported;
- riveted CSP seams (12.7.2.5, Table A12-7, φ 0.67);
- multiple lines' spacing (Table C12.6.7-1);
- the soil envelope or trench width (C12.6.6.1, Table C12.6.6.2-1);
- uplift under groundwater (12.6.2.3);
- cover measured below a flexible pavement (Table 12.6.6.3-1);
- corrosion and abrasion (12.6.9) and construction cover (Construction Specifications 30.5.5) noted in the calc.

## Three-Sided Culvert (AASHTO 12.14)

A precast flat-topped three-sided frame on cast-in-place footings.

**Loads and analysis:**
- Loads: DC, EV (rigid frame γ 1.35), at-rest EH on the legs (max 1.35, and 50% for the least, 3.11.7), LS, and LL
  through the fill or on the top slab (3.6.1.2.6, 4.6.2.10) with IM.
- Analysis: the frame by the stiffness method, legs pinned or fixed at the footings.

**Checks:**
- **Top slab and legs:**
  - flexure at midspan, the corners and the legs (φ 0.95, Table 12.5.5-1);
  - shear (5.12.8.6 with 2 ft or more of fill, else 5.7.3; φ 0.90);
  - crack control (5.6.7);
  - minimum reinforcement (5.6.3.3);
  - live load deflection L/800 (12.14.5.9).
- **Footings (12.14.5.10):** bearing (φ 0.45), sliding, footing flexure and shear.

**Outputs:**
- the section with fill, frame, footings and bars;
- the calc package;
- quantities: precast units (LF), footing concrete and bars.

## Validation

- Hand checks of each formula: D-load (1113 lb/ft/ft for the defaults at 15 ft), VAF and bedding factors, thrust
  (9.36 kip/ft for 48 in. under 20 ft), buckling (39.5 ksi), FF (33.2 in/kip).
- The frame solver against the closed form for a pinned portal (exact), and statics at the legs.
- Not yet compared with a published worked example of a three-sided unit (none at hand).

## Not included

- **Headwalls and wingwalls:** CDOT's standard end sections are paid items (603-05xx), and the CIP Cantilever Wall and
  Cantilever Wingwall tools design cast-in-place ones.
- **The direct design of RCP** (12.10.4.2): CDOT specifies pipe classes.
- **Long-span and deep-corrugation structures** (12.8).
- **Thermoplastic pipe** (12.12).
