import { AssetsManifest, Assets, Texture } from "pixi.js";
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

export async function loadGameAssets(manifest: AssetsManifest): Promise<void> {
  await Assets.init({ manifest });
  await Assets.loadBundle(manifest.bundles.map(x => x.name));
}