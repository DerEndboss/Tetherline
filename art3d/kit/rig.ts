import {
  BackSide,
  Color,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  ShaderMaterial,
  ShadowMaterial,
  SphereGeometry,
  Vector3,
  type Texture,
  type WebGLRenderer,
} from 'three';
import { COLORS, WORLD } from './palette';

/**
 * THE light rig of the 3D art (one for every model, like `LIGHT` in solid.ts was for the SVG art):
 * - key: warm dusk sun from the screen's left, a little in front, high; soft shadows (jittered per sample),
 *   cast to the right and a little up like the SVG art's shadows
 * - sky: cool light from a different hemisphere direction each sample; averaged it is real sky occlusion,
 *   which gives the baked ambient-occlusion feel in creases and the soft contact shadow on the ground
 * - rim: pink-orange horizon light from behind (the horizon is the far side of the map), unshadowed
 * - fill: faint hemisphere bounce (blue above, rust ground below)
 * - environment: a procedural dusk sky with two soft boxes, for glossy reflections
 */

/** Direction towards the key light (model space). */
export const KEY_DIR = new Vector3(-0.3, 1.3, 0.62).normalize();
/** Direction towards the rim light: the horizon behind the map. */
export const RIM_DIR = new Vector3(-0.5, 0.3, -0.81).normalize();

export const LIGHTING = {
  key: { color: '#ffe4c8', intensity: 3.2, spread: 0.06 },
  sky: { color: '#a9c6ff', intensity: 1.55 },
  rim: { color: WORLD.sky.horizon, intensity: 1.0 },
  fill: { sky: '#5f7fd6', ground: '#8d5a50', intensity: 0.35 },
  env: 0.75,
} as const;

export interface Rig {
  scene: Scene;
  key: DirectionalLight;
  sky: DirectionalLight;
  /** Unshadowed horizon light from behind; the renderer turns it with the view. */
  rim: DirectionalLight;
  ground: Mesh;
  env: Texture;
}

function shadowLight(color: string, intensity: number, mapSize: number, radius: number): DirectionalLight {
  const l = new DirectionalLight(new Color(color), intensity);
  l.castShadow = true;
  l.shadow.mapSize.set(mapSize, mapSize);
  l.shadow.radius = radius;
  l.shadow.bias = -0.0004;
  l.shadow.normalBias = 0.012;
  return l;
}

/** The dusk sky used for reflections: deep blue zenith, pink-orange horizon behind, violet ground. */
function envScene(): Scene {
  const scene = new Scene();
  const sky = new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new Color(COLORS.skyTop) },
      mid: { value: new Color(COLORS.skyMid) },
      horizon: { value: new Color(COLORS.horizon) },
      ground: { value: new Color(WORLD.ground[1]!) },
      back: { value: RIM_DIR.clone().setY(0).normalize() },
    },
    vertexShader: 'varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform vec3 top; uniform vec3 mid; uniform vec3 horizon; uniform vec3 ground; uniform vec3 back;
      varying vec3 vDir;
      void main() {
        float y = vDir.y;
        float behind = clamp(dot(normalize(vec3(vDir.x, 0.0, vDir.z)), back) * 0.5 + 0.5, 0.0, 1.0);
        vec3 skyCol = mix(mid * 1.4, top, smoothstep(0.05, 0.75, y));
        float band = exp(-pow(max(y, 0.0) / 0.16, 2.0)) * (0.15 + 1.0 * behind * behind);
        vec3 c = mix(skyCol, horizon * 1.05, band);
        c = y < 0.0 ? mix(horizon * 0.5, ground * 0.6, smoothstep(0.0, 0.25, -y)) : c;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  scene.add(new Mesh(new SphereGeometry(50, 48, 24), sky));
  const box = (dir: Vector3, color: string, power: number, w: number, h: number): void => {
    const m = new Mesh(new PlaneGeometry(w, h), new MeshBasicMaterial({ color: new Color(color).multiplyScalar(power), side: BackSide }));
    m.position.copy(dir).multiplyScalar(40);
    m.lookAt(0, 0, 0);
    scene.add(m);
  };
  box(KEY_DIR, '#ffe2c4', 5, 26, 18);
  box(new Vector3(0.9, 0.5, -0.2).normalize(), COLORS.tech, 1.2, 14, 8);
  return scene;
}

/** Builds the rig; `mapSize` is the shadow map size (sharper contact shadows with more). */
export function createRig(renderer: WebGLRenderer, mapSize = 2048): Rig {
  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  const env = pmrem.fromScene(envScene(), 0.03).texture;
  pmrem.dispose();
  scene.environment = env;
  scene.environmentIntensity = LIGHTING.env;
  const key = shadowLight(LIGHTING.key.color, LIGHTING.key.intensity, mapSize, 2);
  const sky = shadowLight(LIGHTING.sky.color, LIGHTING.sky.intensity, 512, 9);
  const rim = new DirectionalLight(new Color(LIGHTING.rim.color), LIGHTING.rim.intensity);
  rim.position.copy(RIM_DIR).multiplyScalar(20);
  const fill = new HemisphereLight(new Color(LIGHTING.fill.sky), new Color(LIGHTING.fill.ground), LIGHTING.fill.intensity);
  const ground = new Mesh(new PlaneGeometry(80, 80), new ShadowMaterial({ color: new Color(COLORS.shadow), opacity: 0.5, depthWrite: false }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.renderOrder = -1;
  scene.add(key, key.target, sky, sky.target, rim, fill, ground);
  return { scene, key, sky, rim, ground, env };
}

/** Aims a shadow light from `dir` at a sphere (centre, radius) and fits its shadow camera tightly. */
export function aim(light: DirectionalLight, dir: Vector3, centre: Vector3, radius: number): void {
  light.position.copy(centre).addScaledVector(dir, radius * 4);
  light.target.position.copy(centre);
  light.target.updateMatrixWorld();
  const cam = light.shadow.camera;
  cam.left = -radius * 1.08;
  cam.right = radius * 1.08;
  cam.top = radius * 1.08;
  cam.bottom = -radius * 1.08;
  cam.near = radius * 0.5;
  cam.far = radius * 8;
  cam.updateProjectionMatrix();
  light.shadow.normalBias = radius * 0.004;
}

/** Sample `i` of `n`: a cosine-weighted direction over the upper hemisphere (stratified, deterministic). */
export function skyDir(i: number, n: number): Vector3 {
  const u = (i + 0.5) / n;
  // At most ~40 degrees from the zenith: grazing sky light would smear long faint shadows across the ground.
  const r = Math.sqrt(u) * 0.66;
  const a = i * 2.399963;
  return new Vector3(Math.cos(a) * r, Math.sqrt(1 - r * r), Math.sin(a) * r).normalize();
}

/** Sample `i` of `n`: the key direction jittered inside a small disc (soft shadow edges). */
export function keyDir(i: number, n: number): Vector3 {
  const u = (i + 0.5) / n;
  const a = i * 2.399963 + 1.1;
  const r = Math.sqrt(u) * LIGHTING.key.spread;
  const side = new Vector3().crossVectors(KEY_DIR, new Vector3(0, 1, 0)).normalize();
  const up = new Vector3().crossVectors(side, KEY_DIR).normalize();
  return KEY_DIR.clone().addScaledVector(side, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
}
