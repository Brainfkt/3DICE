# 3DICE

3DICE is a small local browser demo focused on one interaction: throwing a 3D die with a credible physical feel. The project favors direct manipulation, stable rendering and a restrained visual style over menus or configuration screens.

## Features

- Real-time 3D scene built with React Three Fiber.
- Rapier rigid-body simulation for the die, floor contact and release impulses.
- Point-based drag: the exact grabbed point on the die drives the throw and spin.
- Open floor with camera follow, wheel zoom and pinch zoom.
- Reset button that restores both die and camera state immediately.
- Deterministic face detection after the die settles.
- Minimal overlay: current face, reset action and a short interaction hint.

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
npm run preview
```

- `npm run dev` starts the local Vite server.
- `npm run build` runs TypeScript checks and creates a production build.
- `npm run test` runs the Vitest unit test suite.
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
  physics/
    config.ts
    dicePhysics.ts
  render/
    config.ts
    floorTexture.ts
    performance.ts
  styles/
    global.css
  utils/
    detectDiceFace.ts
    dicePips.ts
```

## Physics Model

Physics constants are centralized in `src/physics/config.ts`. This includes gravity, mass, friction, restitution, damping, drag mapping, throw impulse limits and settle thresholds.

The die is a dynamic Rapier rigid body with a rounded cuboid collider. During drag, the grabbed point is converted to a local anchor and connected to a kinematic anchor with a spherical joint. This keeps the body dynamic while the user manipulates it, so grabbing a face, edge or corner produces different leverage and spin.

On release, the latest pointer samples are converted into a target velocity at the grabbed point. The current velocity at that same point is measured from linear and angular body velocity, then a bounded impulse is applied with `applyImpulseAtPoint`. The throw therefore comes mainly from the point of contact and the lever arm, with small capped torque for natural tumble.

## Camera and World

The active scene uses an open world: walls and ceiling are not mounted. The floor collider and visual plane are large enough to keep the surface visually continuous during normal throws.

The camera follows the die after release with bounded catch-up speed and transient auto-zoom when the die moves far away. Camera motion is frozen while the die is being dragged so grabbing the die does not cause view jumps. Reset restores the die, look target, camera position and zoom state immediately.

The previous bounded world implementation is kept in `src/components/worlds/BoundedWorld.tsx` for a future selectable world type.

## Face Detection

`src/utils/detectDiceFace.ts` defines local face normals for the die. After the simulation becomes stable, each normal is transformed by the die rotation. The face whose transformed normal is most aligned with the world up axis is reported as the final result.

The detection logic is covered by unit tests in `src/utils/detectDiceFace.test.ts`, and the settle behavior is covered in `src/physics/dicePhysics.test.ts`.

## Render and Performance

The render path uses native Three.js lighting and shadows without post-processing. The floor texture is procedural and deterministic. Optional performance instrumentation can be enabled with query parameters:

```text
?perf=1
?dpr=1
?dpr=2
```

When enabled, render metrics are published on `window.__3diceLastRenderMetrics` and `window.__3diceRenderMetrics`.

## Development Notes

- Keep physics parameters in `src/physics/config.ts`.
- Keep core physics helpers in `src/physics/dicePhysics.ts`.
- Keep the overlay minimal.
- Prefer small, testable changes.
- Run `npm run build` and `npm run test` before opening a pull request.
- For physics or rendering changes, also validate manually in the browser.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for contribution guidelines and [ROADMAP.md](./ROADMAP.md) for current priorities.
