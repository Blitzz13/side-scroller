import {
  Container,
  Graphics,
  FederatedPointerEvent,
  SCALE_MODES,
  Sprite,
  Text,
  Texture,
} from "pixi.js";
import { IDisposable } from "../characters/interfaces/IDisposable";

export interface IVirtualButtonTheme {
  bgColor?: number;
  borderColor?: number;
  pressedBgColor?: number;
  pressedBorderColor?: number;
  bgAlpha?: number;
  pressedBgAlpha?: number;
}

export class VirtualButton extends Container implements IDisposable {
  private bgGraphic: Graphics;
  private labelText: Text;
  private iconSprite?: Sprite;
  private iconSize: number = 36;
  private iconTint: number = 0xffffff;
  private radius: number;
  private bgColor: number;
  private borderColor: number = 0xffffff;
  private pressedBgColor: number;
  private pressedBorderColor: number = 0xffffff;
  private bgAlpha: number = 0.4;
  private pressedBgAlpha: number = 0.85;
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
    _fontName: string = "arial32",
    theme?: IVirtualButtonTheme
  ) {
    super();

    this.radius = radius;
    this.bgColor = theme?.bgColor ?? bgColor;
    this.borderColor = theme?.borderColor ?? 0xffffff;
    this.pressedBgColor = theme?.pressedBgColor ?? this.bgColor;
    this.pressedBorderColor = theme?.pressedBorderColor ?? this.borderColor;
    this.bgAlpha = theme?.bgAlpha ?? 0.4;
    this.pressedBgAlpha = theme?.pressedBgAlpha ?? 0.85;

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
    this.on("pointercancel", this.onPointerCancel, this);

    if (typeof window !== "undefined") {
      window.addEventListener("pointerup", this.onWindowPointerEnd);
      window.addEventListener("pointercancel", this.onWindowPointerEnd);
      window.addEventListener("blur", this.onWindowBlur);
    }
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

  public setIcon(
    textureKey: string,
    fallbackPath?: string,
    size: number = Math.round(this.radius * 1.1),
    tint: number = 0xffffff
  ): void {
    this.iconSize = size;
    this.iconTint = tint;

    const tex = this.resolveTexture(textureKey, fallbackPath);
    if (!this.iconSprite) {
      this.iconSprite = new Sprite(tex);
      this.iconSprite.anchor.set(0.5);
      this.iconSprite.position.set(0, 0);
      this.addChild(this.iconSprite);
    } else {
      this.iconSprite.texture = tex;
    }

    this.fitIconSprite();
    this.labelText.visible = false;
    this.updateLabelStyle();
  }

  public updateIconTexture(textureKey: string, fallbackPath?: string): void {
    if (!this.iconSprite) {
      this.setIcon(textureKey, fallbackPath);
      return;
    }
    this.iconSprite.texture = this.resolveTexture(textureKey, fallbackPath);
    this.fitIconSprite();
  }

  private resolveTexture(textureKey: string, fallbackPath?: string): Texture {
    try {
      const tex = Texture.from(textureKey);
      tex.baseTexture.scaleMode = SCALE_MODES.LINEAR;
      return tex;
    } catch {
      if (fallbackPath) {
        try {
          const tex = Texture.from(fallbackPath);
          tex.baseTexture.scaleMode = SCALE_MODES.LINEAR;
          return tex;
        } catch {
          return Texture.EMPTY;
        }
      }
      return Texture.EMPTY;
    }
  }

  private fitIconSprite(): void {
    if (!this.iconSprite) return;
    const tex = this.iconSprite.texture;
    const w = tex.width || this.iconSize;
    const h = tex.height || this.iconSize;
    const scale = Math.min(this.iconSize / w, this.iconSize / h);
    this.iconSprite.scale.set(scale);
  }

  private updateLabelStyle(): void {
    const color = this._isToggled ? this.activeBorderColor : this.iconTint;
    this.labelText.style.fill = this._isToggled ? this.activeBorderColor : 0xffffff;
    if (this.iconSprite) {
      this.iconSprite.tint = color;
    }
  }

  private drawButton(pressedOrActive: boolean): void {
    this.bgGraphic.clear();
    const currentColor = this._isToggled
      ? this.activeBgColor
      : pressedOrActive
      ? this.pressedBgColor
      : this.bgColor;
    const currentBorder = this._isToggled
      ? this.activeBorderColor
      : pressedOrActive
      ? this.pressedBorderColor
      : this.borderColor;
    const borderAlpha = pressedOrActive ? 0.95 : (this._isToggled ? 0.95 : 0.75);
    const fillAlpha = pressedOrActive ? this.pressedBgAlpha : (this._isToggled ? 0.8 : this.bgAlpha);

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

  private onPointerCancel(e: FederatedPointerEvent): void {
    if (this.activePointerId === e.pointerId) {
      if (e && typeof e.stopPropagation === "function") {
        e.stopPropagation();
      }
      this.activePointerId = null;
      this._isPressed = false;
      this.drawButton(this._isToggled);
      this.scale.set(1.0);
      (this as any).emit("release", e);
    }
  }

  private resetPressedState(): void {
    this.activePointerId = null;
    this._isPressed = false;
    this.drawButton(this._isToggled);
    this.scale.set(1.0);
  }

  private onWindowPointerEnd = (e: PointerEvent): void => {
    if (this.activePointerId === e.pointerId) {
      this.resetPressedState();
      (this as any).emit("release", e);
    }
  };

  private onWindowBlur = (): void => {
    if (this.activePointerId !== null) {
      this.resetPressedState();
    }
  };

  public dispose(): void {
    if (typeof window !== "undefined") {
      window.removeEventListener("pointerup", this.onWindowPointerEnd);
      window.removeEventListener("pointercancel", this.onWindowPointerEnd);
      window.removeEventListener("blur", this.onWindowBlur);
    }
    this.off("pointerdown", this.onPointerDown, this);
    this.off("pointerup", this.onPointerUp, this);
    this.off("pointerupoutside", this.onPointerUp, this);
    this.off("pointercancel", this.onPointerCancel, this);
    this.destroy({ children: true });
  }
}
