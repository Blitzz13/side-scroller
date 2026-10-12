export interface IHologramGlitchConfig {
  /** Whether glitch animations are enabled */
  enabled: boolean;
  /** Minimum interval in seconds between glitch bursts */
  minInterval: number;
  /** Maximum interval in seconds between glitch bursts */
  maxInterval: number;
  /** Minimum duration in seconds of a single glitch */
  minDuration: number;
  /** Maximum duration in seconds of a single glitch */
  maxDuration: number;
  /** Maximum horizontal jitter in pixels */
  maxJitterX: number;
  /** Maximum vertical jitter in pixels */
  maxJitterY: number;
  /** Minimum alpha opacity during a glitch */
  minAlpha: number;
  /** Color tint applied during glitch flashes (hex number) */
  tintGlitch: number;
}

export interface IHologramConfig {
  /** Relative asset path to the hologram sprite */
  image: string;
  /** X coordinate on screen (canvas width: 1280) */
  x: number;
  /** Y coordinate on screen (canvas height: 720) */
  y: number;
  /** Sprite scale multiplier */
  scale: number;
  /** Pivot anchor point { x: 0..1, y: 0..1 } */
  anchor: { x: number; y: number };
  /** Duration of initial fade-in transition in seconds */
  fadeInDuration: number;
  /** Resting alpha transparency (0.0 - 1.0) */
  baseAlpha: number;
  /** Normal hologram color tint */
  tint: number;
  /** Glitch effect settings */
  glitch: IHologramGlitchConfig;
}

export interface IDialogBoxSpeakerColors {
  monMothma: number;
  tuk: number;
  default: number;
}

export interface IDialogBoxConfig {
  /** X coordinate of dialog box top-left */
  x: number;
  /** Y coordinate of dialog box top-left */
  y: number;
  /** Width in pixels */
  width: number;
  /** Height in pixels */
  height: number;
  /** Background panel fill color */
  backgroundColor: number;
  /** Background opacity (0.0 - 1.0) */
  backgroundAlpha: number;
  /** Border outline color */
  borderColor: number;
  /** Border outline stroke width in pixels */
  borderWidth: number;
  /** Rounded corner radius in pixels */
  borderRadius: number;
  /** Header title text */
  headerText: string;
  /** Header title text color */
  headerColor: number;
  /** Speaker badge label colors */
  speakerColors: IDialogBoxSpeakerColors;
  /** Dialogue body text color */
  textColor: number;
  /** Dialogue font size in pixels */
  fontSize: number;
  /** Line spacing */
  lineHeight: number;
  /** Typewriter character reveal speed (characters per second) */
  typewriterSpeed: number;
  /**
   * Audio timestamp in seconds when each line from prologue_dialog.json starts.
   * Matches audio timing for the 4 spoken lines in prologue_dialog.mp3.
   */
  lineTimings: number[];
}

export interface IPromptConfig {
  /** Main call-to-action text displayed after audio ends */
  text: string;
  /** Sub-prompt hint */
  subText: string;
  /** Font size in pixels */
  fontSize: number;
  /** Text color */
  color: number;
  /** Pulsing glow animation frequency */
  pulseSpeed: number;
}

export interface ICutsceneConfig {
  id: string;
  /** Path to background image */
  backgroundImage: string;
  /** Path to audio dialogue mp3 */
  audioFile: string;
  /** Path to dialogue JSON data */
  dialogJsonFile: string;
  /** Name of level to load after cutscene finishes */
  targetLevel: string;
  /** Hologram display settings */
  hologram: IHologramConfig;
  /** Dialog transmission box settings */
  dialogBox: IDialogBoxConfig;
  /** Start mission prompt banner settings */
  prompt: IPromptConfig;
  /** Skip button label */
  skipButtonText: string;
}

export const cutscene1Config: ICutsceneConfig = {
  id: "cutscene1",
  backgroundImage: "assets/cutscenes/ship_holodeck.png",
  audioFile: "assets/cutscenes/cutscene1/prologue_dialog.mp3",
  dialogJsonFile: "assets/cutscenes/cutscene1/prologue_dialog.json",
  targetLevel: "level1",
  hologram: {
    image: "assets/cutscenes/mon_hologram.png",
    x: 620,
    y: 420,
    scale: 1,
    anchor: { x: 0.5, y: 1.0 },
    fadeInDuration: 1,
    baseAlpha: 1,
    tint: 0xb0f0ff,
    glitch: {
      enabled: true,
      minInterval: 2.5,
      maxInterval: 5.5,
      minDuration: 0.08,
      maxDuration: 0.22,
      maxJitterX: 7,
      maxJitterY: 4,
      minAlpha: 0.35,
      tintGlitch: 0xffffff,
    },
  },
  dialogBox: {
    x: 810,
    y: 70,
    width: 450,
    height: 520,
    backgroundColor: 0x05101e,
    backgroundAlpha: 0.88,
    borderColor: 0x00e5ff,
    borderWidth: 2,
    borderRadius: 14,
    headerText: "INCOMING TRANSMISSION // SECURE CHANNEL",
    headerColor: 0x00e5ff,
    speakerColors: {
      monMothma: 0x38bdf8,
      tuk: 0xf59e0b,
      default: 0xffffff,
    },
    textColor: 0xe2e8f0,
    fontSize: 16,
    lineHeight: 24,
    typewriterSpeed: 20,
    lineTimings: [3.8, 17.5, 29.5, 33],
  },
  prompt: {
    text: "CLICK ANYWHERE TO START MISSION",
    subText: "[ OR PRESS ENTER / SPACE ]",
    fontSize: 22,
    color: 0x00ffcc,
    pulseSpeed: 3.5,
  },
  skipButtonText: "SKIP [ESC]",
};

export default cutscene1Config;
