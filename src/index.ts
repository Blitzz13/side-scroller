import "./style.css";
import { Application, Assets, AssetsManifest, Sprite, Texture, Ticker } from "pixi.js";
import { EndlessScene } from "./scenes/EndlessLevel";
import { MainMenu } from "./scenes/MainMenu";
import { gameConfig } from "./configs/GameConfig";
import { BitmapFont } from "pixi.js";
import { BaseScene } from "./scenes/BaseScene";
import { EndGame } from "./scenes/EndGame";
import { Scene } from "./enums/Scene";
import { loadGameAssets } from "./Utils";

const app = new Application<HTMLCanvasElement>({
  backgroundColor: 0xd3d3d3,
  width: gameConfig.width,
  height: gameConfig.height,
});

// For pixi debug utils
(globalThis as any).__PIXI_APP__ = app;
let currentScene: BaseScene;
window.onload = async (): Promise<void> => {
  await loadGameAssets();
  registerFonts();
  document.body.appendChild(app.view);
  resizeCanvas();
  app.stage.interactive = true;
  changeScene(Scene.EndGame);
};

function changeScene(scene: Scene): void {
  currentScene?.dispose();
  switch (scene) {
    case Scene.Endless:
      currentScene = new EndlessScene(app.stage);
      break;
    case Scene.MainMenu:
      currentScene = new MainMenu(app.stage);
      break;
    case Scene.EndGame:
      currentScene = new EndGame(app.stage);
      break;
    default:
      break;
  }
  currentScene.on(Scene.Change, changeScene);
}

function registerFonts(): void {
  BitmapFont.from("arial32", {
    fontFamily: "Arial",
    fontSize: 32,
    lineHeight: 33,
    fill: 0xffffff,
  });
}

// async function loadGameAssets(): Promise<void> {
//   const manifest: AssetsManifest = {
//     bundles: [
//       {
//         name: "environment",
//         assets: [
//           {
//             name: "corridor",
//             srcs: "./assets/map2.png",
//           },
//           {
//             name: "background_hell",
//             srcs: "./assets/backgorund_hell.json",
//           },
//           {
//             name: "main_menu_anim",
//             srcs: "./assets/main_menu_anim.json",
//           },
//         ],
//       },
//       {
//         name: "characters",
//         assets: [
//           {
//             name: "doomguy",
//             srcs: "./assets/doomguy_walking.json",
//           },
//           {
//             name: "doomguy_death",
//             srcs: "./assets/doomguy_death.json",
//           },
//           {
//             name: "grunt_idle",
//             srcs: "./assets/grunt_idle.json",
//           },
//           {
//             name: "grunt_death",
//             srcs: "./assets/grunt_death.json",
//           },
//           {
//             name: "caocdemon",
//             srcs: "./assets/cacodemon.json",
//           },
//         ],
//       },
//       {
//         name: "objects",
//         assets: [
//           {
//             name: "bullet",
//             srcs: "./assets/bullet.png",
//           },
//           {
//             name: "muzzle",
//             srcs: "./assets/muzzle_flash.json",
//           },
//           {
//             name: "green_ball",
//             srcs: "./assets/green_ball.png",
//           },
//         ],
//       },
//     ],
//   };

//   await Assets.init({ manifest });
//   await Assets.loadBundle(["environment", "characters", "objects"]);
// }

function resizeCanvas(): void {
  const cleintWidth = document.documentElement.clientWidth;
  const clientHeight = document.documentElement.clientHeight;

  let scale = Math.min(cleintWidth / gameConfig.width, clientHeight / gameConfig.height);

  const newWidth = Math.round(gameConfig.width * scale);
  const newHeight = Math.round(gameConfig.height * scale);

  app.renderer.resize(newWidth, newHeight);
  app.stage.scale.set(scale);

  const offsetX = (cleintWidth - newWidth) / 2;
  const offsetY = (clientHeight - newHeight) / 2;
  app.view.style.position = "absolute";
  app.view.style.left = `${offsetX}px`;
  app.view.style.top = `${offsetY}px`;
}

function requestFullscreen(): void {
  if (document.fullscreenEnabled) {
      app.view.requestFullscreen().catch((error) => {
          console.error('Failed to enter fullscreen:', error);
      });
  } else {
      console.error('Fullscreen is not supported.');
  }
}

resizeCanvas();
// app.view.addEventListener('click', requestFullscreen);
window.addEventListener("resize", resizeCanvas);
