import { utils } from "pixi.js";
import { sound } from "@pixi/sound";
import { ITriggerZone, IMissionManagerCallbacks } from "./ObjectiveTypes";
import { RaycastObjectiveManager } from "./RaycastObjectiveManager";

export class RaycastTriggerManager extends utils.EventEmitter {
  private triggers: ITriggerZone[] = [];
  private currentLevel: string = "";
  private callbacks: IMissionManagerCallbacks;
  private objectiveManager: RaycastObjectiveManager;
  private currentInsideInteractiveTrigger: ITriggerZone | null = null;
  private currentPlayingSoundInstance: any = null;
  private currentHtmlAudio: HTMLAudioElement | null = null;

  constructor(
    objectiveManager: RaycastObjectiveManager,
    callbacks: IMissionManagerCallbacks = {}
  ) {
    super();
    this.objectiveManager = objectiveManager;
    this.callbacks = callbacks;
  }

  public parseMapTriggers(
    mapData: any,
    levelName: string,
    offsetX: number = 0,
    offsetY: number = 0
  ): void {
    this.triggers = [];
    this.currentLevel = levelName.replace(/\.json$/i, "").toLowerCase();
    this.currentInsideInteractiveTrigger = null;

    if (!mapData || !mapData.layers) return;

    const tileW = mapData.tilewidth || 64;
    const tileH = mapData.tileheight || 64;

    const allLayers: any[] = [];
    const collectLayers = (layers: any[]) => {
      layers.forEach((l) => {
        allLayers.push(l);
        if (l.layers) collectLayers(l.layers);
      });
    };
    collectLayers(mapData.layers);

    for (const layer of allLayers) {
      if (!layer.objects || !Array.isArray(layer.objects)) continue;

      for (const obj of layer.objects) {
        const objType = (obj.type || "").toLowerCase();
        const hasTriggerProps =
          obj.properties &&
          obj.properties.some((p: any) => {
            const pName = (p.name || "").toLowerCase();
            return (
              pName === "voicelinesontrigger" ||
              pName === "trigerevent" ||
              pName === "triggerevent" ||
              pName === "shouldbepressed" ||
              pName === "triggeralarm"
            );
          });

        if (objType !== "triger" && objType !== "trigger" && !hasTriggerProps) {
          continue;
        }

        let event: "onEnter" | "onExit" = "onEnter";
        let shouldBePressed = false;
        let triggerAlarm = false;
        let voicelines: string[] = [];
        let isObjective = false;
        let objectiveKey = "";

        if (obj.properties && Array.isArray(obj.properties)) {
          for (const prop of obj.properties) {
            const pName = (prop.name || "").toLowerCase();
            if (pName === "trigerevent" || pName === "triggerevent") {
              const val = String(prop.value || "").toLowerCase();
              if (val.includes("exit")) {
                event = "onExit";
              } else {
                event = "onEnter";
              }
            } else if (pName === "shouldbepressed") {
              shouldBePressed = Boolean(prop.value);
            } else if (pName === "triggeralarm") {
              triggerAlarm = Boolean(prop.value);
            } else if (pName === "voicelinesontrigger") {
              if (Array.isArray(prop.value)) {
                for (const item of prop.value) {
                  if (typeof item === "string" && item.trim()) {
                    voicelines.push(item.trim());
                  } else if (item && typeof item === "object" && item.value) {
                    voicelines.push(String(item.value).trim());
                  }
                }
              } else if (typeof prop.value === "string" && prop.value.trim()) {
                voicelines.push(prop.value.trim());
              }
            } else if (
              pName === "objective" &&
              prop.value &&
              typeof prop.value === "object"
            ) {
              if (prop.value.isObjective !== undefined) {
                isObjective = Boolean(prop.value.isObjective);
              }
              if (prop.value.objectiveKey !== undefined) {
                objectiveKey = String(prop.value.objectiveKey).trim();
              }
            } else if (pName === "isobjective") {
              isObjective = Boolean(prop.value);
            } else if (pName === "objectivekey") {
              objectiveKey = String(prop.value).trim();
            }
          }
        }

        const objW = obj.width || tileW;
        const objH = obj.height || tileH;

        // Rectangle objects in Tiled: (x, y) is top-left
        let minX = obj.x / tileW + offsetX;
        let maxX = (obj.x + objW) / tileW + offsetX;
        let minY = obj.y / tileH + offsetY;
        let maxY = (obj.y + objH) / tileH + offsetY;

        if (minX > maxX) [minX, maxX] = [maxX, minX];
        if (minY > maxY) [minY, maxY] = [maxY, minY];

        const triggerZone: ITriggerZone = {
          id: obj.id,
          name: obj.name || `trigger_${obj.id}`,
          minX,
          maxX,
          minY,
          maxY,
          event,
          shouldBePressed,
          triggerAlarm,
          voicelines,
          objectiveKey,
          isObjective,
          hasTriggered: false,
          isPlayerInside: false,
        };

        this.triggers.push(triggerZone);
      }
    }

    // Preload voice lines for all triggers in this level
    for (const trigger of this.triggers) {
      if (trigger.voicelines && trigger.voicelines.length > 0) {
        for (const line of trigger.voicelines) {
          const clean = line.replace(/\.mp3$/i, "").trim();
          const alias = `dialog_${this.currentLevel}_${clean}`;
          const soundUrl = `./assets/raycast/dialog/${this.currentLevel}/${clean}.mp3`;
          if (!sound.exists(alias)) {
            try {
              sound.add(alias, { url: soundUrl, preload: true });
            } catch {}
          }
        }
      }
    }
  }

