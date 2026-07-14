import { RotateCcw, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { PhysicsProfile, PhysicsProfileId } from "../physics/config";
import {
  AppSettings,
  diceAppearanceOptions,
  diceCountOptions,
  surfaceOptions,
} from "../settings/config";

// The preset selector was a temporary calibration tool. Keep the code dormant so it
// can be re-enabled for future physics tuning without rebuilding the UI from scratch.
const SHOW_PHYSICS_PRESET_SELECTOR = false;

type MinimalUIProps = {
  faces: readonly (number | null)[];
  rollingDice: readonly boolean[];
  settings: AppSettings;
  physicsProfiles: readonly PhysicsProfile[];
  selectedPhysicsProfileId: PhysicsProfileId;
  onPhysicsProfileChange: (profileId: PhysicsProfileId) => void;
  onReset: () => void;
  onSettingsChange: (patch: Partial<Omit<AppSettings, "version">>) => void;
  onSettingsVisibilityChange: () => void;
};

export function MinimalUI({
  faces,
  rollingDice,
  settings,
  physicsProfiles,
  selectedPhysicsProfileId,
  onPhysicsProfileChange,
  onReset,
  onSettingsChange,
  onSettingsVisibilityChange,
}: MinimalUIProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
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

  return (
    <div className="ui-layer" aria-label="Dice controls">
      <div className="topbar">
        <div className="face-readout" aria-live="polite">
          <span>{label}</span>
          {isMultiDice ? (
            <span className="dice-total">Somme : {totalLabel}</span>
          ) : null}
        </div>
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
              onSettingsVisibilityChange();
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
            className="settings-panel"
            id="settings-panel"
          >
            <fieldset className="setting-group">
              <legend>Dé</legend>
              <div className="swatch-options">
                {diceAppearanceOptions.map((appearance) => (
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
            <fieldset className="setting-group">
              <legend>Plateau</legend>
              <div className="swatch-options">
                {surfaceOptions.map((surface) => (
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
            <fieldset className="setting-group">
              <legend>Des</legend>
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
            <p className="settings-note">Sauvegarde locale automatique</p>
          </section>
        ) : null}
      </div>
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
      <p className="help-text">
        {isMultiDice
          ? "Espace pour lancer · Espace à nouveau pour relancer"
          : "Glissez puis relâchez, ou appuyez sur Espace"}
      </p>
    </div>
  );
}
