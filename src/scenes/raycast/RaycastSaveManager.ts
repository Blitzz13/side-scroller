import { RaycastWeaponType } from "../../enums/RaycastWeaponType";
import { RaycastPlayerController } from "./RaycastPlayerController";

export interface IRaycastPlayerSave {
  health: number;
  maxHealth: number;
  shield: number;
  maxShield: number;
  equippedWeapon: RaycastWeaponType | null;
  ammo: number;
  weapons: Array<{ type: RaycastWeaponType; ammo: number }>;
  keycards: string[];
}

export interface IRaycastSaveData {
  currentLevel: string;
  previousLevel?: string;
  nextLevel?: string;
  completedLevels: string[];
  player: IRaycastPlayerSave;
  securedKeycards?: string[];
  enemiesKilled?: number;
  totalEnemies?: number;
  timestamp: number;
}

export class RaycastSaveManager {
  public static readonly STORAGE_KEY = "star_wars_raycast_save";

  /**
   * Saves player progress and level advancement to localStorage.
   */
  public static saveProgress(
    completedLevel: string,
    nextLevel?: string,
    playerController?: RaycastPlayerController,
    enemiesKilled: number = 0,
    totalEnemies: number = 0
  ): IRaycastSaveData | null {
    try {
      const prevSave = this.loadProgress();
      const completedSet = new Set<string>(prevSave?.completedLevels || []);
      if (completedLevel) {
        completedSet.add(completedLevel);
      }

      let playerSave: IRaycastPlayerSave;
      if (playerController) {
        playerSave = playerController.getStateSnapshot();
      } else if (prevSave) {
        playerSave = { ...prevSave.player };
      } else {
        playerSave = {
          health: 100,
          maxHealth: 100,
          shield: 0,
          maxShield: 100,
          equippedWeapon: RaycastWeaponType.DH17,
          ammo: 30,
          weapons: [{ type: RaycastWeaponType.DH17, ammo: 30 }],
          keycards: [],
        };
      }

      // Preserve keycards from the completed level for debriefing screen,
      // but reset keycards for the next level as requested.
      const securedKeycards = [...(playerSave.keycards || [])];
      playerSave.keycards = [];

      // The new active currentLevel becomes nextLevel so resuming/starting the game enters the new level
      const newCurrentLevel = nextLevel || completedLevel;

      const saveData: IRaycastSaveData = {
        currentLevel: newCurrentLevel,
        previousLevel: completedLevel,
        nextLevel,
        completedLevels: Array.from(completedSet),
        player: playerSave,
        securedKeycards,
        enemiesKilled,
        totalEnemies,
        timestamp: Date.now(),
      };

      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(saveData));
      console.log("[RaycastSaveManager] Saved progress to localStorage:", saveData);
      return saveData;
    } catch (err) {
      console.warn("[RaycastSaveManager] Failed to save progress to localStorage:", err);
      return null;
    }
  }

  /**
   * Loads saved progress from localStorage.
   */
  public static loadProgress(): IRaycastSaveData | null {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw) as IRaycastSaveData;
      if (!data || !data.currentLevel || !data.player) return null;
      return data;
    } catch (err) {
      console.warn("[RaycastSaveManager] Failed to load progress from localStorage:", err);
      return null;
    }
  }

  /**
   * Returns true if a valid save exists in localStorage.
   */
  public static hasSave(): boolean {
    return this.loadProgress() !== null;
  }

  /**
   * Clears saved progress from localStorage.
   */
  public static clearSave(): void {
    try {
      localStorage.removeItem(this.STORAGE_KEY);
      console.log("[RaycastSaveManager] Cleared save data from localStorage");
    } catch (err) {
      console.warn("[RaycastSaveManager] Failed to clear save data:", err);
    }
  }

  /**
   * Returns the current level to load, defaulting to level1 if not saved.
   */
  public static getCurrentLevel(): string {
    const save = this.loadProgress();
    return save?.currentLevel || "level1";
  }

  /**
   * Returns the next target level if available.
   */
  public static getNextLevel(): string | undefined {
    const save = this.loadProgress();
    return save?.nextLevel;
  }

  /**
   * Sets the current and next level in localStorage without overwriting other player data.
   */
  public static setCurrentLevel(level: string): void {
    const save = this.loadProgress();
    if (save) {
      save.currentLevel = level;
      save.nextLevel = level;
      try {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(save));
      } catch {}
    }
  }

  /**
   * Applies the saved player state (health, shield, weapons, ammo, keycards) to a player controller.
   */
  public static applySaveToPlayer(playerController: RaycastPlayerController): boolean {
    const save = this.loadProgress();
    if (!save || !save.player) return false;
    playerController.restoreState(save.player);
    console.log("[RaycastSaveManager] Restored player state:", save.player);
    return true;
  }
}
