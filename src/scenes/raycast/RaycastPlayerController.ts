import { sound } from "@pixi/sound";
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
  private sprintMultiplier: number = 1.7;
  private stepDistance: number = 0.28;
  private stepIndex: number = 0;
  private readonly STEP_DISTANCE_THRESHOLD: number = 0.58;

  constructor(weaponView: RaycastWeaponView, hud: RaycastHUD) {
    this.weaponView = weaponView;
    this.hud = hud;

    this.state = {
      health: 100,
      maxHealth: 100,
      shield: 0,
      maxShield: 100,
      equippedWeapon: null,
      weaponConfig: null,
      ammo: 0,
      maxAmmo: 99,
      keycards: new Set<string>(),
      isSprinting: false,
    };

    // Initialize with default DH-17 blaster pistol
    const dh17Config = getRaycastWeaponConfig(RaycastWeaponType.DH17)!;
    this.inventory.set(RaycastWeaponType.DH17, dh17Config.defaultAmmo);
    this.equipWeapon(dh17Config, dh17Config.defaultAmmo);

    this.hud.setHealth(this.state.health, this.state.maxHealth);
    this.hud.setShield(this.state.shield, this.state.maxShield);
  }

  public get health(): number {
    return this.state.health;
  }

  public get shield(): number {
    return this.state.shield;
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

  public resetKeycards(): void {
    this.state.keycards.clear();
    this.hud.clearKeycards();
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
      } else if (item.type === RaycastPickupType.SHIELD) {
        this.addShield(item.amount);
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

  public addShield(amount: number): void {
    const oldShield = this.state.shield;
    this.state.shield = Math.min(this.state.maxShield, this.state.shield + amount);
    const restored = this.state.shield - oldShield;

    this.hud.setShield(this.state.shield, this.state.maxShield);
    this.hud.showToast(`[+] Shield Unit (+${restored} Shield)`, 0x00ff66);
    this.hud.flashScreen(0x00ff66, 0.25);
  }

  public takeDamage(amount: number): void {
    if (amount <= 0) return;

    let healthDamage = amount;
    let shieldAbsorbed = 0;

    if (this.state.shield > 0) {
      // Shield absorbs a major portion (65%) of incoming damage, negating some but letting the rest penetrate to health
      const absorptionRate = 0.65;
      const targetAbsorb = Math.ceil(amount * absorptionRate);
      shieldAbsorbed = Math.min(this.state.shield, targetAbsorb);
      this.state.shield -= shieldAbsorbed;
      healthDamage = amount - shieldAbsorbed;
    }

    this.state.health = Math.max(0, this.state.health - healthDamage);
    this.hud.setHealth(this.state.health, this.state.maxHealth);
    this.hud.setShield(this.state.shield, this.state.maxShield);

    if (shieldAbsorbed > 0 && this.state.health > 0) {
      // Deflection flash when shield absorbs damage
      this.hud.flashScreen(0x00e676, 0.3);
    } else {
      // Red flash on pure health damage
      this.hud.flashScreen(0xff0000, 0.35);
    }
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
    if (this.inventory.size <= 1) {
      this.hud.showToast("[!] No other weapons in inventory", 0x88bbdd);
      return;
    }

    const owned = Array.from(this.inventory.keys()).filter(
      (k) => (this.inventory.get(k) ?? 0) > 0
    );
    if (owned.length <= 1) {
      this.hud.showToast("[!] Other weapons out of ammo", 0xffaa00);
      return;
    }

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
      if (started) {
        this.lastShotTime = now;
      }
      return started;
    } else {
      this.lastShotTime = now;
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

  public get isSprinting(): boolean {
    return this.state.isSprinting;
  }

  public get sprintSpeedMultiplier(): number {
    return this.sprintMultiplier;
  }

  public get currentSpeedMultiplier(): number {
    return this.state.isSprinting ? this.sprintMultiplier : 1.0;
  }

  public setSprinting(sprinting: boolean): void {
    if (this.state.isSprinting === sprinting) return;
    this.state.isSprinting = sprinting;
    this.hud.setSprinting(sprinting);
  }

  public toggleSprint(): boolean {
    this.setSprinting(!this.state.isSprinting);
    return this.state.isSprinting;
  }

  public startSprint(): void {
    this.setSprinting(true);
  }

  public stopSprint(): void {
    this.setSprinting(false);
  }

  public update(
    delta: number,
    isMoving: boolean,
    moveIntensity: number = 1,
    distMoved: number = 0
  ): void {
    const intensity = this.state.isSprinting && isMoving ? 1.65 : moveIntensity;
    this.weaponView.update(delta, isMoving, intensity);
    this.hud.update(delta);

    // Footstep audio processing
    this.updateFootsteps(delta, isMoving, distMoved);
  }

  public playFootstep(): void {
    const stepSounds = ["step_1", "step_2"];
    const alias = stepSounds[this.stepIndex % stepSounds.length];
    this.stepIndex++;

    const volume = this.state.isSprinting ? 0.35 : 0.25;
    const speed = this.state.isSprinting ? 1.05 : 1.0;

    if (!sound.exists(alias)) {
      try {
        sound.add(alias, { url: `./assets/raycast/sfx/${alias}.mp3`, preload: true });
      } catch {
        try {
          sound.add(alias, `./assets/raycast/sfx/${alias}.mp3`);
        } catch {}
      }
    }

    try {
      if (sound.exists(alias)) {
        sound.play(alias, { volume, speed });
      }
    } catch (e) {
      console.warn(`Could not play footstep sound "${alias}":`, e);
    }
  }

  private updateFootsteps(delta: number, isMoving: boolean, distMoved: number): void {
    if (!isMoving || distMoved <= 0.0001) {
      if (!isMoving) {
        this.stepDistance = 0.28;
      }
      return;
    }

    this.stepDistance += distMoved;
    if (this.stepDistance >= this.STEP_DISTANCE_THRESHOLD) {
      this.stepDistance -= this.STEP_DISTANCE_THRESHOLD;
      this.playFootstep();
    }
  }

  public getStateSnapshot(): {
    health: number;
    maxHealth: number;
    shield: number;
    maxShield: number;
    equippedWeapon: RaycastWeaponType | null;
    ammo: number;
    weapons: Array<{ type: RaycastWeaponType; ammo: number }>;
    keycards: string[];
  } {
    if (this.state.equippedWeapon !== null) {
      this.inventory.set(this.state.equippedWeapon, this.state.ammo);
    }
    const weapons: Array<{ type: RaycastWeaponType; ammo: number }> = [];
    this.inventory.forEach((ammo, type) => {
      weapons.push({ type, ammo });
    });
    return {
      health: this.state.health,
      maxHealth: this.state.maxHealth,
      shield: this.state.shield,
      maxShield: this.state.maxShield,
      equippedWeapon: this.state.equippedWeapon,
      ammo: this.state.ammo,
      weapons,
      keycards: Array.from(this.state.keycards),
    };
  }

  public restoreState(save: {
    health: number;
    maxHealth?: number;
    shield: number;
    maxShield?: number;
    equippedWeapon?: RaycastWeaponType | null;
    ammo?: number;
    weapons?: Array<{ type: RaycastWeaponType; ammo: number }>;
    keycards?: string[];
  }): void {
    if (save.maxHealth) this.state.maxHealth = save.maxHealth;
    this.state.health = Math.max(1, Math.min(this.state.maxHealth, save.health));
    if (save.maxShield) this.state.maxShield = save.maxShield;
    this.state.shield = Math.max(0, Math.min(this.state.maxShield, save.shield));

    if (save.weapons && save.weapons.length > 0) {
      this.inventory.clear();
      for (const w of save.weapons) {
        this.inventory.set(w.type, w.ammo);
      }
    }

    const targetWeaponType = save.equippedWeapon ?? RaycastWeaponType.DH17;
    const weaponConfig = getRaycastWeaponConfig(targetWeaponType);
    if (weaponConfig) {
      const savedAmmo = save.ammo ?? this.inventory.get(targetWeaponType) ?? weaponConfig.defaultAmmo;
      this.state.equippedWeapon = targetWeaponType;
      this.state.weaponConfig = weaponConfig;
      this.state.maxAmmo = weaponConfig.maxAmmo;
      this.state.ammo = savedAmmo;
      this.inventory.set(targetWeaponType, savedAmmo);
      this.weaponView.equip(weaponConfig);
      this.hud.setWeapon(weaponConfig.name, savedAmmo);
    }

    this.state.keycards.clear();
    this.hud.clearKeycards();
    if (save.keycards && save.keycards.length > 0) {
      for (const k of save.keycards) {
        this.state.keycards.add(k);
        this.hud.addKeycard(k);
      }
    }

    this.hud.setHealth(this.state.health, this.state.maxHealth);
    this.hud.setShield(this.state.shield, this.state.maxShield);
  }

  public dispose(): void {
    this.state.isSprinting = false;
    this.stepDistance = 0.28;
    this.stepIndex = 0;
  }
}
