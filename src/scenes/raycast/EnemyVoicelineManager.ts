import { sound } from "@pixi/sound";
import {
  IEnemyVoicePool,
  IEnemyVoicelineConfig,
} from "../../configs/interfaces/IEnemyVoicelineConfig";
import { enemyVoicelineConfig } from "../../configs/EnemyVoicelineConfig";
import { RaycastEnemy } from "./RaycastEnemy";

export type VoicelineCategory = "grenade" | "spotted" | "suspicious";

interface QueuedVoiceline {
  alias: string;
  category: VoicelineCategory;
  priority: number;
  enemyId?: number;
  sourceX: number;
  sourceY: number;
  timestamp: number;
  maxAgeMs: number;
}

interface ActiveSoundHandle {
  id: number;
  enemyId?: number;
  alias: string;
  mediaInstance?: any;
  timeoutId?: any;
}

export class EnemyVoicelineManager {
  private config: IEnemyVoicelineConfig;
  private queue: QueuedVoiceline[] = [];
  private activeHandles: Map<number, ActiveSoundHandle> = new Map();
  private deadEnemyIds: Set<number> = new Set();
  private nextInstanceId: number = 1;

  private lastVoicelineStartTime: number = 0;
  private lastVoicelineEndTime: number = 0;
  private lastSpottedTime: number = 0;
  private lastSuspiciousTime: number = 0;
  private lastGrenadeTime: number = 0;

  // Standard fallback sound aliases
  public static readonly DEFAULT_SOUND_GRENADE = "stormtrooper_grenade";
  public static readonly DEFAULT_SOUND_HEAR_SOMETHING = "stormtrooper_hear_something";
  public static readonly DEFAULT_SOUND_REBEL_SCUM = "stormtrooper_rebel_scum";
  public static readonly DEFAULT_SOUND_THERE_HE_IS = "stormtrooper_there_he_is";

  // Backward-compatibility aliases
  public static readonly SOUND_GRENADE = EnemyVoicelineManager.DEFAULT_SOUND_GRENADE;
  public static readonly SOUND_HEAR_SOMETHING = EnemyVoicelineManager.DEFAULT_SOUND_HEAR_SOMETHING;
  public static readonly SOUND_REBEL_SCUM = EnemyVoicelineManager.DEFAULT_SOUND_REBEL_SCUM;
  public static readonly SOUND_THERE_HE_IS = EnemyVoicelineManager.DEFAULT_SOUND_THERE_HE_IS;

  private static readonly DEFAULT_SOUND_PATHS: Record<string, string> = {
    [EnemyVoicelineManager.DEFAULT_SOUND_GRENADE]:
      "assets/raycast/voicelines/storm_trooper/grenade_grenade.mp3",
    [EnemyVoicelineManager.DEFAULT_SOUND_HEAR_SOMETHING]:
      "assets/raycast/voicelines/storm_trooper/i_hear_something.mp3",
    [EnemyVoicelineManager.DEFAULT_SOUND_REBEL_SCUM]:
      "assets/raycast/voicelines/storm_trooper/rebel_scum.mp3",
    [EnemyVoicelineManager.DEFAULT_SOUND_THERE_HE_IS]:
      "assets/raycast/voicelines/storm_trooper/there_he_is.mp3",
  };

  constructor(customConfig?: Partial<IEnemyVoicelineConfig>) {
    this.config = {
      ...enemyVoicelineConfig,
      ...(customConfig || {}),
    };
    this.ensureSoundsRegistered();
  }

  /**
   * Resolves the voice line pool for a given enemy or fallback
   */
  public getVoicePool(enemy?: RaycastEnemy): IEnemyVoicePool {
    if (enemy?.config?.voicelines) {
      return enemy.config.voicelines;
    }
    const typeKey = enemy?.config?.type?.toLowerCase();
    if (typeKey && this.config.voicePools?.[typeKey]) {
      return this.config.voicePools[typeKey];
    }
    return (
      this.config.defaultVoicePool ||
      this.config.voicePools?.["stormtrooper"] || {
        spotted: [
          EnemyVoicelineManager.DEFAULT_SOUND_REBEL_SCUM,
          EnemyVoicelineManager.DEFAULT_SOUND_THERE_HE_IS,
        ],
        suspicious: [EnemyVoicelineManager.DEFAULT_SOUND_HEAR_SOMETHING],
        grenade: [EnemyVoicelineManager.DEFAULT_SOUND_GRENADE],
      }
    );
  }

  /**
   * Registers a new voice line pool for a specific enemy type identifier (e.g. "officer", "droid")
   */
  public registerEnemyVoicePool(
    enemyType: string,
    pool: IEnemyVoicePool
  ): void {
    if (!this.config.voicePools) {
      this.config.voicePools = {};
    }
    this.config.voicePools[enemyType.toLowerCase()] = pool;
  }

