import { useCallback, useState } from "react";
import { Scene } from "./components/Scene";
import { MinimalUI } from "./components/MinimalUI";
import {
  defaultPhysicsProfileId,
  getPhysicsProfile,
  physicsProfileOptions,
  PhysicsProfileId,
} from "./physics/config";

export default function App() {
  const [face, setFace] = useState<number | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [isRolling, setIsRolling] = useState(false);
  const [physicsProfileId, setPhysicsProfileId] = useState<PhysicsProfileId>(
    defaultPhysicsProfileId,
  );
  const physicsProfile = getPhysicsProfile(physicsProfileId);

  const handleReset = useCallback(() => {
    setFace(null);
    setIsRolling(false);
    setResetKey((value) => value + 1);
  }, []);

  const handlePhysicsProfileChange = useCallback((nextProfileId: PhysicsProfileId) => {
    if (nextProfileId === physicsProfileId) return;

    setPhysicsProfileId(nextProfileId);
    setFace(null);
    setIsRolling(false);
    setResetKey((value) => value + 1);
  }, [physicsProfileId]);

  return (
    <main className="app-shell">
      <Scene
        physicsProfile={physicsProfile}
        resetKey={resetKey}
        onThrowStart={() => {
          setFace(null);
          setIsRolling(true);
        }}
        onSettle={(nextFace) => {
          setFace(nextFace);
          setIsRolling(false);
        }}
      />
      <MinimalUI
        face={face}
        isRolling={isRolling}
        physicsProfiles={physicsProfileOptions}
        selectedPhysicsProfileId={physicsProfileId}
        onPhysicsProfileChange={handlePhysicsProfileChange}
        onReset={handleReset}
      />
    </main>
  );
}
