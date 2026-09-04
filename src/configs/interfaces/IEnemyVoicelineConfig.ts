export interface IEnemyVoicePool {
  /** Voice lines triggered when player is spotted / in line of sight */
  spotted?: string[];
  /** Voice lines triggered when player is close but not seen */
  suspicious?: string[];
  /** Voice lines triggered when player throws a grenade */
  grenade?: string[];
}

export interface IEnemyVoicelineConfig {
  /** Maximum number of enemy voicelines that can play concurrently at once (default: 1) */
  maxConcurrentVoicelines: number;

  /** Spacing / minimum interval in milliseconds between successive voiceline starts (default: 2500ms) */
  voicelineSpacing: number;

  /** Master volume multiplier for voicelines (0.0 to 1.0, default: 0.90) */
  volume: number;

  /** Maximum distance (in tiles) for "I hear something" when player is close but not seen (default: 7.0) */
  hearingRange: number;

  /** Maximum distance (in tiles) for enemies to react to a thrown grenade (default: 25.0) */
  grenadeHearingRange: number;

  /** Minimum interval in milliseconds between "spotted" voicelines per enemy (default: 7000ms) */
  spottedCooldown: number;

  /** Minimum interval in milliseconds between "I hear something" voicelines per enemy (default: 10000ms) */
  suspiciousCooldown: number;

  /** Minimum interval in milliseconds between grenade reaction voicelines (default: 1200ms) */
  grenadeCooldown: number;

  /** Enable distance-based spatial volume attenuation so closer enemies sound louder (default: true) */
  enableSpatialAudio?: boolean;

  /** Minimum volume floor when spatial audio is enabled so distant lines remain audible (default: 0.50) */
  minSpatialVolume?: number;

  /** Registry of audio asset aliases mapped to their file paths */
  soundRegistry?: Record<string, string>;

  /** Voice line pools mapped by enemy type identifier (e.g. "stormtrooper", "officer", "droid") */
  voicePools?: Record<string, IEnemyVoicePool>;

  /** Default fallback voice pool used when an enemy type has no dedicated pool */
  defaultVoicePool?: IEnemyVoicePool;
}

// Backward-compatibility alias
export type IStormtrooperVoicelineConfig = IEnemyVoicelineConfig;
