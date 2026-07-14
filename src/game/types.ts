import { DiceTypeId } from "../settings/config";

export type RollHistoryEntry = {
  faces: readonly number[];
  id: number;
  total: number;
  type: DiceTypeId;
};

