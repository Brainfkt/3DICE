# Architecture Notes

3DICE is a single-screen React application. Most runtime behavior lives in React Three Fiber components, while reusable simulation logic is kept in pure TypeScript helpers.

## Runtime Flow

```text
App
  Scene
    CameraRig
    FollowDirectionalLight
    Physics
      Dice
      Floor
  MinimalUI
```

- `App.tsx` owns result state, rolling state, reset key and the active physics profile.
- `Scene.tsx` owns the canvas, lights, camera behavior, Rapier world and render metrics hook.
- `Dice.tsx` owns the die rigid body, drag joint, release impulse and settle detection loop.
- `Floor.tsx` owns the active open floor collider and material.
- `MinimalUI.tsx` owns the small overlay.

## Physics Configuration

`src/physics/config.ts` is the source of truth for physical values:

- gravity;
- die mass, friction, restitution and damping;
- rounded collider size;
- floor friction and restitution;
- drag mapping limits;
- release impulse limits;
- settle thresholds.

The default profile is `K`, which keeps a strong gravity feel and enough restitution for a lively but controlled die.

## Drag and Throw

The drag starts from the exact pointer hit point on the die. That hit point is converted into a local anchor. A kinematic anchor follows the user gesture, and Rapier keeps the die connected through a spherical joint.

The drag target is clamped relative to the grabbed point, not relative to the world origin. This is important for the open world: after a far throw, grabbing the die should not pull it back toward the center.

On release:

1. Recent pointer samples are converted into a target point velocity.
2. The current velocity at the grabbed point is calculated from body linear and angular velocity.
3. The difference is clamped.
4. A bounded impulse is applied at the grabbed world point.
5. A small bounded torque impulse is applied for natural tumble.

## Camera

The camera follows a look target derived from the die position. Catch-up speed increases with lag but remains capped to avoid hard snaps.

During drag, camera movement is frozen. This keeps the grab stable and avoids feedback between camera movement and pointer mapping.

Reset is immediate. It restores:

- camera position;
- look target;
- wheel zoom target;
- current zoom;
- active pinch state.

## Open and Bounded Worlds

The active world is open. It uses a very large floor collider and plane so normal throws do not reveal a visible boundary.

`src/components/worlds/BoundedWorld.tsx` keeps the previous bounded-world implementation. It is not mounted by the active scene, but remains available for a future world selector.

## Testing

Unit tests cover:

- face normal mapping;
- pip layout;
- deterministic floor texture helpers;
- physics profile shape;
- drag target mapping and clamp behavior;
- throw vector and release impulse helpers;
- settle-state logic.

The minimum validation loop is:

```bash
npm run build
npm run test
```

Physics and rendering changes also need browser validation.
