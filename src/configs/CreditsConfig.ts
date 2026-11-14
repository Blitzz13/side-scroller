export interface ICreditsLocaleData {
  /** Ordered lines/paragraphs shown one by one in the center of the screen. */
  lines: string[];
  /** Label for the skip button on desktop and mobile. */
  skipText: string;
}

export interface ICreditsConfig {
  backgroundImage: string;
  audioAlias: string;
  audioFile: string;
  /** Position in seconds to seek audio to when Skip is pressed. */
  skipAudioStartSec: number;
  /** Default duration (seconds) used until audio metadata is available. */
  fallbackDurationSec: number;
  /** Iris wipe transition duration (seconds). */
  irisWipeDurationSec: number;
  /** Default locale key. */
  defaultLocale: string;
}

export const creditsConfig: ICreditsConfig = {
  backgroundImage: "./assets/cutscenes/intro/star_background.jpg",
  audioAlias: "end_credits_theme",
  audioFile: "./assets/sounds/end_credits_theme.mp3",
  skipAudioStartSec: 37,
  fallbackDurationSec: 50,
  irisWipeDurationSec: 1.15,
  defaultLocale: "en",
};

/**
 * Translatable credits text keyed by ISO language code.
 * Add new language entries here (e.g. "es", "de", "fr", "bg") to localize the credits.
 */
export const CREDITS_TRANSLATIONS: Record<string, ICreditsLocaleData> = {
  en: {
    skipText: "SKIP",
    lines: [
      "Thank you for playing!",
      "For this project, I was heavily inspired by the classic Star Wars: Dark Forces game.",
      "Even though it is a short game, Part One took many months of learning how to edit audio and integrate tools like Tiled 2D.",
      "AI really helped speed up the pace by assisting with architecture and generating some of the game's assets and audio.",
      "All story ideas and dialogue were written by me and refined with AI, and the voices were performed using AI.",
      "I truly support real voice actors, but since my goal was to learn more about game development, I chose the faster and more affordable AI approach.",
      "All rights and credits for original music, characters, and assets belong to their respective artists and owners.",
      "I have more ideas and plans to finish Tuk's mission — though his adventure may not continue in the same gameplay style.",
      "Hope to see you in Part Two!",
    ],
  },
};

export function getCreditsLocale(locale?: string): ICreditsLocaleData {
  const browserLang =
    typeof navigator !== "undefined" && navigator.language
      ? navigator.language.split("-")[0].toLowerCase()
      : "";
  const candidate = (locale || browserLang || creditsConfig.defaultLocale).toLowerCase();
  return CREDITS_TRANSLATIONS[candidate] || CREDITS_TRANSLATIONS[creditsConfig.defaultLocale];
}
