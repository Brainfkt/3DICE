import { useCallback, useEffect, useRef, useState } from "react";
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
  getLightingPreset,
  getSurfaceTheme,
  loadStoredSettings,
  saveStoredSettings,
} from "./settings/config";
import { playGameSound, triggerHaptic } from "./feedback/gameFeedback";
import { RollHistoryEntry } from "./game/types";
import {
  getAppShortcutAction,
  SPACE_THROW_BLOCKED_TARGET_SELECTOR,
} from "./input/keyboardThrow";

const STANDARD_APPEARANCE_IDS = new Set(["ivory", "sage", "garnet", "graphite"]);
const STANDARD_SURFACE_IDS = new Set(["graphite", "midnight", "clay", "sand"]);

function getEffectiveDiceType(settings: AppSettings) {
  return settings.advancedMode ? settings.diceType : "d6";
}

function getEffectiveCameraView(settings: AppSettings) {
  return settings.advancedMode ? settings.cameraView : "free";
}

export default function App() {
  const [settings, setSettings] = useState(loadStoredSettings);
  const [faces, setFaces] = useState<(number | null)[]>(() =>
    Array.from({ length: settings.diceCount }, () => null),
  );
  const [resetKey, setResetKey] = useState(0);
  const [throwRevision, setThrowRevision] = useState(0);
  const [rollingDice, setRollingDice] = useState<boolean[]>(() =>
    Array.from({ length: settings.diceCount }, () => false),
  );
  const [lockedDice, setLockedDice] = useState<boolean[]>(() =>
    Array.from({ length: settings.diceCount }, () => false),
  );
  const [history, setHistory] = useState<RollHistoryEntry[]>([]);
  const [resultRevision, setResultRevision] = useState(0);
  const activeRollIdRef = useRef(0);
  const lastCompletedRollIdRef = useRef(0);
  const lastThrowStartedAtRef = useRef(-Infinity);
  const [physicsProfileId, setPhysicsProfileId] = useState<PhysicsProfileId>(
    defaultPhysicsProfileId,
  );
  const physicsProfile = getPhysicsProfile(physicsProfileId);
  const effectiveDiceType = getEffectiveDiceType(settings);
  const effectiveCameraView = getEffectiveCameraView(settings);
  const effectiveAppearanceId =
    settings.advancedMode || STANDARD_APPEARANCE_IDS.has(settings.diceAppearanceId)
      ? settings.diceAppearanceId
      : "ivory";
  const effectiveSurfaceId =
    settings.advancedMode || STANDARD_SURFACE_IDS.has(settings.surfaceId)
      ? settings.surfaceId
      : "graphite";
  const diceAppearance = getDiceAppearance(effectiveAppearanceId);
  const surface = getSurfaceTheme(effectiveSurfaceId);
  const lightingPreset = getLightingPreset(
    settings.advancedMode ? settings.lightingPresetId : "studio",
  );
  const audioEnabled = settings.advancedMode && settings.audioEnabled;
  const hapticsEnabled = settings.advancedMode && settings.hapticsEnabled;

  useEffect(() => {
    saveStoredSettings(settings);
  }, [settings]);

  const handleReset = useCallback(() => {
    setFaces(Array.from({ length: settings.diceCount }, () => null));
    setRollingDice(Array.from({ length: settings.diceCount }, () => false));
    setLockedDice(Array.from({ length: settings.diceCount }, () => false));
    setResetKey((value) => value + 1);
  }, [settings.diceCount]);

  const handleSettingsChange = useCallback(
    (patch: Partial<Omit<AppSettings, "version">>) => {
      const nextSettings = { ...settings, ...patch };
      const simulationChanged =
        nextSettings.diceCount !== settings.diceCount ||
        getEffectiveDiceType(nextSettings) !== getEffectiveDiceType(settings) ||
        getEffectiveCameraView(nextSettings) !== getEffectiveCameraView(settings);

      setSettings(nextSettings);

      if (simulationChanged) {
        setFaces(Array.from({ length: nextSettings.diceCount }, () => null));
        setRollingDice(
          Array.from({ length: nextSettings.diceCount }, () => false),
        );
        setResetKey((value) => value + 1);
      }

      if (
        simulationChanged ||
        !nextSettings.advancedMode ||
        nextSettings.diceCount < 2
      ) {
        setLockedDice(
          Array.from({ length: nextSettings.diceCount }, () => false),
        );
      }
    },
    [settings],
  );

  const handlePhysicsProfileChange = useCallback((nextProfileId: PhysicsProfileId) => {
    if (nextProfileId === physicsProfileId) return;

    setPhysicsProfileId(nextProfileId);
    setFaces(Array.from({ length: settings.diceCount }, () => null));
    setRollingDice(Array.from({ length: settings.diceCount }, () => false));
    setLockedDice(Array.from({ length: settings.diceCount }, () => false));
    setResetKey((value) => value + 1);
  }, [physicsProfileId, settings.diceCount]);

  const handleThrowStart = useCallback((diceIndex: number) => {
    const now = performance.now();
    if (now - lastThrowStartedAtRef.current > 80) {
      lastThrowStartedAtRef.current = now;
      activeRollIdRef.current += 1;
      setThrowRevision((value) => value + 1);
      playGameSound({
        appearanceId: diceAppearance.id,
        enabled: audioEnabled,
        kind: "throw",
        surfaceId: surface.id,
      });
    }
    setFaces((current) =>
      current.map((face, index) => (index === diceIndex ? null : face)),
    );
    setRollingDice((current) =>
      current.map((rolling, index) => (index === diceIndex ? true : rolling)),
    );
  }, [audioEnabled, diceAppearance.id, surface.id]);

  const handleSettle = useCallback((diceIndex: number, nextFace: number) => {
    setFaces((current) =>
      current.map((face, index) => (index === diceIndex ? nextFace : face)),
    );
    setRollingDice((current) =>
      current.map((rolling, index) => (index === diceIndex ? false : rolling)),
    );
  }, []);

  const handleGrab = useCallback(() => {
    playGameSound({
      appearanceId: diceAppearance.id,
      enabled: audioEnabled,
      kind: "grab",
      surfaceId: surface.id,
    });
  }, [audioEnabled, diceAppearance.id, surface.id]);

  const handleImpact = useCallback(
    (_diceIndex: number, strength: number) => {
      playGameSound({
        appearanceId: diceAppearance.id,
        enabled: audioEnabled,
        kind: "impact",
        strength,
        surfaceId: surface.id,
      });
      triggerHaptic({ enabled: hapticsEnabled, kind: "impact", strength });
    },
    [audioEnabled, diceAppearance.id, hapticsEnabled, surface.id],
  );

  const handleToggleLock = useCallback(
    (diceIndex: number) => {
      if (
        !settings.advancedMode ||
        settings.diceCount < 2 ||
        rollingDice.some(Boolean) ||
        faces[diceIndex] === null
      ) {
        return;
      }

      setLockedDice((current) => {
        if (current[diceIndex]) {
          return current.map((locked, index) =>
            index === diceIndex ? false : locked,
          );
        }

        const unlockedCount = current.filter((locked) => !locked).length;
        if (unlockedCount <= 1) return current;
        return current.map((locked, index) =>
          index === diceIndex ? true : locked,
        );
      });
    },
    [faces, rollingDice, settings.advancedMode, settings.diceCount],
  );

  useEffect(() => {
    const rollId = activeRollIdRef.current;
    if (
      rollId === 0 ||
      rollId === lastCompletedRollIdRef.current ||
      rollingDice.some(Boolean) ||
      faces.some((face) => face === null)
    ) {
      return;
    }

    lastCompletedRollIdRef.current = rollId;
    const completedFaces = faces as number[];
    const total = completedFaces.reduce((sum, face) => sum + face, 0);
    setResultRevision((value) => value + 1);

    if (settings.advancedMode && settings.historyEnabled) {
      setHistory((current) => [
        {
          faces: [...completedFaces],
          id: rollId,
          total,
          type: effectiveDiceType,
        },
        ...current,
      ].slice(0, 8));
    }

    playGameSound({
      appearanceId: diceAppearance.id,
      enabled: audioEnabled,
      kind: "result",
      surfaceId: surface.id,
    });
    triggerHaptic({ enabled: hapticsEnabled, kind: "result" });
  }, [
    audioEnabled,
    diceAppearance.id,
    effectiveDiceType,
    faces,
    hapticsEnabled,
    rollingDice,
    settings.advancedMode,
    settings.historyEnabled,
    surface.id,
  ]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const blockedTarget =
        event.target instanceof Element &&
        event.target.closest(SPACE_THROW_BLOCKED_TARGET_SELECTOR) !== null;
      const action = getAppShortcutAction({
        advancedMode: settings.advancedMode,
        blockedTarget,
        code: event.code,
        defaultPrevented: event.defaultPrevented,
        repeat: event.repeat,
      });
      if (action === "ignore") return;
      event.preventDefault();

      if (action === "reset") {
        handleReset();
        return;
      }

      if (document.fullscreenElement) {
        void document.exitFullscreen().catch(() => undefined);
      } else {
        void document.documentElement.requestFullscreen().catch(() => undefined);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleReset, settings.advancedMode]);

  return (
    <main className="app-shell" style={{ backgroundColor: surface.background }}>
      <Scene
        advancedMode={settings.advancedMode}
        autoRecenterEnabled={settings.autoRecenterEnabled}
        cameraGesturesEnabled={settings.cameraGesturesEnabled}
        cameraView={effectiveCameraView}
        diceAppearance={diceAppearance}
        diceCount={settings.diceCount}
        diceType={effectiveDiceType}
        impactEffectsEnabled={
          settings.advancedMode && settings.impactEffectsEnabled
        }
        lightingPreset={lightingPreset}
        lockedDice={lockedDice}
        physicsProfile={physicsProfile}
        resetKey={resetKey}
        surface={surface}
        throwPower={settings.advancedMode ? settings.throwPower : 1}
        onGrab={handleGrab}
        onImpact={handleImpact}
        onThrowStart={handleThrowStart}
        onSettle={handleSettle}
      />
      <MinimalUI
        faces={faces}
        history={history}
        lockedDice={lockedDice}
        rollingDice={rollingDice}
        resultRevision={resultRevision}
        settings={settings}
        throwRevision={throwRevision}
        physicsProfiles={physicsProfileOptions}
        selectedPhysicsProfileId={physicsProfileId}
        onPhysicsProfileChange={handlePhysicsProfileChange}
        onReset={handleReset}
        onClearHistory={() => setHistory([])}
        onSettingsChange={handleSettingsChange}
        onToggleLock={handleToggleLock}
      />
    </main>
  );
}
