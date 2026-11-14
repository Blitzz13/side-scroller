import {
  Assets,
  Container,
  Graphics,
  ITextStyle,
  Rectangle,
  SCALE_MODES,
  Sprite,
  Text,
  TextStyle,
  Texture,
  Ticker,
} from "pixi.js";
import { sound } from "@pixi/sound";
import { BaseScene } from "./BaseScene";
import { Scene } from "../enums/Scene";
import { gameConfig } from "../configs/GameConfig";
import { creditsConfig, getCreditsLocale } from "../configs/CreditsConfig";
import { SettingsManager } from "../managers/SettingsManager";

interface IStarParticle {
  x: number;
  y: number;
  size: number;
  baseAlpha: number;
  speed: number;
  phase: number;
}

export class CreditsScene extends BaseScene {
  private lines: string[];
  private skipLabel: string;
  private isNavigating: boolean = false;
  private isSkippedToEnd: boolean = false;

  private bgSprite!: Sprite;
  private starGfx!: Graphics;
  private stars: IStarParticle[] = [];
  private currentText!: Text;
  private outgoingText?: Text;
  private skipBtn!: Container;

  private totalDurationSec: number = creditsConfig.fallbackDurationSec;
  private audioElapsedSec: number = 0;
  private currentLineIndex: number = 0;
  private outgoingAlpha: number = 0;
  private skipFadeInElapsed: number = 0;

  private soundInstance: any = null;
  private htmlAudio: HTMLAudioElement | null = null;
  private playGeneration: number = 0;
  private audioFinished: boolean = false;
  private finishingTransitionElapsed: number = 0;
  private finishingStartAlpha: number = 1;
  private isFinishing: boolean = false;

  private settingsUnsubscribe?: () => void;
  private tickerFn: (delta: number) => void;
  private keydownHandler: (e: KeyboardEvent) => void;

  constructor(stage: Container, scale: number, locale?: string) {
    super(stage, scale);

    const localeData = getCreditsLocale(locale);
    this.lines = localeData.lines;
    this.skipLabel = localeData.skipText;

    this.unlockMouse();
    this.eventMode = "static";
    this.interactiveChildren = true;
    this.cursor = "default";

    this.initBackground();
    this.initStarfield();
    this.initTextDisplay();
    this.initSkipButton();

    this.settingsUnsubscribe = SettingsManager.getInstance().subscribe(() => {
      this.syncActiveAudioVolume();
    });

    this.startCreditsAudio(0);

    this.tickerFn = (delta: number) => this.update(delta);
    Ticker.shared.add(this.tickerFn);

    this.keydownHandler = (e: KeyboardEvent) => this.handleKeyDown(e);
    window.addEventListener("keydown", this.keydownHandler);
  }

  private unlockMouse(): void {
    try {
      if (document.exitPointerLock) {
        document.exitPointerLock();
      }
    } catch {}
    if (typeof document !== "undefined" && document.body) {
      document.body.style.cursor = "default";
    }
  }

  private initBackground(): void {
    const blackBg = new Graphics();
    blackBg.beginFill(0x000000, 1.0);
    blackBg.drawRect(0, 0, gameConfig.width, gameConfig.height);
    blackBg.endFill();
    this.addChild(blackBg);

    this.bgSprite = new Sprite(Texture.WHITE);
    this.bgSprite.anchor.set(0.5);
    this.bgSprite.position.set(gameConfig.width / 2, gameConfig.height / 2);
    this.bgSprite.alpha = 0;
    this.addChild(this.bgSprite);

    const applyCoverScale = (tex: Texture) => {
      const texW = tex.width || gameConfig.width;
      const texH = tex.height || gameConfig.height;
      const coverScale = Math.max(gameConfig.width / texW, gameConfig.height / texH);
      this.bgSprite.texture = tex;
      this.bgSprite.scale.set(coverScale);
      this.bgSprite.alpha = 0.88;
    };

    Assets.load(creditsConfig.backgroundImage)
      .then((loadedTex: Texture) => {
        if (loadedTex && this.bgSprite && !this.bgSprite.destroyed) {
          applyCoverScale(loadedTex);
        }
      })
      .catch((err) => {
        console.warn("Failed to load credits star background:", err);
      });

    // Subtle dark scrim for crisp center-text contrast
    const scrim = new Graphics();
    scrim.beginFill(0x00040a, 0.35);
    scrim.drawRect(0, 0, gameConfig.width, gameConfig.height);
    scrim.endFill();
    this.addChild(scrim);
  }

