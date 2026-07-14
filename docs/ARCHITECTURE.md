# Architecture Notes

3DICE is a single-screen React application. Most runtime behavior lives in React Three Fiber components, while reusable simulation logic is kept in pure TypeScript helpers.

## Runtime Flow

```text
App
  Scene
    CameraRig
    FollowDirectionalLight
    Physics
      Dice x 1..4
      Floor | BoundedWorld
  MinimalUI
```

- `App.tsx` owns per-die result/rolling state, reset key, the active physics profile and versioned local settings.
- `Scene.tsx` owns the canvas, lights, camera behavior, Rapier world and render metrics hook.
- `Dice.tsx` owns one die rigid body, drag joint, release impulse and settle detection loop.
- `Floor.tsx` owns the reusable PBR floor surface and the active open floor collider.
- `BoundedWorld.tsx` reuses that surface with invisible wall and ceiling colliders.
- `MinimalUI.tsx` owns the small overlay and collapsed settings panel.

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

The camera follows a look target derived from the average dice position. Catch-up speed increases with lag but remains capped to avoid hard snaps. A second bounded auto-zoom term follows the maximum distance from the group center so scattered dice stay visible.

During drag, camera movement is frozen. This keeps the grab stable and avoids feedback between camera movement and pointer mapping.

Reset is immediate. It restores:

- camera position;
- look target;
- wheel zoom target;
- current zoom;
- active pinch state.

## Open and Bounded Worlds

The default world is open. It uses a very large floor collider and plane so normal throws do not reveal a visible boundary.

The settings panel can mount `src/components/worlds/BoundedWorld.tsx` instead. Both worlds share the selected floor theme and the same physical floor profile.

## Settings

`src/settings/config.ts` defines four restrained die finishes, four floor/background themes, open/bounded world types and counts from one to four. The settings record is validated field by field before it is restored from `localStorage`; malformed or stale values fall back to the product defaults. No export format is exposed because the demo has no sharing workflow.

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
