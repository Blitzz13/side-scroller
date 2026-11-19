import { Container, Graphics, RoundedRectangle, Text } from "pixi.js";

export interface IButtonOptions {
    fillColor?: number;
    fillAlpha?: number;
    strokeColor?: number;
    strokeWidth?: number;
    strokeAlpha?: number;
    textColor?: number | string;
}

export class Button extends Container {
    constructor(size: RoundedRectangle, text: string, options: IButtonOptions = {}) {
        super();
        const button = new Graphics();
        
        // Theme matching skip buttons and "A REBEL STORY" text
        // Background: deep cosmic blue fill matching the skip buttons
        const fillColor = options.fillColor ?? 0x05101e;
        const fillAlpha = options.fillAlpha ?? 0.90;
        // Stroke: exact same cyan border as the skip buttons (0x00e5ff)
        const strokeColor = options.strokeColor ?? 0x00e5ff;
        const strokeWidth = options.strokeWidth ?? 2;
        const strokeAlpha = options.strokeAlpha ?? 0.85;

        button.beginFill(fillColor, fillAlpha);
        button.lineStyle({
            width: strokeWidth,
            color: strokeColor,
            alpha: strokeAlpha,
        });

        this.interactive = true;

        button.drawRoundedRect(0, 0, size.width, size.height, size.radius);
        button.endFill();

        const buttonText = new Text(text, {
            fontFamily: "Segoe UI, Arial, sans-serif",
            fontSize: 22,
            fontWeight: "bold",
            fill: options.textColor ?? 0x00e5ff,
            letterSpacing: 2,
            dropShadow: true,
            dropShadowColor: 0x002233,
            dropShadowDistance: 1,
            align: "center",
        });

        buttonText.anchor.set(0.5);
        buttonText.roundPixels = true;
        button.eventMode = 'static';

        this.addChild(button);
        this.addChild(buttonText);

        buttonText.position.set(Math.round(size.width / 2), Math.round(size.height / 2));

        this.on("mouseenter", () => {
            this.alpha = 0.85;
            this.scale.set(1.02);
        });

        this.on("mouseleave", () => {
            this.alpha = 1;
            this.scale.set(1.0);
        });
    }
}