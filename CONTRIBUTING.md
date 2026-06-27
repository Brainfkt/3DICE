# Contributing

Thanks for taking the time to improve 3DICE. This project is intentionally small: the main goal is to make one 3D die throw feel physical, stable and visually clear.

## Priorities

Work should follow this order:

1. Throw feel and physical credibility.
2. Simulation stability and predictable behavior.
3. Render performance.
4. Simple visual realism.
5. Code clarity and documentation.
6. Customization.
7. UI refinements.

Avoid large product surfaces such as dashboards, sidebars, statistics panels or complex settings screens. If a feature does not improve the throw, stability, performance or visual clarity, keep it out of the main flow.

## Local Setup

```bash
npm install
npm run dev
```

The local server is bound to `127.0.0.1` by the Vite script. Open the URL printed by the terminal.

## Required Checks

Before submitting changes, run:

```bash
npm run build
npm run test
```

For physics or rendering changes, also test manually in the browser.

## Manual Physics Checklist

Use these cases when a change affects drag, release, collisions, camera follow or face detection:

- Short drag.
- Fast drag.
- Vertical drag.
- Grab by corner.
- Grab by face.
- Reset after a throw.
- Reset after a far throw.
- Face result after the die settles.

The browser console should remain free of recurring errors or WebGL warnings.

## Manual Render Checklist

Use these cases when a change affects materials, lighting, shadows, camera, floor or canvas setup:

- Desktop viewport.
- Mobile-sized viewport around `390x844`.
- First screen is not blank.
- The die remains readable against the background.
- UI text does not overlap the canvas or controls.
- Zoom remains usable.

## Code Guidelines

- Keep physics constants centralized in `src/physics/config.ts`.
- Keep pure physics helpers in `src/physics/dicePhysics.ts` when possible.
- Keep face detection documented and tested.
- Prefer deterministic procedural values over `Math.random` in render code.
- Avoid new dependencies unless they clearly improve physics, stability or rendering.
- Avoid expensive post-processing unless native PBR rendering is no longer enough.
- Keep DOM controls minimal.
- Keep changes small and easy to review.

## Pull Request Checklist

Before opening a pull request:

- Update tests or add tests for changed behavior.
- Run `npm run build`.
- Run `npm run test`.
- Manually validate browser behavior if physics or rendering changed.
- Update `README.md`, `ROADMAP.md` or architecture notes when behavior changes.
- Keep generated output, local logs and screenshots out of the commit.

## Documentation

- Use `README.md` for user-facing setup and project overview.
- Use `ROADMAP.md` for priorities, retained tuning values and progress notes.
- Use `docs/ARCHITECTURE.md` for implementation notes that are too detailed for the README.
