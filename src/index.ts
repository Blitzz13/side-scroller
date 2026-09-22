import "./style.css";
import { Application, BaseTexture, Graphics, SCALE_MODES, Ticker } from "pixi.js";
import { MainMenu } from "./scenes/MainMenu";
import { gameConfig, manifest, registerFonts } from "./configs/GameConfig";
import { BaseScene } from "./scenes/BaseScene";
import { EndGame } from "./scenes/EndGame";
import { Scene } from "./enums/Scene";
import { loadGameAssets, toggleFullscreen } from "./Utils";
import { EndlessLevel } from "./scenes/EndlessLevel";
import { IPlayerConfig } from "./configs/interfaces/IPlayerConfig";
import { GameEvent } from "./enums/GameEvent";
import { RaycastScene } from "./scenes/RaycastScene";
import { LevelEndScene } from "./scenes/LevelEndScene";
import { RaycastSaveManager } from "./scenes/raycast/RaycastSaveManager";
import { Stats } from "pixi-stats";

// Set global nearest-neighbor pixel sampling for all loaded textures and spritesheets
BaseTexture.defaultOptions.scaleMode = SCALE_MODES.NEAREST;

const app = new Application<HTMLCanvasElement>({
  backgroundColor: 0xd3d3d3,
  width: gameConfig.width,
  height: gameConfig.height,
  autoDensity: true,
  resolution: Math.max(1, Math.min(window.devicePixelRatio || 1, 2)),
  antialias: true,
});

let showInstructions = true;
let shipConfig: IPlayerConfig;
let currentScale = 1;

// For pixi debug utils
(globalThis as any).__PIXI_APP__ = app;
let currentScene: BaseScene;

const isAndroid = /android/i.test(navigator.userAgent);

function setupAndroidFullscreen(): void {
  if (!isAndroid) return;

  const onFirstInteraction = () => {
    toggleFullscreen();
    if (screen.orientation && (screen.orientation as any).lock) {
      (screen.orientation as any).lock("landscape").catch(() => {});
    }
  };

  document.body.addEventListener("touchend", onFirstInteraction, { once: true });
  document.body.addEventListener("click", onFirstInteraction, { once: true });
  app.view.addEventListener("touchend", onFirstInteraction, { once: true });
}

window.onload = async (): Promise<void> => {
  await loadGameAssets(manifest);
  registerFonts();
  document.body.appendChild(app.view);

  // Add Pixi Stats and adjust its z-index
  const stats = new Stats(app.renderer);

  setupAndroidFullscreen();
  resizeCanvas();
  app.stage.interactive = true;
  changeScene(Scene.Raycast);

  // Update stats on each frame
  Ticker.shared.add(() => {
    stats.update();
  });
};

let transitionOverlay: Graphics | null = null;
let isSceneTransitioning = false;

function getTransitionOverlay(): Graphics {
  if (!transitionOverlay) {
    transitionOverlay = new Graphics();
    transitionOverlay.beginFill(0x000000);
    transitionOverlay.drawRect(-20, -20, gameConfig.width + 40, gameConfig.height + 40);
    transitionOverlay.endFill();
    transitionOverlay.zIndex = 999999;
    transitionOverlay.alpha = 0;
    transitionOverlay.eventMode = "none";
  }
  return transitionOverlay;
}

function buildScene(scene: Scene, nextLevel?: string): void {
  currentScene?.dispose();
  switch (scene) {
    case Scene.Endless:
      showInstructions = false;
      currentScene = new EndlessLevel(app.stage, currentScale, shipConfig);
      break;
    case Scene.MainMenu:
      currentScene = new MainMenu(app.stage, currentScale, showInstructions);
      currentScene.on(GameEvent.SELECT_SHIP, (config: IPlayerConfig) => {
        shipConfig = config;
      });
      break;
    case Scene.EndGame:
      currentScene = new EndGame(app.stage, currentScale);
      break;
    case Scene.LevelEnd:
      currentScene = new LevelEndScene(app.stage, currentScale, nextLevel);
      break;
    case Scene.Raycast: {
      const startingLevel = nextLevel || RaycastSaveManager.getCurrentLevel();
      currentScene = new RaycastScene(app.stage, currentScale, startingLevel);
      break;
    }
    default:
      break;
  }

  Ticker.shared.speed = 1;
  currentScene.on(Scene.Change, changeScene);
}

