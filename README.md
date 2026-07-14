# 3DICE

3DICE is a small local browser demo focused on one interaction: throwing a 3D die with a credible physical feel. The project favors direct manipulation, stable rendering and a restrained visual style over menus or configuration screens.

## Features

- Real-time 3D scene built with React Three Fiber.
- Rapier rigid-body simulation for one to four dice, floor contact, die-to-die contact and release impulses.
- Point-based drag for a single die: the exact grabbed point drives the throw and spin.
- Space-bar or touch-screen tap throw with a strong forward arc and a natural forward roll.
- Always-open floor; the reusable bounded world remains dormant in code.
- Camera follow, group-aware auto zoom, wheel zoom and pinch zoom.
- Icon-only Reset control that restores every die and the camera state immediately.
- Deterministic face detection for each die, plus the total for multi-dice throws.
- A progressive advanced mode for physical sounds, optional haptics, contact feedback, throw power, session history and camera gestures.
- Advanced `d4`, `d8`, `d10`, `d12` and `d20` meshes with convex colliders and labelled face detection; standard mode stays on `d6`.
- Per-die locking after a multi-dice result. Locked dice form a visible, non-colliding side row while the others are rerolled.
- Local PBR presets for die material, floor, background and lighting, without remote assets or post-processing.
- Responsive contextual help that fades after a throw and returns after ten idle seconds.
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

Vite listens on the computer and the local network. It prints both URLs in the terminal, for example:

```text
Local:   http://localhost:5173/
Network: http://192.168.1.42:5173/
```

To test on a phone, connect it to the same Wi-Fi network and open the `Network` URL. Allow the Node/Vite connection if the operating system firewall asks. The address can change when the computer reconnects to the network.

## Scripts

```bash
npm run dev
npm run build
npm run test
npm run test:balance
npm run preview
```

- `npm run dev` starts Vite on the local network for desktop and phone testing.
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
  feedback/
    gameFeedback.ts
  game/
    types.ts
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
    polyhedralDice.ts
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

Because the physics world is paused at rest, the collider mass properties are synchronized when a grab starts. This guarantees that even the first down/up flick uses the configured die mass before Rapier has advanced a frame. Pointer capture also makes focus loss, cancellation and release outside the canvas terminate the drag cleanly. A result is revealed only after roughly `450 ms` of physical stillness and `180 ms` of one stable upward face at the `120 Hz` simulation rate.

Pressing Space or tapping the open canvas on a touch/pen device launches every configured die through the same point-velocity, off-center impulse and capped torque path, with dedicated keyboard power limits. A touch launch accepts only a short primary tap, so drag, long press, pinch and mouse click do not create accidental duplicate throws. Each impulse point is reconstructed above its die in world space, so arbitrary settled faces still produce a high forward arc and a consistent natural forward roll. With one die, an active throw still blocks stacking another impulse. With several dice, drag is disabled and every launch atomically restores the initial formation before throwing the full group again; this prevents accumulated drift from making the camera chase an increasingly distant cluster. Key repeat and inputs remain ignored.

The d6 balance regression test uses the same gravity, rounded collider, mass, floor contacts, Space impulse and settle detection as the application. It simulates 1,000 consecutive throws with a fixed seed and recenters the settled die horizontally between throws; that translation is neutral on the homogeneous open floor and keeps the headless test numerically stable. It then requires both a Pearson chi-squared score below the 99% rejection threshold and every face count to remain within `31` of the expected `166.67`. The advanced polyhedra additionally test every labelled face, convex collider data and equal landing-face areas. These are deterministic bias guards, not a mathematical proof that a finite sample is perfectly uniform.

## Camera and World

The scene always uses an open world: walls and ceiling are not mounted. The floor collider and visual plane are large enough to keep the surface visually continuous during normal throws. `BoundedWorld` is retained as dormant, commented reference code, but it is not exposed as a setting.

The camera follows the center of the configured dice with the same bounded catch-up behavior during a drag and after a Space throw. Transient auto-zoom reacts both to center lag and to the group's physical spread, with portrait compensation on mobile. In advanced multi-dice rolls, locking captures a fixed world anchor: each locked die keeps its settled rotation and ground height, moves once into the left-hand row, then never follows the camera or the rerollable dice. Sensor colliders keep that row out of the new throw while group framing keeps it visible. Reset restores all dice, the look target, camera position and zoom state immediately.

Appearance, surface, dice count and advanced preferences are stored in a versioned local settings record. Older records are migrated without restoring their former world-type choice. There is intentionally no export action: this local single-screen demo has no sharing workflow that would justify it.

## Face Detection

`src/utils/detectDiceFace.ts` defines local face normals for the die. After the simulation becomes stable, each normal is transformed by the die rotation. The face whose transformed normal is most aligned with the world up axis is reported as the final result.

The d6 detection logic is covered by `src/utils/detectDiceFace.test.ts`, polyhedral detection and geometry by `src/render/polyhedralDice.test.ts`, and settle behavior by `src/physics/dicePhysics.test.ts`.

## Render and Performance

The render path uses native Three.js PBR lighting and shadows without post-processing. The d6 has an indexed rounded shell with 21 physically concave pips; polyhedral dice use compact native geometries and local number textures. Deterministic albedo, roughness and normal maps give the selected die and floor their microstructure. One inverse-square studio light casts the moving shadow; a tighter contact shadow is calculated only for the static state. Three local light cards build the reflection environment once, without loading a remote HDR. The default device-pixel ratio is capped at `1.5`. The maximum four-`d20` diagnostic at mobile DPR 2 measured `60fps`, `16.67ms` average, `19ms` worst frame and about `90` draw calls.

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