  /**
   * Ensures sound aliases are registered in @pixi/sound and preloaded
   */
  public ensureSoundsRegistered(): void {
    const allPaths: Record<string, string> = {
      ...EnemyVoicelineManager.DEFAULT_SOUND_PATHS,
      ...(this.config.soundRegistry || {}),
    };

    for (const [alias, src] of Object.entries(allPaths)) {
      if (!sound.exists(alias)) {
        try {
          sound.add(alias, { url: src, preload: true });
        } catch {
          try {
            sound.add(alias, src);
          } catch (e) {
            console.warn(`Could not register voiceline sound alias "${alias}":`, e);
          }
        }
      }
    }
  }

  public getConfig(): IEnemyVoicelineConfig {
    return this.config;
  }

  public setConfig(update: Partial<IEnemyVoicelineConfig>): void {
    this.config = {
      ...this.config,
      ...update,
    };
  }

  /**
   * Set maximum concurrent voicelines that can play simultaneously.
   */
  public setMaxConcurrentVoicelines(count: number): void {
    this.config.maxConcurrentVoicelines = Math.max(1, count);
  }

  /**
   * Set minimum spacing in milliseconds between starting voicelines.
   */
  public setVoicelineSpacing(spacingMs: number): void {
    this.config.voicelineSpacing = Math.max(0, spacingMs);
  }

  /**
   * Immediately stops any sound or voiceline playing for the specified enemy,
   * purges any queued voicelines for that enemy, and prevents any pending voicelines from playing.
   */
  public onEnemyDeath(enemyId: number): void {
    this.deadEnemyIds.add(enemyId);

    // 1. Purge any queued non-grenade voicelines for this dead enemy
    this.queue = this.queue.filter((q) => q.enemyId !== enemyId);

    // 2. Stop any active voicelines currently playing for this dead enemy
    for (const [id, handle] of Array.from(this.activeHandles.entries())) {
      // Do NOT cut off a grenade shout mid-sentence if the enemy is blown up by the grenade
      if (
        handle.enemyId === enemyId &&
        handle.alias !== EnemyVoicelineManager.DEFAULT_SOUND_GRENADE
      ) {
        if (handle.timeoutId) {
          clearTimeout(handle.timeoutId);
        }
        if (handle.mediaInstance && typeof handle.mediaInstance.stop === "function") {
          try {
            handle.mediaInstance.stop();
          } catch (e) {
            console.warn(`Failed to stop media instance for dead enemy ${enemyId}:`, e);
          }
        }
        try {
          sound.stop(handle.alias);
        } catch {}

        this.activeHandles.delete(id);
        this.lastVoicelineEndTime = Date.now();
      }
    }
  }

  /**
   * Triggered when the player throws a grenade / thermal detonator.
   * Guarantees that "grenade, grenade" is shouted with emergency priority.
   */
  public onPlayerThrowGrenade(
    playerX: number,
    playerY: number,
    enemies: RaycastEnemy[] = []
  ): void {
    const now = Date.now();
    if (now - this.lastGrenadeTime < this.config.grenadeCooldown) {
      return;
    }

    // 1. Find closest alive enemy on the map
    let closestEnemy: RaycastEnemy | null = null;
    let closestDistSq = Infinity;

    for (const enemy of enemies) {
      if (enemy.isDead || this.deadEnemyIds.has(enemy.id)) continue;
      const dx = enemy.x - playerX;
      const dy = enemy.y - playerY;
      const distSq = dx * dx + dy * dy;
      if (distSq < closestDistSq) {
        closestDistSq = distSq;
        closestEnemy = enemy;
      }
    }

    // Use closest enemy position if available, or player position as fallback
    const sourceX = closestEnemy ? closestEnemy.x : playerX;
    const sourceY = closestEnemy ? closestEnemy.y : playerY;
    const enemyId = closestEnemy ? closestEnemy.id : undefined;

    this.lastGrenadeTime = now;

    // Pick grenade shout alias from enemy voice pool
    const pool = this.getVoicePool(closestEnemy ?? undefined);
    const grenadeLines = pool.grenade || [];
    const alias =
      grenadeLines.length > 0
        ? grenadeLines[Math.floor(Math.random() * grenadeLines.length)]
        : EnemyVoicelineManager.DEFAULT_SOUND_GRENADE;

    // 2. Emergency Priority: Interrupt casual chatter if at max concurrent capacity
    if (this.activeHandles.size >= this.config.maxConcurrentVoicelines) {
      for (const [id, handle] of Array.from(this.activeHandles.entries())) {
        if (handle.alias !== alias) {
          if (handle.timeoutId) clearTimeout(handle.timeoutId);
          if (handle.mediaInstance && typeof handle.mediaInstance.stop === "function") {
            try {
              handle.mediaInstance.stop();
            } catch {}
          }
          try {
            sound.stop(handle.alias);
          } catch {}
          this.activeHandles.delete(id);
        }
      }
    }

    // 3. Play the grenade shout immediately!
    this.playVoiceline(
      {
        alias,
        category: "grenade",
        priority: 3,
        enemyId,
        sourceX,
        sourceY,
        timestamp: now,
        maxAgeMs: 4000,
      },
      playerX,
      playerY
    );
  }

