<?xml version="1.0" encoding="UTF-8"?>
<tileset version="1.10" tiledversion="1.12.2" name="StarWarsTileset" tilewidth="2048" tileheight="2048" tilecount="57" columns="0" tilerendersize="grid">
 <grid orientation="orthogonal" width="1" height="1"/>
 <tile id="0" type="Tile">
  <properties>
   <property name="tileType" propertytype="TileType" value="thickWall"/>
  </properties>
  <image source="assets/raycast/textures/basic_imperial_wall.jpg" width="600" height="600"/>
 </tile>
 <tile id="1" type="Tile">
  <properties>
   <property name="tileType" propertytype="TileType" value="thinWall"/>
  </properties>
  <image source="assets/raycast/textures/fence.png" width="980" height="980"/>
 </tile>
 <tile id="2" type="Tile">
  <properties>
   <property name="tileType" propertytype="TileType" value="thickWall"/>
  </properties>
  <image source="assets/raycast/textures/imperial_grilled_wall.jpg" width="256" height="256"/>
 </tile>
 <tile id="3" type="Tile">
  <image source="assets/raycast/textures/metal_door.jpg" width="512" height="512"/>
 </tile>
 <tile id="4" type="Tile">
  <properties>
   <property name="tileType" propertytype="TileType" value="thinWall"/>
  </properties>
  <image source="assets/raycast/textures/inside_floor.jpg" width="512" height="512"/>
 </tile>
 <tile id="5" type="Tile">
  <properties>
   <property name="tileType" propertytype="TileType" value="floor"/>
  </properties>
  <image source="assets/raycast/textures/floor.png" width="256" height="256"/>
 </tile>
 <tile id="6" type="Tile">
  <properties>
   <property name="tileType" propertytype="TileType" value="ceiling"/>
  </properties>
  <image source="assets/raycast/textures/ceiling_3.jpg" width="1920" height="1920"/>
 </tile>
 <tile id="7" type="Tile">
  <properties>
   <property name="tileType" propertytype="TileType" value="ceiling"/>
  </properties>
  <image source="assets/raycast/textures/ceiling_1.jpg" width="400" height="400"/>
 </tile>
 <tile id="8" type="Tile">
  <properties>
   <property name="tileType" propertytype="TileType" value="ceiling"/>
  </properties>
  <image source="assets/raycast/textures/ceiling_2.jpg" width="1024" height="1024"/>
 </tile>
 <tile id="9" type="PickupItem">
  <properties>
   <property name="amount" type="int" value="20"/>
   <property name="object" type="class" propertytype="Object">
    <properties>
     <property name="anchor" propertytype="Anchor" value="floor"/>
     <property name="scale" type="float" value="0.2"/>
    </properties>
   </property>
   <property name="type" propertytype="PickupType" value="weapon"/>
   <property name="weaponType" propertytype="Weapons" value="e_11"/>
  </properties>
  <image source="assets/raycast/pickups/e_11_item.png" width="1231" height="511"/>
 </tile>
 <tile id="10" type="PickupItem">
  <properties>
   <property name="amount" type="int" value="20"/>
   <property name="type" propertytype="PickupType" value="health"/>
  </properties>
  <image source="assets/raycast/pickups/health.png" width="28" height="19"/>
 </tile>
 <tile id="11">
  <image source="assets/raycast/enemies/storm_trooper.png" width="480" height="1000"/>
 </tile>
 <tile id="12" type="Object">
  <properties>
   <property name="anchor" propertytype="Anchor" value="floor"/>
  </properties>
  <image source="assets/raycast/decorations/table.png" width="61" height="43"/>
 </tile>
 <tile id="13" type="Object">
  <properties>
   <property name="anchor" propertytype="Anchor" value="floor"/>
  </properties>
  <image source="assets/raycast/decorations/chair.png" width="29" height="31"/>
 </tile>
 <tile id="14" type="PickupItem">
  <properties>
   <property name="object" type="class" propertytype="Object">
    <properties>
     <property name="anchor" propertytype="Anchor" value="center"/>
     <property name="scale" type="float" value="0.4"/>
    </properties>
   </property>
   <property name="type" propertytype="PickupType" value="blue_keycard"/>
  </properties>
  <image source="assets/raycast/pickups/key_card_blue.png" width="25" height="30"/>
 </tile>
 <tile id="15">
  <image source="assets/raycast/textures/stairs_up.jpg" width="2048" height="2048"/>
 </tile>
 <tile id="16" type="Object">
  <properties>
   <property name="anchor" propertytype="Anchor" value="floor"/>
  </properties>
  <image source="assets/raycast/decorations/power_cell.png" width="32" height="64"/>
 </tile>
 <tile id="17" type="PickupItem">
  <properties>
   <property name="amount" type="int" value="5"/>
   <property name="type" propertytype="PickupType" value="ammo"/>
   <property name="weaponType" propertytype="Weapons" value="thermal_detonator"/>
  </properties>
  <image source="assets/raycast/pickups/thermal_detonator_belt.png" width="43" height="25"/>
 </tile>
 <tile id="18" type="PickupItem">
  <properties>
   <property name="amount" type="int" value="1"/>
   <property name="type" propertytype="PickupType" value="ammo"/>
   <property name="weaponType" propertytype="Weapons" value="thermal_detonator"/>
  </properties>
  <image source="assets/raycast/pickups/thermal_detonator_pickup.png" width="15" height="15"/>
 </tile>
 <tile id="19" type="PickupItem">
  <properties>
   <property name="amount" type="int" value="25"/>
   <property name="type" propertytype="PickupType" value="shield"/>
  </properties>
  <image source="assets/raycast/pickups/shield_unit.png" width="38" height="17"/>
 </tile>
 <tile id="20">
  <image source="assets/raycast/textures/computer_panel_destroyed.jpg" width="124" height="124"/>
 </tile>
 <tile id="21" type="DestructableWall">
  <image source="assets/raycast/textures/computer_panel.jpg" width="124" height="124"/>
 </tile>
 <tile id="22">
  <image source="assets/raycast/enemies/viper_droid_default_1.png" width="51" height="63"/>
 </tile>
 <tile id="23">
  <image source="assets/raycast/enemies/implerial_officer.png" width="35" height="69"/>
 </tile>
 <tile id="24">
  <image source="assets/raycast/enemies/imperial_commando.png" width="31" height="73"/>
 </tile>
 <tile id="25">
  <image source="assets/raycast/textures/stairs_up.jpg" width="2048" height="2048"/>
 </tile>
 <tile id="26">
  <image source="assets/raycast/textures/stairs_down.png" width="2048" height="2048"/>
 </tile>
 <tile id="27">
  <image source="player_spawn.webp" width="350" height="350"/>
 </tile>
 <tile id="28">
  <image source="assets/raycast/enemies/phase1_dark_trooper.png" width="48" height="98"/>
 </tile>
 <tile id="30">
  <image source="assets/raycast/enemies/diagona.png" width="78" height="47"/>
 </tile>
 <tile id="31">
  <image source="assets/raycast/textures/dirty_water.jpg" width="2048" height="2048"/>
 </tile>
 <tile id="32" type="Object">
  <properties>
   <property name="anchor" propertytype="Anchor" value="floor"/>
   <property name="scale" type="float" value="0.6"/>
  </properties>
  <image source="assets/raycast/decorations/isb_holotable.png" width="256" height="256"/>
 </tile>
 <tile id="33">
  <image source="assets/raycast/pickups/key_card_green.png" width="25" height="30"/>
 </tile>
 <tile id="34">
  <image source="assets/raycast/pickups/key_card_red.png" width="25" height="30"/>
 </tile>
 <tile id="36" type="DestructableWall">
  <image source="assets/raycast/textures/grilled_wall.jpg" width="64" height="64"/>
 </tile>
 <tile id="38">
  <image source="enemy_spawn.jpg" width="64" height="64"/>
 </tile>
 <tile id="39">
  <image source="assets/raycast/textures/grilled_wall_destroyed.jpg" width="64" height="64"/>
 </tile>
 <tile id="40">
  <image source="assets/raycast/textures/lever_off.png" width="512" height="512"/>
 </tile>
 <tile id="41">
  <image source="assets/raycast/textures/lever_on.jpg" width="512" height="512"/>
 </tile>
 <tile id="42">
  <image source="assets/raycast/textures/piped_wall.png" width="512" height="512"/>
 </tile>
 <tile id="43">
  <image source="assets/raycast/textures/computer_wall.png" width="512" height="512"/>
 </tile>
 <tile id="44">
  <image source="assets/raycast/textures/electronic_wall.png" width="512" height="512"/>
 </tile>
 <tile id="45">
  <image source="assets/raycast/textures/worn_piped_wall.jpg" width="2048" height="2048"/>
 </tile>
 <tile id="46">
  <image source="assets/raycast/textures/worn_sewer_wall.jpg" width="2048" height="2048"/>
 </tile>
 <tile id="47">
  <image source="assets/raycast/textures/worn_grilled_wall.jpg" width="2048" height="2048"/>
 </tile>
 <tile id="48">
  <image source="assets/raycast/textures/sewer_wall.jpg" width="2048" height="2048"/>
 </tile>
 <tile id="49">
  <image source="assets/raycast/textures/sewer_ceiling.jpg" width="2048" height="2048"/>
 </tile>
 <tile id="50" type="Tile">
  <image source="assets/raycast/textures/sewer_door.jpg" width="2048" height="2048"/>
 </tile>
 <tile id="51" type="Tile">
  <properties>
   <property name="align" propertytype="Align" value="-"/>
   <property name="tileType" propertytype="TileType" value="thinWall"/>
  </properties>
  <image source="assets/raycast/textures/sewer_waterfall.png" width="678" height="678"/>
 </tile>
 <tile id="52">
  <image source="../../../side-scroller/assets/raycast/textures/worn_stairs_up.jpg" width="2048" height="2048"/>
 </tile>
 <tile id="53">
  <image source="../../../side-scroller/assets/raycast/textures/worn_stairs_down.jpg" width="2048" height="2048"/>
 </tile>
 <tile id="54">
  <image source="assets/raycast/enemies/prisoner.png" width="35" height="69"/>
 </tile>
 <tile id="55">
  <image source="assets/raycast/enemies/at_st.png" width="54" height="102"/>
 </tile>
 <tile id="56">
  <image source="assets/raycast/enemies/tie_fighter.png" width="46" height="66"/>
 </tile>
 <tile id="57">
  <image source="assets/raycast/enemies/tie_bomber.png" width="67" height="61"/>
 </tile>
 <tile id="58">
  <image source="assets/raycast/textures/elevator_pad.jpg" width="2048" height="2048"/>
 </tile>
 <tile id="59" type="Tile">
  <image source="assets/raycast/textures/shield.png" width="1146" height="1146"/>
 </tile>
</tileset>
