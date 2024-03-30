import { Sprite } from "pixi.js";

export interface IBullet {
    sprite: Sprite,
    velocityX: number,
    velocityY: number
}