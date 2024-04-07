import { BitmapText, Container, Graphics, RoundedRectangle } from "pixi.js";

export class Button extends Container {
    constructor(size: RoundedRectangle, text: string) {
        super();
        const button = new Graphics();
        button.beginFill(0x000000);
        button.lineStyle({
            width: 2,
            color: 0x919191
        })

        this.interactive = true;

        button.drawRoundedRect(0, 0, size.width, size.height, size.radius);

        const buttonText = new BitmapText(text, {
            fontName: "arial32",
        });

        buttonText.anchor.set(0.5);
        button.eventMode = 'static';

        this.addChild(button);
        this.addChild(buttonText);

        buttonText.position.set(button.width / 2, button.height / 2);

        this.on("mouseenter", () => {
            this.alpha = 0.7;
        });

        this.on("mouseleave", () => {
            this.alpha = 1;
        });
    }
}