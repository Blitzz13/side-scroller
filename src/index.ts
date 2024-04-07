import "./style.css";
import { Application, Ticker } from "pixi.js";
import { MainMenu } from "./scenes/MainMenu";
import { gameConfig, manifest, registerFonts } from "./configs/GameConfig";
import { BaseScene } from "./scenes/BaseScene";
import { EndGame } from "./scenes/EndGame";
import { Scene } from "./enums/Scene";
import { loadGameAssets } from "./Utils";
import { EndlessLevel } from "./scenes/EndlessLevel";
import { IPlayerConfig } from "./configs/interfaces/IPlayerConfig";
import { GameEvent } from "./enums/GameEvent";

const app = new Application<HTMLCanvasElement>({
  backgroundColor: 0xd3d3d3,
  width: gameConfig.width,
  height: gameConfig.height,
});

let showInstructions = true;
let shipConfig: IPlayerConfig;
let currentScale = 1;

// For pixi debug utils
(globalThis as any).__PIXI_APP__ = app;
let currentScene: BaseScene;
window.onload = async (): Promise<void> => {
  await loadGameAssets(manifest);
  registerFonts();
  document.body.appendChild(app.view);
  resizeCanvas();
  app.stage.interactive = true;
  changeScene(Scene.MainMenu);
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
    default:
      break;
  }

  Ticker.shared.speed = 1;
  currentScene.on(Scene.Change, changeScene);
}

function resizeCanvas(): void {
  const cleintWidth = document.documentElement.clientWidth;
  const clientHeight = document.documentElement.clientHeight;

  let scale = Math.min(cleintWidth / gameConfig.width, clientHeight / gameConfig.height);
  currentScale = scale;

  const newWidth = Math.round(gameConfig.width * scale);
  const newHeight = Math.round(gameConfig.height * scale);

  app.renderer.resize(newWidth, newHeight);
  app.stage.scale.set(scale);
  if (currentScene) {
    currentScene.appScale = scale;
  }

  const offsetX = (cleintWidth - newWidth) / 2;
  const offsetY = (clientHeight - newHeight) / 2;
  app.view.style.position = "absolute";
  app.view.style.left = `${offsetX}px`;
  app.view.style.top = `${offsetY}px`;
}

resizeCanvas();
window.addEventListener("resize", resizeCanvas);
