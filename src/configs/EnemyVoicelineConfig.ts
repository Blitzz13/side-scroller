import {
  IEnemyVoicePool,
  IEnemyVoicelineConfig,
} from "./interfaces/IEnemyVoicelineConfig";

export const defaultVoicePool: IEnemyVoicePool = {
  spotted: ["stormtrooper_rebel_scum", "stormtrooper_there_he_is"],
  suspicious: ["stormtrooper_hear_something"],
  grenade: ["stormtrooper_grenade"],
};

export const defaultViperDroidVoicePool: IEnemyVoicePool = {
  spotted: [
    "probe_droid_voice_1",
    "probe_droid_voice_2",
    "probe_droid_voice_3",
    "probe_droid_voice_4",
    "probe_droid_voice_5",
    "probe_droid_voice_6",
    "probe_droid_voice_7",
    "probe_droid_voice_8",
  ],
  suspicious: [
    "probe_droid_voice_1",
    "probe_droid_voice_2",
    "probe_droid_voice_3",
  ],
};

export const defaultImperialOfficerVoicePool: IEnemyVoicePool = {
  spotted: [
    "stop_right_there_scum",
    "troopers_blast_him",
    "office_commando_stop_now",
    "officer_commando_throw_down_your_weapons",
  ],
  suspicious: [
    "officer_commando_he_must_be_here",
    "officer_commando_no_use_hiding",
    "officer_commando_show_yourself",
  ],
  grenade: ["officer_commando_fall_back"],
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
    stormtrooper_grenade: "assets/raycast/sfx/storm_trooper/grenade_grenade.mp3",
    stormtrooper_hear_something: "assets/raycast/sfx/storm_trooper/i_hear_something.mp3",
    stormtrooper_rebel_scum: "assets/raycast/sfx/storm_trooper/rebel_scum.mp3",
    stormtrooper_there_he_is: "assets/raycast/sfx/storm_trooper/there_he_is.mp3",
    probe_droid_voice_1: "assets/raycast/sfx/viper_droid/probe_droid_voice_1.mp3",
    probe_droid_voice_2: "assets/raycast/sfx/viper_droid/probe_droid_voice_2.mp3",
    probe_droid_voice_3: "assets/raycast/sfx/viper_droid/probe_droid_voice_3.mp3",
    probe_droid_voice_4: "assets/raycast/sfx/viper_droid/probe_droid_voice_4.mp3",
    probe_droid_voice_5: "assets/raycast/sfx/viper_droid/probe_droid_voice_5.mp3",
    probe_droid_voice_6: "assets/raycast/sfx/viper_droid/probe_droid_voice_6.mp3",
    probe_droid_voice_7: "assets/raycast/sfx/viper_droid/probe_droid_voice_7.mp3",
    probe_droid_voice_8: "assets/raycast/sfx/viper_droid/probe_droid_voice_8.mp3",
    stop_right_there_scum: "assets/raycast/sfx/imperial_officer_commando/stop_right_there_scum.mp3",
    troopers_blast_him: "assets/raycast/sfx/imperial_officer_commando/troopers_blast_him.mp3",
    office_commando_stop_now: "assets/raycast/sfx/imperial_officer_commando/office_commando_stop_now.mp3",
    officer_commando_fall_back: "assets/raycast/sfx/imperial_officer_commando/officer_commando_fall_back.mp3",
    officer_commando_he_must_be_here: "assets/raycast/sfx/imperial_officer_commando/officer_commando_he_must_be_here.mp3",
    officer_commando_no_use_hiding: "assets/raycast/sfx/imperial_officer_commando/officer_commando_no_use_hiding.mp3",
    officer_commando_show_yourself: "assets/raycast/sfx/imperial_officer_commando/officer_commando_show_yourself.mp3",
    officer_commando_throw_down_your_weapons: "assets/raycast/sfx/imperial_officer_commando/officer_commando_throw_down_your_weapons.mp3",
  },

  voicePools: {
    stormtrooper: defaultVoicePool,
    viper_droid: defaultViperDroidVoicePool,
    viperdroid: defaultViperDroidVoicePool,
    imperial_officer: defaultImperialOfficerVoicePool,
    imperialofficer: defaultImperialOfficerVoicePool,
    officer: defaultImperialOfficerVoicePool,
    imperial_commando: defaultImperialOfficerVoicePool,
    imperialcommando: defaultImperialOfficerVoicePool,
    commando: defaultImperialOfficerVoicePool,
  },

  defaultVoicePool,
};

// Backward-compatibility aliases
export const stormtrooperVoicelineConfig = enemyVoicelineConfig;
export const defaultStormtrooperVoicePool = defaultVoicePool;

