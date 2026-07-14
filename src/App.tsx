import { useCallback, useEffect, useState } from "react";
import { Scene } from "./components/Scene";
import { MinimalUI } from "./components/MinimalUI";
import {
  defaultPhysicsProfileId,
  getPhysicsProfile,
  physicsProfileOptions,
  PhysicsProfileId,
} from "./physics/config";
import {
  AppSettings,
  getDiceAppearance,
  getSurfaceTheme,
  loadStoredSettings,
  saveStoredSettings,
} from "./settings/config";

export default function App() {
  const [settings, setSettings] = useState(loadStoredSettings);
  const [faces, setFaces] = useState<(number | null)[]>(() =>
    Array.from({ length: settings.diceCount }, () => null),
  );
  const [resetKey, setResetKey] = useState(0);
  const [uiRevision, setUiRevision] = useState(0);
  const [rollingDice, setRollingDice] = useState<boolean[]>(() =>
    Array.from({ length: settings.diceCount }, () => false),
  );
  const [physicsProfileId, setPhysicsProfileId] = useState<PhysicsProfileId>(
    defaultPhysicsProfileId,
  );
  const physicsProfile = getPhysicsProfile(physicsProfileId);
  const diceAppearance = getDiceAppearance(settings.diceAppearanceId);
  const surface = getSurfaceTheme(settings.surfaceId);

  useEffect(() => {
    saveStoredSettings(settings);
  }, [settings]);

  const handleReset = useCallback(() => {
    setFaces(Array.from({ length: settings.diceCount }, () => null));
    setRollingDice(Array.from({ length: settings.diceCount }, () => false));
    setResetKey((value) => value + 1);
  }, [settings.diceCount]);

  const handleSettingsChange = useCallback(
    (patch: Partial<Omit<AppSettings, "version">>) => {
      const nextSettings = { ...settings, ...patch };
      const simulationChanged = nextSettings.diceCount !== settings.diceCount;

      setSettings(nextSettings);

      if (simulationChanged) {
        setFaces(Array.from({ length: nextSettings.diceCount }, () => null));
        setRollingDice(
          Array.from({ length: nextSettings.diceCount }, () => false),
        );
        setResetKey((value) => value + 1);
      }
    },
    [settings],
  );

  const handlePhysicsProfileChange = useCallback((nextProfileId: PhysicsProfileId) => {
    if (nextProfileId === physicsProfileId) return;

    setPhysicsProfileId(nextProfileId);
    setFaces(Array.from({ length: settings.diceCount }, () => null));
    setRollingDice(Array.from({ length: settings.diceCount }, () => false));
    setResetKey((value) => value + 1);
  }, [physicsProfileId, settings.diceCount]);

  const handleThrowStart = useCallback((diceIndex: number) => {
    setFaces((current) =>
      current.map((face, index) => (index === diceIndex ? null : face)),
    );
    setRollingDice((current) =>
      current.map((rolling, index) => (index === diceIndex ? true : rolling)),
    );
  }, []);

  const handleSettle = useCallback((diceIndex: number, nextFace: number) => {
    setFaces((current) =>
      current.map((face, index) => (index === diceIndex ? nextFace : face)),
    );
    setRollingDice((current) =>
      current.map((rolling, index) => (index === diceIndex ? false : rolling)),
    );
  }, []);

  return (
    <main className="app-shell" style={{ backgroundColor: surface.background }}>
      <Scene
        diceAppearance={diceAppearance}
        diceCount={settings.diceCount}
        physicsProfile={physicsProfile}
        resetKey={resetKey}
        surface={surface}
        uiRevision={uiRevision}
        onThrowStart={handleThrowStart}
        onSettle={handleSettle}
      />
      <MinimalUI
        faces={faces}
        rollingDice={rollingDice}
        settings={settings}
        physicsProfiles={physicsProfileOptions}
        selectedPhysicsProfileId={physicsProfileId}
        onPhysicsProfileChange={handlePhysicsProfileChange}
        onReset={handleReset}
        onSettingsChange={handleSettingsChange}
        onSettingsVisibilityChange={() => setUiRevision((value) => value + 1)}
      />
    </main>
  );
}