  public update(playerX: number, playerY: number): void {
    let activeInteractiveInside: ITriggerZone | null = null;

    for (const trigger of this.triggers) {
      const isInside =
        playerX >= trigger.minX &&
        playerX <= trigger.maxX &&
        playerY >= trigger.minY &&
        playerY <= trigger.maxY;

      const wasInside = trigger.isPlayerInside;
      trigger.isPlayerInside = isInside;

      if (!wasInside && isInside) {
        // Player entered trigger zone
        if (trigger.event === "onEnter" && !trigger.hasTriggered) {
          if (!trigger.shouldBePressed) {
            this.fireTrigger(trigger);
          }
        }
      } else if (wasInside && !isInside) {
        // Player exited trigger zone
        if (trigger.event === "onExit" && !trigger.hasTriggered) {
          if (!trigger.shouldBePressed) {
            this.fireTrigger(trigger);
          }
        }
      }

      if (isInside && trigger.shouldBePressed && !trigger.hasTriggered) {
        activeInteractiveInside = trigger;
      }
    }

    // Update HUD interaction prompt
    if (activeInteractiveInside !== this.currentInsideInteractiveTrigger) {
      this.currentInsideInteractiveTrigger = activeInteractiveInside;
      if (this.currentInsideInteractiveTrigger) {
        const promptText = this.currentInsideInteractiveTrigger.isObjective
          ? "[E] PRESS [E] TO FINISH OBJECTIVE"
          : "[E] PRESS [E] TO INTERACT";
        this.callbacks.showPrompt?.(promptText);
      } else {
        this.callbacks.hidePrompt?.();
      }
    }
  }

  public getActivePromptText(): string | null {
    if (
      this.currentInsideInteractiveTrigger &&
      !this.currentInsideInteractiveTrigger.hasTriggered
    ) {
      if (this.currentInsideInteractiveTrigger.isObjective) {
        return "[E] PRESS [E] TO FINISH OBJECTIVE";
      }
      return "[E] PRESS [E] TO INTERACT";
    }
    return null;
  }

  public handleInteract(): boolean {
    if (
      this.currentInsideInteractiveTrigger &&
      !this.currentInsideInteractiveTrigger.hasTriggered
    ) {
      const trigger = this.currentInsideInteractiveTrigger;
      this.fireTrigger(trigger);
      this.currentInsideInteractiveTrigger = null;
      this.callbacks.hidePrompt?.();
      return true;
    }
    return false;
  }

  private fireTrigger(trigger: ITriggerZone): void {
    if (trigger.hasTriggered) return;
    trigger.hasTriggered = true;

    // 1. Play Voice lines
    if (trigger.voicelines && trigger.voicelines.length > 0) {
      for (const line of trigger.voicelines) {
        this.playVoiceline(line);
      }
    }

    // 2. Trigger Alarm if requested
    if (trigger.triggerAlarm) {
      this.callbacks.onTriggerAlarm?.();
    }

    // 3. Mark linked objective complete
    if (trigger.isObjective && trigger.objectiveKey) {
      this.objectiveManager.completeObjective(trigger.objectiveKey);
    }

    this.emit("triggerFired", trigger);
  }

  private stopCurrentVoiceline(): void {
    if (this.currentPlayingSoundInstance) {
      try {
        this.currentPlayingSoundInstance.stop?.();
      } catch {}
      this.currentPlayingSoundInstance = null;
    }
    if (this.currentHtmlAudio) {
      try {
        this.currentHtmlAudio.pause();
        this.currentHtmlAudio.currentTime = 0;
      } catch {}
      this.currentHtmlAudio = null;
    }
  }

  private playVoiceline(filename: string): void {
    if (!filename) return;
    const cleanName = filename.replace(/\.mp3$/i, "").trim();
    const alias = `dialog_${this.currentLevel}_${cleanName}`;
    const soundUrl = `./assets/raycast/dialog/${this.currentLevel}/${cleanName}.mp3`;

    this.stopCurrentVoiceline();

    const playWithHtmlAudio = () => {
      try {
        const audio = new Audio(soundUrl);
        audio.volume = 0.9;
        this.currentHtmlAudio = audio;
        audio.play().catch(() => {});
        audio.onended = () => {
          if (this.currentHtmlAudio === audio) {
            this.currentHtmlAudio = null;
          }
        };
      } catch (err) {
        console.warn(`[RaycastTriggerManager] HTML5 Audio fallback failed for ${soundUrl}:`, err);
      }
    };

    try {
      if (sound.exists(alias)) {
        const s = sound.find(alias);
        if (s && s.isLoaded) {
          const res = sound.play(alias, { volume: 0.9 });
          if (res && typeof (res as any).then === "function") {
            (res as any)
              .then((inst: any) => {
                this.currentPlayingSoundInstance = inst;
              })
              .catch(() => {});
          } else {
            this.currentPlayingSoundInstance = res;
          }
        } else {
          playWithHtmlAudio();
        }
      } else {
        // Preload via Pixi sound for future plays and immediately play with HTML5 Audio to avoid buffer race
        try {
          sound.add(alias, {
            url: soundUrl,
            preload: true,
          });
        } catch {}
        playWithHtmlAudio();
      }
    } catch (e) {
      playWithHtmlAudio();
    }
  }

  public getTriggers(): ITriggerZone[] {
    return this.triggers;
  }

  public dispose(): void {
    this.stopCurrentVoiceline();
    this.triggers = [];
    this.currentInsideInteractiveTrigger = null;
    this.removeAllListeners();
  }
}
