import { RaycastHUD } from "./RaycastHUD";
import { RaycastPickupItem, RaycastPlayerState, RAYCAST_WEAPONS } from "./types";
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
    return this.state.equippedWeapon !== null;
  }

  public get equippedWeapon(): string | null {
    return this.state.equippedWeapon;
  }

  public handlePickups(items: RaycastPickupItem[]): void {
    for (const item of items) {
      if (item.type === "health") {
        this.heal(item.amount);
      } else if (item.type === "weapon") {
        this.equipWeapon(item.weaponType || "e_11", item.amount);
      } else if (item.type === "ammo") {
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

  public equipWeapon(weaponId: string, ammoCount: number): void {
    const def = RAYCAST_WEAPONS[weaponId];
    const weaponName = def?.name || "E-11 Blaster";

    this.state.equippedWeapon = weaponId;
    this.state.ammo = Math.min(this.state.maxAmmo, this.state.ammo + ammoCount);

    this.weaponView.equip(weaponId);
    this.hud.setWeapon(weaponName, this.state.ammo);
    this.hud.showToast(`[+] Equipped ${weaponName} (+${ammoCount} Ammo)`, 0x00e5ff);
    this.hud.flashScreen(0x00ccff, 0.25);
  }

  public addAmmo(count: number): void {
    this.state.ammo = Math.min(this.state.maxAmmo, this.state.ammo + count);
    const weaponName = this.state.equippedWeapon
      ? RAYCAST_WEAPONS[this.state.equippedWeapon]?.name || "Blaster"
      : null;

    this.hud.setWeapon(weaponName, this.state.ammo);
    this.hud.showToast(`[+] Ammo Pack (+${count} Ammo)`, 0xffaa00);
    this.hud.flashScreen(0xffaa00, 0.2);
  }

  public tryShoot(): boolean {
    if (!this.state.equippedWeapon || this.state.ammo <= 0) {
      return false;
    }

    const def = RAYCAST_WEAPONS[this.state.equippedWeapon];
    const fireRate = def?.fireRate ?? 200;
    const now = Date.now();

    if (now - this.lastShotTime < fireRate) {
      return false;
    }

    this.lastShotTime = now;
    this.state.ammo--;

    this.weaponView.shoot();
    this.hud.setWeapon(def?.name || "E-11 Blaster", this.state.ammo);

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
