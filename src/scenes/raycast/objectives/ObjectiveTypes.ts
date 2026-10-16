export interface ILevelObjective {
  id: string;
  key: string;
  title: string;
  description: string;
  isCompleted: boolean;
  isOptional?: boolean;
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
}

export interface IMissionManagerCallbacks {
  onTriggerAlarm?: () => void;
  showToast?: (text: string, color?: number, durationSec?: number) => void;
  showPrompt?: (text: string) => void;
  hidePrompt?: () => void;
  getScreenSize?: () => { width: number; height: number };
}
