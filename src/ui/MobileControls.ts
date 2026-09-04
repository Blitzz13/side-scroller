import { Container } from "pixi.js";
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
  }

  public get moveVector(): JoystickVector {
    return this.joystick.vector;
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
    this.destroy({ children: true });
  }
}
