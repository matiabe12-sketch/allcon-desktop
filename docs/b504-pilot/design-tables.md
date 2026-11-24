# MSE and GRS wall design tables: pilot content (draft 2026-11-24)

Sheet-ready content replacing the eight design-chart sheets, B-504-H1–H4 (MSE) and O1–O4 (GRS). The charts compute
σH, Tmax, Le and BP for one geometry, under pre-10th-edition factors. They carry the note "Update design for current
MASH loads", and the bearing values on the section sheets come from them.

The proposal is three kinds of tables, all recomputed for the design-basis sheet (AASHTO 10th, Web Doc 326):

- **External tables (E):** factored bearing pressure BP, eccentricity and sliding by design height, for each top of
  wall and base type. BP moves here from the section sheets.
- **Internal tables (I):** the factored horizontal stress σH and the pullout resistance per foot of embedment P′,
  at depth z. The designer applies them to any spacing and product.
- **Barrier table (R):** the top layers' required strength under a barrier on a moment slab, by test level and
  spacing. This is the "reinforcement sheet" the other pilot sheets refer to.

**How they were worked:**
- With ALLCON's MSE engine (AASHTO 10th factors: geosynthetic tensile 0.80, pullout 0.70; metallic pullout 0.90),
  using CDOT's soils: γ = 125 pcf and φ = 34° for the backfill and the retained soil.
- **Checked against the current charts:**
  - core-wall BP: 4.752 TSF at DH = 40 ft with the charts' own inputs, against CDOT's 4.721–4.772;
  - σH at z = 26 ft (roadway): 1.423 ksf, against H2's 1.390;
  - truncated-base BP: 10.41 TSF (soil) and 9.59 (rock), against CDOT's 9.709 and 8.963. The difference is the
    heavier slab and pavement.
- `[Decide]` and `[Verify]` as before. Proposed sheets: B-504-H1 (tables E and R) and H2 (tables I), with the GRS
  variant on O1.

---

## 1. Notes for the sheet

1. **Design values:** design-basis sheet B-504-A C. AASHTO simplified method for extensible reinforcement; coherent
   gravity (kr/Ka from 1.7 at the top to 1.2 at 20 ft) for steel strips (AASHTO 11.10.6.2.1).
2. **Pavement and slab:**
   - Roadway: 12 in HMA (140 psf).
   - Rail anchor slab: 12 in slab and 3 in HMA (185 psf).
   - Both are taken as DW (γ = 1.50 / 0.65), spread over the reinforced zone.
