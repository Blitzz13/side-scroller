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
