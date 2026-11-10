Seamless 360-degree panoramic skybox of a massive
Source: https://storage.googleapis.com/rosebud_assets_storage/f9856646-ff26-4fc0-b351-ec3adaa86162.webp
Prompt: Seamless 360-degree panoramic skybox of a massive, gritty sci-fi industrial hangar bay, low-angle human perspective. In the center, a colossal octagonal open bay door with scaffolding frames a misty, overcast tropical jungle containing distant military bunkers, radar dishes, and landing pads. The surrounding interior features towering weathered steel walls, heavy pipes, ceiling cranes with hanging chains, and elevated glass control rooms glowing with amber and teal lights. The opposite side has a giant closed blast door with yellow hazard stripes, recessed ship bays with parked sci-fi dropships, and steam vents. The wet, oil-stained metal grating floor has thick cables, cargo crates, forklifts, and tiny ground crew figures for massive scale. Photorealistic, cinematic volumetric lighting, dark industrial sci-fi aesthetic, 8k, seamless horizontal wrap
Six 720×720 cube faces converted from the 2880×1440 equirectangular panorama.

Face layout (OpenGL cubemap, +Y up): px = +X right, nx = -X left, py = +Y up, ny = -Y down, pz = +Z, nz = -Z.

three.js
  const texture = new THREE.CubeTextureLoader().load(['px.png', 'nx.png', 'py.png', 'ny.png', 'pz.png', 'nz.png']);
  scene.background = texture;

Unity: create a Cubemap texture or a 6 Sided skybox material and assign the faces by axis.
Godot: import the six faces into a Cubemap resource, or keep using the equirectangular source with PanoramaSkyMaterial.
