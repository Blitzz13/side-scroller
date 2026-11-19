import { Container, Graphics, Text } from "pixi.js";
import { gameConfig } from "../../../configs/GameConfig";
import { getRaycastUIConfig, IRaycastUIConfig } from "../../../configs/RaycastUIConfig";
import { SettingsManager } from "../../../managers/SettingsManager";
import { IDisposable } from "../../../characters/interfaces/IDisposable";
import { ISubtitleCue } from "./SubtitleTypes";

/**
 * Bottom-centre subtitle bar. Driven by audio progress (0..1), so it stays in sync
 * with the voiceline even when the game is paused.
 */
export class RaycastSubtitles extends Container implements IDisposable {
  private bg: Graphics;
  private speakerText: Text;
  private bodyText: Text;

  private cues: ISubtitleCue[] = [];
  private activeCue: ISubtitleCue | null = null;

  private readonly uiCfg: IRaycastUIConfig["subtitles"];
  private readonly maxWidth: number;
  private readonly paddingX: number;
  private readonly paddingY: number;
  private readonly speakerBodyGap: number;
  private readonly cornerRadius: number;
  private unsubscribeSettings?: () => void;

  constructor() {
    super();
    this.eventMode = "none";
    this.visible = false;

    this.uiCfg = getRaycastUIConfig().subtitles;
    this.paddingX = this.uiCfg.paddingX;
    this.paddingY = this.uiCfg.paddingY;
    this.speakerBodyGap = this.uiCfg.speakerBodyGap;
    this.cornerRadius = this.uiCfg.cornerRadius;

    const screenW = gameConfig.width;
    const screenH = gameConfig.height;
    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));

    this.maxWidth = Math.min(screenW * this.uiCfg.maxWidthRatio, this.uiCfg.maxWidthCap);
    this.position.set(screenW / 2, screenH - this.uiCfg.bottomOffset);

    this.bg = new Graphics();
    this.addChild(this.bg);

    this.speakerText = new Text("", {
      fontFamily: "Segoe UI, Arial, sans-serif",
      fontSize: this.uiCfg.speakerFontSize,
      fontWeight: "bold",
      fill: 0x00e5ff,
      letterSpacing: this.uiCfg.speakerLetterSpacing,
    });
    this.speakerText.resolution = dpr;
    this.addChild(this.speakerText);

    this.bodyText = new Text("", {
      fontFamily: "Segoe UI, Arial, sans-serif",
      fontSize: this.uiCfg.bodyFontSize,
      fill: 0xffffff,
      align: "center",
      wordWrap: true,
      wordWrapWidth: this.maxWidth - this.paddingX * 2,
      dropShadow: true,
      dropShadowColor: 0x000000,
      dropShadowDistance: 1,
      dropShadowBlur: 2,
    });
    this.bodyText.resolution = dpr;
    this.addChild(this.bodyText);

    this.applySubtitleScale();
    this.unsubscribeSettings = SettingsManager.getInstance().subscribe(() => {
      this.applySubtitleScale();
    });
  }

  private applySubtitleScale(): void {
    const scale = SettingsManager.getInstance().getSubtitleScale();
    this.speakerText.style.fontSize = Math.round(this.uiCfg.speakerFontSize * scale);
    this.bodyText.style.fontSize = Math.round(this.uiCfg.bodyFontSize * scale);
    this.bodyText.style.wordWrapWidth = this.maxWidth - this.paddingX * 2;
    if (this.activeCue && this.visible) {
      this.renderCue(this.activeCue);
    }
  }

  /** Starts showing a dialogue; call `setProgress` as the audio plays. */
  public start(cues: ISubtitleCue[]): void {
    this.cues = cues;
    this.activeCue = null;
    this.visible = false;
    if (cues.length === 0) return;
    // Manual times need the audio length, so wait for the first progress update.
    if (!cues.some((c) => c.startSec !== undefined || c.endSec !== undefined)) {
      this.setProgress(0);
    }
  }

  /**
   * @param progress audio position as a fraction (0..1).
   * @param durationSec audio length in seconds; required for manual `start`/`end` times
   *                    (without it the estimated, length-based timing is used).
   */
  public setProgress(progress: number, durationSec?: number): void {
    if (this.cues.length === 0) return;
    const p = Math.max(0, Math.min(1, progress));
    const useSeconds = typeof durationSec === "number" && isFinite(durationSec) && durationSec > 0;
    // Work in seconds when the duration is known, otherwise in audio fractions.
    const scale = useSeconds ? (durationSec as number) : 1;
    const now = p * scale;

    const startOf = (c: ISubtitleCue): number =>
      useSeconds && c.startSec !== undefined ? c.startSec : c.start * scale;

    let cue: ISubtitleCue | null = null;
    for (let i = 0; i < this.cues.length; i++) {
      const c = this.cues[i];
      const next = this.cues[i + 1];
      const end =
        useSeconds && c.endSec !== undefined ? c.endSec : next ? startOf(next) : Infinity;
      if (now >= startOf(c) && now < end) {
        cue = c;
        break;
      }
    }

    if (cue !== this.activeCue) {
      this.activeCue = cue;
      if (cue) {
        this.renderCue(cue);
      } else {
        this.visible = false;
      }
    }
  }

  public clear(): void {
    this.cues = [];
    this.activeCue = null;
    this.visible = false;
  }

  private renderCue(cue: ISubtitleCue): void {
    const speaker = cue.characterState
      ? `${cue.speaker.toUpperCase()}  ·  ${cue.characterState.toUpperCase()}`
      : cue.speaker.toUpperCase();
    this.speakerText.text = speaker;
    this.speakerText.style.fill = cue.isPlayer ? 0x00e5ff : 0xffb347;
    this.bodyText.text = cue.text;

    const contentW = Math.max(this.speakerText.width, this.bodyText.width);
    const boxW = Math.min(this.maxWidth, contentW + this.paddingX * 2);
    const boxH = this.paddingY * 2 + this.speakerText.height + this.speakerBodyGap + this.bodyText.height;

    // Anchor the box's bottom edge at the container origin so it grows upwards.
    this.bg.clear();
    this.bg.beginFill(0x05101e, 0.82);
    this.bg.lineStyle(1.5, cue.isPlayer ? 0x00e5ff : 0xffb347, 0.7);
    this.bg.drawRoundedRect(-boxW / 2, -boxH, boxW, boxH, this.cornerRadius);
    this.bg.endFill();

    this.speakerText.position.set(-this.speakerText.width / 2, -boxH + this.paddingY);
    this.bodyText.position.set(
      -this.bodyText.width / 2,
      -boxH + this.paddingY + this.speakerText.height + this.speakerBodyGap
    );
    this.visible = true;
  }

  public dispose(): void {
    if (this.unsubscribeSettings) {
      this.unsubscribeSettings();
      this.unsubscribeSettings = undefined;
    }
    this.clear();
    this.destroy({ children: true });
  }
}
