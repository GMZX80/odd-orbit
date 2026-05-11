import type { RunResult } from "../systems/runTypes";
import type { StorageAdapter } from "./localStorageAdapter";

export interface PlayerProfile {
  id: string;
  displayName: string;
  bestUnits: number;
  totalRuns: number;
  successfulRuns: number;
  settings: {
    reducedMotion: boolean;
  };
}

const defaultProfile: PlayerProfile = {
  id: "local-captain",
  displayName: "Captain Maybe",
  bestUnits: 1,
  totalRuns: 0,
  successfulRuns: 0,
  settings: {
    reducedMotion: false
  }
};

export interface UserDataService {
  getProfile(userId: string): Promise<PlayerProfile>;
  applyRunResult(userId: string, result: RunResult): Promise<PlayerProfile>;
}

export function createUserDataService(storage: StorageAdapter): UserDataService {
  const key = "player-profile";

  return {
    async getProfile(userId: string) {
      const saved = storage.read<PlayerProfile>(key, defaultProfile);
      return saved.id === userId ? saved : { ...defaultProfile, id: userId };
    },

    async applyRunResult(userId: string, result: RunResult) {
      const profile = await this.getProfile(userId);
      const next: PlayerProfile = {
        ...profile,
        bestUnits: Math.max(profile.bestUnits, result.units),
        totalRuns: profile.totalRuns + 1,
        successfulRuns: profile.successfulRuns + (result.status === "complete" ? 1 : 0)
      };
      storage.write(key, next);
      return next;
    }
  };
}
