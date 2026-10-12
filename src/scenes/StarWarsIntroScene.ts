import {
  Assets,
  Container,
  Graphics,
  ITextStyle,
  Mesh,
  MeshGeometry,
  MIPMAP_MODES,
  SCALE_MODES,
  Shader,
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
import { introConfig, IStarWarsIntroConfig } from "../../assets/cutscenes/intro/config";
import introJsonData from "../../assets/cutscenes/intro/intro.json";
import starWarsCrawlVert from "./raycast/shaders/starWarsCrawl.vert";
import starWarsCrawlFrag from "./raycast/shaders/starWarsCrawl.frag";

enum IntroPhase {
  BLUE_CARD = 0,
  LOGO_RECEDE = 1,
  CRAWL = 2,
  FINISHED = 3,
}

export class StarWarsIntroScene extends BaseScene {
  private config: IStarWarsIntroConfig;
  private targetLevel: string;
  private isNavigating: boolean = false;
  private elapsed: number = 0;
  private currentPhase: IntroPhase = IntroPhase.BLUE_CARD;
  private soundInstance: any = null;
  private isAudioPlaying: boolean = false;
  private audioElapsed: number = 0;
  private cameraPanY: number = 0;
  private fadeOverlay!: Graphics;

  private tickerFn: (delta: number) => void;
  private keydownHandler: (e: KeyboardEvent) => void;

  // Background
  private baseBgGfx!: Graphics;
  private bgSprite!: Sprite;
  private starfieldContainer: Container;
  private starData: Array<{ x: number; y: number; size: number; baseAlpha: number; speed: number; phase: number }> = [];
  private starGfx: Graphics;

  // Blue Card ("A long time ago in a galaxy far, far away....")
  private blueCardContainer: Container;
  private blueCardText!: Text;

  // Receding Logo (STAR / WARS / Story Name)
  private logoContainer: Container;
  private logoLine1Text!: Text;
  private logoLine2Text!: Text;
  private logoStoryText!: Text;

  // 3D Perspective Crawl (WebGL Mesh with Projective Shader)
  private crawlMesh!: Mesh<Shader>;
  private crawlShader!: Shader;
  private crawlTexture!: Texture;
  private crawlScroll: number = 0;
  private crawlScrollMax: number = 2.4;
  private crawlTextStartY: number = 24;
  private isCrawlStarted: boolean = false;

  // Data loaded dynamically from intro.json
  private blueCardString: string = "A long time ago in a galaxy far, far away....";
  private logoWords: string[] = ["STAR", "WARS"];
  private storyTitle: string = "A REBEL STORY";
  private crawlParagraphs: string[] = [];

  // Skip button
  private skipBtn!: Container;

  constructor(stage: Container, scale: number, targetLevel: string = "level1") {
    super(stage, scale);

    this.config = { ...introConfig };
    this.targetLevel = targetLevel || introConfig.targetLevel;

    // Release mouse pointer lock so mouse cursor is available
    this.unlockMouse();

    // Scene itself is NOT clickable to skip (only skip button or Escape key)
    this.eventMode = "none";
    this.cursor = "default";

    // 1. Initialize text data directly from intro.json (no hardcoding)
    this.applyIntroData(introJsonData);

    // 2. Initialize Containers
    this.starfieldContainer = new Container();
    this.starGfx = new Graphics();
    this.starfieldContainer.addChild(this.starGfx);
    this.starfieldContainer.visible = false;
    this.starfieldContainer.alpha = 0;

    this.blueCardContainer = new Container();

    this.logoContainer = new Container();
    this.logoContainer.visible = false;

    // 3. Build Layers in order
    this.initBackground();
    this.addChild(this.starfieldContainer);
    this.initStarfield();
    this.initCrawlMesh();
    this.addChild(this.logoContainer);
    this.initLogo();
    this.addChild(this.blueCardContainer);
    this.initBlueCard();
    this.initFadeOverlay();
    this.initSkipButton();

    // 4. Audio Timing: if audioStartTime <= 0, begin playback immediately
    if (this.config.audioStartTime <= 0) {
      this.startThemeAudio();
    }

    // 5. Animation Loop
    this.tickerFn = (delta: number) => this.update(delta);
    Ticker.shared.add(this.tickerFn);

    // 6. Keyboard Controls (only Escape skips)
    this.keydownHandler = (e: KeyboardEvent) => this.handleKeyDown(e);
    window.addEventListener("keydown", this.keydownHandler);

    // 7. Try loading updated intro.json if loaded via Assets bundle
    this.tryLoadExternalJson();
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
    // 1. Permanent solid black background to ensure canvas is always dark
    this.baseBgGfx = new Graphics();
    this.baseBgGfx.beginFill(0x000000, 1.0);
    this.baseBgGfx.drawRect(0, 0, gameConfig.width, gameConfig.height);
    this.baseBgGfx.endFill();
    this.addChild(this.baseBgGfx);

    // 2. Galaxy star background image (hidden during blue card; extra height for camera pan down)
    this.bgSprite = new Sprite(Texture.WHITE);
    this.bgSprite.tint = 0x000000;
    this.bgSprite.width = gameConfig.width;
    this.bgSprite.height = gameConfig.height + 480;
    this.bgSprite.alpha = 0;
    this.bgSprite.visible = false;
    this.addChild(this.bgSprite);

    // Load starry galaxy background image asynchronously
    const bgPath = this.config.backgroundImage;
    if (bgPath) {
      Assets.load(bgPath)
        .then((loadedTex) => {
          if (loadedTex && this.bgSprite) {
            this.bgSprite.texture = loadedTex;
            this.bgSprite.tint = 0xffffff;
            this.bgSprite.width = gameConfig.width;
            this.bgSprite.height = gameConfig.height + 480;
          }
        })
        .catch((err) => {
          console.warn("Failed to load star background image:", err);
        });
    }
  }

  private initStarfield(): void {
    const numStars = 220;
    const w = gameConfig.width;
    const h = gameConfig.height;

    for (let i = 0; i < numStars; i++) {
      this.starData.push({
        x: Math.random() * w,
        y: -100 + Math.random() * (h + 550), // Extended vertical span for camera pan down
        size: 0.7 + Math.random() * 1.5,
        baseAlpha: 0.3 + Math.random() * 0.5,
        speed: 1.2 + Math.random() * 3.0,
        phase: Math.random() * Math.PI * 2,
      });
    }

    this.renderStars(0);
  }

  private renderStars(time: number): void {
    this.starGfx.clear();
    for (const s of this.starData) {
      const alpha = Math.max(0.15, Math.min(0.9, s.baseAlpha + Math.sin(time * s.speed + s.phase) * 0.25));
      this.starGfx.beginFill(0xffffff, alpha);
      this.starGfx.drawCircle(s.x, s.y, s.size);
      this.starGfx.endFill();
    }
  }

  private initBlueCard(): void {
    const cx = gameConfig.width / 2;
    const cy = gameConfig.height / 2;

    this.blueCardText = this.createSharpText(
      this.blueCardString,
      {
        fontSize: 26,
        fontWeight: "bold",
        fill: this.config.blueCardColor,
        letterSpacing: 2.5,
      },
      cx,
      cy,
      0.5,
      0.5,
      this.blueCardContainer
    );
    this.blueCardText.alpha = 0;

    if (this.config.blueCardDuration <= 0) {
      this.blueCardContainer.visible = false;
    } else {
      this.blueCardContainer.visible = true;
      this.blueCardContainer.alpha = 1.0;
    }
  }

  private initFadeOverlay(): void {
    this.fadeOverlay = new Graphics();
    this.fadeOverlay.beginFill(0x000000, 1.0);
    this.fadeOverlay.drawRect(0, 0, gameConfig.width, gameConfig.height);
    this.fadeOverlay.endFill();
    this.fadeOverlay.alpha = 0;
    this.fadeOverlay.visible = false;
    this.addChild(this.fadeOverlay);
  }

  private initLogo(): void {
    const cx = gameConfig.width / 2;
    const cy = gameConfig.height / 2;

    this.logoContainer.position.set(cx, cy);

    // Line 1: "STAR"
    this.logoLine1Text = this.createSharpText(
      this.logoWords[0] || "STAR",
      {
        fontSize: 88,
        fontWeight: "900",
        fill: 0xffe81f,
        stroke: 0x000000,
        strokeThickness: 7,
        letterSpacing: 10,
        dropShadow: true,
        dropShadowColor: "#000000",
        dropShadowBlur: 14,
        dropShadowDistance: 4,
      },
      0,
      -80,
      0.5,
      0.5,
      this.logoContainer
    );

    // Line 2: "WARS"
    this.logoLine2Text = this.createSharpText(
      this.logoWords[1] || "WARS",
      {
        fontSize: 88,
        fontWeight: "900",
        fill: 0xffe81f,
        stroke: 0x000000,
        strokeThickness: 7,
        letterSpacing: 10,
        dropShadow: true,
        dropShadowColor: "#000000",
        dropShadowBlur: 14,
        dropShadowDistance: 4,
      },
      0,
      0,
      0.5,
      0.5,
      this.logoContainer
    );

    // Line 3: Name of the story below "WARS" (from intro.json, e.g. "A REBEL STORY")
    this.logoStoryText = this.createSharpText(
      this.storyTitle || "A REBEL STORY",
      {
        fontSize: 32,
        fontWeight: "bold",
        fill: 0xffe81f,
        stroke: 0x000000,
        strokeThickness: 4,
        letterSpacing: 8,
        dropShadow: true,
        dropShadowColor: "#000000",
        dropShadowBlur: 10,
        dropShadowDistance: 3,
      },
      0,
      76,
      0.5,
      0.5,
      this.logoContainer
    );

    this.logoContainer.scale.set(1.35);
  }

  private initCrawlMesh(): void {
    this.crawlTexture = this.generateCrawlCanvasTexture();

    const w = gameConfig.width;
    const h = gameConfig.height;

    const crawlGeom = new MeshGeometry(
      new Float32Array([
        0, 0,
        w, 0,
        w, h,
        0, h,
      ]) as any,
      new Float32Array([
        0, 0,
        1, 0,
        1, 1,
        0, 1,
      ]) as any,
      new Uint16Array([0, 1, 2, 0, 2, 3]) as any
    );

    // Initial scroll primed directly at bottom screen edge
    const hMax = 1.0 - this.config.horizonY;
    const vTextStart = this.crawlTextStartY / 2048;
    this.crawlScroll = (this.config.perspectiveK / hMax) + vTextStart - 0.001;

    this.crawlShader = Shader.from(
      starWarsCrawlVert,
      starWarsCrawlFrag,
      {
        uCrawlTexture: this.crawlTexture,
        uScroll: this.crawlScroll,
        uHorizonY: this.config.horizonY,
        uTaper: this.config.taper,
        uPerspectiveK: this.config.perspectiveK,
        uTopFade: this.config.topFade,
        uBottomFade: this.config.bottomFade,
      }
    );

    this.crawlMesh = new Mesh(crawlGeom, this.crawlShader);
    this.crawlMesh.visible = false;
    this.addChild(this.crawlMesh);

    // Calculate maximum scroll when bottom of text passes horizon
    this.crawlScrollMax = 1.0 + (this.config.perspectiveK / Math.max(0.02, this.config.topFade));
  }

  private generateCrawlCanvasTexture(): Texture {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 2048;
    const ctx = canvas.getContext("2d");
    if (!ctx) return Texture.WHITE;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const padX = 110;
    const contentWidth = canvas.width - padX * 2; // ~804px wide justified block
    this.crawlTextStartY = 24;
    let curY = this.crawlTextStartY;

    // 1. Optional Episode Header (e.g. "EPISODE I" if configured; story name is NEVER rendered here)
    if (this.config.episodeHeader && this.config.episodeHeader.trim().length > 0) {
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillStyle = this.config.episodeHeaderColor || "#FFE81F";
      ctx.font = "900 46px 'Segoe UI', Arial, sans-serif";
      ctx.fillText(this.config.episodeHeader.trim(), canvas.width / 2, curY);
      curY += 75;
    }

    // 2. Justified Body Paragraphs directly from intro.json
    ctx.font = `bold ${this.config.crawlFontSize || 34}px 'Segoe UI', Arial, sans-serif`;
    ctx.fillStyle = this.config.crawlColor || "#FFE81F";

    const lineHeight = this.config.crawlLineHeight || 50;
    const paraSpacing = 55;

    for (const para of this.crawlParagraphs) {
      if (!para || para.trim().length === 0) continue;
      curY = this.renderJustifiedParagraph(
        ctx,
        para.trim(),
        padX,
        curY,
        contentWidth,
        lineHeight
      );
      curY += paraSpacing;
    }

    const tex = Texture.from(canvas);
    tex.baseTexture.scaleMode = SCALE_MODES.LINEAR;
    tex.baseTexture.mipmap = MIPMAP_MODES.ON;
    tex.baseTexture.update();
    return tex;
  }

  private refreshCrawlTexture(): void {
    if (this.crawlTexture) {
      this.crawlTexture.destroy(true);
    }
    this.crawlTexture = this.generateCrawlCanvasTexture();
    if (this.crawlShader) {
      this.crawlShader.uniforms.uCrawlTexture = this.crawlTexture;
    }
    this.crawlScrollMax = 1.0 + (this.config.perspectiveK / Math.max(0.02, this.config.topFade));
  }

  private renderJustifiedParagraph(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    startY: number,
    maxWidth: number,
    lineHeight: number
  ): number {
    ctx.textAlign = "left";
    ctx.textBaseline = "top";

    const words = text.split(/\s+/).filter((w) => w.length > 0);
    if (words.length === 0) return startY;

    const spaceWidth = ctx.measureText(" ").width;
    const lines: string[][] = [];
    let currentLine: string[] = [];
    let currentLineWidth = 0;

    for (const word of words) {
      const wordWidth = ctx.measureText(word).width;
      const testWidth = currentLine.length === 0 ? wordWidth : currentLineWidth + spaceWidth + wordWidth;

      if (testWidth > maxWidth && currentLine.length > 0) {
        lines.push(currentLine);
        currentLine = [word];
        currentLineWidth = wordWidth;
      } else {
        currentLine.push(word);
        currentLineWidth = testWidth;
      }
    }
    if (currentLine.length > 0) {
      lines.push(currentLine);
    }

    let y = startY;
    for (let l = 0; l < lines.length; l++) {
      const lineWords = lines[l];
      const isLastLine = l === lines.length - 1;

      if (isLastLine || lineWords.length <= 1) {
        // Last line of paragraph: draw standard left-aligned
        let curX = x;
        for (const w of lineWords) {
          ctx.fillText(w, curX, y);
          curX += ctx.measureText(w).width + spaceWidth;
        }
      } else {
        // Justified line: distribute excess space equally among inter-word gaps
        let wordsOnlyWidth = 0;
        for (const w of lineWords) {
          wordsOnlyWidth += ctx.measureText(w).width;
        }
        const extraSpace = maxWidth - wordsOnlyWidth;
        const gap = extraSpace / (lineWords.length - 1);
        let curX = x;
        for (const w of lineWords) {
          ctx.fillText(w, curX, y);
          curX += ctx.measureText(w).width + gap;
        }
      }
      y += lineHeight;
    }

    return y;
  }

  private applyIntroData(data: any): void {
    if (!data || !Array.isArray(data.en)) return;

    // en[0]: Blue prologue card
    if (data.en[0]) {
      this.blueCardString = data.en[0].trim();
      if (this.blueCardText) {
        this.blueCardText.text = this.blueCardString;
      }
    }

    // en[1]: Main Title ("Star \n Wars")
    if (data.en[1]) {
      const lines = data.en[1]
        .split(/[\r\n]+/)
        .map((w: string) => w.trim().toUpperCase())
        .filter((w: string) => w.length > 0);

      if (lines.length >= 2) {
        this.logoWords = lines;
      } else {
        const words = data.en[1]
          .split(/\s+/)
          .map((w: string) => w.trim().toUpperCase())
          .filter((w: string) => w.length > 0);
        this.logoWords = words.length >= 2 ? words : [words[0] || "STAR", "WARS"];
      }

      if (this.logoLine1Text && this.logoWords[0]) {
        this.logoLine1Text.text = this.logoWords[0];
      }
      if (this.logoLine2Text && this.logoWords[1]) {
        this.logoLine2Text.text = this.logoWords[1];
      }
    }

    // en[2]: Story name below logo ("A Rebel Story")
    if (data.en[2]) {
      this.storyTitle = data.en[2].trim().toUpperCase();
      if (this.logoStoryText) {
        this.logoStoryText.text = this.storyTitle;
      }
    }

    // en[3...]: Scrolling crawl paragraphs (story name is NOT added here)
    if (data.en.length > 3) {
      this.crawlParagraphs = data.en.slice(3).map((p: string) => p.trim()).filter((p: string) => p.length > 0);
    } else if (data.en[2] && data.en.length === 3) {
      this.crawlParagraphs = [data.en[2].trim()];
    }

    if (this.crawlShader) {
      this.refreshCrawlTexture();
    }
  }

  private async tryLoadExternalJson(): Promise<void> {
    try {
      let jsonData: any = null;
      if (Assets.cache.has(this.config.jsonFile)) {
        jsonData = Assets.get(this.config.jsonFile);
      } else {
        jsonData = await Assets.load(this.config.jsonFile);
      }

      if (jsonData && Array.isArray(jsonData.en)) {
        this.applyIntroData(jsonData);
      }
    } catch {}
  }

  private initSkipButton(): void {
    const btnW = 140;
    const btnH = 32;
    const btnX = gameConfig.width - btnW - 24;
    const btnY = 20;

    this.skipBtn = new Container();
    this.skipBtn.position.set(btnX, btnY);

    const btnGfx = new Graphics();
    btnGfx.beginFill(0x040c18, 0.75);
    btnGfx.lineStyle(1.5, 0xffe81f, 0.6);
    btnGfx.drawRoundedRect(0, 0, btnW, btnH, 8);
    btnGfx.endFill();
    this.skipBtn.addChild(btnGfx);

    this.createSharpText(
      this.config.skipText,
      {
        fontSize: 12,
        fontWeight: "bold",
        fill: 0xffe81f,
        letterSpacing: 1.5,
      },
      btnW / 2,
      btnH / 2,
      0.5,
      0.5,
      this.skipBtn
    );

    // Only the button is interactive for mouse clicking
    this.skipBtn.eventMode = "static";
    this.skipBtn.cursor = "pointer";
    this.skipBtn.on("pointerdown", (e) => {
      e?.stopPropagation?.();
      this.handleSkip();
    });

    this.addChild(this.skipBtn);
  }

  private startThemeAudio(): void {
    if (this.isAudioPlaying) return;
    this.isAudioPlaying = true;

    const alias = "intro_theme";
    const url = "./" + this.config.audioFile;

    const play = () => {
      try {
        const inst = sound.play(alias, {
          volume: 0.95,
          complete: () => {
            this.finishIntro();
          },
        });
        if (inst && typeof (inst as any).then === "function") {
          (inst as any)
            .then((res: any) => {
              this.soundInstance = res;
            })
            .catch(() => {});
        } else {
          this.soundInstance = inst;
        }
      } catch (err) {
        console.warn("Failed to play intro audio:", err);
      }
    };

    if (sound.exists(alias)) {
      play();
    } else {
      try {
        sound.add(alias, {
          url,
          preload: true,
          loaded: () => play(),
        });
      } catch {
        play();
      }
    }
  }

  private update(delta: number): void {
    const deltaSec = delta / 60;
    this.elapsed += deltaSec;

    // Trigger Audio whenever audioStartTime threshold is reached
    if (!this.isAudioPlaying && this.elapsed >= this.config.audioStartTime) {
      this.startThemeAudio();
    }

    // Track song elapsed time while audio is playing
    if (this.isAudioPlaying) {
      this.audioElapsed += deltaSec;
    }

    // Phase 0: Blue Prologue Card ("A long time ago in a galaxy far, far away....")
    const blueCardEnd = this.config.blueCardDuration;
    if (this.elapsed < blueCardEnd) {
      this.currentPhase = IntroPhase.BLUE_CARD;

      // Keep galaxy background and stars hidden during the prologue card
      this.bgSprite.visible = false;
      this.starfieldContainer.visible = false;
      this.blueCardContainer.visible = true;

      // Smooth text fade in / hold / fade out on solid black background
      const fadeDuration = Math.min(0.8, blueCardEnd / 3);
      if (this.elapsed < fadeDuration) {
        this.blueCardText.alpha = this.elapsed / fadeDuration;
      } else if (this.elapsed < blueCardEnd - fadeDuration) {
        this.blueCardText.alpha = 1.0;
      } else {
        const fadeOutProgress = (this.elapsed - (blueCardEnd - fadeDuration)) / fadeDuration;
        this.blueCardText.alpha = Math.max(0, 1.0 - fadeOutProgress);
      }
      return;
    }

    // Hide blue card once duration has passed
    if (this.blueCardContainer.visible) {
      this.blueCardContainer.visible = false;
    }

    // Reveal cosmic galaxy background and starfield smoothly
    if (!this.bgSprite.visible) {
      this.bgSprite.visible = true;
      this.starfieldContainer.visible = true;
    }
    const bgFade = Math.min(1.0, (this.elapsed - blueCardEnd) / 0.8);
    this.bgSprite.alpha = bgFade;
    this.starfieldContainer.alpha = bgFade;

    // Twinkle stars only after blue card has passed
    this.renderStars(this.elapsed);

    // Phase 1: Fanfare Logo Recede into Deep Space
    const logoStart = blueCardEnd;
    const logoEnd = logoStart + this.config.logoDuration;

    if (this.elapsed >= logoStart && this.elapsed < logoEnd) {
      this.currentPhase = IntroPhase.LOGO_RECEDE;
      this.logoContainer.visible = true;

      const progress = (this.elapsed - logoStart) / this.config.logoDuration;
      // Stately cinematic recede curve: lingers large and readable, then smoothly recedes into deep space
      const p = Math.max(0, Math.min(1.0, progress));
      const scale = 1.35 * Math.pow(Math.max(0.001, 1.0 - p * 0.95), 1.6);
      this.logoContainer.scale.set(scale);

      // Floats slowly upward towards vanishing point
      this.logoContainer.y = (gameConfig.height / 2) - Math.pow(p, 1.15) * 160;

      // Soft alpha fade as it recedes into deep space
      this.logoContainer.alpha = Math.max(0, 1.0 - Math.pow(p, 2.6));
    } else {
      this.logoContainer.visible = false;
    }

    // Phase 2: 3D Perspective Opening Crawl
    const crawlDelay = this.config.crawlStartDelay !== undefined
      ? this.config.crawlStartDelay
      : Math.min(5.0, this.config.logoDuration * 0.65);
    const crawlStart = logoStart + crawlDelay;

    if (this.elapsed >= crawlStart) {
      this.currentPhase = IntroPhase.CRAWL;

      if (!this.isCrawlStarted) {
        this.isCrawlStarted = true;
        this.crawlMesh.visible = true;
        const hMax = 1.0 - this.config.horizonY;
        const vTextStart = this.crawlTextStartY / 2048;
        // Prime crawlScroll so the very top of text is at the bottom screen edge ready to scroll in
        this.crawlScroll = (this.config.perspectiveK / hMax) + vTextStart - 0.001;
        this.crawlShader.uniforms.uScroll = this.crawlScroll;
      }

      // Smooth constant 3D motion along the inclined plane
      this.crawlScroll += deltaSec * this.config.crawlSpeed;
      this.crawlShader.uniforms.uScroll = this.crawlScroll;

      // When crawl completes past horizon, hide crawl mesh while remaining in intro
      if (this.crawlScroll >= this.crawlScrollMax) {
        this.crawlMesh.visible = false;
      }
    }

    // Camera tilt / pan down starting around 1:16 (76.0s of song playback)
    const panStartTime = this.config.cameraPanDownStartTime !== undefined ? this.config.cameraPanDownStartTime : 76.0;
    if (this.audioElapsed >= panStartTime) {
      const panElapsed = this.audioElapsed - panStartTime;
      const easeFactor = Math.min(1.0, panElapsed / 2.0); // Smooth ease-in over 2 seconds
      const speed = (this.config.panDownSpeed || 24.0) * easeFactor;
      this.cameraPanY += deltaSec * speed;

      // Pan space elements upward
      this.bgSprite.y = -this.cameraPanY;
      this.starfieldContainer.y = -this.cameraPanY * 1.15;
      if (this.crawlMesh && this.crawlMesh.visible) {
        this.crawlMesh.y = -this.cameraPanY;
        const horizonShift = this.cameraPanY / gameConfig.height;
        this.crawlShader.uniforms.uHorizonY = Math.max(-0.5, this.config.horizonY - horizonShift);
      }
    }

    // Fade to black starting around 1:22 (82.0s of song playback) until the end of the song
    const fadeStartTime = this.config.fadeToBlackStartTime !== undefined ? this.config.fadeToBlackStartTime : 82.0;
    const songEndTime = this.config.songDuration || 89.36;
    if (this.audioElapsed >= fadeStartTime) {
      this.fadeOverlay.visible = true;
      const fadeDuration = Math.max(0.1, songEndTime - 0.5 - fadeStartTime);
      const fadeProgress = (this.audioElapsed - fadeStartTime) / fadeDuration;
      this.fadeOverlay.alpha = Math.min(1.0, Math.max(0.0, fadeProgress));
    }

    // Finish intro at the end of the song
    if (this.audioElapsed >= songEndTime) {
      this.finishIntro();
    }
  }

  private handleSkip(): void {
    if (this.isNavigating) return;
    this.finishIntro();
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (this.isNavigating) return;

    // Only Escape key skips the intro
    if (e.key === "Escape") {
      this.handleSkip();
    }
  }

  private finishIntro(): void {
    if (this.isNavigating) return;
    this.isNavigating = true;

    // Stop / fade audio
    this.stopAudio();

    // Transition smoothly to Cutscene 1 (which plays Holodeck cutscene)
    this.emit(Scene.Change, Scene.Cutscene, this.targetLevel);
  }

  private stopAudio(): void {
    try {
      if (this.soundInstance) {
        this.soundInstance.stop?.();
        this.soundInstance = null;
      }
      if (sound.exists("intro_theme")) {
        sound.stop("intro_theme");
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

    if (this.crawlTexture) {
      this.crawlTexture.destroy(true);
    }

    if (this.crawlMesh) {
      this.crawlMesh.destroy({ children: true });
    }

    this.destroy({ children: true });
  }
}
