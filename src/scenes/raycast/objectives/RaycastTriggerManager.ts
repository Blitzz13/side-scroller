import { utils } from "pixi.js";
import { sound } from "@pixi/sound";
import { ITriggerZone, ITriggerSoundConfig, IMissionManagerCallbacks } from "./ObjectiveTypes";
import { RaycastObjectiveManager } from "./RaycastObjectiveManager";
import { extractLinkIds } from "../DestructableWall";

export class RaycastTriggerManager extends utils.EventEmitter {
  private triggers: ITriggerZone[] = [];
  private currentLevel: string = "";
  private callbacks: IMissionManagerCallbacks;
  private objectiveManager: RaycastObjectiveManager;
  private currentInsideInteractiveTrigger: ITriggerZone | null = null;
  private currentPlayingSoundInstance: any = null;
  private currentHtmlAudio: HTMLAudioElement | null = null;
  private currentVoiceKey: string | null = null;

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
        let displayMessage = "";
        let linkAction = "";
        let linkIds: string[] = [];
        let wait: { shouldWait: boolean; waitTimeInSeconds: number } | undefined = undefined;
        let soundOnTrigger: string[] = [];
        let triggerSound: ITriggerSoundConfig | undefined = undefined;

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
              pName === "soundontrigger" ||
              pName === "sound" ||
              pName === "sfx" ||
              pName === "audio"
            ) {
              if (
                pName === "sound" &&
                prop.value &&
                typeof prop.value === "object" &&
                !Array.isArray(prop.value)
              ) {
                const rawAction = String(prop.value.action ?? "stop").trim().toLowerCase();
                const action: "start" | "stop" = rawAction === "start" ? "start" : "stop";
                const soundName = String(prop.value.soundName ?? "").trim();
                if (soundName || action === "stop") {
                  triggerSound = {
                    action,
                    delay: Number(prop.value.delay) || 0,
                    overrideBackgroundMusic: Boolean(prop.value.overrideBackgroundMusic),
                    shouldLoop: Boolean(prop.value.shouldLoop),
                    soundName,
                  };
                }
              } else if (Array.isArray(prop.value)) {
                for (const item of prop.value) {
                  if (typeof item === "string" && item.trim()) {
                    soundOnTrigger.push(item.trim());
                  } else if (item && typeof item === "object" && item.value) {
                    soundOnTrigger.push(String(item.value).trim());
                  }
                }
              } else if (typeof prop.value === "string" && prop.value.trim()) {
                soundOnTrigger.push(prop.value.trim());
              }
            } else if (pName === "link" && prop.value && typeof prop.value === "object") {
              if (prop.value.action) {
                linkAction = String(prop.value.action).trim().toLowerCase();
              }
              if (prop.value.linkIds) {
                linkIds.push(...extractLinkIds(prop.value.linkIds));
              }
            } else if (pName === "action" || pName === "linkaction") {
              linkAction = String(prop.value).trim().toLowerCase();
            } else if (
              pName === "linkids" ||
              pName === "linkid" ||
              pName === "linkedid" ||
              pName === "linkedids" ||
              pName === "targetid"
            ) {
              linkIds.push(...extractLinkIds(prop.value));
            } else if (pName === "wait" && prop.value && typeof prop.value === "object") {
              wait = {
                shouldWait: Boolean(prop.value.shouldWait),
                waitTimeInSeconds: parseFloat(prop.value.waitTimeInSeconds) || 0,
              };
            } else if (pName === "shouldwait") {
              if (!wait) wait = { shouldWait: false, waitTimeInSeconds: 0 };
              wait.shouldWait = Boolean(prop.value);
            } else if (pName === "waittimeinseconds" || pName === "waittime") {
              if (!wait) wait = { shouldWait: true, waitTimeInSeconds: 0 };
              wait.waitTimeInSeconds = parseFloat(prop.value) || 0;
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
              if (prop.value.displayMessage !== undefined) {
                displayMessage = String(prop.value.displayMessage).trim();
              } else if (prop.value.message !== undefined) {
                displayMessage = String(prop.value.message).trim();
              }
            } else if (pName === "isobjective") {
              isObjective = Boolean(prop.value);
            } else if (pName === "objectivekey") {
              objectiveKey = String(prop.value).trim();
            } else if (pName === "displaymessage" || pName === "message") {
              displayMessage = String(prop.value).trim();
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

        if (!linkAction || linkAction === "-") {
          if (wait && wait.shouldWait) {
            linkAction = "enable";
          } else {
            linkAction = "disable";
          }
        }

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
          linkAction,
          linkIds,
          wait,
          displayMessage,
          soundOnTrigger,
          sound: triggerSound,
        };

        this.triggers.push(triggerZone);
      }
    }

    // Preload voice lines and sounds for all triggers in this level
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
      if (trigger.soundOnTrigger && trigger.soundOnTrigger.length > 0) {
        for (const sName of trigger.soundOnTrigger) {
          void this.preloadSoundAsset(sName);
        }
      }
      if (trigger.sound?.soundName && trigger.sound.action === "start") {
        void this.preloadSoundAsset(trigger.sound.soundName);
      }
    }
  }

  private async preloadSoundAsset(rawName: string): Promise<void> {
    const clean = rawName.replace(/\.(wav|mp3|ogg)$/i, "").trim();
    if (!clean || sound.exists(clean)) return;

    const candidateUrls = [
      `./assets/raycast/sfx/${clean}.mp3`,
      `./assets/raycast/sfx/${clean}.wav`,
      `./assets/sounds/${clean}.mp3`,
      `./assets/sounds/${clean}.wav`,
    ];
    for (const url of candidateUrls) {
      try {
        const res = await fetch(url, { method: "HEAD" });
        if (res.ok) {
          if (!sound.exists(clean)) {
            sound.add(clean, { url, preload: true });
          }
          return;
        }
      } catch {}
    }
  }

  public update(playerX: number, playerY: number): void {
    let activeInteractiveInside: ITriggerZone | null = null;

    for (const trigger of this.triggers) {
      // Check if wait timer completed
      if (trigger.isWaitRunning && trigger.waitEndTime && Date.now() >= trigger.waitEndTime) {
        this.completeTriggerWait(trigger);
      }

      const isInside =
        playerX >= trigger.minX &&
        playerX <= trigger.maxX &&
        playerY >= trigger.minY &&
        playerY <= trigger.maxY;

      const wasInside = trigger.isPlayerInside;
      trigger.isPlayerInside = isInside;

      if (!wasInside && isInside) {
        // Player entered trigger zone
        if (trigger.event === "onEnter" && !trigger.hasTriggered && !trigger.isWaitRunning) {
          if (!trigger.shouldBePressed) {
            this.fireTrigger(trigger);
          }
        }
      } else if (wasInside && !isInside) {
        // Player exited trigger zone
        if (trigger.event === "onExit" && !trigger.hasTriggered && !trigger.isWaitRunning) {
          if (!trigger.shouldBePressed) {
            this.fireTrigger(trigger);
          }
        }
      }

      if (isInside && trigger.shouldBePressed && (!trigger.hasTriggered || trigger.isWaitRunning)) {
        activeInteractiveInside = trigger;
      }
    }

    // Update HUD interaction prompt
    this.currentInsideInteractiveTrigger = activeInteractiveInside;
    if (this.currentInsideInteractiveTrigger) {
      const promptText = this.getActivePromptText();
      if (promptText) {
        const color = this.currentInsideInteractiveTrigger.isWaitRunning ? 0xffaa00 : 0x00e5ff;
        this.callbacks.showPrompt?.(promptText, color);
      } else {
        this.callbacks.hidePrompt?.();
      }
    } else {
      this.callbacks.hidePrompt?.();
    }
  }

  public getActivePromptColor(): number {
    return this.currentInsideInteractiveTrigger?.isWaitRunning ? 0xffaa00 : 0x00e5ff;
  }

  public getActivePromptText(): string | null {
    if (!this.currentInsideInteractiveTrigger) return null;
    const trigger = this.currentInsideInteractiveTrigger;

    // 1. If currently waiting, show countdown and objective/wait message
    if (trigger.isWaitRunning && trigger.waitEndTime) {
      const remainingSec = Math.max(0, Math.ceil((trigger.waitEndTime - Date.now()) / 1000));
      if (trigger.displayMessage && trigger.displayMessage.toLowerCase() !== "press_e") {
        const cleanMsg = trigger.displayMessage.replace(/_/g, " ").toUpperCase();
        return `[⏳] ${cleanMsg}... (${remainingSec}s)`;
      }
      if (trigger.isObjective && trigger.objectiveKey) {
        const obj = this.objectiveManager.getObjective(trigger.objectiveKey);
        const title = (obj?.title || trigger.objectiveKey.replace(/_/g, " ")).toUpperCase();
        return `[⏳] ${title}... (${remainingSec}s)`;
      }
      return `[⏳] PLEASE WAIT... (${remainingSec}s)`;
    }

    // 2. Before triggering: display interaction prompt with objective message
    if (!trigger.hasTriggered) {
      if (trigger.displayMessage) {
        const raw = trigger.displayMessage.trim();
        const lower = raw.toLowerCase();
        if (lower === "press_e" || lower === "press e" || lower === "e") {
          if (trigger.isObjective && trigger.objectiveKey) {
            const obj = this.objectiveManager.getObjective(trigger.objectiveKey);
            const title = (obj?.title || trigger.objectiveKey.replace(/_/g, " ")).toUpperCase();
            return `[E] PRESS [E] - ${title}`;
          }
          return "[E] PRESS [E] TO ACTIVATE";
        }
        const cleanMsg = raw.replace(/_/g, " ").toUpperCase();
        if (cleanMsg.startsWith("PRESS ")) {
          return `[E] ${cleanMsg}`;
        }
        return `[E] PRESS [E] TO ${cleanMsg}`;
      }

      if (trigger.isObjective && trigger.objectiveKey) {
        const obj = this.objectiveManager.getObjective(trigger.objectiveKey);
        const title = (obj?.title || trigger.objectiveKey.replace(/_/g, " ")).toUpperCase();
        return `[E] PRESS [E] TO ${title}`;
      }

      if (trigger.isObjective) {
        return "[E] PRESS [E] TO COMPLETE OBJECTIVE";
      }

      return "[E] PRESS [E] TO INTERACT";
    }

    return null;
  }

  public handleInteract(): boolean {
    if (this.currentInsideInteractiveTrigger) {
      const trigger = this.currentInsideInteractiveTrigger;
      if (trigger.isWaitRunning && trigger.waitEndTime) {
        const remainingSec = Math.max(1, Math.ceil((trigger.waitEndTime - Date.now()) / 1000));
        this.callbacks.showToast?.(`[⏳] Please wait, in progress... (${remainingSec}s)`, 0xffaa00, 1.5);
        return true;
      }
      if (!trigger.hasTriggered) {
        this.fireTrigger(trigger);
        return true;
      }
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

    // 2. Play trigger SFX sound effects (non-waiting triggers)
    if (trigger.soundOnTrigger && trigger.soundOnTrigger.length > 0 && (!trigger.wait || !trigger.wait.shouldWait)) {
      for (const sName of trigger.soundOnTrigger) {
        this.playTriggerSound(sName);
      }
    }

    // 3. Trigger Alarm if requested
    if (trigger.triggerAlarm) {
      this.callbacks.onTriggerAlarm?.();
    }

    // 4. Mark linked objective complete or display objective toast
    if (trigger.isObjective) {
      if (trigger.objectiveKey) {
        if (!trigger.wait || !trigger.wait.shouldWait) {
          this.objectiveManager.completeObjective(trigger.objectiveKey);
        } else {
          const obj = this.objectiveManager.getObjective(trigger.objectiveKey);
          const title = obj?.title || trigger.objectiveKey.replace(/_/g, " ");
          this.callbacks.showToast?.(`[★] Objective Initiated: ${title}`, 0x00e5ff, 3.0);
        }
      } else if (trigger.displayMessage) {
        const clean = trigger.displayMessage.replace(/_/g, " ");
        this.callbacks.showToast?.(`[★] Objective: ${clean}`, 0x00e5ff, 3.0);
      }
    } else if (trigger.displayMessage && !trigger.shouldBePressed) {
      const clean = trigger.displayMessage.replace(/_/g, " ");
      this.callbacks.showToast?.(`[!] ${clean}`, 0x00e5ff, 3.0);
    }

    // 5. Initialize wait timer if configured
    if (trigger.wait && trigger.wait.shouldWait && trigger.wait.waitTimeInSeconds > 0) {
      trigger.isWaitRunning = true;
      trigger.waitEndTime = Date.now() + trigger.wait.waitTimeInSeconds * 1000;
      const waitMsg =
        trigger.displayMessage && trigger.displayMessage.toLowerCase() !== "press_e"
          ? trigger.displayMessage.replace(/_/g, " ")
          : "System active";
      this.callbacks.showToast?.(
        `[⏳] ${waitMsg}... (${trigger.wait.waitTimeInSeconds}s)`,
        0xffaa00,
        2.5
      );

      setTimeout(() => {
        this.completeTriggerWait(trigger);
      }, trigger.wait.waitTimeInSeconds * 1000);
    }

    // 6. Notify callbacks and listeners
    this.callbacks.onTriggerFired?.(trigger);
    this.emit("triggerFired", trigger);
  }

  private completeTriggerWait(trigger: ITriggerZone): void {
    if (!trigger.isWaitRunning) return;
    trigger.isWaitRunning = false;
    trigger.waitEndTime = undefined;
    trigger.hasTriggered = true; // Mark as triggered so it does not loop/re-prompt indefinitely
    this.callbacks.showToast?.("[✓] Operation Complete!", 0x00ffcc, 2.5);
    if (trigger.isObjective && trigger.objectiveKey) {
      this.objectiveManager.completeObjective(trigger.objectiveKey);
    }
    this.callbacks.onTriggerWaitComplete?.(trigger);
    this.emit("triggerWaitComplete", trigger);
  }

  private playTriggerSound(name: string): void {
    if (!name) return;
    const cleanName = name.replace(/\.(wav|mp3|ogg)$/i, "").trim();
    if (sound.exists(cleanName)) {
      try {
        sound.play(cleanName, { volume: 0.6 });
        return;
      } catch {}
    }
    const candidateUrls = [
      `./assets/raycast/sfx/${cleanName}.wav`,
      `./assets/raycast/sfx/${cleanName}.mp3`,
      `./assets/sounds/${cleanName}.wav`,
      `./assets/sounds/${cleanName}.mp3`,
    ];
    let loaded = false;
    for (const url of candidateUrls) {
      try {
        sound.add(cleanName, { url, preload: true });
        sound.play(cleanName, { volume: 0.6 });
        loaded = true;
        break;
      } catch {}
    }
    if (!loaded) {
      try {
        const audio = new Audio(`./assets/raycast/sfx/${cleanName}.wav`);
        audio.volume = 0.6;
        audio.play().catch(() => {});
      } catch {}
    }
  }

  private finishVoiceline(key: string | null): void {
    if (!key || this.currentVoiceKey !== key) return;
    this.currentVoiceKey = null;
    this.callbacks.onVoicelineEnd?.(key);
  }

  private stopCurrentVoiceline(): void {
    this.finishVoiceline(this.currentVoiceKey);
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

    this.currentVoiceKey = cleanName;
    this.callbacks.onVoicelineStart?.(this.currentLevel, cleanName);

    const playWithHtmlAudio = () => {
      try {
        const audio = new Audio(soundUrl);
        audio.volume = 0.9;
        this.currentHtmlAudio = audio;
        audio.ontimeupdate = () => {
          if (this.currentHtmlAudio === audio && audio.duration > 0) {
            this.callbacks.onVoicelineProgress?.(
              cleanName,
              audio.currentTime / audio.duration,
              audio.duration
            );
          }
        };
        audio.play().catch(() => this.finishVoiceline(cleanName));
        audio.onended = () => {
          if (this.currentHtmlAudio === audio) {
            this.currentHtmlAudio = null;
          }
          this.finishVoiceline(cleanName);
        };
      } catch (err) {
        this.finishVoiceline(cleanName);
        console.warn(`[RaycastTriggerManager] HTML5 Audio fallback failed for ${soundUrl}:`, err);
      }
    };

    const trackInstance = (inst: any) => {
      // Ignore if another voiceline replaced this one while the sound was loading.
      if (this.currentVoiceKey !== cleanName || !inst) return;
      this.currentPlayingSoundInstance = inst;
      try {
        inst.on?.("progress", (progress: number, duration?: number) => {
          if (this.currentVoiceKey === cleanName) {
            const dur =
              typeof duration === "number" && duration > 0
                ? duration
                : (sound.find(alias)?.duration as number | undefined);
            this.callbacks.onVoicelineProgress?.(cleanName, progress, dur);
          }
        });
        inst.once?.("end", () => this.finishVoiceline(cleanName));
        inst.once?.("stop", () => this.finishVoiceline(cleanName));
      } catch {}
    };

    try {
      if (sound.exists(alias)) {
        const s = sound.find(alias);
        if (s && s.isLoaded) {
          const res = sound.play(alias, { volume: 0.9 });
          if (res && typeof (res as any).then === "function") {
            (res as any).then(trackInstance).catch(() => this.finishVoiceline(cleanName));
          } else {
            trackInstance(res);
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
