import { Container, Graphics, FederatedPointerEvent } from "pixi.js";
import { IDisposable } from "../characters/interfaces/IDisposable";

export interface JoystickVector {
  x: number;
  y: number;
}

export class VirtualJoystick extends Container implements IDisposable {
  private baseGraphic: Graphics;
  private knobGraphic: Graphics;
  private baseRadius: number;
  private knobRadius: number;
  private activePointerId: number | null = null;
  private _vector: JoystickVector = { x: 0, y: 0 };

  constructor(baseRadius: number = 65, knobRadius: number = 30) {
    super();

    this.baseRadius = baseRadius;
    this.knobRadius = knobRadius;

    // Outer base circle
    this.baseGraphic = new Graphics();
    this.baseGraphic.beginFill(0x111111, 0.4);
    this.baseGraphic.lineStyle({ width: 3, color: 0xffffff, alpha: 0.5 });
    this.baseGraphic.drawCircle(0, 0, this.baseRadius);
    this.baseGraphic.endFill();

    // Directional cross markers
    this.baseGraphic.lineStyle({ width: 2, color: 0xffffff, alpha: 0.25 });
    this.baseGraphic.moveTo(0, -this.baseRadius + 10);
    this.baseGraphic.lineTo(0, this.baseRadius - 10);
    this.baseGraphic.moveTo(-this.baseRadius + 10, 0);
    this.baseGraphic.lineTo(this.baseRadius - 10, 0);

    // Inner knob circle
    this.knobGraphic = new Graphics();
    this.knobGraphic.beginFill(0xffffff, 0.65);
    this.knobGraphic.lineStyle({ width: 2, color: 0xffffff, alpha: 0.9 });
    this.knobGraphic.drawCircle(0, 0, this.knobRadius);
    this.knobGraphic.endFill();

    this.addChild(this.baseGraphic);
    this.addChild(this.knobGraphic);

    this.eventMode = "static";
    this.cursor = "pointer";

    this.on("pointerdown", this.onPointerDown, this);
    this.on("globalpointermove", this.onPointerMove, this);
    this.on("pointerup", this.onPointerUp, this);
    this.on("pointerupoutside", this.onPointerUp, this);
  }

  public get vector(): JoystickVector {
    return this._vector;
  }

  private onPointerDown(e: FederatedPointerEvent): void {
    if (this.activePointerId !== null) return;
    this.activePointerId = e.pointerId;
    this.updatePosition(e);
  }

  private onPointerMove(e: FederatedPointerEvent): void {
    if (this.activePointerId !== e.pointerId) return;
    this.updatePosition(e);
  }

  private onPointerUp(e: FederatedPointerEvent): void {
    if (this.activePointerId === e.pointerId) {
      this.activePointerId = null;
      this.knobGraphic.position.set(0, 0);
      this._vector.x = 0;
      this._vector.y = 0;
    }
  }

  private updatePosition(e: FederatedPointerEvent): void {
    const local = this.toLocal(e.global);
    const dist = Math.hypot(local.x, local.y);
    const angle = Math.atan2(local.y, local.x);

    const clampedDist = Math.min(dist, this.baseRadius);
    const knobX = Math.cos(angle) * clampedDist;
    const knobY = Math.sin(angle) * clampedDist;

    this.knobGraphic.position.set(knobX, knobY);

    this._vector.x = knobX / this.baseRadius;
    this._vector.y = knobY / this.baseRadius;
  }

  public dispose(): void {
    this.off("pointerdown", this.onPointerDown, this);
    this.off("globalpointermove", this.onPointerMove, this);
    this.off("pointerup", this.onPointerUp, this);
    this.off("pointerupoutside", this.onPointerUp, this);
    this.destroy({ children: true });
  }
}
