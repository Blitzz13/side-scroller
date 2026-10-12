import {
  Assets,
  Container,
  Graphics,
  ITextStyle,
  MIPMAP_MODES,
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
import { cutscene1Config, ICutsceneConfig } from "../../assets/cutscenes/cutscene1/config";

interface IParsedDialogLine {
  speaker: string;
  text: string;
  timing: number;
}

export class CutsceneScene extends BaseScene {
  private config: ICutsceneConfig;
  private isNavigating: boolean = false;
  private isDialogFinished: boolean = false;
  private audioElapsed: number = 0;
  private soundInstance: any = null;
  private soundDuration: number = 44.0;
  private tickerFn: (delta: number) => void;
  private keydownHandler: (e: KeyboardEvent) => void;

  // Visual Display Elements
  private bgSprite: Sprite | null = null;
  private hologramContainer: Container;
  private hologramSprite: Sprite | null = null;
  private hologramBaseGlow: Graphics | null = null;
  private glitchGfx: Graphics;

  // Glitch animation state
  private isGlitching: boolean = false;
  private glitchTimer: number = 2.5;
  private glitchDurationTimer: number = 0;
  private fadeElapsed: number = 0;
  private totalTimeElapsed: number = 0;

  // Dialog Box Elements
  private dialogContainer: Container;
  private dialogBoxGfx: Graphics;
  private dialogContentContainer: Container;
  private parsedLines: IParsedDialogLine[] = [];
  private lineDisplayObjects: Array<{
    container: Container;
    speakerText: Text;
    bodyText: Text;
    fullText: string;
    revealedChars: number;
  }> = [];

  // Dialog layout & scrolling
  private targetScrollY: number = 0;
  private currentScrollY: number = 0;
  private minScrollY: number = 0;
  private dialogContentMask: Graphics | null = null;

  // Call to action prompt
  private promptContainer: Container;
  private promptText!: Text;
  private promptSubText!: Text;

  // Skip button
  private skipBtn!: Container;

  constructor(stage: Container, scale: number, targetLevel: string = "level1") {
    super(stage, scale);

    this.config = {
      ...cutscene1Config,
      targetLevel: targetLevel || cutscene1Config.targetLevel,
    };

    // Release mouse pointer lock so mouse clicking works everywhere
    this.unlockMouse();

    // 1. Root Containers
    this.eventMode = "static";
    this.cursor = "pointer";
    this.on("pointerdown", () => this.handleScreenClick());

    this.hologramContainer = new Container();
    this.glitchGfx = new Graphics();
    this.dialogContainer = new Container();
    this.dialogBoxGfx = new Graphics();
    this.dialogContentContainer = new Container();
    this.promptContainer = new Container();
    this.promptContainer.visible = false;
    this.promptContainer.alpha = 0;

    // 2. Parse Dialogue Lines
    this.initDialogueLines();

    // 3. Build UI & Sprites
    this.initBackground();
    this.initHologram();
    this.initDialogBox();
    this.initPromptBanner();
    this.initSkipButton();

    // 4. Setup Audio & Playback
    this.initAudio();

    // 5. Setup Ticker loop for animations & typewriter
    this.tickerFn = (delta: number) => this.update(delta);
    Ticker.shared.add(this.tickerFn);

    // 6. Keyboard controls
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

  private initDialogueLines(): void {
    const rawLines = [
      "Mon Mothma: Tuk, everything hinges on this. The transport will be in your sector at any moment. You need to get in, secure the asset, and get out. And Tuk... do try to keep the fireworks to a minimum this time.",
      "Tuk: Relax, Senator. You hired me because I don't botch snatch-and-grabs. Going dark in ten seconds—just make sure your extraction team is at the rendezvous when I breach that hull. Don't leave me hanging.",
      "Mon Mothma: We will be there. May the Force be with you.",
      "Tuk: Keep the Force, Senator. In my line of work, I'll take a charged blaster and a clean exit over luck any day. Tuk out.",
    ];

    const timings = this.config.dialogBox.lineTimings || [0.0, 14.5, 29.5, 33.5];

    this.parsedLines = rawLines.map((line, idx) => {
      const colonIdx = line.indexOf(":");
      let speaker = "";
      let text = line;
      if (colonIdx > 0) {
        speaker = line.substring(0, colonIdx).trim();
        text = line.substring(colonIdx + 1).trim();
      }
      return {
        speaker,
        text,
        timing: timings[idx] !== undefined ? timings[idx] : idx * 10,
      };
    });

    // Attempt to load external json if available in cache or fetch
    this.tryLoadExternalDialogJson();
  }

  private async tryLoadExternalDialogJson(): Promise<void> {
    try {
      let jsonData: any = null;
      if (Assets.cache.has(this.config.dialogJsonFile)) {
        jsonData = Assets.get(this.config.dialogJsonFile);
      } else {
        jsonData = await Assets.load(this.config.dialogJsonFile);
      }

      if (jsonData && Array.isArray(jsonData.en) && jsonData.en.length > 0) {
        const timings = this.config.dialogBox.lineTimings || [0.0, 14.5, 29.5, 33.5];
        this.parsedLines = jsonData.en.map((line: string, idx: number) => {
          const colonIdx = line.indexOf(":");
          let speaker = "";
          let text = line;
          if (colonIdx > 0) {
            speaker = line.substring(0, colonIdx).trim();
            text = line.substring(colonIdx + 1).trim();
          }
          return {
            speaker,
            text,
            timing: timings[idx] !== undefined ? timings[idx] : idx * 10,
          };
        });
        if (this.dialogContentContainer) {
          this.buildDialogueDisplayObjects();
        }
      }
    } catch {}
  }

  private initBackground(): void {
    let bgTexture: Texture | undefined;
    const bgPath = this.config.backgroundImage;
    try {
      if (Assets.cache.has(bgPath)) {
        bgTexture = Assets.get(bgPath);
      } else {
        bgTexture = Texture.from(bgPath);
      }
    } catch {}

    if (!bgTexture) {
      bgTexture = Texture.WHITE;
    }

    if (bgTexture && bgTexture.baseTexture) {
      bgTexture.baseTexture.scaleMode = SCALE_MODES.NEAREST;
      bgTexture.baseTexture.mipmap = MIPMAP_MODES.OFF;
      bgTexture.baseTexture.update();
    }

    this.bgSprite = new Sprite(bgTexture);
    this.bgSprite.width = gameConfig.width;
    this.bgSprite.height = gameConfig.height;
    this.addChild(this.bgSprite);

    // Asynchronously ensure high-res background texture is loaded
    Assets.load(bgPath)
      .then((loadedTex) => {
        if (loadedTex && this.bgSprite) {
          if (loadedTex.baseTexture) {
            loadedTex.baseTexture.scaleMode = SCALE_MODES.NEAREST;
            loadedTex.baseTexture.mipmap = MIPMAP_MODES.OFF;
            loadedTex.baseTexture.update();
          }
          this.bgSprite.texture = loadedTex;
          this.bgSprite.width = gameConfig.width;
          this.bgSprite.height = gameConfig.height;
        }
      })
      .catch(() => {});
  }

  private initHologram(): void {
    const holoCfg = this.config.hologram;
    this.hologramContainer.position.set(holoCfg.x, holoCfg.y);

    // 2. Hologram Sprite
    let holoTexture: Texture | undefined;
    try {
      if (Assets.cache.has(holoCfg.image)) {
        holoTexture = Assets.get(holoCfg.image);
      } else {
        holoTexture = Texture.from(holoCfg.image);
      }
    } catch {}

    if (!holoTexture) {
      holoTexture = Texture.WHITE;
    }

    if (holoTexture && holoTexture.baseTexture) {
      holoTexture.baseTexture.scaleMode = SCALE_MODES.NEAREST;
      holoTexture.baseTexture.mipmap = MIPMAP_MODES.OFF;
      holoTexture.baseTexture.update();
    }

    this.hologramSprite = new Sprite(holoTexture);
    this.hologramSprite.anchor.set(holoCfg.anchor.x, holoCfg.anchor.y);
    this.hologramSprite.scale.set(holoCfg.scale);
    this.hologramSprite.tint = holoCfg.tint;
    this.hologramSprite.alpha = 0; // Starts at 0, smoothly fades in

    this.hologramContainer.addChild(this.hologramSprite);
    this.hologramContainer.addChild(this.glitchGfx);
    this.addChild(this.hologramContainer);

    // Asynchronously load the texture if it was not preloaded
    Assets.load(holoCfg.image)
      .then((loadedTex) => {
        if (loadedTex && this.hologramSprite) {
          if (loadedTex.baseTexture) {
            loadedTex.baseTexture.scaleMode = SCALE_MODES.NEAREST;
            loadedTex.baseTexture.mipmap = MIPMAP_MODES.OFF;
            loadedTex.baseTexture.update();
          }
          this.hologramSprite.texture = loadedTex;
        }
      })
      .catch(() => {});
  }

  private initDialogBox(): void {
    const boxCfg = this.config.dialogBox;
    this.dialogContainer.position.set(boxCfg.x, boxCfg.y);

    // Draw cybernetic dialog panel
    this.dialogBoxGfx.clear();
    // Glassmorphism background
    this.dialogBoxGfx.beginFill(boxCfg.backgroundColor, boxCfg.backgroundAlpha);
    this.dialogBoxGfx.lineStyle(boxCfg.borderWidth, boxCfg.borderColor, 0.9);
    this.dialogBoxGfx.drawRoundedRect(0, 0, boxCfg.width, boxCfg.height, boxCfg.borderRadius);
    this.dialogBoxGfx.endFill();

    // Top glowing accent line
    this.dialogBoxGfx.beginFill(boxCfg.borderColor, 0.95);
    this.dialogBoxGfx.drawRoundedRect(16, 6, boxCfg.width - 32, 3, 2);
    this.dialogBoxGfx.endFill();

    // Subtle header divider
    this.dialogBoxGfx.lineStyle(1, 0x1e3a5f, 0.7);
    this.dialogBoxGfx.moveTo(16, 44);
    this.dialogBoxGfx.lineTo(boxCfg.width - 16, 44);

    this.dialogContainer.addChild(this.dialogBoxGfx);

    // Header Title
    this.createSharpText(
      boxCfg.headerText,
      {
        fontSize: 13,
        fontWeight: "bold",
        fill: boxCfg.headerColor,
        letterSpacing: 2,
      },
      24,
      18,
      0,
      0,
      this.dialogContainer
    );

    // // Live Indicator Tag
    // const liveTag = this.createSharpText(
    //   "● LIVE TRANSMISSION",
    //   {
    //     fontSize: 11,
    //     fontWeight: "bold",
    //     fill: 0x00ffcc,
    //     letterSpacing: 1,
    //   },
    //   boxCfg.width - 24,
    //   19,
    //   1,
    //   0,
    //   this.dialogContainer
    // );

    // Dialog messages container
    this.dialogContentContainer.position.set(24, 56);
    this.dialogContainer.addChild(this.dialogContentContainer);

    // Mask to ensure messages never spill outside the dialog box
    this.dialogContentMask = new Graphics();
    this.dialogContentMask.beginFill(0xffffff);
    this.dialogContentMask.drawRect(0, 0, Math.max(100, boxCfg.width - 32), Math.max(50, boxCfg.height - 72));
    this.dialogContentMask.endFill();
    this.dialogContentMask.position.set(16, 52);
    this.dialogContainer.addChild(this.dialogContentMask);
    this.dialogContentContainer.mask = this.dialogContentMask;

    // Enable wheel scrolling on dialogContainer
    this.dialogContainer.eventMode = "static";
    this.dialogContainer.on("wheel", (e: any) => {
      e?.stopPropagation?.();
      const delta = e.deltaY || 0;
      this.targetScrollY = Math.min(0, Math.max(this.minScrollY, this.targetScrollY - delta * 0.6));
    });

    this.buildDialogueDisplayObjects();

    this.addChild(this.dialogContainer);
  }

  private buildDialogueDisplayObjects(): void {
    const boxCfg = this.config.dialogBox;
    this.dialogContentContainer.removeChildren();
    this.lineDisplayObjects = [];

    const maxTextWidth = Math.max(150, boxCfg.width - 48);

    for (let i = 0; i < this.parsedLines.length; i++) {
      const lineData = this.parsedLines[i];
      const lineWrap = new Container();
      lineWrap.position.set(0, 0);
      lineWrap.visible = false;

      // Determine speaker color
      let speakerColor = boxCfg.speakerColors.default;
      const spkLower = lineData.speaker.toLowerCase();
      if (spkLower.includes("mothma")) {
        speakerColor = boxCfg.speakerColors.monMothma;
      } else if (spkLower.includes("tuk")) {
        speakerColor = boxCfg.speakerColors.tuk;
      }

      const spkTitle = lineData.speaker ? `[ ${lineData.speaker.toUpperCase()} ]` : "";
      const spkText = this.createSharpText(
        spkTitle,
        {
          fontSize: 14,
          fontWeight: "bold",
          fill: speakerColor,
          letterSpacing: 1.5,
        },
        0,
        0,
        0,
        0,
        lineWrap
      );

      const spkH = Math.max(16, Math.ceil(spkText.height || 18));

      const bodyText = this.createSharpText(
        "",
        {
          fontSize: boxCfg.fontSize,
          fill: boxCfg.textColor,
          lineHeight: boxCfg.lineHeight,
          wordWrap: true,
          wordWrapWidth: maxTextWidth,
        },
        0,
        spkH + 4,
        0,
        0,
        lineWrap
      );

      this.dialogContentContainer.addChild(lineWrap);
      this.lineDisplayObjects.push({
        container: lineWrap,
        speakerText: spkText,
        bodyText: bodyText,
        fullText: lineData.text,
        revealedChars: 0,
      });
    }

    this.layoutDialogue(0);
  }

  private layoutDialogue(deltaSec: number = 0): void {
    const boxCfg = this.config.dialogBox;
    const messageGap = 16;
    let currentY = 0;
    let activeBlockBottom = 0;

    for (let i = 0; i < this.lineDisplayObjects.length; i++) {
      const disp = this.lineDisplayObjects[i];
      if (!disp || !disp.container.visible) continue;

      disp.container.position.set(0, currentY);

      disp.speakerText.position.set(0, 0);
      const spkH = Math.max(16, Math.ceil(disp.speakerText.height || 18));
      disp.bodyText.position.set(0, spkH + 4);

      const bodyH = Math.max(18, Math.ceil(disp.bodyText.height || 20));
      const totalBlockHeight = spkH + 4 + bodyH;

      currentY += totalBlockHeight + messageGap;
      activeBlockBottom = currentY;
    }

    // Available vertical space inside the dialog box (accounting for header and margins)
    const availableHeight = Math.max(80, boxCfg.height - 76);

    if (activeBlockBottom > availableHeight) {
      this.minScrollY = -(activeBlockBottom - availableHeight);
      this.targetScrollY = this.minScrollY;
    } else {
      this.minScrollY = 0;
      this.targetScrollY = 0;
    }

    if (deltaSec > 0) {
      this.currentScrollY += (this.targetScrollY - this.currentScrollY) * Math.min(1, deltaSec * 8);
    } else {
      this.currentScrollY = this.targetScrollY;
    }

    this.dialogContentContainer.y = 56 + this.currentScrollY;
  }

  private initPromptBanner(): void {
    const promptCfg = this.config.prompt;
    const bannerW = 680;
    const bannerH = 68;
    const bannerX = (gameConfig.width - bannerW) / 2;
    const bannerY = gameConfig.height - bannerH - 24;

    this.promptContainer.position.set(bannerX, bannerY);

    const bgGfx = new Graphics();
    bgGfx.beginFill(0x020a14, 0.92);
    bgGfx.lineStyle(2, promptCfg.color, 0.85);
    bgGfx.drawRoundedRect(0, 0, bannerW, bannerH, 14);
    bgGfx.endFill();

    // Top glowing edge
    bgGfx.beginFill(promptCfg.color, 0.95);
    bgGfx.drawRoundedRect(20, 4, bannerW - 40, 2.5, 2);
    bgGfx.endFill();

    this.promptContainer.addChild(bgGfx);

    this.promptText = this.createSharpText(
      promptCfg.text,
      {
        fontSize: promptCfg.fontSize,
        fontWeight: "900",
        fill: [promptCfg.color, 0xffffff],
        dropShadow: true,
        dropShadowColor: promptCfg.color,
        dropShadowBlur: 8,
        dropShadowDistance: 0,
        letterSpacing: 3,
      },
      bannerW / 2,
      14,
      0.5,
      0,
      this.promptContainer
    );

    this.promptSubText = this.createSharpText(
      promptCfg.subText,
      {
        fontSize: 12,
        fontWeight: "bold",
        fill: 0x88ccff,
        letterSpacing: 2,
      },
      bannerW / 2,
      43,
      0.5,
      0,
      this.promptContainer
    );

    this.promptContainer.eventMode = "static";
    this.promptContainer.cursor = "pointer";
    this.promptContainer.on("pointerdown", (e) => {
      e?.stopPropagation?.();
      this.startMission();
    });

    this.addChild(this.promptContainer);
  }

  private initSkipButton(): void {
    const btnW = 150;
    const btnH = 34;
    const btnX = gameConfig.width - btnW - 20;
    const btnY = 20;

    this.skipBtn = new Container();
    this.skipBtn.position.set(btnX, btnY);

    const btnGfx = new Graphics();
    btnGfx.beginFill(0x061424, 0.75);
    btnGfx.lineStyle(1.5, 0x38bdf8, 0.6);
    btnGfx.drawRoundedRect(0, 0, btnW, btnH, 8);
    btnGfx.endFill();
    this.skipBtn.addChild(btnGfx);

    this.createSharpText(
      this.config.skipButtonText,
      {
        fontSize: 12,
        fontWeight: "bold",
        fill: 0xa0e0ff,
        letterSpacing: 1,
      },
      btnW / 2,
      btnH / 2,
      0.5,
      0.5,
      this.skipBtn
    );

    this.skipBtn.eventMode = "static";
    this.skipBtn.cursor = "pointer";
    this.skipBtn.on("pointerdown", (e) => {
      e?.stopPropagation?.();
      this.handleSkip();
    });

    this.addChild(this.skipBtn);
  }

  private initAudio(): void {
    const soundAlias = "prologue_dialog";
    const audioUrl = "./" + this.config.audioFile;

    const playAudio = () => {
      try {
        const inst = sound.play(soundAlias, {
          volume: 1.0,
          complete: () => {
            this.onAudioFinished();
          },
        });
        if (inst && typeof (inst as any).then === "function") {
          (inst as any)
            .then((resolved: any) => {
              this.soundInstance = resolved;
              if (resolved && typeof resolved.on === "function") {
                resolved.on("end", () => this.onAudioFinished());
              }
            })
            .catch(() => {});
        } else {
          this.soundInstance = inst;
          if (inst && typeof (inst as any).on === "function") {
            (inst as any).on("end", () => this.onAudioFinished());
          }
        }
      } catch (err) {
        console.warn("Failed to play dialogue sound:", err);
      }
    };

    if (sound.exists(soundAlias)) {
      playAudio();
    } else {
      try {
        sound.add(soundAlias, {
          url: audioUrl,
          preload: true,
          loaded: () => {
            playAudio();
          },
        });
      } catch {
        playAudio();
      }
    }
  }

  private update(delta: number): void {
    const deltaSec = delta / 60;
    this.totalTimeElapsed += deltaSec;
    this.audioElapsed += deltaSec;

    // 1. Hologram Fade-In Animation
    const holoCfg = this.config.hologram;
    if (this.fadeElapsed < holoCfg.fadeInDuration) {
      this.fadeElapsed += deltaSec;
      const progress = Math.min(1, this.fadeElapsed / holoCfg.fadeInDuration);
      if (this.hologramSprite) {
        this.hologramSprite.alpha = progress * holoCfg.baseAlpha;
      }
    } else if (!this.isGlitching && this.hologramSprite) {
      // Resting subtle hologram pulse
      this.hologramSprite.alpha =
        holoCfg.baseAlpha + Math.sin(this.totalTimeElapsed * 3) * 0.03;
    }

    // 2. Random Hologram Glitch Animation
    if (holoCfg.glitch.enabled && this.fadeElapsed >= holoCfg.fadeInDuration * 0.5) {
      this.updateHologramGlitch(deltaSec);
    }

    // 3. Dialogue Typewriter & Line Revealing
    this.updateDialogue(deltaSec);

    // 4. Mission Prompt Pulsing Animation
    if (this.isDialogFinished && this.promptContainer) {
      const pulse =
        0.75 +
        0.25 *
          Math.sin(this.totalTimeElapsed * this.config.prompt.pulseSpeed);
      this.promptContainer.alpha = Math.min(1, this.promptContainer.alpha + deltaSec * 3);
      this.promptText.alpha = pulse;
    }

    // 5. Audio completion safety timeout (in case sound onComplete is delayed)
    if (!this.isDialogFinished && this.audioElapsed >= this.soundDuration) {
      this.onAudioFinished();
    }
  }

  private updateHologramGlitch(deltaSec: number): void {
    const glitchCfg = this.config.hologram.glitch;
    const holoCfg = this.config.hologram;

    if (!this.isGlitching) {
      this.glitchTimer -= deltaSec;
      if (this.glitchTimer <= 0) {
        // Trigger glitch burst
        this.isGlitching = true;
        this.glitchDurationTimer =
          glitchCfg.minDuration +
          Math.random() * (glitchCfg.maxDuration - glitchCfg.minDuration);
      }
    } else {
      this.glitchDurationTimer -= deltaSec;
      if (this.glitchDurationTimer > 0 && this.hologramSprite) {
        // Active jitter
        const jx = (Math.random() - 0.5) * 2 * glitchCfg.maxJitterX;
        const jy = (Math.random() - 0.5) * 2 * glitchCfg.maxJitterY;
        this.hologramSprite.position.set(jx, jy);
        this.hologramSprite.alpha =
          glitchCfg.minAlpha + Math.random() * 0.35;
        this.hologramSprite.tint =
          Math.random() < 0.5 ? glitchCfg.tintGlitch : holoCfg.tint;
        this.hologramSprite.scale.x =
          holoCfg.scale * (1.0 + (Math.random() - 0.5) * 0.12);

        // Render horizontal glitch scanlines
        this.glitchGfx.clear();
        const holoW = 83 * holoCfg.scale;
        const holoH = 190 * holoCfg.scale;
        const numSlices = 2 + Math.floor(Math.random() * 3);
        for (let s = 0; s < numSlices; s++) {
          const sy = -holoH + Math.random() * holoH;
          const sh = 2 + Math.random() * 7;
          const sx = (Math.random() - 0.5) * 16;
          this.glitchGfx.beginFill(0x00e5ff, 0.45 + Math.random() * 0.4);
          this.glitchGfx.drawRect(
            -holoW / 2 + sx,
            sy,
            holoW + Math.random() * 12,
            sh
          );
          this.glitchGfx.endFill();
        }
      } else {
        // Glitch ended: reset to resting state
        this.isGlitching = false;
        this.glitchGfx.clear();
        if (this.hologramSprite) {
          this.hologramSprite.position.set(0, 0);
          this.hologramSprite.alpha = holoCfg.baseAlpha;
          this.hologramSprite.tint = holoCfg.tint;
          this.hologramSprite.scale.set(holoCfg.scale);
        }
        // Pick next random glitch interval
        this.glitchTimer =
          glitchCfg.minInterval +
          Math.random() * (glitchCfg.maxInterval - glitchCfg.minInterval);
      }
    }
  }

  private updateDialogue(deltaSec: number): void {
    const typewriterSpeed = this.config.dialogBox.typewriterSpeed || 35;

    for (let i = 0; i < this.parsedLines.length; i++) {
      const lineData = this.parsedLines[i];
      const disp = this.lineDisplayObjects[i];
      if (!disp) continue;

      if (this.audioElapsed >= lineData.timing) {
        disp.container.visible = true;

        if (disp.revealedChars < disp.fullText.length) {
          disp.revealedChars = Math.min(
            disp.fullText.length,
            disp.revealedChars + typewriterSpeed * deltaSec
          );
          const charsCount = Math.floor(disp.revealedChars);
          disp.bodyText.text = disp.fullText.substring(0, charsCount);
        }

        // Active line has full opacity; older lines are slightly dimmed
        const isActive =
          i === this.parsedLines.length - 1 ||
          this.audioElapsed < (this.parsedLines[i + 1]?.timing ?? Infinity);
        disp.container.alpha = isActive ? 1.0 : 0.78;
      }
    }

    // Continuously update dynamic block positions and smooth scrolling
    this.layoutDialogue(deltaSec);
  }

  private onAudioFinished(): void {
    if (this.isDialogFinished) return;
    this.isDialogFinished = true;

    // Fully reveal all dialogue lines
    for (let i = 0; i < this.lineDisplayObjects.length; i++) {
      const disp = this.lineDisplayObjects[i];
      if (disp) {
        disp.container.visible = true;
        disp.revealedChars = disp.fullText.length;
        disp.bodyText.text = disp.fullText;
        disp.container.alpha = 1.0;
      }
    }

    // Snap layout to final positions
    this.layoutDialogue(0);

    // Display "CLICK TO START MISSION" prompt
    this.promptContainer.visible = true;
  }

  private handleSkip(): void {
    if (this.isNavigating) return;

    if (!this.isDialogFinished) {
      // Fast-forward to the end of cutscene
      this.stopAudio();
      this.onAudioFinished();
    } else {
      // Start mission immediately
      this.startMission();
    }
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (this.isNavigating) return;

    if (e.key === "Escape") {
      this.handleSkip();
    } else if (e.key === "Enter" || e.key === " ") {
      if (this.isDialogFinished) {
        this.startMission();
      } else {
        this.handleSkip();
      }
    }
  }

  private handleScreenClick(): void {
    if (this.isNavigating) return;

    if (this.isDialogFinished) {
      this.startMission();
    }
  }

  private startMission(): void {
    if (this.isNavigating) return;
    this.isNavigating = true;

    this.stopAudio();
    this.playButtonClick();

    // Transition to the target level (level1), passing skipCutscene = true to prevent looping
    this.emit(Scene.Change, Scene.Raycast, this.config.targetLevel, true);
  }

  private stopAudio(): void {
    try {
      if (this.soundInstance) {
        this.soundInstance.stop?.();
        this.soundInstance = null;
      }
      if (sound.exists("prologue_dialog")) {
        sound.stop("prologue_dialog");
      }
    } catch {}
  }

  private playButtonClick(): void {
    try {
      if (sound.exists("button_click")) {
        sound.play("button_click", { volume: 0.5 });
      } else {
        sound.add("button_click", {
          url: "./assets/sounds/button_click.mp3",
          preload: true,
          loaded: () => {
            sound.play("button_click", { volume: 0.5 });
          },
        });
      }
    } catch {}
  }

  private createSharpText(
    content: string,
    style: Partial<ITextStyle> | TextStyle,
    x: number,
    y: number,
    anchorX: number = 0,
    anchorY: number = 0,
    parent?: Container
  ): Text {
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const textRes = Math.max(3, Math.min(Math.round(dpr * 2), 4));

    const t = new Text(content, {
      fontFamily: "Segoe UI, Arial, sans-serif",
      ...style,
    });
    t.resolution = textRes;
    t.roundPixels = true;
    if (t.texture && t.texture.baseTexture) {
      t.texture.baseTexture.scaleMode = SCALE_MODES.NEAREST;
    }
    t.anchor.set(anchorX, anchorY);
    t.position.set(Math.round(x), Math.round(y));

    if (parent) {
      parent.addChild(t);
    } else {
      this.addChild(t);
    }
    return t;
  }

  public dispose(): void {
    this.stopAudio();

    if (this.tickerFn) {
      Ticker.shared.remove(this.tickerFn);
    }

    if (this.keydownHandler) {
      window.removeEventListener("keydown", this.keydownHandler);
    }

    this.destroy({ children: true });
  }
}