3. **Live load surcharge:** 2.0 ft of soil (γLS = 1.75), except under a backslope.
4. **External stability (tables E):**
   - **Core walls:** RL per the core-wall sheet, moments about the center of the base, Meyerhof BP over L − 2e
     (AASHTO 11.6.3.2).
   - **Truncated bases** (CDOT's method, reproduced): the whole factored weight acts at the center of the bottom
     length, with the earth pressure and surcharges overturning about it; BP is over Lb − 2e.
   - e_max = L/3 (AASHTO 11.6.3.3). "e / e_max" and "sliding D/C" are demand over capacity; 1.0 or less passes.
5. **Internal stability (tables I):** at depth z below the top of the wall:
   - **Tmax(z) = σH(z) × Sv.** The tensile check is Tmax ≤ φ Tal Rc, with φ = 0.80 for geosynthetics and 0.75 for
     steel strips (AASHTO Table 11.5.7-1).
   - **Pullout:** Tmax ≤ P′(z) × Le × Rc, where Le is the length beyond the active zone:
     - active zone, extensible: (DH − z) tan(45° − φ/2);
     - active zone, inextensible: the smaller of 0.3 H1 and 0.6 (DH − z).
   - **P′** includes φ = 0.70 (geosynthetics) or 0.90 (steel strips). It is for a geogrid (α = 0.8, F* = 0.67 tan φ):
     multiply by 0.75 for geotextiles and geostrips (α = 0.6). The strips' P′ assumes Cu = 4.
6. **The barrier's load on the reinforcement** is in table R, not in σH. This differs from the current charts:
   - H1 and O1 add a triangle of 660(1 − z/15.1) lb/ft to every layer in the top 15.1 ft;
   - H2 adds 900 lb/ft to the layers in the top 2 ft;
   - here, Web Doc 326's pressures act on the top 4.75 ft (TL-3 and TL-4) or 4.1 ft (TL-5), as the crash tests
     measured.
7. **GRS walls (O sheets):** multiply σH by 1 / 0.7^(Sv / (6 dmax)) (FHWA-HRT-11-026 Eq. 31). For an 8 in spacing and
   dmax = 2 in this is 1.268. All other rules as above.
8. **Backslope over a truncated base: design per project** (table E-C has the core wall only). The current C2, C3,
   F2, F3, N2 and N3 tabulate it, but their basis for the slope's earth pressure isn't stated `[Verify]`.

## 2. Worked example (for the sheet)

A 16 ft core wall under a roadway, with geogrid at Sv = 2.0 ft. Check the layer at z = 15 ft (from table I-B,
interpolating z = 14 and 16).

- **Stresses:** σH = 0.900 ksf; P′ = 1.02 kip/ft per ft.
- **Tension:** Tmax = 0.900 × 2.0 = 1.80 kip/ft. That needs Tal ≥ 1.80 / 0.80 = 2.25 kip/ft, so
  Tult ≥ 2.25 × 1.3 × 2.55 × 1.1 = 8.2 kip/ft (HDPE). A 12,000 lb/ft geogrid works; 7,800 doesn't.
- **Pullout:**
  - Le = 11.2 − (16 − 15) tan 28° = 10.7 ft;
  - resistance P′ Le = 1.02 × 10.7 = 10.9 kip/ft ≥ 1.80. OK.
- **External** (table E-B, DH = 16): BP = 2.338 TSF, which the geotechnical report's factored resistance must meet;
  e / e_max = 0.682 and sliding D/C = 0.615, both OK.

---

## Equations (on the sheets: external on H1, internal on H2)

Per foot of wall. γ_EV, γ_EH, γ_LS, γ_DW are the load factors (Strength I: 1.35 or 1.00, 1.50, 1.75, 1.50 or 0.65).

**External stability (H1, tables E)**

| No. | Equation | Where | Reference |
|---|---|---|---|
| E1 | Ka = tan²(45° − φ/2) | level retained fill; under a backslope, Coulomb's Ka with δ = β | AASHTO 11.10.5.2 |
| E2 | P_EH = ½ γ_f Ka h² | h = DH + L tan β, the height at the back of the reinforced zone | AASHTO 11.10.5.2 |
| E3 | P_LS = γ_f h_eq Ka DH, h_eq = 2.0 ft | traffic over the wall | B-504-A C Table 1 |
| E4 | P_DW = q_DW Ka DH, V_DW = q_DW L | q_DW = 185 psf (rail anchor slab), 140 psf (roadway) | B-504-A C Note 7 |
| E5 | V = γ_EV γ_r DH L + γ_DW V_DW (+ γ_LS γ_r h_eq L for bearing) | core wall | AASHTO 11.10.5 |
| E6 | V = γ_EV γ_r (DH L_b + ½ s DH²) + … | truncated base: s = ¾ (soil) or ½ (rock), L_b = bottom length | CDOT method |
| E7 | e = [γ_EH P_EH (h/3) + γ_LS P_LS (DH/2) + γ_DW P_DW (DH/2)] / V ≤ e_max = L/3 | moments about the center of the base (truncated: of the bottom; all weight there) | AASHTO 11.6.3.3 |
| E8 | BP = V / (L − 2e) | Meyerhof; factored, in TSF on the tables | AASHTO 11.6.3.2 |
| E9 | φ_τ V tan φ_min ≥ γ_EH P_EH cos β + γ_LS P_LS + γ_DW P_DW | φ_τ = 1.0; V with γ_EV = 1.00, no live load; φ_min the weaker of the reinforced fill and the foundation | AASHTO 11.10.5.3 |

**Internal stability (H2, tables I)**

| No. | Equation | Where | Reference |
|---|---|---|---|
| I1 | σ_v = γ_r z + q_DW (+ γ_r h_eq for σ_H) | z below the top of the wall | AASHTO 11.10.6.2.1 |
| I2 | σ_H = k_r [γ_EV γ_r z + γ_DW q_DW + γ_LS γ_r h_eq] | factored | AASHTO Eq. 11.10.6.2.1-1 |
| I3 | k_r = Ka (extensible); k_r = Ka (1.7 − 0.5 z/20) for steel strips, to 1.2 Ka below 20 ft | Ka of the reinforced fill (E1, level) | AASHTO Fig. 11.10.6.2.1-3 |
| I4 | T_max = σ_H S_v | S_v the layer's tributary height | AASHTO Eq. 11.10.6.2.1-2 |
| I5 | T_al = T_ult / (RF_ID RF_CR RF_D) | RF_ID 1.3, RF_D 1.1, RF_CR 2.55 (HDPE) or 1.8 (PP, PET) | AASHTO 11.10.6.4.3b |
| I6 | φ T_al R_c ≥ T_max | φ = 0.80 geotextiles, geogrids; 0.55 geostrips; 0.75 steel strips | AASHTO 11.10.6.4.1, Table 11.5.7-1 |
| I7 | P′ = φ F* α σ_v C, with C = 2 | φ = 0.70 geosynthetics, 0.90 steel; F* = 0.67 tan φ, α = 0.8 (geogrids), 0.6 (geotextiles, geostrips); steel strips F* = 1.2 + log Cu at the top to tan φ at 20 ft, α = 1.0 | AASHTO Eq. 11.10.6.3.2-1, Fig. 11.10.6.3.2-2 |
| I8 | P′ L_e R_c ≥ T_max | | AASHTO 11.10.6.3.2 |
| I9 | L_e = RL − L_a; L_a = (DH − z) tan(45° − φ/2) (extensible); L_a = min(0.3 H1, 0.6 (DH − z)) (inextensible) | active zone | AASHTO Fig. 11.10.6.3.1-1 |
| I10 | σ_H,GRS = σ_H / 0.7^(S_v / 6 d_max) | GRS walls (O tables) | FHWA-HRT-11-026 Eq. 31 |

**Barrier on a moment slab (H1, table R)**

| No. | Equation | Where | Reference |
|---|---|---|---|
| R1 | F_y = p_dy A_t | p_dy over band h1, then p_dy2 over band h2; A_t the layer's tributary height inside each band | Web Doc 326 9.2 |
| R2 | F_s = k_r σ_v S_v | the static load on the layer | AASHTO 11.10.6.2.1 |
| R3 | T_ult ≥ (F_s RF_CR + F_y) RF_ID RF_D / φ, φ = 1.0 | geosynthetics: the dynamic part without creep | AASHTO Eq. 11.10.10.2-1 |
| R4 | φ T_al R_c ≥ F_s + F_y, φ = 1.0 (strips), 0.85 (grids) | steel | AASHTO 11.5.8 |
| R5 | φ P′ L R_c ≥ F_s + F_pd, F_pd = p_dp A_t | pullout over the full length L, φ = 1.0 (geosynthetics), 1.20 (steel) | AASHTO 11.10.10.2; Web Doc 326 Eq. 9-6 |

## 3. Tables E: external stability by design height

#### Table E-A: Rail anchor slab (12 in slab and 3 in HMA: 185 psf as DW)

| DH (ft) | Core: RL (ft) | Core: BP (TSF) | Core: e / e_max | Core: sliding D/C | ¾:1 soil: BP (TSF) | ¾:1 soil: e / e_max | ¾:1 soil: sliding D/C | ½:1 rock: BP (TSF) | ½:1 rock: e / e_max | ½:1 rock: sliding D/C |
|---|---|---|---|---|---|---|---|---|---|---|
| 4 | 6.000 | 0.761 | 0.293 | 0.491 | 1.246 | 0.456 | 0.509 | 1.117 | 0.508 | 0.567 |
| 6 | 6.000 | 1.051 | 0.531 | 0.615 | 1.997 | 0.729 | 0.563 | 1.792 | 0.838 | 0.647 |
| 8 | 8.000 | 1.239 | 0.460 | 0.548 | 3.102 | 1.005 | 0.599 | 2.868 | 1.184 | 0.706 |
| 10 | 8.000 | 1.594 | 0.648 | 0.632 | 3.995 | 1.074 | 0.589 | 3.776 | 1.277 | 0.700 |
| 12 | 8.400 | 1.981 | 0.783 | 0.680 | 4.418 | 0.999 | 0.558 | 4.153 | 1.186 | 0.662 |
| 14 | 9.800 | 2.192 | 0.736 | 0.649 | 4.842 | 0.944 | 0.535 | 4.533 | 1.119 | 0.635 |
| 16 | 11.200 | 2.404 | 0.700 | 0.626 | 5.268 | 0.901 | 0.517 | 4.917 | 1.067 | 0.613 |
| 18 | 12.600 | 2.617 | 0.672 | 0.607 | 5.695 | 0.867 | 0.503 | 5.302 | 1.027 | 0.596 |
| 20 | 14.000 | 2.829 | 0.649 | 0.592 | 6.122 | 0.839 | 0.492 | 5.689 | 0.993 | 0.582 |
| 22 | 15.400 | 3.042 | 0.630 | 0.579 | 6.550 | 0.816 | 0.482 | 6.076 | 0.966 | 0.571 |
| 24 | 16.800 | 3.256 | 0.614 | 0.569 | 6.979 | 0.797 | 0.474 | 6.465 | 0.943 | 0.561 |
| 26 | 18.200 | 3.469 | 0.601 | 0.560 | 7.407 | 0.780 | 0.468 | 6.854 | 0.923 | 0.553 |
| 28 | 19.600 | 3.683 | 0.589 | 0.552 | 7.836 | 0.766 | 0.462 | 7.244 | 0.906 | 0.546 |
| 30 | 21.000 | 3.897 | 0.579 | 0.546 | 8.265 | 0.754 | 0.457 | 7.634 | 0.891 | 0.540 |
| 32 | 22.400 | 4.111 | 0.570 | 0.540 | 8.695 | 0.743 | 0.452 | 8.024 | 0.878 | 0.534 |
| 34 | 23.800 | 4.324 | 0.562 | 0.535 | 9.124 | 0.733 | 0.448 | 8.415 | 0.866 | 0.529 |
| 36 | 25.200 | 4.538 | 0.555 | 0.530 | 9.554 | 0.724 | 0.444 | 8.806 | 0.856 | 0.525 |
| 38 | 26.600 | 4.753 | 0.549 | 0.526 | 9.984 | 0.717 | 0.441 | 9.197 | 0.847 | 0.521 |
| 40 | 28.000 | 4.967 | 0.543 | 0.522 | 10.414 | 0.710 | 0.438 | 9.589 | 0.838 | 0.518 |

#### Table E-B: Roadway (12 in HMA: 140 psf as DW)

| DH (ft) | Core: RL (ft) | Core: BP (TSF) | Core: e / e_max | Core: sliding D/C | ¾:1 soil: BP (TSF) | ¾:1 soil: e / e_max | ¾:1 soil: sliding D/C | ½:1 rock: BP (TSF) | ½:1 rock: e / e_max | ½:1 rock: sliding D/C |
|---|---|---|---|---|---|---|---|---|---|---|
| 4 | 6.000 | 0.723 | 0.286 | 0.483 | 1.175 | 0.449 | 0.506 | 1.055 | 0.500 | 0.563 |
| 6 | 6.000 | 1.005 | 0.516 | 0.603 | 1.896 | 0.715 | 0.557 | 1.701 | 0.820 | 0.639 |
| 8 | 8.000 | 1.192 | 0.446 | 0.537 | 2.953 | 0.984 | 0.592 | 2.725 | 1.157 | 0.696 |
| 10 | 8.000 | 1.538 | 0.629 | 0.619 | 3.817 | 1.051 | 0.583 | 3.597 | 1.247 | 0.691 |
| 12 | 8.400 | 1.914 | 0.760 | 0.667 | 4.241 | 0.978 | 0.552 | 3.976 | 1.159 | 0.654 |
| 14 | 9.800 | 2.125 | 0.716 | 0.637 | 4.666 | 0.924 | 0.529 | 4.358 | 1.094 | 0.626 |
| 16 | 11.200 | 2.338 | 0.682 | 0.615 | 5.093 | 0.883 | 0.512 | 4.743 | 1.044 | 0.606 |
| 18 | 12.600 | 2.550 | 0.655 | 0.597 | 5.520 | 0.850 | 0.498 | 5.130 | 1.005 | 0.589 |
| 20 | 14.000 | 2.763 | 0.634 | 0.583 | 5.948 | 0.823 | 0.487 | 5.517 | 0.974 | 0.576 |
| 22 | 15.400 | 2.977 | 0.616 | 0.571 | 6.377 | 0.802 | 0.478 | 5.906 | 0.948 | 0.565 |
| 24 | 16.800 | 3.190 | 0.601 | 0.561 | 6.805 | 0.783 | 0.470 | 6.295 | 0.926 | 0.555 |
| 26 | 18.200 | 3.404 | 0.589 | 0.553 | 7.234 | 0.767 | 0.463 | 6.685 | 0.907 | 0.548 |
| 28 | 19.600 | 3.618 | 0.578 | 0.546 | 7.664 | 0.754 | 0.458 | 7.075 | 0.891 | 0.541 |
| 30 | 21.000 | 3.832 | 0.568 | 0.539 | 8.093 | 0.742 | 0.453 | 7.466 | 0.877 | 0.535 |
| 32 | 22.400 | 4.046 | 0.560 | 0.534 | 8.523 | 0.732 | 0.448 | 7.857 | 0.864 | 0.530 |
| 34 | 23.800 | 4.260 | 0.553 | 0.529 | 8.953 | 0.723 | 0.445 | 8.248 | 0.853 | 0.525 |
| 36 | 25.200 | 4.474 | 0.546 | 0.525 | 9.383 | 0.714 | 0.441 | 8.639 | 0.844 | 0.521 |
| 38 | 26.600 | 4.688 | 0.540 | 0.521 | 9.813 | 0.707 | 0.438 | 9.031 | 0.835 | 0.517 |
| 40 | 28.000 | 4.902 | 0.535 | 0.517 | 10.243 | 0.701 | 0.435 | 9.423 | 0.827 | 0.514 |

#### Table E-C: Backslope 2H:1V, no traffic (core walls; truncated bases per project, Note 8)

| DH (ft) | Core: RL (ft) | Core: BP (TSF) | Core: e / e_max | Core: sliding D/C |
|---|---|---|---|---|
| 4 | 6.000 | 0.537 | 0.027 | 0.499 |
| 6 | 6.000 | 0.828 | 0.215 | 0.584 |
| 8 | 8.000 | 1.105 | 0.215 | 0.584 |
| 10 | 8.000 | 1.492 | 0.370 | 0.645 |
| 12 | 8.400 | 1.932 | 0.489 | 0.688 |
| 14 | 9.800 | 2.254 | 0.489 | 0.688 |
| 16 | 11.200 | 2.576 | 0.489 | 0.688 |
| 18 | 12.600 | 2.899 | 0.489 | 0.688 |
| 20 | 14.000 | 3.221 | 0.489 | 0.688 |
| 22 | 15.400 | 3.543 | 0.489 | 0.688 |
| 24 | 16.800 | 3.865 | 0.489 | 0.688 |
| 26 | 18.200 | 4.187 | 0.489 | 0.688 |
| 28 | 19.600 | 4.509 | 0.489 | 0.688 |
| 30 | 21.000 | 4.831 | 0.489 | 0.688 |
| 32 | 22.400 | 5.153 | 0.489 | 0.688 |
| 34 | 23.800 | 5.475 | 0.489 | 0.688 |
| 36 | 25.200 | 5.797 | 0.489 | 0.688 |
| 38 | 26.600 | 6.119 | 0.489 | 0.688 |
| 40 | 28.000 | 6.441 | 0.489 | 0.688 |

## 4. Tables I: internal stresses at depth z (any wall height; extensible and steel strips)

σv is unfactored (for pullout). σH is factored (Strength I). P′ is in kip/ft per ft of Le, at Rc = 1.

#### Table I-A: Rail anchor slab (12 in slab and 3 in HMA: 185 psf as DW)

| z (ft) | σv, unfactored (ksf) | Extensible: σH (ksf) | Extensible: P′ (kip/ft per ft) | Steel strips: σH (ksf) | Steel strips: P′ (kip/ft per ft) |
|---|---|---|---|---|---|
| 1 | 0.310 | 0.250 | 0.157 | 0.419 | 0.974 |
| 2 | 0.435 | 0.298 | 0.220 | 0.491 | 1.323 |
| 3 | 0.560 | 0.345 | 0.283 | 0.561 | 1.646 |
| 4 | 0.685 | 0.393 | 0.347 | 0.629 | 1.944 |
| 5 | 0.810 | 0.441 | 0.410 | 0.694 | 2.217 |
| 6 | 0.935 | 0.488 | 0.473 | 0.757 | 2.464 |
| 7 | 1.060 | 0.536 | 0.537 | 0.818 | 2.685 |
| 8 | 1.185 | 0.584 | 0.600 | 0.876 | 2.882 |
| 9 | 1.310 | 0.632 | 0.663 | 0.932 | 3.053 |
| 10 | 1.435 | 0.679 | 0.726 | 0.985 | 3.199 |
| 12 | 1.685 | 0.775 | 0.853 | 1.085 | 3.414 |
| 14 | 1.935 | 0.870 | 0.979 | 1.175 | 3.528 |
| 16 | 2.185 | 0.965 | 1.106 | 1.255 | 3.540 |
| 18 | 2.435 | 1.061 | 1.232 | 1.326 | 3.451 |
| 20 | 2.685 | 1.156 | 1.359 | 1.388 | 3.260 |
| 22 | 2.935 | 1.252 | 1.486 | 1.502 | 3.563 |
| 24 | 3.185 | 1.347 | 1.612 | 1.617 | 3.867 |
| 26 | 3.435 | 1.443 | 1.739 | 1.731 | 4.171 |
| 28 | 3.685 | 1.538 | 1.865 | 1.846 | 4.474 |
| 30 | 3.935 | 1.633 | 1.992 | 1.960 | 4.778 |
| 32 | 4.185 | 1.729 | 2.118 | 2.075 | 5.081 |
| 34 | 4.435 | 1.824 | 2.245 | 2.189 | 5.385 |
| 36 | 4.685 | 1.920 | 2.371 | 2.304 | 5.688 |
| 38 | 4.935 | 2.015 | 2.498 | 2.418 | 5.992 |

#### Table I-B: Roadway (12 in HMA: 140 psf as DW)

| z (ft) | σv, unfactored (ksf) | Extensible: σH (ksf) | Extensible: P′ (kip/ft per ft) | Steel strips: σH (ksf) | Steel strips: P′ (kip/ft per ft) |
|---|---|---|---|---|---|
| 1 | 0.265 | 0.231 | 0.134 | 0.387 | 0.833 |
| 2 | 0.390 | 0.278 | 0.197 | 0.459 | 1.186 |
| 3 | 0.515 | 0.326 | 0.261 | 0.530 | 1.514 |
| 4 | 0.640 | 0.374 | 0.324 | 0.598 | 1.816 |
| 5 | 0.765 | 0.422 | 0.387 | 0.664 | 2.093 |
| 6 | 0.890 | 0.469 | 0.450 | 0.727 | 2.345 |
| 7 | 1.015 | 0.517 | 0.514 | 0.788 | 2.571 |
| 8 | 1.140 | 0.565 | 0.577 | 0.847 | 2.772 |
| 9 | 1.265 | 0.612 | 0.640 | 0.903 | 2.948 |
| 10 | 1.390 | 0.660 | 0.704 | 0.957 | 3.098 |
| 12 | 1.640 | 0.756 | 0.830 | 1.058 | 3.323 |
| 14 | 1.890 | 0.851 | 0.957 | 1.149 | 3.445 |
| 16 | 2.140 | 0.946 | 1.083 | 1.230 | 3.467 |
| 18 | 2.390 | 1.042 | 1.210 | 1.302 | 3.387 |
| 20 | 2.640 | 1.137 | 1.336 | 1.365 | 3.205 |
| 22 | 2.890 | 1.233 | 1.463 | 1.479 | 3.509 |
| 24 | 3.140 | 1.328 | 1.589 | 1.594 | 3.812 |
| 26 | 3.390 | 1.423 | 1.716 | 1.708 | 4.116 |
| 28 | 3.640 | 1.519 | 1.842 | 1.823 | 4.419 |
| 30 | 3.890 | 1.614 | 1.969 | 1.937 | 4.723 |
| 32 | 4.140 | 1.710 | 2.095 | 2.052 | 5.026 |
| 34 | 4.390 | 1.805 | 2.222 | 2.166 | 5.330 |
| 36 | 4.640 | 1.901 | 2.349 | 2.281 | 5.633 |
| 38 | 4.890 | 1.996 | 2.475 | 2.395 | 5.937 |

## 5. Table R: top layers under a barrier on a moment slab (Web Doc 326 9.2)

**Basis:** a rail anchor slab with 12 in slab and 3 in HMA, the first layer at s/2 below the top, and each layer's
tributary height in the impact bands.

**How the required Tult is worked:** Tult ≥ (Fs × RF_CR + Fy) × RF_ID × RF_D / φ, with φ = 1.0 (extreme event,
AASHTO 11.5.8) and RF_ID = 1.3, RF_D = 1.1. The dynamic part carries no creep factor (AASHTO Eq. 11.10.10.2-1).

**Steel:** the last column is the demand per foot of wall. Check it against φ Tal Rc, with φ = 1.0 for strips and
0.85 for grids.

**How to read it:** the 4,800 lb/ft woven PP geotextile (B-504-D1) covers TL-3 and TL-4 at 1 ft spacing, about
2,700–2,800 lb/ft required. At 2 ft spacing TL-4 needs about 5,500 lb/ft. TL-5 needs about 4,800–6,500 lb/ft even at
1 ft.

| Test level | Spacing s (ft) | Layer | z (ft) | Static Fs (lb/ft) | Yield Fy (lb/ft) | Tult req., PP (RF_CR 1.8) (lb/ft) | Tult req., HDPE (RF_CR 2.55) (lb/ft) | Steel: Fs + Fy (lb/ft) |
|---|---|---|---|---|---|---|---|---|
| TL-3 | 1 | 1 | 0.50 | 70 | 1415 | 2204 | 2279 | 1485 |
| TL-3 | 1 | 2 | 1.50 | 105 | 1415 | 2295 | 2408 | 1520 |
| TL-3 | 1 | 3 | 2.50 | 141 | 579 | 1190 | 1341 | 719 |
| TL-3 | 1.5 | 1 | 0.75 | 118 | 2123 | 3339 | 3466 | 2241 |
| TL-3 | 1.5 | 2 | 2.25 | 198 | 1286 | 2348 | 2560 | 1484 |
| TL-3 | 1.5 | 3 | 3.75 | 277 | 450 | 1357 | 1654 | 727 |
| TL-3 | 2 | 1 | 1.00 | 175 | 2830 | 4498 | 4686 | 3005 |
| TL-3 | 2 | 2 | 3.00 | 317 | 879 | 2072 | 2411 | 1195 |
| TL-3 | 2 | 3 | 5.00 | 458 | 225 | 1501 | 1992 | 683 |
| TL-3 | 2.5 | 1 | 1.25 | 241 | 3259 | 5281 | 5540 | 3500 |
| TL-3 | 2.5 | 2 | 3.75 | 462 | 675 | 2155 | 2650 | 1137 |
| TL-4-1 | 1 | 1 | 0.50 | 70 | 1755 | 2690 | 2765 | 1825 |
| TL-4-1 | 1 | 2 | 1.50 | 105 | 1755 | 2781 | 2894 | 1860 |
| TL-4-1 | 1 | 3 | 2.50 | 141 | 664 | 1311 | 1462 | 804 |
| TL-4-1 | 1.5 | 1 | 0.75 | 118 | 2633 | 4069 | 4196 | 2751 |
| TL-4-1 | 1.5 | 2 | 2.25 | 198 | 1541 | 2713 | 2925 | 1739 |
| TL-4-1 | 1.5 | 3 | 3.75 | 277 | 450 | 1357 | 1654 | 727 |
| TL-4-1 | 2 | 1 | 1.00 | 175 | 3510 | 5471 | 5659 | 3685 |
| TL-4-1 | 2 | 2 | 3.00 | 317 | 964 | 2193 | 2533 | 1280 |
| TL-4-1 | 2 | 3 | 5.00 | 458 | 225 | 1501 | 1992 | 683 |
| TL-4-1 | 2.5 | 1 | 1.25 | 241 | 4024 | 6375 | 6634 | 4265 |
| TL-4-1 | 2.5 | 2 | 3.75 | 462 | 675 | 2155 | 2650 | 1137 |
| TL-4-2 | 1 | 1 | 0.50 | 70 | 1755 | 2690 | 2765 | 1825 |
| TL-4-2 | 1 | 2 | 1.50 | 105 | 1755 | 2781 | 2894 | 1860 |
| TL-4-2 | 1 | 3 | 2.50 | 141 | 664 | 1311 | 1462 | 804 |
| TL-4-2 | 1.5 | 1 | 0.75 | 118 | 2633 | 4069 | 4196 | 2751 |
| TL-4-2 | 1.5 | 2 | 2.25 | 198 | 1541 | 2713 | 2925 | 1739 |
| TL-4-2 | 1.5 | 3 | 3.75 | 277 | 450 | 1357 | 1654 | 727 |
| TL-4-2 | 2 | 1 | 1.00 | 175 | 3510 | 5471 | 5659 | 3685 |
| TL-4-2 | 2 | 2 | 3.00 | 317 | 964 | 2193 | 2533 | 1280 |
| TL-4-2 | 2 | 3 | 5.00 | 458 | 225 | 1501 | 1992 | 683 |
| TL-4-2 | 2.5 | 1 | 1.25 | 241 | 4024 | 6375 | 6634 | 4265 |
| TL-4-2 | 2.5 | 2 | 3.75 | 462 | 675 | 2155 | 2650 | 1137 |
| TL-5-1 | 1 | 1 | 0.50 | 70 | 3250 | 4828 | 4903 | 3320 |
| TL-5-1 | 1 | 2 | 1.50 | 105 | 2144 | 3337 | 3450 | 2249 |
| TL-5-1 | 1 | 3 | 2.50 | 141 | 485 | 1056 | 1206 | 626 |
| TL-5-1 | 1.5 | 1 | 0.75 | 118 | 4875 | 7276 | 7402 | 4993 |
| TL-5-1 | 1.5 | 2 | 2.25 | 198 | 1004 | 1945 | 2157 | 1202 |
| TL-5-1 | 1.5 | 3 | 3.75 | 277 | 533 | 1477 | 1774 | 811 |
| TL-5-1 | 2 | 1 | 1.00 | 175 | 5394 | 8165 | 8353 | 5569 |
| TL-5-1 | 2 | 2 | 3.00 | 317 | 970 | 2202 | 2542 | 1287 |
| TL-5-1 | 2 | 3 | 5.00 | 458 | 48 | 1248 | 1740 | 507 |
| TL-5-1 | 2.5 | 1 | 1.25 | 241 | 5637 | 8681 | 8940 | 5878 |
| TL-5-1 | 2.5 | 2 | 3.75 | 462 | 776 | 2299 | 2795 | 1238 |
| TL-5-2 | 1 | 1 | 0.50 | 70 | 4440 | 6529 | 6604 | 4510 |
| TL-5-2 | 1 | 2 | 1.50 | 105 | 2934 | 4467 | 4580 | 3039 |
| TL-5-2 | 1 | 3 | 2.50 | 141 | 675 | 1327 | 1478 | 816 |
| TL-5-2 | 1.5 | 1 | 0.75 | 118 | 6660 | 9828 | 9955 | 6778 |
| TL-5-2 | 1.5 | 2 | 2.25 | 198 | 1389 | 2495 | 2707 | 1587 |
| TL-5-2 | 1.5 | 3 | 3.75 | 277 | 742 | 1775 | 2073 | 1020 |
| TL-5-2 | 2 | 1 | 1.00 | 175 | 7374 | 10996 | 11184 | 7549 |
| TL-5-2 | 2 | 2 | 3.00 | 317 | 1350 | 2746 | 3085 | 1667 |
| TL-5-2 | 2 | 3 | 5.00 | 458 | 67 | 1275 | 1767 | 526 |
| TL-5-2 | 2.5 | 1 | 1.25 | 241 | 7712 | 11648 | 11907 | 7953 |
| TL-5-2 | 2.5 | 2 | 3.75 | 462 | 1080 | 2734 | 3229 | 1542 |

---

## 6. What the recomputation shows (for the review)

1. **Core walls barely change** from the current charts: BP is within about 4% at 40 ft, σH within about 2%. The new
   resistance factors (0.80 and 0.70) change what product and length are required, not the loads.
2. **Truncated bases can fail eccentricity** at 0.45 DH. On a ½:1 rock cut e / e_max exceeds 1.0 at mid-heights
   (1.067 at DH = 16 ft, rail anchor slab). The current sheets don't show this because they tabulate BP only. Either
   lengthen the bottom, or state that the eccentricity limit is waived where global stability governs
   `[Decide]` (decision DT2).
3. **Barrier on the reinforcement:** the current charts spread a TL-4 load into every layer down to 15.1 ft (H1, O1).
   Web Doc 326's measured pressures confine it to the top 4–5 ft, at higher intensity. The top layers need more
   strength and the deeper layers less.
4. **ALLCON's MSE tool** (fixed 2026-11-24): its truncated-base external model counted the reinforced triangle over the
   cut as resisting overturning behind the base's center. That swung the resultant to the heel (e = −6.5 ft at
   DH = 40) and gave an impossible 24.6 TSF. It now uses CDOT's method, as these tables do, and is tested against
   B-504-H2's 9.709 and 8.963 TSF.

## 7. Decisions

| # | Decision | Recommendation |
|---|---|---|
| DT1 | Tables in place of charts | Yes: tables E and R on one sheet, tables I on another, plus the GRS factor note; drop the per-geometry charts |
| DT2 | Truncated base eccentricity (e > L/3 at mid-heights, rock) | Lengthen the bottom to meet L/3, or waive L/3 where the geotechnical engineer's global stability analysis covers it; state which |
| DT3 | Barrier load on the reinforcement | Web Doc 326 (table R), replacing the charts' 660(1 − z/15.1) and 900 lb/ft |
| DT4 | Rail anchor slab dead load | As DW over the reinforced zone (here), or as DC (1.25 / 0.90) over the slab's width only. The charts use γ = 1.5 / 0.9, which matches neither |
| DT5 | Backslope over truncated bases | Per project, until CDOT's basis for C2/C3 is confirmed |
