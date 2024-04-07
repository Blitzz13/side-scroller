import { ILineStyleOptions, RoundedRectangle } from "pixi.js";
import { ISpriteConfig } from "./ISpriteConfig";
import { ITextConfig } from "./ITextConfig";

export interface IInstructionsConfig { 
    distanceBetweenItemsY: number;
    titleConfig: ITextConfig;
    contentTextConfig: ITextConfig;
    ammoDescConfig: ITextConfig;
    healthDescConfig: ITextConfig;
    background: {
        color: number;
        alpha: number;
        lineStyle: ILineStyleOptions;
        size: RoundedRectangle;
    }
    ammo: ISpriteConfig;
    health: ISpriteConfig;
}