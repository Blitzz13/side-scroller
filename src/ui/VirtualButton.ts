import { Container, Graphics, FederatedPointerEvent, Text } from "pixi.js";
import { IDisposable } from "../characters/interfaces/IDisposable";

export class VirtualButton extends Container implements IDisposable {
  private bgGraphic: Graphics;
  private labelText: Text;
  private radius: number;
  private bgColor: number;
  private _isPressed: boolean = false;
  private activePointerId: number | null = null;
  private isToggle: boolean = false;
  private _isToggled: boolean = false;
  private activeBgColor: number = 0x005577;
  private activeBorderColor: number = 0x00e5ff;

  constructor(
    radius: number = 36,
    label: string = "",
    bgColor: number = 0x111111,
    _fontName: string = "arial32"
  ) {
    super();

    this.radius = radius;
    this.bgColor = bgColor;

    this.bgGraphic = new Graphics();
    this.drawButton(false);

    const dpr = Math.max(2, Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, 3));
    this.labelText = new Text(label, {
      fontFamily: "Arial, sans-serif",
      fontSize: label.length > 2 ? 15 : 20,
      fontWeight: "bold",
      fill: 0xffffff,
      align: "center",
      letterSpacing: 0.5,
    });
    this.labelText.resolution = dpr;
    this.labelText.anchor.set(0.5);
    this.labelText.position.set(0, 0);

    this.addChild(this.bgGraphic);
    this.addChild(this.labelText);

    this.eventMode = "static";
    this.cursor = "pointer";

    this.on("pointerdown", this.onPointerDown, this);
    this.on("pointerup", this.onPointerUp, this);
    this.on("pointerupoutside", this.onPointerUp, this);
  }

  public get isPressed(): boolean {
    return this._isPressed;
  }

  public get isToggled(): boolean {
    return this._isToggled;
  }

  public setToggleMode(
    enabled: boolean,
    activeBgColor: number = 0x005577,
    activeBorderColor: number = 0x00e5ff
  ): void {
    this.isToggle = enabled;
    this.activeBgColor = activeBgColor;
    this.activeBorderColor = activeBorderColor;
    this.drawButton(this._isPressed || this._isToggled);
    this.updateLabelStyle();
  }

  public setToggled(toggled: boolean): void {
    if (this._isToggled === toggled) return;
    this._isToggled = toggled;
    this.drawButton(this._isPressed || this._isToggled);
    this.updateLabelStyle();
  }

  public setLabel(text: string): void {
    this.labelText.text = text;
  }

  private updateLabelStyle(): void {
    if (this._isToggled) {
      this.labelText.style.fill = this.activeBorderColor;
    } else {
      this.labelText.style.fill = 0xffffff;
    }
  }

  private drawButton(pressedOrActive: boolean): void {
    this.bgGraphic.clear();
    const currentColor = this._isToggled ? this.activeBgColor : this.bgColor;
    const currentBorder = this._isToggled ? this.activeBorderColor : 0xffffff;
    const borderAlpha = pressedOrActive ? 0.95 : (this._isToggled ? 0.9 : 0.6);
    const fillAlpha = pressedOrActive ? 0.85 : (this._isToggled ? 0.75 : 0.4);

    this.bgGraphic.beginFill(currentColor, fillAlpha);
    this.bgGraphic.lineStyle({
      width: pressedOrActive || this._isToggled ? 3 : 2,
      color: currentBorder,
      alpha: borderAlpha,
    });
    this.bgGraphic.drawCircle(0, 0, this.radius);
    this.bgGraphic.endFill();
  }

  private onPointerDown(e: FederatedPointerEvent): void {
    if (this.activePointerId !== null) return;
    if (e && typeof e.stopPropagation === "function") {
      e.stopPropagation();
    }
    this.activePointerId = e.pointerId;
    this._isPressed = true;
    this.drawButton(true);
    this.scale.set(0.92);
    (this as any).emit("press", e);
  }

  private onPointerUp(e: FederatedPointerEvent): void {
    if (this.activePointerId === e.pointerId) {
      if (e && typeof e.stopPropagation === "function") {
        e.stopPropagation();
      }
      this.activePointerId = null;
      this._isPressed = false;
      if (this.isToggle) {
        this._isToggled = !this._isToggled;
        this.updateLabelStyle();
        (this as any).emit("toggle", this._isToggled);
      }
      this.drawButton(this._isToggled);
      this.scale.set(1.0);
      (this as any).emit("release", e);
      (this as any).emit("tap", e);
    }
  }

  public dispose(): void {
    this.off("pointerdown", this.onPointerDown, this);
    this.off("pointerup", this.onPointerUp, this);
    this.off("pointerupoutside", this.onPointerUp, this);
    this.destroy({ children: true });
  }
}
