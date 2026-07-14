# 3DICE

3DICE is a small local browser demo focused on one interaction: throwing a 3D die with a credible physical feel. The project favors direct manipulation, stable rendering and a restrained visual style over menus or configuration screens.

## Features

- Real-time 3D scene built with React Three Fiber.
- Rapier rigid-body simulation for one to four dice, floor contact, die-to-die contact and release impulses.
- Point-based drag for a single die: the exact grabbed point drives the throw and spin.
- Space-bar throw with a strong forward arc and a natural forward roll.
- Always-open floor; the reusable bounded world remains dormant in code.
- Camera follow, group-aware auto zoom, wheel zoom and pinch zoom.
- Icon-only Reset control that restores every die and the camera state immediately.
- Deterministic face detection for each die, plus the total for multi-dice throws.
- A collapsed settings panel for die finish, floor/background and dice count.
- Versioned local settings persistence without accounts, export UI or dependencies.

## Tech Stack

- React 18
- Vite
- TypeScript
- Three.js
- React Three Fiber
- Drei
- React Three Rapier
- Vitest

## Requirements

- Node.js 20 or newer is recommended.
- npm 10 or newer is recommended.

## Getting Started

Install dependencies:

```bash
npm install
```

Start the local development server:

```bash
npm run dev
```

Vite prints the local URL in the terminal, usually:

```text
http://127.0.0.1:5173/
```

## Scripts

```bash
npm run dev
npm run build
npm run test
npm run test:balance
npm run preview
```

- `npm run dev` starts the local Vite server.
- `npm run build` runs TypeScript checks and creates a production build.
- `npm run test` runs the Vitest unit test suite.
- `npm run test:balance` runs 1,000 seeded Space throws in headless Rapier and prints the face distribution.
- `npm run preview` serves the production build locally.

## Project Structure

```text
src/
  App.tsx
  main.tsx
  components/
    Dice.tsx
    Floor.tsx
    MinimalUI.tsx
    Scene.tsx
    worlds/
      BoundedWorld.tsx
  input/
    keyboardThrow.ts
  physics/
    config.ts
    dicePhysics.ts
  render/
    config.ts
    diceGeometry.ts
    floorTexture.ts
    ivoryTexture.ts
    performance.ts
  settings/
    config.ts
  styles/
    global.css
  utils/
    detectDiceFace.ts
    dicePips.ts
```

## Physics Model

Physics constants are centralized in `src/physics/config.ts`. This includes gravity, mass, friction, restitution, damping, drag mapping, throw impulse limits and settle thresholds.

The die is a dynamic Rapier rigid body with a rounded cuboid collider, continuous collision detection, short-range predictive CCD and local solver refinement for violent impacts. During drag, the grabbed point is converted to a local anchor and connected to a kinematic anchor with a spherical joint. This keeps the body dynamic while the user manipulates it, so grabbing a face, edge or corner produces different leverage and spin. Pointer listeners stay ready before the gesture starts, so a complete fast flick between two render frames is not lost.

On release, the Rapier joint is removed synchronously before recent pointer samples are converted into a target velocity at the grabbed point. The estimator uses native event timestamps, coalesced pointer events, and the final `pointerup` coordinate, so throw power stays consistent across mouse polling rates and sub-frame flicks. The current velocity at the grabbed point is then measured from linear and angular body velocity, and `applyImpulseAtPoint` only supplies momentum missing in the gesture direction; it never brakes momentum already created by the drag. The throw therefore comes mainly from the point of contact and the lever arm, with small capped torque for natural tumble and soft compression only for extreme velocity outliers. Rapier advances at a fixed `1/120` step with CCD substeps, predictive contact and extra local solver iterations for violent impacts.

Because the physics world is paused at rest, the collider mass properties are synchronized when a grab starts. This guarantees that even the first down/up flick uses the configured die mass before Rapier has advanced a frame. Pointer capture also makes focus loss, cancellation and release outside the canvas terminate the drag cleanly.