function changeScene(scene: Scene, nextLevel?: string): void {
  if (isSceneTransitioning) return;

  const overlay = getTransitionOverlay();
  app.stage.sortableChildren = true;

  if (!currentScene) {
    // Initial scene start: fade in from black smoothly
    overlay.alpha = 1;
    overlay.eventMode = "static";
    app.stage.addChild(overlay);

    buildScene(scene, nextLevel);

    let fadeElapsed = 0;
    const fadeDuration = 0.35;
    const onInitialFadeIn = (delta: number) => {
      fadeElapsed += delta / 60;
      overlay.alpha = Math.max(0, 1 - fadeElapsed / fadeDuration);
      if (overlay.alpha <= 0) {
        overlay.alpha = 0;
        overlay.eventMode = "none";
        Ticker.shared.remove(onInitialFadeIn);
      }
    };
    Ticker.shared.add(onInitialFadeIn);
    return;
  }

  // Smooth cinematic scene transition: Fade Out -> Swap Scene -> Fade In
  isSceneTransitioning = true;
  overlay.alpha = 0;
  overlay.eventMode = "static";
  app.stage.addChild(overlay);

  let fadeOutElapsed = 0;
  const fadeDuration = 0.28;

  const onFadeOut = (delta: number) => {
    fadeOutElapsed += delta / 60;
    overlay.alpha = Math.min(1, fadeOutElapsed / fadeDuration);

    if (overlay.alpha >= 1) {
      Ticker.shared.remove(onFadeOut);
      overlay.alpha = 1;

      // Swap the active scene while screen is fully black
      buildScene(scene, nextLevel);
      app.stage.addChild(overlay); // Ensure overlay stays on top

      // Smoothly fade in the new scene
      let fadeInElapsed = 0;
      const onFadeIn = (inDelta: number) => {
        fadeInElapsed += inDelta / 60;
        overlay.alpha = Math.max(0, 1 - fadeInElapsed / fadeDuration);

        if (overlay.alpha <= 0) {
          Ticker.shared.remove(onFadeIn);
          overlay.alpha = 0;
          overlay.eventMode = "none";
          isSceneTransitioning = false;
        }
      };
      Ticker.shared.add(onFadeIn);
    }
  };

  Ticker.shared.add(onFadeOut);
}

function resizeCanvas(): void {
  const clientWidth = document.documentElement.clientWidth;
  const clientHeight = document.documentElement.clientHeight;

  let scale = Math.min(
    clientWidth / gameConfig.width,
    clientHeight / gameConfig.height
  );
  currentScale = scale;

  const newWidth = Math.round(gameConfig.width * scale);
  const newHeight = Math.round(gameConfig.height * scale);

  app.renderer.resize(newWidth, newHeight);
  app.stage.scale.set(scale);
  if (currentScene) {
    currentScene.appScale = scale;
  }

  const offsetX = (clientWidth - newWidth) / 2;
  const offsetY = (clientHeight - newHeight) / 2;
  app.view.style.position = "absolute";
  app.view.style.left = `${offsetX}px`;
  app.view.style.top = `${offsetY}px`;
}

resizeCanvas();
window.addEventListener("resize", resizeCanvas);
window.addEventListener("orientationchange", () => {
  setTimeout(resizeCanvas, 150);
});
document.addEventListener("fullscreenchange", resizeCanvas);
document.addEventListener("webkitfullscreenchange", resizeCanvas);