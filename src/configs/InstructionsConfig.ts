import { Point, RoundedRectangle } from "pixi.js";
import { IInstructionsConfig } from "./interfaces/IInstructionsConfig";

export const instructionsConfig: IInstructionsConfig = {
    distanceBetweenItemsY: 20,
    ammo: {
        position: new Point(70, 120),
        scale: new Point(0.3, 0.3),
        texture: "ammo"
    },
    health: {
        position: new Point(430, 114),
        scale: new Point(0.09, 0.09),
        texture: "health"
    },
    titleConfig: {
        position: new Point(0, 14),
        anchor: new Point(0.5, 0),
        textConfig: {
            fontName: "arial32",
        }
    },
    contentTextConfig: {
        position: new Point(),
        anchor: new Point(0.5, 0),
        textConfig: {
            fontName: "arial32",
            fontSize: 20,
            maxWidth: 674,
            align: "center"
        }
    },
    ammoDescConfig: {
        position: new Point(138, 136),
        anchor: new Point(),
        textConfig: {
            fontName: "arial32",
            fontSize: 20,
        }
    },
    healthDescConfig: {
        position: new Point(494, 136),
        anchor: new Point(),
        textConfig: {
            fontName: "arial32",
            fontSize: 20,
        }
    },
    background: {
        color: 0x141414,
        alpha: 1,
        lineStyle: {
            color: 0x919191,
            width: 2
        },
        size: new RoundedRectangle(0, 0, 700, 300, 12),
    }
}