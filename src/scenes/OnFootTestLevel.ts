import { Container, Sprite } from "pixi.js";
import { BaseScene } from "./BaseScene";

export class OnFootTestLevel extends BaseScene {
    private _map: Sprite;

    constructor(stage: Container, scale: number) {
        super(stage, scale);
        this._map = Sprite.from("corridor_corner");
        const asd = Sprite.from("corridor_down");
        const asd1 = Sprite.from("corridor_down");
        const asd2 = Sprite.from("corridor_down");
        const asd3 = Sprite.from("corridor_down");
        asd.scale.set(0.2);
        asd1.scale.set(0.2);
        asd2.scale.set(0.2);
        asd3.scale.set(0.2);
        this._map.scale.set(0.2);
        asd.y += this._map.height;
        asd1.y += asd.height + asd.y;
        asd2.y += asd1.height + asd1.y;
        asd3.y += asd2.height + asd2.y;
        this.stage.addChild(this._map);
        this.stage.addChild(asd);
        this.stage.addChild(asd1);
        this.stage.addChild(asd2);
        this.stage.addChild(asd3);
    }

    public dispose(): void {
        throw new Error("Method not implemented.");
    }
}