import {
  Container,
  Mesh,
  MeshGeometry,
  RenderTexture,
  SCALE_MODES,
  Shader,
} from "pixi.js";
import { gameConfig } from "../../configs/GameConfig";
import wipeVert from "./shaders/starWarsWipe.vert";
import wipeFrag from "./shaders/starWarsWipe.frag";

export interface WipeOptions {
  duration?: number; // Duration in seconds (default: 0.55s)
  wipeDir?: { x: number; y: number }; // Direction vector
  wipeType?: number; // 0 = linear directional, 1 = clock, 2 = iris
  lineColor?: [number, number, number]; // RGB 0..1
  onTeleport?: () => void;
  onComplete?: () => void;
}

export class StarWarsWipeTransition {
  private mesh: Mesh<Shader>;
  private shader: Shader;
  private prevRenderTexture: RenderTexture;
  private isRunning: boolean = false;
  private elapsedTime: number = 0;
  private duration: number = 0.55;
  private onCompleteCallback?: () => void;

  constructor(parent: Container) {
    const w = gameConfig.width;
    const h = gameConfig.height;

    const geom = new MeshGeometry(
      new Float32Array([
        0, 0,
        w, 0,
        w, h,
        0, h,
      ]) as any,
      new Float32Array([
        0, 0,
        1, 0,
        1, 1,
        0, 1,
      ]) as any,
      new Uint16Array([0, 1, 2, 0, 2, 3]) as any
    );

    this.prevRenderTexture = RenderTexture.create({
      width: w,
      height: h,
      scaleMode: SCALE_MODES.LINEAR,
    });

    this.shader = Shader.from(wipeVert, wipeFrag, {
      uPrevTexture: this.prevRenderTexture,
      uProgress: 0.0,
      uWipeDir: [1.0, 0.0],
      uWipeType: 0.0,
      uSoftness: 0.012,
      uLineWidth: 0.007,
      uLineColor: [0.0, 0.88, 1.0],
    });

    this.mesh = new Mesh(geom, this.shader);
    this.mesh.zIndex = 65;
    this.mesh.visible = false;
    parent.addChild(this.mesh);
  }

  public getMesh(): Mesh<Shader> {
    return this.mesh;
  }

  public isTransitioning(): boolean {
    return this.isRunning;
  }

  public start(
    sceneWorldContainer: Container,
    weaponContainer: Container | null,
    options: WipeOptions = {}
  ): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.elapsedTime = 0;
    this.duration = options.duration ?? 0.55;
    this.onCompleteCallback = options.onComplete;

    const dirX = options.wipeDir?.x ?? 1.0;
    const dirY = options.wipeDir?.y ?? 0.0;
    const wipeType = options.wipeType ?? 0.0;
    const lineColor = options.lineColor ?? [0.0, 0.88, 1.0];

    // 1. Snapshot previous scene view before teleport
    const renderer = (globalThis as any).__PIXI_APP__?.renderer;
    if (renderer) {
      try {
        renderer.render(sceneWorldContainer, {
          renderTexture: this.prevRenderTexture,
          clear: true,
        });
        if (weaponContainer) {
          renderer.render(weaponContainer, {
            renderTexture: this.prevRenderTexture,
            clear: false,
          });
        }
      } catch (e) {
        console.warn("Failed to capture snapshot in StarWarsWipeTransition:", e);
      }
    }

    // 2. Set shader uniforms
    this.shader.uniforms.uProgress = 0.0;
    this.shader.uniforms.uWipeDir = [dirX, dirY];
    this.shader.uniforms.uWipeType = wipeType;
    this.shader.uniforms.uLineColor = lineColor;
    this.mesh.visible = true;

    // 3. Teleport player underneath
    if (options.onTeleport) {
      options.onTeleport();
    }
  }

  public update(delta: number): void {
    if (!this.isRunning) return;

    const dtSeconds = delta / 60;
    this.elapsedTime += dtSeconds;
    const progress = Math.min(1.0, this.elapsedTime / this.duration);

    this.shader.uniforms.uProgress = progress;

    if (progress >= 1.0) {
      this.complete();
    }
  }

  public complete(): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    this.mesh.visible = false;
    const cb = this.onCompleteCallback;
    this.onCompleteCallback = undefined;
    if (cb) {
      cb();
    }
  }

  public destroy(): void {
    if (this.mesh.parent) {
      this.mesh.parent.removeChild(this.mesh);
    }
    this.mesh.destroy();
    this.prevRenderTexture.destroy(true);
  }
}
