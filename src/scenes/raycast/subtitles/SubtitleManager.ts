import { ISubtitleCue, ISubtitleFileData } from "./SubtitleTypes";

/**
 * Loads per-level `dialog.json` files and turns a dialogue (keyed by audio name)
 * into cues spread over the audio timeline.
 *
 * The audio for a dialogue is one file, so cue timing is estimated from text length
 * (longer lines stay on screen longer).
 */
export class SubtitleManager {
  private language: string = "en";
  private fallbackLanguage: string = "en";
  private files = new Map<string, ISubtitleFileData | null>();
  private loading = new Map<string, Promise<void>>();

  public setLanguage(language: string): void {
    this.language = language;
  }

  public getLanguage(): string {
    return this.language;
  }

  /** Loads `assets/raycast/dialog/<level>/dialog.json` (no-op if already loaded). */
  public load(levelName: string): Promise<void> {
    const level = this.normalizeLevel(levelName);
    if (this.files.has(level)) return Promise.resolve();
    const pending = this.loading.get(level);
    if (pending) return pending;

    const promise = fetch(`./assets/raycast/dialog/${level}/dialog.json`)
      .then((resp) => (resp.ok ? (resp.json() as Promise<ISubtitleFileData>) : null))
      .catch(() => null)
      .then((data) => {
        this.files.set(level, data && data.dialogues ? data : null);
        this.loading.delete(level);
      });
    this.loading.set(level, promise);
    return promise;
  }

  /** Returns the timed cues for an audio key, or an empty list if there is no subtitle data. */
  public getCues(levelName: string, audioKey: string): ISubtitleCue[] {
    const level = this.normalizeLevel(levelName);
    const key = audioKey.replace(/\.mp3$/i, "").trim();
    const dialogue = this.files.get(level)?.dialogues?.[key];
    if (!dialogue || !Array.isArray(dialogue.lines)) return [];

    const lines = dialogue.lines
      .map((line) => ({
        line,
        text: (line.text?.[this.language] ?? line.text?.[this.fallbackLanguage] ?? "").trim(),
      }))
      .filter((entry) => entry.text.length > 0);
    if (lines.length === 0) return [];

    // Weight by length; the +10 stops very short lines from flashing past.
    const weights = lines.map((entry) => entry.text.length + 10);
    const total = weights.reduce((a, b) => a + b, 0);

    let cursor = 0;
    return lines.map((entry, i) => {
      const start = cursor;
      cursor += weights[i] / total;
      return {
        speaker: entry.line.speaker,
        isPlayer: Boolean(entry.line.isPlayer),
        characterState: entry.line.characterState,
        text: entry.text,
        startSec: typeof entry.line.start === "number" ? entry.line.start : undefined,
        endSec: typeof entry.line.end === "number" ? entry.line.end : undefined,
        start,
        end: i === lines.length - 1 ? 1 : cursor,
      };
    });
  }

  private normalizeLevel(levelName: string): string {
    return levelName.replace(/\.json$/i, "").toLowerCase();
  }
}
