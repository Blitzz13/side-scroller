import "./style.css";
import { Application, Assets, AssetsManifest, Sprite, Texture, Ticker } from "pixi.js";
import { EndlessScene } from "./scenes/EndlessLevel";
import { MainMenu } from "./scenes/MainMenu";
import { gameConfig } from "./configs/GameConfig";
import { BitmapFont } from "pixi.js";
import { BaseScene } from "./scenes/BaseScene";
import { Scene } from "./Scene";

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
  changeScene(Scene.MainMenu);
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
    default:
      break;
  }
  currentScene.on(Scene.Change, changeScene);
}

function registerFonts(): void {
  BitmapFont.from("arial32", {
    fontFamily: "Arial",
    fontSize: 32,
    fill: 0xffffff,
  })
}

async function loadGameAssets(): Promise<void> {
  const manifest: AssetsManifest = {
    bundles: [
      {
        name: "environment",
        assets: [
          {
            name: "corridor",
            srcs: "./assets/map2.png",
          },
          {
            name: "background_hell",
            srcs: "./assets/backgorund_hell.json",
          },
        ],
      },
      {
        name: "characters",
        assets: [
          {
            name: "doomguy",
            srcs: "./assets/doomguy_walking.json",
          },
          {
            name: "doomguy_death",
            srcs: "./assets/doomguy_death.json",
          },
          {
            name: "grunt_idle",
            srcs: "./assets/grunt_idle.json",
          },
          {
            name: "grunt_death",
            srcs: "./assets/grunt_death.json",
          },
        ],
      },
      {
        name: "objects",
        assets: [
          {
            name: "bullet",
            srcs: "./assets/bullet.png",
          },
          {
            name: "muzzle",
            srcs: "./assets/muzzle_flash.json",
          },
        ],
      },
    ],
  };

  await Assets.init({ manifest });
  await Assets.loadBundle(["environment", "characters", "objects"]);
}

function resizeCanvas(): void {
  const resize = () => {
    let scale = 1;

    scale = window.innerWidth / gameConfig.width;

    app.renderer.resize(gameConfig.width * scale, gameConfig.height * scale);
    app.stage.scale.set(scale);
  };

  resize();

  window.addEventListener("resize", resize);
}
