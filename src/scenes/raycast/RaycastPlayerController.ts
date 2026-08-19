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
    };

    this.hud.setHealth(this.state.health, this.state.maxHealth);
    this.hud.setWeapon(null, 0);
  }

  public get health(): number {
    return this.state.health;
  }

  public get ammo(): number {
    return this.state.ammo;
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

  public equipWeapon(
    weapon: RaycastWeaponType | IRaycastWeaponConfig | string,
    ammoCount: number
  ): void {
    const config =
      typeof weapon === "object"
        ? weapon
        : getRaycastWeaponConfig(weapon) || getRaycastWeaponConfig(RaycastWeaponType.E11)!;

    const weaponName = config.name;

    this.state.equippedWeapon = config.type;
    this.state.weaponConfig = config;
    this.state.maxAmmo = config.maxAmmo;
    this.state.ammo = Math.min(this.state.maxAmmo, this.state.ammo + ammoCount);

    this.weaponView.equip(config);
    this.hud.setWeapon(weaponName, this.state.ammo);
    this.hud.showToast(`[+] Equipped ${weaponName} (+${ammoCount} Ammo)`, 0x00e5ff);
    this.hud.flashScreen(0x00ccff, 0.25);
  }

  public addAmmo(count: number): void {
    this.state.ammo = Math.min(this.state.maxAmmo, this.state.ammo + count);
    const weaponName = this.state.weaponConfig?.name || null;

    this.hud.setWeapon(weaponName, this.state.ammo);
    this.hud.showToast(`[+] Ammo Pack (+${count} Ammo)`, 0xffaa00);
    this.hud.flashScreen(0xffaa00, 0.2);
  }

  public tryShoot(): boolean {
    if (!this.state.weaponConfig || this.state.ammo <= 0) {
      return false;
    }

    const fireRate = this.state.weaponConfig.rateOfFire ?? 200;
    const now = Date.now();

    if (now - this.lastShotTime < fireRate) {
      return false;
    }

    this.lastShotTime = now;
    this.state.ammo--;

    this.weaponView.shoot();
    this.hud.setWeapon(this.state.weaponConfig.name, this.state.ammo);

    return true;
  }

  public update(delta: number, isMoving: boolean, moveIntensity: number = 1): void {
    this.weaponView.update(delta, isMoving, moveIntensity);
    this.hud.update(delta);
  }

  public dispose(): void {
    // Reset state
  }
}
