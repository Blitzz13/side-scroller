/** A single line as authored in `assets/raycast/dialog/<level>/dialog.json`. */
export interface ISubtitleLineData {
  speaker: string;
  isPlayer?: boolean;
  characterState?: string;
  /** Localised text keyed by language code (e.g. `en`). */
  text: Record<string, string>;
  /**
   * Optional: second in the audio when this line appears.
   * If omitted, the line's start is estimated from text length.
   */
  start?: number;
  /**
   * Optional: second in the audio when this line disappears.
   * If omitted, it stays until the next line starts (or the audio ends).
   */
  end?: number;
}

export interface ISubtitleDialogueData {
  context?: string;
  lines: ISubtitleLineData[];
}

export interface ISubtitleFileData {
  level: number;
  /** Keyed by audio file name (without extension). */
  dialogues: Record<string, ISubtitleDialogueData>;
}

/** A line resolved for the active language with its place on the audio timeline. */
export interface ISubtitleCue {
  speaker: string;
  isPlayer: boolean;
  characterState?: string;
  text: string;
  /** Start of the cue as a fraction (0..1) of the audio length. */
  start: number;
  /** End of the cue as a fraction (0..1) of the audio length. */
  end: number;
  /** Manual start in seconds from the JSON (overrides `start`). */
  startSec?: number;
  /** Manual end in seconds from the JSON (overrides `end`). */
  endSec?: number;
}
