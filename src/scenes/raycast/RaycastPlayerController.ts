import { RaycastHUD } from "./RaycastHUD";
import {
  IRaycastWeaponConfig,
  RaycastPickupItem,
  RaycastPickupType,
  RaycastPlayerState,
  RaycastWeaponType,
  getRaycastWeaponConfig,
} from "./types";
import { RaycastWeaponView } from "./RaycastWeaponView";

export class RaycastPlayerController {
  private state: RaycastPlayerState;
  private weaponView: RaycastWeaponView;
  private hud: RaycastHUD;
  private lastShotTime: number = 0;
  private inventory: Map<RaycastWeaponType, number> = new Map();

  constructor(weaponView: RaycastWeaponView, hud: RaycastHUD) {
    this.weaponView = weaponView;
    this.hud = hud;

    this.state = {
      health: 100,
      maxHealth: 100,
      equippedWeapon: null,
      weaponConfig: null,
      ammo: 0,
      maxAmmo: 99,
      keycards: new Set<string>(),
    };

    // Initialize with default DH-17 blaster pistol
    const dh17Config = getRaycastWeaponConfig(RaycastWeaponType.DH17)!;
    this.inventory.set(RaycastWeaponType.DH17, dh17Config.defaultAmmo);
    this.equipWeapon(dh17Config, dh17Config.defaultAmmo);

    this.hud.setHealth(this.state.health, this.state.maxHealth);
  }

  public get health(): number {
    return this.state.health;
  }

  public get ammo(): number {
    return this.state.ammo;
  }

  public get keycards(): Set<string> {
    return this.state.keycards;
  }

  public get weaponInventory(): Map<RaycastWeaponType, number> {
    return this.inventory;
  }

  public hasKeycard(color: string): boolean {
    const norm = color.toLowerCase().replace(/[-_ ]/g, "").replace("keycard", "").replace("card", "").replace("key", "");
    for (const k of this.state.keycards) {
      if (k.toLowerCase().includes(norm) || norm.includes(k.toLowerCase())) return true;
    }
    return false;
  }

  public addKeycard(color: string): void {
    const norm = color.toLowerCase().replace(/[-_ ]/g, "").replace("keycard", "").replace("card", "").replace("key", "");
    this.state.keycards.add(norm);
    this.hud.addKeycard(norm);
    const displayName = norm.charAt(0).toUpperCase() + norm.slice(1) + " Keycard";
    const toastColor = norm === "blue" ? 0x00d5ff : norm === "green" ? 0x00ff88 : 0xff4444;
    this.hud.showToast(`[+] Collected ${displayName}`, toastColor);
    this.hud.flashScreen(toastColor, 0.25);
  }

  public get isWeaponEquipped(): boolean {
    return this.state.equippedWeapon !== null && this.state.weaponConfig !== null;
  }

  public get equippedWeapon(): RaycastWeaponType | null {
    return this.state.equippedWeapon;
  }

  public get weaponConfig(): IRaycastWeaponConfig | null {
    return this.state.weaponConfig;
  }

  public handlePickups(items: RaycastPickupItem[]): void {
    for (const item of items) {
      if (item.type === RaycastPickupType.HEALTH) {
        this.heal(item.amount);
      } else if (item.type === RaycastPickupType.WEAPON) {
        this.equipWeapon(item.weaponType ?? RaycastWeaponType.E11, item.amount);
      } else if (item.type === RaycastPickupType.AMMO) {
        this.addAmmo(item.amount);
      } else if (item.type === RaycastPickupType.THERMAL_DETONATOR_SINGLE) {
        this.addThermalDetonators(item.amount ?? 1);
      } else if (item.type === RaycastPickupType.THERMAL_DETONATOR_BELT) {
        this.addThermalDetonators(item.amount ?? 5);
      } else if (
        item.type === RaycastPickupType.BLUE_KEYCARD ||
        item.type === RaycastPickupType.GREEN_KEYCARD ||
        item.type === RaycastPickupType.RED_KEYCARD ||
        item.type === RaycastPickupType.KEYCARD ||
        item.keyColor
      ) {
        const color =
          item.keyColor ||
          (item.type === RaycastPickupType.GREEN_KEYCARD
            ? "green"
            : item.type === RaycastPickupType.RED_KEYCARD
            ? "red"
            : "blue");
        this.addKeycard(color);
      }
    }
  }

  public heal(amount: number): void {
    const oldHealth = this.state.health;
    this.state.health = Math.min(this.state.maxHealth, this.state.health + amount);
    const restored = this.state.health - oldHealth;

    this.hud.setHealth(this.state.health, this.state.maxHealth);
    this.hud.showToast(`[+] Health Pack (+${restored} HP)`, 0x00ff88);
    this.hud.flashScreen(0x00ff66, 0.2);
  }

  public takeDamage(amount: number): void {
    this.state.health = Math.max(0, this.state.health - amount);
    this.hud.setHealth(this.state.health, this.state.maxHealth);
    this.hud.flashScreen(0xff0000, 0.35);
  }

  public addThermalDetonators(count: number): void {
    const current = this.inventory.get(RaycastWeaponType.THERMAL_DETONATOR) ?? 0;
    const newCount = Math.min(99, current + count);
    this.inventory.set(RaycastWeaponType.THERMAL_DETONATOR, newCount);

    const config = getRaycastWeaponConfig(RaycastWeaponType.THERMAL_DETONATOR);
    const label = count > 1 ? `Thermal Detonator Belt (+${count})` : `Thermal Detonator (+${count})`;

    this.hud.showToast(`[+] ${label}`, 0xffaa00);
    this.hud.flashScreen(0xff8800, 0.2);

    if (this.state.equippedWeapon === RaycastWeaponType.THERMAL_DETONATOR) {
      this.state.ammo = newCount;
      this.hud.setWeapon(config?.name || "Thermal Detonator", this.state.ammo);
    } else if (this.state.equippedWeapon === null) {
      this.switchWeapon(RaycastWeaponType.THERMAL_DETONATOR);
    }
  }

