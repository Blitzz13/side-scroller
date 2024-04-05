import { Container, Sprite, Ticker } from "pixi.js";
import { IEntity } from "../characters/interfaces/IEntity";
import { IPickUpConfig } from "../configs/interfaces/IPickUpConfig";
import { ISpawnRange } from "../configs/interfaces/ISpawnRange";
import { PickUpType } from "../enums/PickUpType";

export class PickUp extends Container implements IEntity {
    private _config: IPickUpConfig
    constructor(config: IPickUpConfig) {
        super();
        this._config = config;
        this.scale.copyFrom(config.scale);
        const sprite = Sprite.from(config.texture);
        this.addChild(sprite);
        Ticker.shared.add(this.move, this);
    }

    public get type(): PickUpType {
        return this._config.type;
    }

    public get spawnRange(): ISpawnRange {
        return this._config.spawnRange;
    }

    public pickUp(): number {
        return this._config.amount;
    }

    public dispose(): void {
        this.destroy();
        Ticker.shared.remove(this.move, this);
    }

    private move(dt: number): void {
        this.x -= this._config.speed * dt;
    }
}