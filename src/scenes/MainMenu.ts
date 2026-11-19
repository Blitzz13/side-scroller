import { Container, Graphics, RoundedRectangle, Sprite, Text } from "pixi.js";
import { gameConfig } from "../configs/GameConfig";
import { BaseScene } from "./BaseScene";
import { Scene } from "../enums/Scene";
import { Button } from "../misc/Button";
import { sound } from "@pixi/sound";
import { RaycastSaveManager } from "./raycast/RaycastSaveManager";
import { InGameMenu } from "../ui/InGameMenu";

export class MainMenu extends BaseScene {
    private optionsModal?: InGameMenu;

    constructor(stage: Container, scale: number) {
        super(stage, scale);

        try {
            const s = sound.find("menu_theme");
            if (!s || !s.isPlaying) {
                sound.play("menu_theme", { loop: true });
            }
        } catch {}

        // 1. Background
        const background = Sprite.from("menu_background");
        background.position.set(-3, -3);
        background.scale.set(1.2);
        this.addChild(background);

        // Dim overlay for clear text readability
        const dimOverlay = new Graphics();
        dimOverlay.beginFill(0x000000, 0.4);
        dimOverlay.drawRect(0, 0, gameConfig.width, gameConfig.height);
        dimOverlay.endFill();
        this.addChild(dimOverlay);

        const playClickSound = () => {
            try {
                if (sound.exists("button_click")) {
                    sound.play("button_click", { volume: 0.45 });
                } else {
                    sound.add("button_click", {
                        url: "./assets/sounds/button_click.mp3",
                        preload: true,
                        loaded: () => {
                            sound.play("button_click", { volume: 0.45 });
                        }
                    });
                }
            } catch (e) {}
        };

        // 2. Title Logo
        const titleText = new Text("STAR WARS", {
            fontFamily: "Segoe UI, Arial, sans-serif",
            fontSize: 54,
            fontWeight: "900",
            fill: ["#FFE81F", "#D4AC0D"],
            letterSpacing: 8,
            dropShadow: true,
            dropShadowColor: 0x000000,
            dropShadowBlur: 8,
            dropShadowDistance: 4,
            align: "center",
        });
        titleText.anchor.set(0.5, 0.5);
        titleText.position.set(gameConfig.width / 2, 160);
        this.addChild(titleText);

        const subtitleText = new Text("A REBEL STORY", {
            fontFamily: "Segoe UI, Arial, sans-serif",
            fontSize: 22,
            fontWeight: "bold",
            fill: 0x00e5ff,
            letterSpacing: 8,
            dropShadow: true,
            dropShadowColor: 0x000000,
            dropShadowBlur: 6,
            dropShadowDistance: 2,
            align: "center",
        });
        subtitleText.anchor.set(0.5, 0.5);
        subtitleText.position.set(gameConfig.width / 2, 218);
        this.addChild(subtitleText);

        // 3. Buttons Layout
        const btnSize = new RoundedRectangle(0, 0, 260, 56, 14);
        const btnX = gameConfig.width / 2 - btnSize.width / 2;

        // Check if there is valid progress in any level
        const save = RaycastSaveManager.loadProgress();
        const hasProgress = Boolean(
            save &&
            ((save.completedLevels && save.completedLevels.length > 0) ||
             (save.currentLevel && save.currentLevel !== "level1") ||
             save.player)
        );

        let currentY = hasProgress ? 295 : 340;
        const btnGap = 16;

        // 3A. Continue Button (shown only if progress exists)
        if (hasProgress) {
            const continueButton = new Button(btnSize, "Continue");
            continueButton.x = btnX;
            continueButton.y = currentY;
            continueButton.eventMode = "static";
            continueButton.cursor = "pointer";
            continueButton.on("pointertap", (e) => {
                e?.stopPropagation?.();
                playClickSound();
                if (sound.exists("menu_theme")) {
                    sound.stop("menu_theme");
                }
                const currentLevel = RaycastSaveManager.getCurrentLevel() || "level1";
                this.emit(Scene.Change, Scene.Raycast, currentLevel, true);
            });
            this.addChild(continueButton);
            currentY += btnSize.height + btnGap;
        }

        // 3B. New Game Button (starts levels from level 1)
        const newGameButton = new Button(btnSize, "New Game");
        newGameButton.x = btnX;
        newGameButton.y = currentY;
        newGameButton.eventMode = "static";
        newGameButton.cursor = "pointer";
        newGameButton.on("pointertap", (e) => {
            e?.stopPropagation?.();
            playClickSound();
            if (sound.exists("menu_theme")) {
                sound.stop("menu_theme");
            }
            RaycastSaveManager.clearSave();
            this.emit(Scene.Change, Scene.Raycast, "level1", false);
        });
        this.addChild(newGameButton);
        currentY += btnSize.height + btnGap;

        // 3C. Level Select Button
        const levelSelectButton = new Button(btnSize, "Level Select");
        levelSelectButton.x = btnX;
        levelSelectButton.y = currentY;
        levelSelectButton.eventMode = "static";
        levelSelectButton.cursor = "pointer";
        levelSelectButton.on("pointertap", (e) => {
            e?.stopPropagation?.();
            playClickSound();
            this.emit(Scene.Change, Scene.LevelSelect);
        });
        this.addChild(levelSelectButton);
        currentY += btnSize.height + btnGap;

        // 3D. Options Button
        const optionsButton = new Button(btnSize, "Options");
        optionsButton.x = btnX;
        optionsButton.y = currentY;
        optionsButton.eventMode = "static";
        optionsButton.cursor = "pointer";
        optionsButton.on("pointertap", (e) => {
            e?.stopPropagation?.();
            playClickSound();
            if (!this.optionsModal) {
                this.optionsModal = new InGameMenu({ standaloneOptions: true });
                this.optionsModal.zIndex = 100;
                this.optionsModal.on("close", () => {
                    if (this.optionsModal) {
                        this.optionsModal.visible = false;
                    }
                });
                this.addChild(this.optionsModal);
            }
            this.optionsModal.refreshDisplay();
            this.optionsModal.visible = true;
        });
        this.addChild(optionsButton);
    }

    public dispose(): void {
        if (this.optionsModal) {
            this.optionsModal.dispose();
            this.optionsModal = undefined;
        }
        this.destroy({ children: true });
    }
}
