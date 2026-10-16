import { Container, Graphics, Sprite, Text } from "pixi.js";
import { IDisposable } from "../characters/interfaces/IDisposable";
import { VirtualJoystick, JoystickVector } from "./VirtualJoystick";
import { VirtualButton } from "./VirtualButton";
import { TouchLookArea } from "./TouchLookArea";
import { gameConfig } from "../configs/GameConfig";
import { toggleFullscreen } from "../Utils";

export class MobileControls extends Container implements IDisposable {
  private joystick: VirtualJoystick;
  private lookArea: TouchLookArea;
  private btnTurnLeft: VirtualButton;
  private btnTurnRight: VirtualButton;
  private btnFire: VirtualButton;
  private btnAction: VirtualButton;
  private btnWeapon: VirtualButton;
  private btnFullscreen: VirtualButton;
  private btnSprint: VirtualButton;
  private btnMap: Container;
  private btnObjectives: Container;
  private buttonTurnSpeed: number = 0.04;

  constructor() {
    super();

    const screenW = gameConfig.width;
    const screenH = gameConfig.height;

    // 1. Right-side touch look area (swipe anywhere on right half of screen to look)
    this.lookArea = new TouchLookArea(screenW / 2, screenH);
    this.lookArea.position.set(screenW / 2, 0);
    this.lookArea.on("tap", (e: any) => {
      const posX = e.global?.x ?? e.x ?? 0;
      const posY = e.global?.y ?? e.y ?? 0;
      // Check if tapped over HUD weapon info container (bottom right corner)
      const inWeaponHud = posX >= screenW - 270 && posY >= screenH - 95;
      // Check if tapped over weapon sprite area (lower right-center)
      const inWeaponView = posX >= screenW * 0.45 && posX <= screenW * 0.85 && posY >= screenH * 0.50;
      if (inWeaponHud || inWeaponView) {
        (this as any).emit("switchWeapon");
      }
    });
    this.addChild(this.lookArea);

    // 2. Left-side thumbstick for walking & strafing
    this.joystick = new VirtualJoystick(70, 32);
    this.joystick.position.set(160, screenH - 160);
    this.addChild(this.joystick);

    // 3. Quick Turn Left Button (<)
    this.btnTurnLeft = new VirtualButton(36, "<", 0x111111);
    this.btnTurnLeft.position.set(screenW - 270, screenH - 130);
    this.addChild(this.btnTurnLeft);

    // 4. Quick Turn Right Button (>)
    this.btnTurnRight = new VirtualButton(36, ">", 0x111111);
    this.btnTurnRight.position.set(screenW - 180, screenH - 130);
    this.addChild(this.btnTurnRight);

    // 5. Fire / Shoot Button
    this.btnFire = new VirtualButton(46, "FIRE", 0x882222);
    this.btnFire.position.set(screenW - 85, screenH - 130);
    this.btnFire.on("tap", () => {
      (this as any).emit("fire");
    });
    this.addChild(this.btnFire);

    // 6. Action / Interact Button ([E] Open Door / Use)
    this.btnAction = new VirtualButton(42, "E", 0x224422);
    this.btnAction.position.set(screenW - 85, screenH - 230);
    this.btnAction.on("tap", () => {
      (this as any).emit("action");
    });
    this.addChild(this.btnAction);

    // 7. Weapon Switch Button ([WPN])
    this.btnWeapon = new VirtualButton(42, "WPN", 0x224466);
    this.btnWeapon.position.set(screenW - 180, screenH - 230);
    this.btnWeapon.on("tap", () => {
      (this as any).emit("switchWeapon");
    });
    this.addChild(this.btnWeapon);

    // 8. Fullscreen Button ([FS])
    this.btnFullscreen = new VirtualButton(36, "FS", 0x222244);
    this.btnFullscreen.position.set(screenW - 70, 60);
    this.btnFullscreen.on("tap", () => {
      toggleFullscreen();
    });
    this.addChild(this.btnFullscreen);

    // 9. Sprint Toggle Button ([RUN])
    this.btnSprint = new VirtualButton(42, "RUN", 0x1f2937);
    this.btnSprint.position.set(screenW - 270, screenH - 230);
    this.btnSprint.setToggleMode(true, 0x005577, 0x00e5ff);
    this.btnSprint.on("toggle", (active: boolean) => {
      (this as any).emit("toggleSprint", active);
    });
    this.addChild(this.btnSprint);

    // 10. Map Button ([MAP]) with assets/common/map_icon.png
    this.btnMap = new Container();
    this.btnMap.position.set(screenW - 150, 60);
    this.btnMap.eventMode = "static";
    this.btnMap.cursor = "pointer";

    const mapBg = new Graphics();
    const drawBtnBg = (pressed: boolean) => {
      mapBg.clear();
      // Star Wars sci-fi cyber theme: deep dark blue fill with glowing cyan border & inner ring
      const bgColor = pressed ? 0x004466 : 0x091929;
      const borderColor = pressed ? 0x00ffff : 0x00e5ff;
      mapBg.beginFill(bgColor, pressed ? 0.95 : 0.85);
      mapBg.lineStyle(2.5, borderColor, pressed ? 1.0 : 0.85);
      mapBg.drawCircle(0, 0, 36);
      mapBg.lineStyle(1, borderColor, pressed ? 0.6 : 0.35);
      mapBg.drawCircle(0, 0, 31);
      mapBg.endFill();
    };
    drawBtnBg(false);
    this.btnMap.addChild(mapBg);

    let mapIcon: Sprite;
    try {
      mapIcon = Sprite.from("assets/common/map_icon.png");
    } catch {
      mapIcon = Sprite.from("map_icon");
    }
    mapIcon.anchor.set(0.5);
    mapIcon.width = 40;
    mapIcon.height = 40;
    mapIcon.position.set(0, 0);
    mapIcon.tint = 0xffffff;
    this.btnMap.addChild(mapIcon);

    this.btnMap.on("pointerdown", (e: any) => {
      if (e && typeof e.stopPropagation === "function") e.stopPropagation();
      drawBtnBg(true);
      this.btnMap.scale.set(0.92);
    });
    this.btnMap.on("pointerup", (e: any) => {
      if (e && typeof e.stopPropagation === "function") e.stopPropagation();
      drawBtnBg(false);
      this.btnMap.scale.set(1.0);
      (this as any).emit("toggleMinimap");
    });
    this.btnMap.on("pointerupoutside", () => {
      drawBtnBg(false);
      this.btnMap.scale.set(1.0);
    });
    this.addChild(this.btnMap);

    // 11. Objectives Info Button ([i])
    this.btnObjectives = new Container();
    this.btnObjectives.position.set(screenW - 230, 60);
    this.btnObjectives.eventMode = "static";
    this.btnObjectives.cursor = "pointer";

    const objBg = new Graphics();
    const drawObjBtnBg = (pressed: boolean) => {
      objBg.clear();
      const bgColor = pressed ? 0x004466 : 0x091929;
      const borderColor = pressed ? 0x00ffff : 0x00e5ff;
      objBg.beginFill(bgColor, pressed ? 0.95 : 0.85);
      objBg.lineStyle(2.5, borderColor, pressed ? 1.0 : 0.85);
      objBg.drawCircle(0, 0, 36);
      objBg.lineStyle(1, borderColor, pressed ? 0.6 : 0.35);
      objBg.drawCircle(0, 0, 31);
      objBg.endFill();
    };
    drawObjBtnBg(false);
    this.btnObjectives.addChild(objBg);

    const infoLabel = new Text("i", {
      fontFamily: "Georgia, serif",
      fontSize: 28,
      fontWeight: "bold",
      fontStyle: "italic",
      fill: 0x00ffff,
      dropShadow: true,
      dropShadowColor: 0x002233,
      dropShadowDistance: 1,
    });
    infoLabel.anchor.set(0.5);
    infoLabel.position.set(0, -1);
    this.btnObjectives.addChild(infoLabel);

    this.btnObjectives.on("pointerdown", (e: any) => {
      if (e && typeof e.stopPropagation === "function") e.stopPropagation();
      drawObjBtnBg(true);
      this.btnObjectives.scale.set(0.92);
    });
    this.btnObjectives.on("pointerup", (e: any) => {
      if (e && typeof e.stopPropagation === "function") e.stopPropagation();
      drawObjBtnBg(false);
      this.btnObjectives.scale.set(1.0);
      (this as any).emit("toggleObjectives");
    });
    this.btnObjectives.on("pointerupoutside", () => {
      drawObjBtnBg(false);
      this.btnObjectives.scale.set(1.0);
    });
    this.addChild(this.btnObjectives);
  }

  public get moveVector(): JoystickVector {
    return this.joystick.vector;
  }

  public get isSprintToggled(): boolean {
    return this.btnSprint.isToggled;
  }

  public setSprintToggled(active: boolean): void {
    this.btnSprint.setToggled(active);
  }

  public consumeLookDelta(): number {
    let delta = this.lookArea.consumeDelta();

    // Add continuous turn button inputs
    if (this.btnTurnLeft.isPressed) {
      delta -= this.buttonTurnSpeed;
    }
    if (this.btnTurnRight.isPressed) {
      delta += this.buttonTurnSpeed;
    }

    return delta;
  }

  public dispose(): void {
    this.joystick.dispose();
    this.lookArea.dispose();
    this.btnTurnLeft.dispose();
    this.btnTurnRight.dispose();
    this.btnFire.dispose();
    this.btnAction.dispose();
    this.btnWeapon.dispose();
    this.btnFullscreen.dispose();
    this.btnSprint.dispose();
    this.btnMap.destroy({ children: true });
    this.btnObjectives.destroy({ children: true });
    this.destroy({ children: true });
  }
}
