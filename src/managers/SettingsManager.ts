import { sound } from "@pixi/sound";
import { enemyVoicelineConfig } from "../configs/EnemyVoicelineConfig";
import { gameConfig } from "../configs/GameConfig";

export interface IGameSettings {
  voicesVolume: number; // 0.0 - 1.0 (steps of 0.1)
  musicVolume: number;  // 0.0 - 1.0 (steps of 0.1)
  autoAim: boolean;
}

const SETTINGS_STORAGE_KEY = "star_wars_game_settings";

const MUSIC_TRACK_ALIASES = [
  "menu_theme",
  "battle_theme",
  "calm_loop",
  "base_alarm",
  "intro_theme",
  "end_theme"
];

export class SettingsManager {
  private static instance: SettingsManager;
  private settings: IGameSettings;
  private listeners: Set<(settings: IGameSettings) => void> = new Set();

  private constructor() {
    this.settings = this.loadSettings();
    this.applySettings();
  }

  public static getInstance(): SettingsManager {
    if (!SettingsManager.instance) {
      SettingsManager.instance = new SettingsManager();
    }
    return SettingsManager.instance;
  }

  public static isMobileDevice(): boolean {
    const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
    const isMobileUA = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile/i.test(ua);
    const hasTouch = typeof window !== "undefined" && ("ontouchstart" in window || (navigator.maxTouchPoints > 0));
    const isCoarsePointer = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
    return isMobileUA || (hasTouch && isCoarsePointer);
  }

  private loadSettings(): IGameSettings {
    const isMobile = SettingsManager.isMobileDevice();
    const defaults: IGameSettings = {
      voicesVolume: 0.8,
      musicVolume: 0.5,
      autoAim: isMobile,
    };

    try {
      const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (typeof parsed.voicesVolume === "number") {
          defaults.voicesVolume = Math.max(0, Math.min(1, Math.round(parsed.voicesVolume * 10) / 10));
        }
        if (typeof parsed.musicVolume === "number") {
          defaults.musicVolume = Math.max(0, Math.min(1, Math.round(parsed.musicVolume * 10) / 10));
        }
        if (typeof parsed.autoAim === "boolean") {
          defaults.autoAim = parsed.autoAim;
        }
      }
    } catch {
      // LocalStorage access might fail in some sandboxed iframes
    }

    return defaults;
  }

  private saveSettings(): void {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(this.settings));
    } catch {}
  }

  public applySettings(): void {
    // 1. Apply voices volume to EnemyVoicelineConfig
    enemyVoicelineConfig.volume = this.settings.voicesVolume;

    // 2. Apply music volume to GameConfig
    gameConfig.musicVolume = this.settings.musicVolume;

    // 3. Update all active/cached music tracks in Pixi Sound
    for (const alias of MUSIC_TRACK_ALIASES) {
      if (sound.exists(alias)) {
        try {
          sound.volume(alias, this.settings.musicVolume);
        } catch {}
      }
    }
  }

  public getSettings(): Readonly<IGameSettings> {
    return { ...this.settings };
  }

  public getVoicesVolume(): number {
    return this.settings.voicesVolume;
  }

  public setVoicesVolume(vol: number): void {
    const clamped = Math.max(0, Math.min(1, Math.round(vol * 10) / 10));
    if (this.settings.voicesVolume !== clamped) {
      this.settings.voicesVolume = clamped;
      this.applySettings();
      this.saveSettings();
      this.notifyListeners();
    }
  }

  public getMusicVolume(): number {
    return this.settings.musicVolume;
  }

  public setMusicVolume(vol: number): void {
    const clamped = Math.max(0, Math.min(1, Math.round(vol * 10) / 10));
    if (this.settings.musicVolume !== clamped) {
      this.settings.musicVolume = clamped;
      this.applySettings();
      this.saveSettings();
      this.notifyListeners();
    }
  }

  public getAutoAim(): boolean {
    return this.settings.autoAim;
  }

  public setAutoAim(enabled: boolean): void {
    if (this.settings.autoAim !== enabled) {
      this.settings.autoAim = enabled;
      this.saveSettings();
      this.notifyListeners();
    }
  }

  public toggleAutoAim(): boolean {
    this.setAutoAim(!this.settings.autoAim);
    return this.settings.autoAim;
  }

  public subscribe(listener: (settings: IGameSettings) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.getSettings());
      } catch (err) {
        console.error("Error in settings change listener:", err);
      }
    }
  }
}
