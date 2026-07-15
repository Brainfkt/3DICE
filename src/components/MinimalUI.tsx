import {
  Lock,
  LockOpen,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { RollHistoryEntry } from "../game/types";
import {
  keyboardThrowPowerConfig,
  PhysicsProfile,
  PhysicsProfileId,
} from "../physics/config";
import {
  AppSettings,
  cameraViewOptions,
  diceAppearanceOptions,
  diceCountOptions,
  diceTypeOptions,
  lightingPresetOptions,
  surfaceOptions,
} from "../settings/config";

// The preset selector was a temporary calibration tool. Keep the code dormant so it
// can be re-enabled for future physics tuning without rebuilding the UI from scratch.
const SHOW_PHYSICS_PRESET_SELECTOR = false;
const HELP_IDLE_TIMEOUT_MS = 10_000;
const STANDARD_OPTION_COUNT = 4;

function SpaceKey() {
  return <kbd className="space-key">Espace</kbd>;
}

function SettingToggle({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      aria-checked={checked}
      className="setting-toggle"
      onClick={() => onChange(!checked)}
      role="switch"
      type="button"
    >
      <span>{label}</span>
      <span aria-hidden="true" className="setting-toggle-track">
        <span className="setting-toggle-knob" />
      </span>
    </button>
  );
}

type MinimalUIProps = {
  faces: readonly (number | null)[];
  history: readonly RollHistoryEntry[];
  lockedDice: readonly boolean[];
  rollingDice: readonly boolean[];
  resultRevision: number;
  settings: AppSettings;
  throwRevision: number;
  physicsProfiles: readonly PhysicsProfile[];
  selectedPhysicsProfileId: PhysicsProfileId;
  onPhysicsProfileChange: (profileId: PhysicsProfileId) => void;
  onReset: () => void;
  onClearHistory: () => void;
  onSettingsChange: (patch: Partial<Omit<AppSettings, "version">>) => void;
  onToggleLock: (diceIndex: number) => void;
};

export function MinimalUI({
  faces,
  history,
  lockedDice,
  rollingDice,
  resultRevision,
  settings,
  throwRevision,
  physicsProfiles,
  selectedPhysicsProfileId,
  onPhysicsProfileChange,
  onReset,
  onClearHistory,
  onSettingsChange,
  onToggleLock,
}: MinimalUIProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpVisible, setHelpVisible] = useState(true);
  const results = faces.map((face, index) =>
    rollingDice[index] ? "…" : face ?? "–",
  );
  const label =
    results.length === 1
      ? `Face: ${results[0]}`
      : `Faces: ${results.join(" · ")}`;
  const isMultiDice = faces.length > 1;
  const isAnyDieRolling = rollingDice.some(Boolean);
  const hasCompleteResult = faces.every((face) => face !== null);
  const totalLabel = isAnyDieRolling
    ? "…"
    : hasCompleteResult
      ? String(faces.reduce<number>((total, face) => total + (face ?? 0), 0))
      : "–";
  const unlockedCount = lockedDice.filter((locked) => !locked).length;
  const shouldAnimateResult =
    settings.advancedMode &&
    settings.resultAnimationEnabled &&
    hasCompleteResult &&
    !isAnyDieRolling &&
    resultRevision > 0;
  const appearanceOptions = settings.advancedMode
    ? diceAppearanceOptions
    : diceAppearanceOptions.slice(0, STANDARD_OPTION_COUNT);
  const availableSurfaces = settings.advancedMode
    ? surfaceOptions
    : surfaceOptions.slice(0, STANDARD_OPTION_COUNT);
  const throwPowerPercent = Math.round(settings.throwPower * 100);
  const throwPowerPosition =
    ((settings.throwPower - keyboardThrowPowerConfig.min) /
      (keyboardThrowPowerConfig.max - keyboardThrowPowerConfig.min)) *
    100;

  useEffect(() => {
    if (throwRevision === 0) return;

    setHelpVisible(false);
    const timeoutId = window.setTimeout(() => {
      setHelpVisible(true);
    }, HELP_IDLE_TIMEOUT_MS);

    return () => window.clearTimeout(timeoutId);
  }, [throwRevision]);

  const appearanceControls = (
    <fieldset className="setting-group">
      <legend>Dé</legend>
      <div className="swatch-options swatch-options-wrap">
        {appearanceOptions.map((appearance) => (
          <button
            key={appearance.id}
            aria-label={appearance.label}
            aria-pressed={settings.diceAppearanceId === appearance.id}
            className="swatch-button"
            onClick={() =>
              onSettingsChange({ diceAppearanceId: appearance.id })
            }
            style={{ backgroundColor: appearance.bodyColor }}
            title={appearance.label}
            type="button"
          />
        ))}
      </div>
    </fieldset>
  );

  const surfaceControls = (
    <fieldset className="setting-group">
      <legend>Plateau</legend>
      <div className="swatch-options swatch-options-wrap">
        {availableSurfaces.map((surface) => (
          <button
            key={surface.id}
            aria-label={surface.label}
            aria-pressed={settings.surfaceId === surface.id}
            className="swatch-button surface-swatch"
            onClick={() => onSettingsChange({ surfaceId: surface.id })}
            style={{
              background: `linear-gradient(135deg, ${surface.background} 0 48%, ${surface.floor} 52% 100%)`,
            }}
            title={surface.label}
            type="button"
          />
        ))}
      </div>
    </fieldset>
  );

  const countControls = (
    <fieldset className="setting-group">
      <legend>Dés</legend>
      <div className="segment-options dice-count-options">
        {diceCountOptions.map((count) => (
          <button
            key={count}
            aria-label={`${count} dé${count > 1 ? "s" : ""}`}
            aria-pressed={settings.diceCount === count}
            onClick={() => onSettingsChange({ diceCount: count })}
            type="button"
          >
            {count}
          </button>
        ))}
      </div>
    </fieldset>
  );

  return (
    <div className="ui-layer" aria-label="Dice controls">
      <div className="topbar">
        <div
          key={resultRevision}
          className={`face-readout ${shouldAnimateResult ? "result-pop" : ""}`}
          aria-live="polite"
        >
          <span>{label}</span>
          {isMultiDice ? (
            <span className="dice-total">Somme : {totalLabel}</span>
          ) : null}
          {settings.advancedMode ? (
            <span className="advanced-status">
              {settings.diceType}
            </span>
          ) : null}
        </div>
        {settings.advancedMode &&
        isMultiDice &&
        hasCompleteResult &&
        !isAnyDieRolling ? (
          <div className="lock-strip" aria-label="Verrouiller des dés">
            {faces.map((face, index) => {
              const locked = lockedDice[index] ?? false;
              const cannotLock = !locked && unlockedCount <= 1;
              return (
                <button
                  key={index}
                  aria-label={`${locked ? "Déverrouiller" : "Verrouiller"} le dé ${index + 1}`}
                  aria-pressed={locked}
                  disabled={cannotLock}
                  onClick={(event) => {
                    onToggleLock(index);
                    event.currentTarget.blur();
                  }}
                  title={
                    cannotLock
                      ? "Au moins un dé doit rester relançable"
                      : `${locked ? "Déverrouiller" : "Verrouiller"} ${face}`
                  }
                  type="button"
                >
                  {locked ? (
                    <Lock aria-hidden="true" size={11} />
                  ) : (
                    <LockOpen aria-hidden="true" size={11} />
                  )}
                  {face}
                </button>
              );
            })}
          </div>
        ) : null}
        {settings.advancedMode && settings.historyEnabled && history.length > 0 ? (
          <aside className="history-strip" aria-label="Derniers lancers">
            <div className="history-title">
              <span>Historique</span>
              <button
                aria-label="Effacer l’historique"
                onClick={onClearHistory}
                title="Effacer"
                type="button"
              >
                <Trash2 aria-hidden="true" size={12} />
              </button>
            </div>
            <ol>
              {history.slice(0, 5).map((entry) => (
                <li key={entry.id}>
                  <span>{entry.type}</span>
                  <span>{entry.faces.join(" + ")}</span>
                  <strong>{entry.total}</strong>
                </li>
              ))}
            </ol>
          </aside>
        ) : null}
      </div>

      <div className="settings-cluster">
        <div className="settings-actions">
          <button
            aria-label="Réinitialiser"
            className="reset-button"
            onClick={(event) => {
              onReset();
              event.currentTarget.blur();
            }}
            title="Réinitialiser"
            type="button"
          >
            <RotateCcw aria-hidden="true" size={17} strokeWidth={1.9} />
          </button>
          <button
            aria-controls="settings-panel"
            aria-expanded={settingsOpen}
            aria-label="Réglages"
            className="settings-button"
            onClick={(event) => {
              const isClosing = settingsOpen;
              setSettingsOpen(!settingsOpen);
              if (isClosing) event.currentTarget.blur();
            }}
            type="button"
          >
            <SlidersHorizontal aria-hidden="true" size={17} strokeWidth={1.8} />
          </button>
        </div>

        {settingsOpen ? (
          <section
            aria-label="Réglages de la scène"
            className={`settings-panel ${settings.advancedMode ? "is-advanced" : ""}`}
            id="settings-panel"
          >
            <SettingToggle
              checked={settings.advancedMode}
              label="Mode avancé"
              onChange={(advancedMode) => onSettingsChange({ advancedMode })}
            />

            {settings.advancedMode ? (
              <div className="advanced-settings">
                <p className="advanced-intro">
                  Options enrichies et HUD contextuel.
                </p>

                <details open>
                  <summary>Apparence</summary>
                  <div className="advanced-section-content">
                    {appearanceControls}
                    {surfaceControls}
                    <fieldset className="setting-group setting-group-wide">
                      <legend>Lumière</legend>
                      <div className="segment-options lighting-options">
                        {lightingPresetOptions.map((preset) => (
                          <button
                            key={preset.id}
                            aria-pressed={settings.lightingPresetId === preset.id}
                            onClick={() =>
                              onSettingsChange({ lightingPresetId: preset.id })
                            }
                            title={preset.label}
                            type="button"
                          >
                            {preset.label.replace("Table ", "").replace("Studio ", "")}
                          </button>
                        ))}
                      </div>
                    </fieldset>
                  </div>
                </details>

                <details>
                  <summary>Dés</summary>
                  <div className="advanced-section-content">
                    <fieldset className="setting-group">
                      <legend>Type</legend>
                      <div className="segment-options die-type-options">
                        {diceTypeOptions.map((type) => (
                          <button
                            key={type.id}
                            aria-pressed={settings.diceType === type.id}
                            onClick={() => onSettingsChange({ diceType: type.id })}
                            type="button"
                          >
                            {type.label}
                          </button>
                        ))}
                      </div>
                    </fieldset>
                    {countControls}
                  </div>
                </details>

                <details>
                  <summary>Lancer et caméra</summary>
                  <div className="advanced-section-content toggle-stack">
                    <fieldset className="setting-group setting-group-wide">
                      <legend>Vue</legend>
                      <div className="segment-options">
                        {cameraViewOptions.map((view) => (
                          <button
                            key={view.id}
                            aria-pressed={settings.cameraView === view.id}
                            onClick={() => onSettingsChange({ cameraView: view.id })}
                            type="button"
                          >
                            {view.label}
                          </button>
                        ))}
                      </div>
                    </fieldset>
                    {settings.cameraView === "free" ? (
                      <>
                        <SettingToggle
                          checked={settings.autoRecenterEnabled}
                          label="Recentrage auto"
                          onChange={(autoRecenterEnabled) =>
                            onSettingsChange({ autoRecenterEnabled })
                          }
                        />
                        <SettingToggle
                          checked={settings.cameraGesturesEnabled}
                          label="Gestes caméra"
                          onChange={(cameraGesturesEnabled) =>
                            onSettingsChange({ cameraGesturesEnabled })
                          }
                        />
                      </>
                    ) : null}
                    <p className="shortcut-help">
                      <kbd>Espace</kbd> lancer · <kbd>R</kbd> reset · <kbd>F</kbd> plein écran
                    </p>
                  </div>
                </details>

                <details>
                  <summary>Retours</summary>
                  <div className="advanced-section-content toggle-stack">
                    <SettingToggle
                      checked={settings.audioEnabled}
                      label="Sons physiques"
                      onChange={(audioEnabled) => onSettingsChange({ audioEnabled })}
                    />
                    <SettingToggle
                      checked={settings.hapticsEnabled}
                      label="Vibrations"
                      onChange={(hapticsEnabled) => onSettingsChange({ hapticsEnabled })}
                    />
                    <SettingToggle
                      checked={settings.impactEffectsEnabled}
                      label="Effets de contact"
                      onChange={(impactEffectsEnabled) =>
                        onSettingsChange({ impactEffectsEnabled })
                      }
                    />
                    <SettingToggle
                      checked={settings.resultAnimationEnabled}
                      label="Animation du résultat"
                      onChange={(resultAnimationEnabled) =>
                        onSettingsChange({ resultAnimationEnabled })
                      }
                    />
                    <SettingToggle
                      checked={settings.historyEnabled}
                      label="Historique de session"
                      onChange={(historyEnabled) =>
                        onSettingsChange({ historyEnabled })
                      }
                    />
                  </div>
                </details>
              </div>
            ) : (
              <div className="standard-settings">
                {appearanceControls}
                {surfaceControls}
                {countControls}
              </div>
            )}
          </section>
        ) : null}
      </div>

      {settings.advancedMode && !settingsOpen ? (
        <label
          className="throw-power-gauge"
          style={
            {
              "--power-position": `${throwPowerPosition}%`,
            } as CSSProperties
          }
          title={`Puissance du lancer : ${throwPowerPercent} %`}
        >
          <span className="power-gauge-name">Puissance du lancer</span>
          <span className="power-gauge-shell">
            <span aria-hidden="true" className="power-gauge-track" />
            <input
              aria-label="Puissance du lancer clavier"
              aria-orientation="vertical"
              max={keyboardThrowPowerConfig.max}
              min={keyboardThrowPowerConfig.min}
              onChange={(event) =>
                onSettingsChange({
                  throwPower: Number(event.currentTarget.value),
                })
              }
              step={keyboardThrowPowerConfig.step}
              type="range"
              value={settings.throwPower}
            />
          </span>
          <output>{throwPowerPercent}<span aria-hidden="true">%</span></output>
        </label>
      ) : null}

      {SHOW_PHYSICS_PRESET_SELECTOR ? (
        <div className="preset-strip" aria-label="Drop presets">
          {physicsProfiles.map((profile) => (
            <button
              key={profile.id}
              aria-label={`Preset ${profile.label}: ${profile.name}`}
              aria-pressed={profile.id === selectedPhysicsProfileId}
              className="preset-button"
              onClick={() => onPhysicsProfileChange(profile.id)}
              title={`${profile.label} - ${profile.name}`}
              type="button"
            >
              {profile.label}
            </button>
          ))}
        </div>
      ) : null}

      <p
        aria-hidden={!helpVisible}
        className={`help-text ${helpVisible ? "is-visible" : "is-hidden"}`}
      >
        <span className="help-copy help-copy-desktop">
          {settings.cameraView === "top" || isMultiDice ? (
            <>
              <SpaceKey /> pour (re)lancer
            </>
          ) : (
            <>
              Glissez puis relâchez ou <SpaceKey />
            </>
          )}
        </span>
        <span className="help-copy help-copy-touch">
          {settings.cameraView === "top" || isMultiDice
            ? "Tapez sur l’écran pour (re)lancer"
            : "Glissez puis relâchez ou tapez sur l’écran pour lancer"}
        </span>
      </p>
    </div>
  );
}
