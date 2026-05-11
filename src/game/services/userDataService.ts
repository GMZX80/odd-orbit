import type { RunResult } from "../systems/runTypes";
import type { StorageAdapter } from "./localStorageAdapter";

export interface PlayerProfile {
  id: string;
  displayName: string;
  coins: number;
  totalRuns: number;
  successfulRuns: number;
  artefacts: string[];
  ship: {
    name: string;
    hullLevel: number;
    fuelLevel: number;
  };
  settings: {
    reducedMotion: boolean;
  };
}

const defaultProfile: PlayerProfile = {
  id: "local-captain",
  displayName: "Captain Maybe",
  coins: 0,
  totalRuns: 0,
  successfulRuns: 0,
  artefacts: [],
  ship: {
    name: "S.S. Questionable",
    hullLevel: 1,
    fuelLevel: 1
  },
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
      const artefacts = new Set([...profile.artefacts, ...result.artefacts]);
      const next: PlayerProfile = {
        ...profile,
        coins: profile.coins + result.coins,
        totalRuns: profile.totalRuns + 1,
        successfulRuns: profile.successfulRuns + (result.status === "arrived" ? 1 : 0),
        artefacts: [...artefacts]
      };
      storage.write(key, next);
      return next;
    }
  };
}
