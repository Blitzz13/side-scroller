import { Container, Graphics, FederatedPointerEvent } from "pixi.js";
import { IDisposable } from "../characters/interfaces/IDisposable";

export class TouchLookArea extends Container implements IDisposable {
  private hitAreaGraphic: Graphics;
  private activePointerId: number | null = null;
  private lastX: number = 0;
  private accumulatedDelta: number = 0;
  private sensitivity: number;

  private startX: number = 0;
  private startY: number = 0;
  private startTime: number = 0;
  private isDrag: boolean = false;

  constructor(
    width: number,
    height: number,
    sensitivity: number = 0.0035
  ) {
    super();

    this.sensitivity = sensitivity;

    this.hitAreaGraphic = new Graphics();
    this.hitAreaGraphic.beginFill(0x000000, 0.001); // Near invisible touch capture zone
    this.hitAreaGraphic.drawRect(0, 0, width, height);
    this.hitAreaGraphic.endFill();

    this.addChild(this.hitAreaGraphic);

    this.eventMode = "static";
    this.cursor = "grab";

    this.on("pointerdown", this.onPointerDown, this);
    this.on("globalpointermove", this.onPointerMove, this);
    this.on("pointerup", this.onPointerUp, this);
    this.on("pointerupoutside", this.onPointerUp, this);
  }

  public consumeDelta(): number {
    const delta = this.accumulatedDelta;
    this.accumulatedDelta = 0;
    return delta;
  }

  private onPointerDown(e: FederatedPointerEvent): void {
    if (this.activePointerId !== null) return;
    this.activePointerId = e.pointerId;
    this.lastX = e.global.x;
    this.startX = e.global.x;
    this.startY = e.global.y;
    this.startTime = Date.now();
    this.isDrag = false;
  }

  private onPointerMove(e: FederatedPointerEvent): void {
    if (this.activePointerId !== e.pointerId) return;
    const dist = Math.hypot(e.global.x - this.startX, e.global.y - this.startY);
    if (dist > 12) {
      this.isDrag = true;
    }
    const dx = e.global.x - this.lastX;
    this.lastX = e.global.x;
    this.accumulatedDelta += dx * this.sensitivity;
  }

  private onPointerUp(e: FederatedPointerEvent): void {
    if (this.activePointerId === e.pointerId) {
      this.activePointerId = null;
      if (!this.isDrag && Date.now() - this.startTime < 350) {
        this.emit("tap", e);
      }
    }
  }

  public resize(width: number, height: number): void {
    this.hitAreaGraphic.clear();
    this.hitAreaGraphic.beginFill(0x000000, 0.001);
    this.hitAreaGraphic.drawRect(0, 0, width, height);
    this.hitAreaGraphic.endFill();
  }

  public dispose(): void {
    this.off("pointerdown", this.onPointerDown, this);
    this.off("globalpointermove", this.onPointerMove, this);
    this.off("pointerup", this.onPointerUp, this);
    this.off("pointerupoutside", this.onPointerUp, this);
    this.destroy({ children: true });
  }
}
