# Re-entrant honeycomb

Interactive 34-second explanation of a re-entrant honeycomb auxetic lattice. One continuous polymer coupon is stretched in Y and widens in X. The negative ratio is an effective property of the architecture. The polymer itself is not auxetic.

This is illustrative kinematics, not finite-element analysis and not a measured material test.

## Run

```bash
npm install
npm test
npm run dev
```

Production build:

```bash
npm run build
npm run preview
```

The Vite `base` is `./`, so the `dist/` folder can be hosted from a subdirectory or from GitHub Pages.

## What the picture is doing

- Bottom fixture is fixed. The top fixture moves up, then returns.
- Inclined rib chords stay at length `li`. Vertical rib chords stay at length `hv`.
- One shared angle, measured from the vertical, moves every node.
- Gauge height and width are averages of the same interior material points at every time.
- `ν_sec = −ε_x / ε_y` is withheld near zero axial strain.
- Cyan marks an illustrative flexure overlay, not a calculated stress field.
- The end shoes travel on rails. That fixture is laterally accommodating. The lattice does not slide through a clamp.
- The comparison inset is a separate schematic. Both cells are shown at the same axial strain. The conventional example narrows.

## Checks

`npm test` checks connectivity, rib chord length, arc-length drift, centerline clearance, positive gauge strains, a negative secant ratio away from zero strain, return to the initial geometry, and repeated seeks. Those checks do not establish structural safety.

## Controls

Play and pause, replay, timeline, mute, separate music and effects levels, full screen where the browser allows it, reduced-motion inspection, and shot jumps. Keyboard: Space, arrows, Shift+arrows, Home, End, M, F, R. Sound starts only after playback or another explicit control.

## GitHub

About: Interactive 34-second explainer of a re-entrant honeycomb auxetic lattice with illustrative kinematics.

Topics: `auxetic`, `metamaterial`, `re-entrant-honeycomb`, `threejs`, `vite`, `mechanics`, `visualization`, `poisson-ratio`, `typescript`

`.github/workflows/pages.yml` builds `dist/` and deploys GitHub Pages from `main`. The site uses relative asset paths (`base: "./"`), so it loads from a project-pages URL.