  /**
   * Called during enemy AI update for each alive enemy.
   * Determines if "spotted" or "suspicious" voicelines should be triggered.
   */
  public onEnemyUpdate(
    enemy: RaycastEnemy,
    playerX: number,
    playerY: number,
    hasLos: boolean,
    distance: number
  ): void {
    if (enemy.isDead || this.deadEnemyIds.has(enemy.id)) return;

    const now = Date.now();
    const pool = this.getVoicePool(enemy);

    if (hasLos && distance <= enemy.config.sightRange) {
      // Enemy sees the player
      const justSpotted = !enemy.wasSeeingPlayer;
      const cooldownElapsed = now - enemy.lastSpottedTime >= this.config.spottedCooldown;
      const globalCooldownElapsed = now - this.lastSpottedTime >= 4000;

      if ((justSpotted || cooldownElapsed) && globalCooldownElapsed) {
        enemy.lastSpottedTime = now;
        this.lastSpottedTime = now;

        const spottedLines = pool.spotted || [];
        if (spottedLines.length > 0) {
          const alias =
            spottedLines[Math.floor(Math.random() * spottedLines.length)];

          this.requestVoiceline(
            {
              alias,
              category: "spotted",
              priority: 2, // Medium priority
              enemyId: enemy.id,
              sourceX: enemy.x,
              sourceY: enemy.y,
              timestamp: now,
              maxAgeMs: 3500,
            },
            playerX,
            playerY
          );
        }
      }
      enemy.wasSeeingPlayer = true;
    } else {
      // Enemy does NOT see the player
      enemy.wasSeeingPlayer = false;

      // Player is close, but NOT seen -> "I hear something"
      if (distance <= this.config.hearingRange) {
        const cooldownElapsed = now - enemy.lastSuspiciousTime >= this.config.suspiciousCooldown;
        const globalCooldownElapsed = now - this.lastSuspiciousTime >= 6000;

        if (cooldownElapsed && globalCooldownElapsed) {
          enemy.lastSuspiciousTime = now;
          this.lastSuspiciousTime = now;

          const suspiciousLines = pool.suspicious || [];
          if (suspiciousLines.length > 0) {
            const alias =
              suspiciousLines[Math.floor(Math.random() * suspiciousLines.length)];

            this.requestVoiceline(
              {
                alias,
                category: "suspicious",
                priority: 1, // Normal priority
                enemyId: enemy.id,
                sourceX: enemy.x,
                sourceY: enemy.y,
                timestamp: now,
                maxAgeMs: 4000,
              },
              playerX,
              playerY
            );
          }
        }
      }
    }
  }

  /**
   * Request playing a voiceline, either immediately or adding to queue.
   */
  private requestVoiceline(
    item: QueuedVoiceline,
    playerX: number,
    playerY: number
  ): void {
    if (item.enemyId !== undefined && this.deadEnemyIds.has(item.enemyId)) {
      return;
    }

    const now = Date.now();
    const canPlayImmediately =
      item.category === "grenade" ||
      (this.activeHandles.size < this.config.maxConcurrentVoicelines &&
        now - this.lastVoicelineStartTime >= this.config.voicelineSpacing);

    if (canPlayImmediately) {
      this.playVoiceline(item, playerX, playerY);
    } else {
      // Avoid duplicate requests of the same category in the queue
      const existing = this.queue.find((q) => q.category === item.category);
      if (existing) {
        if (item.priority > existing.priority) {
          existing.priority = item.priority;
          existing.alias = item.alias;
          existing.enemyId = item.enemyId;
          existing.sourceX = item.sourceX;
          existing.sourceY = item.sourceY;
          existing.timestamp = item.timestamp;
        }
        return;
      }

      // Keep queue compact (max 3 queued lines)
      if (this.queue.length >= 3) {
        this.queue.shift();
      }
      this.queue.push(item);
    }
  }

