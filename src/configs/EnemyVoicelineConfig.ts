import {
  IEnemyVoicePool,
  IEnemyVoicelineConfig,
} from "./interfaces/IEnemyVoicelineConfig";

export const defaultVoicePool: IEnemyVoicePool = {
  spotted: ["stormtrooper_rebel_scum", "stormtrooper_there_he_is"],
  suspicious: ["stormtrooper_hear_something"],
  grenade: ["stormtrooper_grenade"],
};

export const enemyVoicelineConfig: IEnemyVoicelineConfig = {
  maxConcurrentVoicelines: 1,
  voicelineSpacing: 2500,
  volume: 0.90,
  hearingRange: 7.0,
  grenadeHearingRange: 25.0,
  spottedCooldown: 7000,
  suspiciousCooldown: 10000,
  grenadeCooldown: 1200,
  enableSpatialAudio: true,
  minSpatialVolume: 0.5,

  soundRegistry: {
    stormtrooper_grenade: "assets/raycast/voicelines/storm_trooper/grenade_grenade.mp3",
    stormtrooper_hear_something: "assets/raycast/voicelines/storm_trooper/i_hear_something.mp3",
    stormtrooper_rebel_scum: "assets/raycast/voicelines/storm_trooper/rebel_scum.mp3",
    stormtrooper_there_he_is: "assets/raycast/voicelines/storm_trooper/there_he_is.mp3",
  },

  voicePools: {
    stormtrooper: defaultVoicePool,
  },

  defaultVoicePool,
};

// Backward-compatibility aliases
export const stormtrooperVoicelineConfig = enemyVoicelineConfig;
export const defaultStormtrooperVoicePool = defaultVoicePool;
