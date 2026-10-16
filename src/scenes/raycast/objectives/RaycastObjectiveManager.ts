import { Assets, utils } from "pixi.js";
import { ILevelObjective, IMissionManagerCallbacks } from "./ObjectiveTypes";

export class RaycastObjectiveManager extends utils.EventEmitter {
  private objectives: ILevelObjective[] = [];
  private currentLevel: string = "";
  private callbacks: IMissionManagerCallbacks;

  constructor(callbacks: IMissionManagerCallbacks = {}) {
    super();
    this.callbacks = callbacks;
  }

  public async loadObjectives(levelName: string): Promise<void> {
    this.currentLevel = levelName;
    this.objectives = [];

    const cleanLevel = levelName.replace(/\.json$/i, "").toLowerCase();
    const possiblePaths = [
      `${cleanLevel}_objectives`,
      `assets/raycast/levels/objectives/${cleanLevel}.json`,
      `./assets/raycast/levels/objectives/${cleanLevel}.json`,
      `assets/raycast/levels/objectives/${levelName}.json`,
    ];

    let rawData: any = null;

    // 1. Try Assets cache / load
    for (const path of possiblePaths) {
      try {
        if (Assets.cache.has(path)) {
          rawData = Assets.cache.get(path);
          if (rawData) break;
        }
        rawData = await Assets.load(path);
        if (rawData) break;
      } catch {
        // Continue to next path
      }
    }

    // 2. Fallback to fetch if Assets loader failed or returned non-array
    if (!rawData || !Array.isArray(rawData)) {
      for (const path of possiblePaths) {
        try {
          const resp = await fetch(path);
          if (resp.ok) {
            const json = await resp.json();
            if (Array.isArray(json) || (json && json.objectives)) {
              rawData = json;
              break;
            }
          }
        } catch {
          // Continue
        }
      }
    }

    // Normalize raw data into ILevelObjective[]
    const list: any[] = Array.isArray(rawData)
      ? rawData
      : Array.isArray(rawData?.objectives)
      ? rawData.objectives
      : [];

    this.objectives = list.map((item, index) => {
      const key = String(item.key || item.id || item.objectiveKey || `obj_${index}`).trim();
      const title = String(item.title || item.name || item.text || key).trim();
      const description = String(item.description || item.desc || item.details || "").trim();
      const isOptional = Boolean(item.isOptional || item.optional);
      return {
        id: key,
        key: key,
        title: title,
        description: description,
        isCompleted: Boolean(item.isCompleted || item.completed),
        isOptional,
      };
    });

    this.emit("objectivesLoaded", this.objectives);
  }

  /**
   * Returns all objectives that should be visible to the player.
   * Rule: All completed objectives are visible, PLUS the single currently active objective.
   * Future objectives are NOT visible until the current one is completed.
   */
  public getVisibleObjectives(): ILevelObjective[] {
    const visible: ILevelObjective[] = [];
    let foundFirstIncomplete = false;

    for (const obj of this.objectives) {
      if (obj.isCompleted) {
        visible.push(obj);
      } else if (!foundFirstIncomplete) {
        visible.push(obj);
        foundFirstIncomplete = true;
      }
      // Subsequent incomplete objectives remain hidden
    }

    return visible;
  }

  public getAllObjectives(): ILevelObjective[] {
    return this.objectives;
  }

  public getCurrentActiveObjective(): ILevelObjective | null {
    return this.objectives.find((o) => !o.isCompleted) || null;
  }

  public isAllCompleted(): boolean {
    return this.objectives.length > 0 && this.objectives.every((o) => o.isCompleted);
  }

  public areAllObjectivesCompleted(): boolean {
    return this.objectives.length === 0 || this.objectives.every((o) => o.isCompleted);
  }

  /**
   * Returns true if player is allowed to finish the level.
   * If there is at most 1 mandatory objective remaining (the last one) or 0 remaining,
   * finishing the last objective is optional and exiting is allowed.
   */
  public canExitLevel(): boolean {
    if (this.objectives.length === 0) return true;
    const remainingMandatory = this.objectives.filter(
      (o) => !o.isCompleted && !o.isOptional
    );
    return remainingMandatory.length <= 1;
  }

  /**
   * Completes any remaining incomplete objectives upon exiting the level.
   */
  public completeRemainingObjectives(): void {
    for (const obj of this.objectives) {
      if (!obj.isCompleted) {
        obj.isCompleted = true;
      }
    }
    this.emit("objectivesUpdated", this.getVisibleObjectives());
  }

  public hasObjectives(): boolean {
    return this.objectives.length > 0;
  }

  public completeObjective(key: string): boolean {
    if (!key) return false;
    const cleanKey = key.trim().toLowerCase();

    const target = this.objectives.find(
      (o) => o.key.toLowerCase() === cleanKey || o.id.toLowerCase() === cleanKey
    );

    if (target && !target.isCompleted) {
      target.isCompleted = true;

      // Show HUD toast for completion
      if (this.callbacks.showToast) {
        this.callbacks.showToast(`[✓] OBJECTIVE COMPLETED: ${target.title}`, 0x00ff88, 3.5);
      }

      const nextActive = this.getCurrentActiveObjective();
      if (nextActive && this.callbacks.showToast) {
        setTimeout(() => {
          this.callbacks.showToast?.(`[►] NEW OBJECTIVE: ${nextActive.title}`, 0x00e5ff, 4.0);
        }, 1200);
      } else if (!nextActive && this.isAllCompleted() && this.callbacks.showToast) {
        setTimeout(() => {
          this.callbacks.showToast?.(`[★] ALL OBJECTIVES COMPLETED! PROCEED TO EXTRACTION`, 0xffaa00, 4.5);
        }, 1200);
      }

      this.emit("objectiveCompleted", target);
      this.emit("objectivesUpdated", this.getVisibleObjectives());
      return true;
    }

    return false;
  }

  public getCurrentLevelName(): string {
    return this.currentLevel;
  }
}