Pressing Space launches every configured die through the same point-velocity, off-center impulse and capped torque path, with dedicated keyboard power limits. Each impulse point is reconstructed above its die in world space, so arbitrary settled faces still produce a high forward arc and a consistent natural forward roll. With one die, an active throw still blocks stacking another impulse. With several dice, drag is disabled and every Space press atomically restores the initial formation before launching the full group again; this prevents accumulated drift from making the camera chase an increasingly distant cluster. Key repeat and inputs remain ignored.

The balance regression test uses the same gravity, rounded collider, mass, floor contacts, Space impulse and settle detection as the application. It simulates 1,000 consecutive throws with a fixed seed and recenters the settled die horizontally between throws; that translation is neutral on the homogeneous open floor and keeps the headless test numerically stable. It then requires both a Pearson chi-squared score below the 99% rejection threshold and every face count to remain within `31` of the expected `166.67`. The two criteria have a combined false-rejection rate of roughly 5% for a truly uniform 1,000-throw sample. This is a deterministic bias guard for the canonical Space throw, not an end-to-end UI test or a mathematical proof that a finite sample is perfectly uniform.

## Camera and World

The scene always uses an open world: walls and ceiling are not mounted. The floor collider and visual plane are large enough to keep the surface visually continuous during normal throws. `BoundedWorld` is retained as dormant, commented reference code, but it is not exposed as a setting.

The camera follows the center of the configured dice with the same bounded catch-up behavior during a drag and after a Space throw. Transient auto-zoom reacts both to center lag and to the group's physical spread so separated dice stay framed on mobile. Reset restores all dice, the look target, camera position and zoom state immediately.

Appearance, surface and dice count are stored in a versioned local settings record. Older records are migrated without restoring their former world-type choice. There is intentionally no export action: this local single-screen demo has no sharing workflow that would justify it.

## Face Detection

`src/utils/detectDiceFace.ts` defines local face normals for the die. After the simulation becomes stable, each normal is transformed by the die rotation. The face whose transformed normal is most aligned with the world up axis is reported as the final result.

The detection logic is covered by unit tests in `src/utils/detectDiceFace.test.ts`, and the settle behavior is covered in `src/physics/dicePhysics.test.ts`.

## Render and Performance

The render path uses native Three.js PBR lighting and shadows without post-processing. Each die has an indexed rounded shell with 21 physically concave pips, while deterministic albedo, roughness and normal maps give the selected resin and floor their microstructure. One inverse-square studio light casts the moving shadow; a tighter contact shadow is calculated only for the static state. Three local light cards build the reflection environment once, without loading a remote HDR. The default device-pixel ratio is capped at `1.5`. The maximum four-dice diagnostic at mobile DPR 2 measured about `59.86fps`, `16.71ms`, `10` draw calls and `23,196` triangles.

The Canvas renders on demand and Rapier follows that render loop instead of keeping an independent animation callback. A small active-frame driver discards the stale clock delta when the scene wakes, then runs only from grab through settle; Rapier is paused afterward. Drag, throw, camera easing, wheel/pinch zoom, Reset and shadow refreshes explicitly request the frames they need, so an idle scene performs no WebGL draws, physics steps or animation-frame callbacks. Optional performance instrumentation can be enabled with query parameters:

```text
?perf=1
?dpr=1
?dpr=2
?physicsDebug=1
```

When enabled, render metrics are published on `window.__3diceLastRenderMetrics` and `window.__3diceRenderMetrics`. The `?perf=1` diagnostic intentionally keeps rendering continuously so per-frame measurements remain comparable; normal mode still stops at rest.

`?physicsDebug=1` adds no visible UI. It exposes a read-only `window.__3dicePhysicsDebug.read()` report with bounded samples for phase, position, quaternion, linear and angular velocity, candidate face, final face and sleeping state. Without the flag, the global is absent and the physics body is not sampled for debug data.

## Development Notes

- Keep physics parameters in `src/physics/config.ts`.
- Keep core physics helpers in `src/physics/dicePhysics.ts`.
- Keep the overlay minimal.
- Prefer small, testable changes.
- Run `npm run build` and `npm run test` before opening a pull request.
- For physics or rendering changes, also validate manually in the browser.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for contribution guidelines and [ROADMAP.md](./ROADMAP.md) for current priorities.