  public equipWeapon(
    weapon: RaycastWeaponType | IRaycastWeaponConfig | string,
    ammoCount: number
  ): void {
    const config =
      typeof weapon === "object"
        ? weapon
        : getRaycastWeaponConfig(weapon) || getRaycastWeaponConfig(RaycastWeaponType.E11)!;

    const weaponName = config.name;
    const existingAmmo = this.inventory.get(config.type) ?? 0;
    const newAmmo = Math.min(config.maxAmmo, existingAmmo + ammoCount);
    this.inventory.set(config.type, newAmmo);

    this.state.equippedWeapon = config.type;
    this.state.weaponConfig = config;
    this.state.maxAmmo = config.maxAmmo;
    this.state.ammo = newAmmo;

    this.weaponView.equip(config);
    this.hud.setWeapon(weaponName, this.state.ammo);
    const equipHint = config.type === RaycastWeaponType.E11 ? " (RMB: Auto-Fire)" : "";
    this.hud.showToast(`[+] Equipped ${weaponName}${equipHint} (${newAmmo} Ammo)`, 0x00e5ff);
    this.hud.flashScreen(0x00ccff, 0.25);
  }

  public switchWeapon(type: RaycastWeaponType): boolean {
    if (!this.inventory.has(type)) {
      return false;
    }
    const config = getRaycastWeaponConfig(type);
    if (!config) return false;

    // Save current ammo
    if (this.state.equippedWeapon !== null) {
      this.inventory.set(this.state.equippedWeapon, this.state.ammo);
    }

    this.state.equippedWeapon = type;
    this.state.weaponConfig = config;
    this.state.maxAmmo = config.maxAmmo;
    this.state.ammo = this.inventory.get(type) ?? 0;

    this.weaponView.equip(config);
    this.hud.setWeapon(config.name, this.state.ammo);
    const switchHint = config.type === RaycastWeaponType.E11 ? " (RMB: Auto-Fire)" : "";
    this.hud.showToast(`[!] Selected ${config.name}${switchHint}`, 0x00e5ff);
    return true;
  }

  public cycleWeapon(direction: number = 1): void {
    const owned = Array.from(this.inventory.keys()).filter(
      (k) => (this.inventory.get(k) ?? 0) > 0
    );
    if (owned.length <= 1) return;

    const currIdx = this.state.equippedWeapon !== null ? owned.indexOf(this.state.equippedWeapon) : -1;
    let nextIdx: number;
    if (currIdx === -1) {
      nextIdx = 0;
    } else {
      nextIdx = (currIdx + direction + owned.length) % owned.length;
    }
    this.switchWeapon(owned[nextIdx]);
  }

  public addAmmo(count: number): void {
    this.state.ammo = Math.min(this.state.maxAmmo, this.state.ammo + count);
    if (this.state.equippedWeapon !== null) {
      this.inventory.set(this.state.equippedWeapon, this.state.ammo);
    }
    const weaponName = this.state.weaponConfig?.name || null;

    this.hud.setWeapon(weaponName, this.state.ammo);
    this.hud.showToast(`[+] Ammo Pack (+${count} Ammo)`, 0xffaa00);
    this.hud.flashScreen(0xffaa00, 0.2);
  }

  public tryShoot(onThrowRelease?: () => void, isAutoFire: boolean = false): boolean {
    if (!this.state.weaponConfig || this.state.ammo <= 0) {
      return false;
    }

    const fireRate =
      isAutoFire && this.state.weaponConfig.autoFireRate
        ? this.state.weaponConfig.autoFireRate
        : (this.state.weaponConfig.rateOfFire ?? 200);
    const now = Date.now();

    if (now - this.lastShotTime < fireRate) {
      return false;
    }

    this.lastShotTime = now;

    if (this.state.weaponConfig.isThrowable) {
      // Throwable weapon: play throw animation, release projectile at peak toss
      const started = this.weaponView.playThrowAnimation(
        () => {
          this.state.ammo--;
          if (this.state.equippedWeapon !== null) {
            this.inventory.set(this.state.equippedWeapon, this.state.ammo);
          }
          this.hud.setWeapon(this.state.weaponConfig!.name, this.state.ammo);
          if (onThrowRelease) {
            onThrowRelease();
          }
        },
        () => {
          // If depleted after throw, auto-switch to DH-17, E-11, or unequip
          if (this.state.ammo <= 0) {
            this.inventory.delete(RaycastWeaponType.THERMAL_DETONATOR);
            if (this.inventory.has(RaycastWeaponType.DH17)) {
              this.switchWeapon(RaycastWeaponType.DH17);
            } else if (this.inventory.has(RaycastWeaponType.E11)) {
              this.switchWeapon(RaycastWeaponType.E11);
            } else {
              this.weaponView.unequip();
              this.hud.setWeapon(null, 0);
            }
          }
        }
      );
      return started;
    } else {
      // Standard firearm shoot
      this.state.ammo--;
      if (this.state.equippedWeapon !== null) {
        this.inventory.set(this.state.equippedWeapon, this.state.ammo);
      }
      this.weaponView.shoot();
      this.hud.setWeapon(this.state.weaponConfig.name, this.state.ammo);
      return true;
    }
  }

  public update(delta: number, isMoving: boolean, moveIntensity: number = 1): void {
    this.weaponView.update(delta, isMoving, moveIntensity);
    this.hud.update(delta);
  }

  public dispose(): void {
    // Reset state
  }
}
