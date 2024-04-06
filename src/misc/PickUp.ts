import { Container, Sprite, Ticker } from "pixi.js";
import { IDisposable } from "../characters/interfaces/IDisposable";
import { IPickUpConfig } from "../configs/interfaces/IPickUpConfig";
import { ISpawnRange } from "../configs/interfaces/ISpawnRange";
import { PickUpType } from "../enums/PickUpType";
import { ISoundConfig } from "../configs/interfaces/ISoundConfig";

export class PickUp extends Container implements IDisposable {
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

    public get sound(): ISoundConfig {
        return this._config.pickUpSound;
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