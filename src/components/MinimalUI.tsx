import { RotateCcw } from "lucide-react";
import { PhysicsProfile, PhysicsProfileId } from "../physics/config";

// The preset selector was a temporary calibration tool. Keep the code dormant so it
// can be re-enabled for future physics tuning without rebuilding the UI from scratch.
const SHOW_PHYSICS_PRESET_SELECTOR = false;

type MinimalUIProps = {
  face: number | null;
  isRolling: boolean;
  physicsProfiles: readonly PhysicsProfile[];
  selectedPhysicsProfileId: PhysicsProfileId;
  onPhysicsProfileChange: (profileId: PhysicsProfileId) => void;
  onReset: () => void;
};

export function MinimalUI({
  face,
  isRolling,
  physicsProfiles,
  selectedPhysicsProfileId,
  onPhysicsProfileChange,
  onReset,
}: MinimalUIProps) {
  const label = face ? `Face: ${face}` : isRolling ? "Face: ..." : "Face: -";

  return (
    <div className="ui-layer" aria-label="Dice controls">
      <div className="topbar">
        <div className="face-readout" aria-live="polite">
          {label}
        </div>
        <button className="reset-button" onClick={onReset} type="button">
          <RotateCcw aria-hidden="true" size={15} strokeWidth={1.9} />
          Reset
        </button>
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
      <p className="help-text">Drag and release to throw</p>
    </div>
  );
}
