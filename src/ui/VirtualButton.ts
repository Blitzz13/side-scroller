import { Container, Graphics, FederatedPointerEvent, Text } from "pixi.js";
import { IDisposable } from "../characters/interfaces/IDisposable";

export class VirtualButton extends Container implements IDisposable {
  private bgGraphic: Graphics;
  private labelText: Text;
  private radius: number;
  private _isPressed: boolean = false;
  private activePointerId: number | null = null;

  constructor(
    radius: number = 36,
    label: string = "",
    bgColor: number = 0x111111,
    _fontName: string = "arial32"
  ) {
    super();

    this.radius = radius;

    this.bgGraphic = new Graphics();
    this.drawButton(false, bgColor);

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

  private drawButton(pressed: boolean, bgColor: number = 0x111111): void {
    this.bgGraphic.clear();
    this.bgGraphic.beginFill(
      bgColor,
      pressed ? 0.8 : 0.4
    );
    this.bgGraphic.lineStyle({
      width: pressed ? 3 : 2,
      color: 0xffffff,
      alpha: pressed ? 0.95 : 0.6,
    });
    this.bgGraphic.drawCircle(0, 0, this.radius);
    this.bgGraphic.endFill();
  }

  private onPointerDown(e: FederatedPointerEvent): void {
    if (this.activePointerId !== null) return;
    this.activePointerId = e.pointerId;
    this._isPressed = true;
    this.drawButton(true);
    this.scale.set(0.92);
    (this as any).emit("press", e);
  }

  private onPointerUp(e: FederatedPointerEvent): void {
    if (this.activePointerId === e.pointerId) {
      this.activePointerId = null;
      this._isPressed = false;
      this.drawButton(false);
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
