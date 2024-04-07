import { BitmapText, Container, Graphics, Sprite } from "pixi.js";
import { Button } from "../misc/Button";
import { defaultButtonSize } from "../configs/GameConfig";
import { instructionsConfig } from "../configs/InstructionsConfig";
import { IDisposable } from "../characters/interfaces/IDisposable";

export class Instructions extends Container implements IDisposable {
    constructor() {
        super();
        const titleText = new BitmapText("Instructions", instructionsConfig.titleConfig.textConfig);
        titleText.anchor.copyFrom(instructionsConfig.titleConfig.anchor);
        titleText.position.copyFrom(instructionsConfig.titleConfig.position);

        const content = new BitmapText(
            "The game can be paused by pressing ESC. The player is controlled with WASD or the ARROW keys and drops bombs with SPACEBAR.",
            instructionsConfig.contentTextConfig.textConfig
        );
        content.anchor.copyFrom(instructionsConfig.contentTextConfig.anchor);

        const ok = new Button(defaultButtonSize, "OK");

        const ammoDesc = new BitmapText("Restores Ammo", instructionsConfig.ammoDescConfig.textConfig);
        ammoDesc.position.copyFrom(instructionsConfig.ammoDescConfig.position);

        const healthDesc = new BitmapText("Restores Health", instructionsConfig.healthDescConfig.textConfig);

        healthDesc.position.copyFrom(instructionsConfig.healthDescConfig.position)

        const ammo = Sprite.from(instructionsConfig.ammo.texture);
        ammo.scale.copyFrom(instructionsConfig.ammo.scale);
        ammo.position.copyFrom(instructionsConfig.ammo.position);

        const health = Sprite.from(instructionsConfig.health.texture);
        health.scale.copyFrom(instructionsConfig.health.scale);
        health.position.copyFrom(instructionsConfig.health.position)

        ok.on("pointerdown", () => {
            this.visible = false;
        });

        const graphics = new Graphics();
        graphics.beginFill(instructionsConfig.background.color, instructionsConfig.background.alpha);
        graphics.lineStyle(instructionsConfig.background.lineStyle);

        graphics.drawRoundedRect(
            instructionsConfig.background.size.x,
            instructionsConfig.background.size.y,
            instructionsConfig.background.size.width,
            instructionsConfig.background.size.height,
            instructionsConfig.background.size.radius
        );

        titleText.x = graphics.width / 2;
        content.y += titleText.y + titleText.textHeight + instructionsConfig.distanceBetweenItemsY;
        content.x = titleText.x;
        ok.x = graphics.width / 2 - ok.width / 2;
        ok.y = graphics.height - ok.height - instructionsConfig.distanceBetweenItemsY;
        ok.interactive = true;

        this.addChild(graphics);
        this.addChild(titleText);
        this.addChild(content);
        this.addChild(ammo);
        this.addChild(health);
        this.addChild(healthDesc);
        this.addChild(ammoDesc);
        this.addChild(ok);
    }

    public dispose(): void {
        this.destroy();
    }
}