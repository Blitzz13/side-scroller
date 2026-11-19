/**
 * Default volume levels (0.0 - 1.0) used when no saved user settings exist.
 */
export const DEFAULT_VOICES_VOLUME = 1.0;
export const DEFAULT_MUSIC_VOLUME = 0.3;

/**
 * Scales music playback relative to voices so dialogue remains clearly audible over music.
 */
export const MUSIC_VOLUME_MULTIPLIER = 0.65;

/**
 * Base volume multipliers for sound effects (before scaling by the options volume).
 * Default base volume is 1.2 (0.6 at the default 50% options setting).
 */
export const DEFAULT_SFX_VOLUME = 1.2;

export const SOUND_VOLUME_OVERRIDES: Record<string, number> = {
  water_drain: 1.8,
};

export function getSoundBaseVolume(
  soundName: string,
  defaultVolume: number = DEFAULT_SFX_VOLUME
): number {
  const key = soundName.trim().toLowerCase();
  return SOUND_VOLUME_OVERRIDES[key] ?? defaultVolume;
}
