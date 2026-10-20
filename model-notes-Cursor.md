# Model notes

The coupon is one connected graph. Even columns carry vertical ribs of length `hv = 1.15`. Inclined ribs of chord length `li = 0.62` join those columns to the staggered odd columns. The opening angle θ is measured from the vertical.

Re-entrant pitch:

- column spacing `dx = li sin θ`
- axial pitch `ly = 2 (hv − li cos θ)`

θ runs from 46° to 69° in the illustrated range. Both gauge height and gauge width increase. At full extension the illustrative secant ratio is about −1.03, with axial strain about +0.29 and transverse strain about +0.30. Those numbers are whatever the node coordinates produce. They are not typed in as a target Poisson ratio.

The conventional comparison uses `ly = 2 (hv + li cos θ)` and closes θ from 72° until its axial gauge strain matches the auxetic full-extension strain. Its transverse strain is negative.

## Approximations

- Rigid-link node motion, plus a small quadratic bow on inclined ribs. Chord lengths stay exact. Arc length stays within 2%.
- Rounded junctions are ellipsoids fused to the rib ends. They are not pin joints, and they are not a stress result.
- The cyan stripe is an overlay. Curvature is not uniform, and the stripe does not say that it is.
- End shoes translate along fixed-length rails. That is an illustrative laterally accommodating fixture.
- Deformation is amplified and time is compressed. Nothing here is a validated elastic limit, stiffness, force, or fatigue life.
- The constituent is drawn as one satin polymer. It is not assigned a negative Poisson ratio.

## Reuse

The same shell can show another cellular mechanism by replacing `buildLattice` and keeping the timeline, gauge math, audio clock, and controls. The conventional inset is already that second mechanism. A chiral or rotating-square lattice would need its own length-preserving linkage and the same strain tests before it could be labeled the same way.
