import "./style.css";
import { Application, BaseTexture, SCALE_MODES, Ticker } from "pixi.js";
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
import { Stats } from "pixi-stats";

// Set global nearest-neighbor pixel sampling for all loaded textures and spritesheets
BaseTexture.defaultOptions.scaleMode = SCALE_MODES.NEAREST;

const app = new Application<HTMLCanvasElement>({
  backgroundColor: 0xd3d3d3,
  width: gameConfig.width,
  height: gameConfig.height,
  autoDensity: true,
  resolution: Math.max(1, Math.min(window.devicePixelRatio || 1, 3)),
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

function changeScene(scene: Scene): void {
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
    case Scene.Raycast:
      currentScene = new RaycastScene(app.stage, currentScale);
      break;
    default:
      break;
  }

  Ticker.shared.speed = 1;
  currentScene.on(Scene.Change, changeScene);
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