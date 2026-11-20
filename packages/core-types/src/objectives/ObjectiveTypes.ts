export interface ILevelObjective {
  id: string;
  key: string;
  title: string;
  description: string;
  isCompleted: boolean;
  isOptional?: boolean;
}

export interface ITriggerSoundConfig {
  action: "start" | "stop";
  delay: number;
  overrideBackgroundMusic: boolean;
  shouldLoop: boolean;
  soundName: string;
}

export interface ITriggerZone {
  id: number;
  name: string;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  event: "onEnter" | "onExit";
  shouldBePressed: boolean;
  triggerAlarm: boolean;
  voicelines: string[];
  objectiveKey?: string;
  isObjective?: boolean;
  hasTriggered: boolean;
  isPlayerInside: boolean;
  enabled?: boolean;
  linkAction?: string;
  linkIds?: string[];
  wait?: {
    shouldWait: boolean;
    waitTimeInSeconds: number;
  };
  displayMessage?: string;
  soundOnTrigger?: string[];
  sound?: ITriggerSoundConfig;
  isWaitRunning?: boolean;
  waitEndTime?: number;
}

export interface IMissionManagerCallbacks {
  onTriggerAlarm?: () => void;
  onTriggerFired?: (trigger: ITriggerZone) => void;
  onTriggerWaitComplete?: (trigger: ITriggerZone) => void;
  /** A trigger voiceline started. `key` is the audio name without extension. */
  onVoicelineStart?: (level: string, key: string) => void;
  /** Audio position of the active voiceline as a fraction (0..1), plus its length in seconds if known. */
  onVoicelineProgress?: (key: string, progress: number, durationSec?: number) => void;
  /** The voiceline finished or was stopped/replaced. */
  onVoicelineEnd?: (key: string) => void;
  showToast?: (text: string, color?: number, durationSec?: number) => void;
  showPrompt?: (text: string, color?: number) => void;
  hidePrompt?: () => void;
  getScreenSize?: () => { width: number; height: number };
}
