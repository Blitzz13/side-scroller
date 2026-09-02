<?xml version="1.0" encoding="UTF-8"?>
<tileset version="1.10" tiledversion="1.12.2" name="StarWarsTileset" tilewidth="1920" tileheight="1920" tilecount="19" columns="0" tilerendersize="grid">
 <grid orientation="orthogonal" width="1" height="1"/>
 <tile id="0" type="Tile">
  <properties>
   <property name="tileType" propertytype="TileType" value="thickWall"/>
  </properties>
  <image source="basic_imperial_wall.jpg" width="600" height="600"/>
 </tile>
 <tile id="1" type="Tile">
  <properties>
   <property name="tileType" propertytype="TileType" value="thinWall"/>
  </properties>
  <image source="fence.png" width="980" height="980"/>
 </tile>
 <tile id="2" type="Tile">
  <properties>
   <property name="tileType" propertytype="TileType" value="thickWall"/>
  </properties>
  <image source="imperial_grilled_wall.jpg" width="256" height="256"/>
 </tile>
 <tile id="3" type="Tile">
  <image source="metal_door.jpg" width="512" height="512"/>
 </tile>
 <tile id="4" type="Tile">
  <properties>
   <property name="tileType" propertytype="TileType" value="thinWall"/>
  </properties>
  <image source="inside_floor.jpg" width="512" height="512"/>
 </tile>
 <tile id="5" type="Tile">
  <properties>
   <property name="tileType" propertytype="TileType" value="floor"/>
  </properties>
  <image source="floor.png" width="256" height="256"/>
 </tile>
 <tile id="6" type="Tile">
  <properties>
   <property name="tileType" propertytype="TileType" value="ceiling"/>
  </properties>
  <image source="ceiling_3.jpg" width="1920" height="1920"/>
 </tile>
 <tile id="7" type="Tile">
  <properties>
   <property name="tileType" propertytype="TileType" value="ceiling"/>
  </properties>
  <image source="ceiling_1.jpg" width="400" height="400"/>
 </tile>
 <tile id="8" type="Tile">
  <properties>
   <property name="tileType" propertytype="TileType" value="ceiling"/>
  </properties>
  <image source="ceiling_2.jpg" width="1024" height="1024"/>
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
  <image source="e_11_item.png" width="1231" height="511"/>
 </tile>
 <tile id="10" type="PickupItem">
  <properties>
   <property name="amount" type="int" value="20"/>
   <property name="type" propertytype="PickupType" value="health"/>
  </properties>
  <image source="health.png" width="613" height="569"/>
 </tile>
 <tile id="11">
  <image source="storm_trooper.png" width="480" height="1000"/>
 </tile>
 <tile id="12" type="Object">
  <properties>
   <property name="anchor" propertytype="Anchor" value="floor"/>
  </properties>
  <image source="table.png" width="61" height="43"/>
 </tile>
 <tile id="13" type="Object">
  <properties>
   <property name="anchor" propertytype="Anchor" value="floor"/>
  </properties>
  <image source="chair.png" width="29" height="31"/>
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
  <image source="../../../texture-packer/raw/keycard/key_card_blue_1.png" width="25" height="30"/>
 </tile>
 <tile id="15">
  <image source="stairs.png" width="667" height="374"/>
 </tile>
 <tile id="16" type="Object">
  <properties>
   <property name="anchor" propertytype="Anchor" value="floor"/>
  </properties>
  <image source="power_cell.PNG" width="32" height="64"/>
 </tile>
 <tile id="17" type="PickupItem">
  <properties>
   <property name="amount" type="int" value="5"/>
   <property name="type" propertytype="PickupType" value="ammo"/>
   <property name="weaponType" propertytype="Weapons" value="thermal_detonator"/>
  </properties>
  <image source="thermal_detonator_belt.png" width="43" height="25"/>
 </tile>
 <tile id="18" type="PickupItem">
  <properties>
   <property name="amount" type="int" value="1"/>
   <property name="type" propertytype="PickupType" value="ammo"/>
   <property name="weaponType" propertytype="Weapons" value="thermal_detonator"/>
  </properties>
  <image source="thermal_detonator_pickup.png" width="15" height="15"/>
 </tile>
</tileset>
