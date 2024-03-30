import "./style.css";
import { AnimatedSprite, Application, Assets, AssetsManifest, Sprite, Texture } from "pixi.js";
import { EndlessLevel } from "./EndlessLevel";
import { gameConfig } from "./configs/GameConfig";

const app = new Application<HTMLCanvasElement>({
  backgroundColor: 0xd3d3d3,
  width:  gameConfig.width,
  height: gameConfig.height,
});

// For pixi debug utils
(globalThis as any).__PIXI_APP__ = app;

window.onload = async (): Promise<void> => {
  await loadGameAssets();
  document.body.appendChild(app.view);
  resizeCanvas();
  app.stage.interactive = true;
  new EndlessLevel(app.stage);
};

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
            name: "grunt_idle",
            srcs: "./assets/grunt_idle.json",
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