  private initStarfield(): void {
    this.starGfx = new Graphics();
    this.addChild(this.starGfx);

    for (let i = 0; i < 85; i++) {
      this.stars.push({
        x: Math.random() * gameConfig.width,
        y: Math.random() * gameConfig.height,
        size: 0.8 + Math.random() * 1.6,
        baseAlpha: 0.25 + Math.random() * 0.55,
        speed: 0.8 + Math.random() * 1.8,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  private createCenteredText(content: string, isHighlight: boolean = false): Text {
    const dpr = typeof window !== "undefined" ? (window.devicePixelRatio || 1) : 1;
    const textRes = Math.max(3, Math.min(Math.round(dpr * 2), 4));
    const maxWrapW = Math.min(880, gameConfig.width - 140);

    const style: Partial<ITextStyle> = {
      fontFamily: "Segoe UI, Arial, sans-serif",
      fontSize: isHighlight ? 34 : 26,
      fontWeight: isHighlight ? "bold" : "600",
      fill: 0xffe81f,
      align: "center",
      wordWrap: true,
      wordWrapWidth: maxWrapW,
      lineHeight: isHighlight ? 46 : 38,
      letterSpacing: isHighlight ? 1.5 : 0.6,
      dropShadow: true,
      dropShadowColor: 0x001020,
      dropShadowBlur: 6,
      dropShadowDistance: 2,
    };

    const t = new Text(content, new TextStyle(style));
    t.resolution = textRes;
    t.roundPixels = true;
    if (t.texture?.baseTexture) {
      t.texture.baseTexture.scaleMode = SCALE_MODES.LINEAR;
    }
    t.anchor.set(0.5, 0.5);
    t.position.set(Math.round(gameConfig.width / 2), Math.round(gameConfig.height / 2));
    return t;
  }

  private initTextDisplay(): void {
    const firstLine = this.lines[0] || "";
    this.currentText = this.createCenteredText(firstLine, true);
    this.currentText.alpha = 0;
    this.addChild(this.currentText);
  }

  private initSkipButton(): void {
    const isMobile = SettingsManager.isMobileDevice();
    const btnW = isMobile ? 128 : 96;
    const btnH = isMobile ? 48 : 34;
    const btnX = gameConfig.width - btnW - (isMobile ? 20 : 24);
    const btnY = isMobile ? 24 : 20;

    this.skipBtn = new Container();
    this.skipBtn.position.set(btnX, btnY);
    this.skipBtn.zIndex = 100;
    this.skipBtn.hitArea = new Rectangle(
      isMobile ? -15 : -5,
      isMobile ? -15 : -5,
      btnW + (isMobile ? 30 : 10),
      btnH + (isMobile ? 30 : 10)
    );

    const btnGfx = new Graphics();
    const drawSkipGfx = (pressed: boolean) => {
      btnGfx.clear();
      btnGfx.beginFill(pressed ? 0x092636 : 0x05101e, 0.9);
      btnGfx.lineStyle(2, pressed ? 0x38bdf8 : 0x00e5ff, pressed ? 1.0 : 0.85);
      btnGfx.drawRoundedRect(0, 0, btnW, btnH, 8);
      btnGfx.endFill();
    };
    drawSkipGfx(false);
    this.skipBtn.addChild(btnGfx);

    const dpr = typeof window !== "undefined" ? (window.devicePixelRatio || 1) : 1;
    const textRes = Math.max(3, Math.min(Math.round(dpr * 2), 4));
    const lbl = new Text(this.skipLabel, {
      fontFamily: "Segoe UI, Arial, sans-serif",
      fontSize: isMobile ? 15 : 12,
      fontWeight: "bold",
      fill: 0x00e5ff,
      letterSpacing: 2,
      dropShadow: true,
      dropShadowColor: 0x002233,
      dropShadowDistance: 1,
    });
    lbl.resolution = textRes;
    lbl.anchor.set(0.5);
    lbl.position.set(btnW / 2, btnH / 2);
    this.skipBtn.addChild(lbl);

    this.skipBtn.eventMode = "static";
    this.skipBtn.cursor = "pointer";

    const triggerSkip = (e?: any) => {
      e?.stopPropagation?.();
      drawSkipGfx(false);
      this.skipBtn.scale.set(1.0);
      try {
        if (sound.exists("button_click")) {
          sound.play("button_click", { volume: 0.5 });
        }
      } catch {}
      this.handleSkip();
    };

    this.skipBtn.on("pointerdown", (e) => {
      e?.stopPropagation?.();
      drawSkipGfx(true);
      this.skipBtn.scale.set(0.94);
    });
    this.skipBtn.on("pointerup", triggerSkip);
    this.skipBtn.on("pointertap", triggerSkip);
    this.skipBtn.on("pointerupoutside", () => {
      drawSkipGfx(false);
      this.skipBtn.scale.set(1.0);
    });
    this.skipBtn.on("pointercancel", () => {
      drawSkipGfx(false);
      this.skipBtn.scale.set(1.0);
    });

    this.addChild(this.skipBtn);
  }

  private getEffectiveVolume(): number {
    return SettingsManager.getInstance().getEffectiveMusicVolume();
  }

  private syncActiveAudioVolume(): void {
    const vol = this.getEffectiveVolume();
    if (this.soundInstance) {
      try {
        this.soundInstance.volume = vol;
      } catch {}
    }
    if (this.htmlAudio) {
      try {
        this.htmlAudio.volume = vol;
      } catch {}
    }
    if (sound.exists(creditsConfig.audioAlias)) {
      try {
        sound.volume(creditsConfig.audioAlias, vol);
      } catch {}
    }
  }

  private stopCurrentAudioOnly(): void {
    this.playGeneration++;
    if (this.soundInstance) {
      try {
        this.soundInstance.stop?.();
      } catch {}
      this.soundInstance = null;
    }
    try {
      if (sound.exists(creditsConfig.audioAlias)) {
        sound.stop(creditsConfig.audioAlias);
      }
    } catch {}
    if (this.htmlAudio) {
      try {
        this.htmlAudio.pause();
        this.htmlAudio.onended = null;
        this.htmlAudio.ontimeupdate = null;
      } catch {}
      this.htmlAudio = null;
    }
  }

  private startCreditsAudio(startSec: number): void {
    this.stopCurrentAudioOnly();
    const token = this.playGeneration;
    const alias = creditsConfig.audioAlias;
    const volume = this.getEffectiveVolume();

    const onAudioComplete = () => {
      if (token !== this.playGeneration) return;
      this.audioFinished = true;
      this.beginExitToMainMenu();
    };

    const playWithHtmlAudio = () => {
      try {
        const audio = new Audio(creditsConfig.audioFile);
        audio.volume = volume;
        this.htmlAudio = audio;
        const seekAndPlay = () => {
          if (token !== this.playGeneration) return;
          if (audio.duration && Number.isFinite(audio.duration) && audio.duration > 0) {
            this.totalDurationSec = audio.duration;
          }
          const clampedStart =
            startSec > 0 && audio.duration > 0
              ? Math.min(startSec, Math.max(0, audio.duration - 1))
              : startSec;
          if (clampedStart > 0) {
            audio.currentTime = clampedStart;
          }
          audio.play().catch(() => {});
        };
        if (audio.readyState >= 1) {
          seekAndPlay();
        } else {
          audio.addEventListener("loadedmetadata", seekAndPlay, { once: true });
        }
        audio.ontimeupdate = () => {
          if (token !== this.playGeneration) return;
          if (audio.duration && Number.isFinite(audio.duration) && audio.duration > 0) {
            this.totalDurationSec = audio.duration;
          }
          this.audioElapsedSec = audio.currentTime;
        };
        audio.onended = onAudioComplete;
      } catch (err) {
        console.warn("Credits HTMLAudio playback failed:", err);
      }
    };

    const playViaPixi = () => {
      try {
        const existingSound = sound.find(alias);
        if (existingSound?.duration && existingSound.duration > 0) {
          this.totalDurationSec = existingSound.duration;
        }
        const clampedStart =
          startSec > 0 && this.totalDurationSec > 0
            ? Math.min(startSec, Math.max(0, this.totalDurationSec - 1))
            : startSec;
        const res = sound.play(alias, {
          start: clampedStart,
          volume,
          complete: onAudioComplete,
        });
        const attachInstance = (inst: any) => {
          if (!inst || token !== this.playGeneration) {
            try { inst?.stop?.(); } catch {}
            return;
          }
          this.soundInstance = inst;
          try {
            inst.volume = this.getEffectiveVolume();
            inst.on?.("progress", (progress: number, duration?: number) => {
              if (token !== this.playGeneration) return;
              if (typeof duration === "number" && duration > 0) {
                this.totalDurationSec = duration;
              }
              const dur = this.totalDurationSec;
              if (dur > 0) {
                this.audioElapsedSec = Math.max(this.audioElapsedSec, progress * dur);
              }
            });
            inst.once?.("end", onAudioComplete);
          } catch {}
        };
        if (res && typeof (res as any).then === "function") {
          (res as any).then(attachInstance).catch(() => playWithHtmlAudio());
        } else {
          attachInstance(res);
        }
      } catch {
        playWithHtmlAudio();
      }
    };

    if (sound.exists(alias)) {
      const s = sound.find(alias);
      if (s && s.isLoaded) {
        playViaPixi();
      } else {
        playWithHtmlAudio();
      }
    } else {
      try {
        sound.add(alias, {
          url: creditsConfig.audioFile,
          preload: true,
          loaded: (err, loadedSound) => {
            if (token !== this.playGeneration) return;
            if (!err && loadedSound) {
              if (loadedSound.duration > 0) {
                this.totalDurationSec = loadedSound.duration;
              }
              if (!this.htmlAudio) {
                playViaPixi();
              }
            }
          },
        });
      } catch {}
      playWithHtmlAudio();
    }
  }

  private switchToLine(index: number): void {
    const safeIdx = Math.max(0, Math.min(this.lines.length - 1, index));
    if (safeIdx === this.currentLineIndex) return;

    if (this.outgoingText && !this.outgoingText.destroyed) {
      this.outgoingText.destroy();
    }
    this.outgoingText = this.currentText;
    this.outgoingAlpha = this.currentText.alpha;

    this.currentLineIndex = safeIdx;
    const isHighlight = safeIdx === 0 || safeIdx === this.lines.length - 1;
    this.currentText = this.createCenteredText(this.lines[safeIdx], isHighlight);
    this.currentText.alpha = 0;
    this.addChild(this.currentText);
    if (this.skipBtn && !this.skipBtn.destroyed) {
      this.addChild(this.skipBtn);
    }
  }

  private handleSkip(): void {
    if (this.isSkippedToEnd || this.isFinishing || this.isNavigating) return;
    this.isSkippedToEnd = true;
    this.skipFadeInElapsed = 0;

    if (this.skipBtn) {
      this.skipBtn.visible = false;
      this.skipBtn.eventMode = "none";
    }

    // Always show the final message before exiting
    const lastIdx = Math.max(0, this.lines.length - 1);
    if (this.currentLineIndex !== lastIdx) {
      this.switchToLine(lastIdx);
    } else if (this.currentText.alpha >= 0.99) {
      this.skipFadeInElapsed = 2.0;
    }

    // Seek audio to the 37th second if not already past it, and let it finish naturally
    const targetSeek = creditsConfig.skipAudioStartSec;
    if (this.audioElapsedSec < targetSeek) {
      this.audioElapsedSec = targetSeek;
      this.startCreditsAudio(targetSeek);
    }
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (e.key === "Escape" || e.key === " " || e.key === "Enter") {
      this.handleSkip();
    }
  }

  private beginExitToMainMenu(): void {
    if (this.isFinishing || this.isNavigating) return;
    this.isFinishing = true;
    this.finishingTransitionElapsed = 0;
    this.finishingStartAlpha = this.currentText ? this.currentText.alpha : 1;
  }

  private goToMainMenu(): void {
    if (this.isNavigating) return;
    this.isNavigating = true;
    this.emit(Scene.Change, Scene.MainMenu);
  }

  private update(delta: number): void {
    const dt = Math.min(delta / 60, 0.1);
    this.audioElapsedSec += dt;

    // Twinkle stars
    this.starGfx.clear();
    const t = this.audioElapsedSec;
    for (const s of this.stars) {
      const alpha = s.baseAlpha * (0.6 + 0.4 * Math.sin(t * s.speed + s.phase));
      this.starGfx.beginFill(0xffffff, Math.max(0.05, Math.min(1, alpha)));
      this.starGfx.drawCircle(s.x, s.y, s.size);
      this.starGfx.endFill();
    }

    // Fade out any outgoing line cleanly
    if (this.outgoingText && !this.outgoingText.destroyed) {
      this.outgoingAlpha = Math.max(0, this.outgoingAlpha - dt * 1.8);
      this.outgoingText.alpha = this.outgoingAlpha;
      if (this.outgoingAlpha <= 0) {
        this.outgoingText.destroy();
        this.outgoingText = undefined;
      }
    }

    if (this.isFinishing) {
      this.finishingTransitionElapsed += dt;
      this.currentText.alpha = Math.max(
        0,
        this.finishingStartAlpha * (1 - this.finishingTransitionElapsed / 0.8)
      );
      if (this.finishingTransitionElapsed >= 0.85) {
        this.goToMainMenu();
      }
      return;
    }

    if (this.isSkippedToEnd) {
      this.skipFadeInElapsed += dt;
      // Wait for outgoing text to fade slightly before fading in the final line
      const fadeInAlpha = Math.min(1, Math.max(0, (this.skipFadeInElapsed - 0.25) / 0.85));
      this.currentText.alpha = Math.max(this.currentText.alpha, fadeInAlpha);
      if (!this.audioFinished && this.audioElapsedSec >= this.totalDurationSec + 0.5) {
        this.beginExitToMainMenu();
      }
      return;
    }

    // Normal sequential credits stretched across the full music duration
    const count = Math.max(1, this.lines.length);
    const slotDuration = Math.max(2.5, this.totalDurationSec / count);
    const targetIdx = Math.max(
      this.currentLineIndex,
      Math.min(count - 1, Math.floor(this.audioElapsedSec / slotDuration))
    );
    if (targetIdx !== this.currentLineIndex) {
      this.switchToLine(targetIdx);
    }

    const slotStart = this.currentLineIndex * slotDuration;
    const localTime = Math.max(0, this.audioElapsedSec - slotStart);
    const fadeDur = Math.min(0.85, slotDuration * 0.22);

    let alpha = 1;
    const isLastLine = this.currentLineIndex === count - 1;
    if (localTime < fadeDur) {
      alpha = localTime / fadeDur;
    } else if (!isLastLine && localTime > slotDuration - fadeDur) {
      alpha = Math.max(0, (slotDuration - localTime) / fadeDur);
    }
    this.currentText.alpha = Math.max(0, Math.min(1, alpha));

    if (this.audioElapsedSec >= this.totalDurationSec + 0.5) {
      this.beginExitToMainMenu();
    }
  }

  public dispose(): void {
    this.settingsUnsubscribe?.();
    this.settingsUnsubscribe = undefined;
    Ticker.shared.remove(this.tickerFn);
    window.removeEventListener("keydown", this.keydownHandler);
    this.stopCurrentAudioOnly();
    this.destroy({ children: true });
  }
}
