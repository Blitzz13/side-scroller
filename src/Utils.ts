import { AssetsManifest, Assets, BitmapText, Container, Sprite, AnimatedSprite, Texture } from "pixi.js";
import { EnemyType } from "./enums/EnemyType";

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

export function getTextureArrayFromStrings(textureStrings: string[]): Texture[] {
  const textures: Texture[] = [];
  for (const string of textureStrings) {
    const texture = Texture.from(string);
    textures.push(texture);
  }

  return textures;
}

export function getRandomInt(min: number, max: number) {
  min = Math.ceil(min);
  max = Math.floor(max);
  const asd = Math.floor(Math.random() * (max - min)) + min;
  console.log(asd);
  return asd;
}

export async function loadGameAssets(): Promise<void> {
  const manifest: AssetsManifest = {
    bundles: [
      {
        name: "environment",
        assets: [
          {
            name: "outdoors_area",
            src: "./assets/outdoors_area.jpg",
          },
          {
            name: "menu_background",
            src: "./assets/menu_background.png",
          }
        ],
      },
      {
        name: "characters",
        assets: [
          {
            name: "x_wing",
            src: "./assets/x_wing.png",
          },
          {
            name: "y_wing",
            src: "./assets/y_wing.png",
          },
          {
            name: "laser",
            src: "./assets/laser.png",
          },
          {
            name: "at_st",
            src: "./assets/at_st.json",
          },
          {
            name: "viper_droid",
            src: "./assets/viper_droid.json",
          }
        ],
      },
      {
        name: "objects",
        assets: [
          {
            name: "bullet",
            src: "./assets/bullet.png",
          },
          {
            name: "green_ball",
            src: "./assets/green_ball.png",
          },
          {
            name: "ammo",
            src: "./assets/ammo.png",
          },
          {
            name: "health",
            src: "./assets/health.png",
          }
        ],
      },
    ],
  };

  await Assets.init({ manifest });
  await Assets.loadBundle(["environment", "characters", "objects"]);
}