  /**
   * Execute actual audio playback with concurrency tracking and spatial attenuation.
   */
  private playVoiceline(
    item: QueuedVoiceline,
    playerX: number,
    playerY: number
  ): void {
    // If enemy died before a non-grenade line could start, do not play
    if (
      item.category !== "grenade" &&
      item.enemyId !== undefined &&
      this.deadEnemyIds.has(item.enemyId)
    ) {
      return;
    }

    const now = Date.now();
    this.lastVoicelineStartTime = now;

    // Calculate volume based on distance if spatial audio is enabled
    let effectiveVolume = this.config.volume;
    if (item.category === "grenade") {
      // Emergency shout is always clearly audible (at least 0.85)
      effectiveVolume = Math.max(0.85, this.config.volume);
    } else if (this.config.enableSpatialAudio) {
      const dx = item.sourceX - playerX;
      const dy = item.sourceY - playerY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const maxDist = Math.max(10, this.config.hearingRange * 2);
      const falloff = Math.max(0, 1 - distance / maxDist);
      const minVol = this.config.minSpatialVolume ?? 0.5;
      effectiveVolume = this.config.volume * (minVol + (1 - minVol) * falloff);
    }

    const instanceId = this.nextInstanceId++;
    const handle: ActiveSoundHandle = {
      id: instanceId,
      enemyId: item.enemyId,
      alias: item.alias,
    };
    this.activeHandles.set(instanceId, handle);

    const onFinish = () => {
      const h = this.activeHandles.get(instanceId);
      if (h?.timeoutId) {
        clearTimeout(h.timeoutId);
      }
      this.activeHandles.delete(instanceId);
      this.lastVoicelineEndTime = Date.now();
    };

    try {
      // Resume audioContext if browser suspended it before first gesture
      if (sound.context && (sound.context as any).audioContext?.state === "suspended") {
        try {
          (sound.context as any).audioContext.resume();
        } catch {}
      }

      if (!sound.exists(item.alias)) {
        this.ensureSoundsRegistered();
      }

      const res = sound.play(item.alias, {
        volume: effectiveVolume,
        loop: false,
        complete: onFinish,
      });

      if (res) {
        if (typeof (res as any).then === "function") {
          (res as Promise<any>)
            .then((inst) => {
              if (
                item.category !== "grenade" &&
                item.enemyId !== undefined &&
                this.deadEnemyIds.has(item.enemyId)
              ) {
                try {
                  inst?.stop?.();
                } catch {}
                onFinish();
              } else {
                handle.mediaInstance = inst;
              }
            })
            .catch(() => {
              onFinish();
            });
        } else {
          handle.mediaInstance = res;
          if (
            item.category !== "grenade" &&
            item.enemyId !== undefined &&
            this.deadEnemyIds.has(item.enemyId)
          ) {
            try {
              (res as any).stop?.();
            } catch {}
            onFinish();
            return;
          }
        }
      }

      handle.timeoutId = setTimeout(() => {
        onFinish();
      }, 3500);
    } catch (err) {
      console.warn(`Error playing voiceline "${item.alias}":`, err);
      // Fallback to HTML5 Audio if Pixi sound encounters an issue
      try {
        const audioSrc =
          this.config.soundRegistry?.[item.alias] ||
          EnemyVoicelineManager.DEFAULT_SOUND_PATHS[item.alias];
        if (audioSrc && typeof Audio !== "undefined") {
          const audio = new Audio(audioSrc);
          audio.volume = effectiveVolume;
          audio.play().catch(() => {});
          handle.mediaInstance = audio;
        }
      } catch {}
      onFinish();
    }
  }

  /**
   * Called every frame to manage queue and spaced playback.
   */
  public update(delta: number, playerX: number, playerY: number): void {
    const now = Date.now();

    // 1. Remove expired items or dead enemy items from the queue
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const q = this.queue[i];
      if (
        now - q.timestamp > q.maxAgeMs ||
        (q.category !== "grenade" &&
          q.enemyId !== undefined &&
          this.deadEnemyIds.has(q.enemyId))
      ) {
        this.queue.splice(i, 1);
      }
    }

    if (this.queue.length === 0) return;

    // 2. Check if we can play next queued voiceline based on concurrency and spacing
    const canPlay =
      this.activeHandles.size < this.config.maxConcurrentVoicelines &&
      now - this.lastVoicelineStartTime >= this.config.voicelineSpacing;

    if (canPlay) {
      // Sort queue so highest priority items play first
      this.queue.sort((a, b) => b.priority - a.priority);
      const nextItem = this.queue.shift();
      if (nextItem) {
        this.playVoiceline(nextItem, playerX, playerY);
      }
    }
  }

  public dispose(): void {
    this.queue = [];
    for (const handle of this.activeHandles.values()) {
      if (handle.timeoutId) {
        clearTimeout(handle.timeoutId);
      }
      if (handle.mediaInstance && typeof handle.mediaInstance.stop === "function") {
        try {
          handle.mediaInstance.stop();
        } catch {}
      }
    }
    this.activeHandles.clear();
    this.deadEnemyIds.clear();
  }
}

export { EnemyVoicelineManager as RaycastEnemyVoicelineManager, EnemyVoicelineManager as StormtrooperVoicelineManager };
