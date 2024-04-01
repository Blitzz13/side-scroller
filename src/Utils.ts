import { AssetsManifest, Assets, BitmapText, Container, Sprite, AnimatedSprite, Texture } from "pixi.js";
import { EnemyType } from "./enums/EnemyType";
import { gameConfig } from "./configs/GameConfig";

export function saveScore(key: string, score: Map<EnemyType, number>) {
  const scoreObject = Object.fromEntries(score);
  const scoreJSON = JSON.stringify(scoreObject);
  localStorage.setItem(key, scoreJSON);
}

export function retrieveScore(key: string): Map<EnemyType, number> | null {
  const killsJSON = localStorage.getItem(key);
  if (killsJSON) {
    const killsObject = JSON.parse(killsJSON);
    return new Map(Object.entries(killsObject)) as Map<EnemyType, number>;
  }

  return null;
}

export function getDoomguyAnimation(): AnimatedSprite {
  const textures: Texture[] = [];
  for (let i = 0; i < 100; i++) {
    const texture = Texture.from(`frame_${i.toString().padStart(3, "0")}.png`);
    textures.push(texture);
  }

  const animation = new AnimatedSprite(textures);
  animation.play();
  animation.loop = true;
  animation.animationSpeed = 0.4;
  animation.scale.set(1.6);
  return animation;
}

export async function loadGameAssets(): Promise<void> {
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
          {
            name: "main_menu_anim",
            srcs: "./assets/main_menu_anim.json",
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
          {
            name: "caocdemon",
            srcs: "./assets/cacodemon.json",
          },
          {
            name: "portrait",
            srcs: "./assets/ui_portrait.json",
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
          {
            name: "green_ball",
            srcs: "./assets/green_ball.png",
          },
        ],
      },
    ],
  };

  await Assets.init({ manifest });
  await Assets.loadBundle(["environment", "characters", "objects"]);
}