import { Canvas, useFrame, useLoader } from '@react-three/fiber'
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import ClubExperience3D from './ClubExperience3D'
import { EVENT_CONFIG } from '../data/events'

const LIQUID_CONFIG = Object.freeze({
  trailStrength: 0.74,
  trailRadius: 0.042,
  velocityInfluence: 0.42,
  inertia: 0.9915,
  // About six percent of a strong mark remains after 3.2 seconds at 60fps:
  // enough to read as viscous inertia without leaving a permanent residue.
  dissipation: 0.9855,
  advectionStrength: 0.34,
  desktopResolution: 256,
  coarseResolution: 128,
  maxSplatsPerFrame: 12,
  maxVelocity: 2.8,
})
const LIQUID_SPLAT_COUNT = LIQUID_CONFIG.maxSplatsPerFrame
const EMPTY_POINTER = { x: 0, y: 0, velocityX: 0, velocityY: 0, isActive: false }
// Relative URL keeps the model available from Vite's root and from a local
// file:// preview when the production folder is served directly.
const HERO_MODEL_URL = './assets/neon-text-3d-model.glb'
const EVENT_ACCENT_COLORS = EVENT_CONFIG.map((event) => new THREE.Color(event.accent))
const CLUB_ACCENT_COLORS = [
  new THREE.Color('#627cff'),
  new THREE.Color('#54d9e8'),
]

// Section transforms are kept separate from the Event Space's existing world
// transform. The first Event pose is a strict identity so Steps 04–07 remain
// byte-for-byte equivalent visually until the dedicated section range begins.
const EVENT_STACK_POSES = [
  { progress: 0, position: [0, 0, 0], scale: 1, rotation: [0, 0, 0] },
  { progress: 0.25, position: [0.02, 0.02, -0.55], scale: 0.92, rotation: [-0.008, 0.04, -0.006] },
  { progress: 0.55, position: [-0.18, 0.11, -2.25], scale: 0.64, rotation: [-0.02, 0.18, -0.015] },
  { progress: 0.80, position: [-0.48, 0.18, -4.50], scale: 0.42, rotation: [-0.025, 0.30, -0.022] },
  { progress: 1, position: [-0.62, 0.22, -6.20], scale: 0.34, rotation: [-0.02, 0.36, -0.018] },
]

const CLUB_STACK_POSES = [
  { progress: 0, position: [0.55, -0.24, -6.80], scale: 0.34, rotation: [0.025, -0.30, 0.018] },
  { progress: 0.25, position: [0.48, -0.20, -6.00], scale: 0.40, rotation: [0.018, -0.24, 0.012] },
  { progress: 0.55, position: [0.25, -0.10, -3.45], scale: 0.66, rotation: [0.008, -0.12, 0.006] },
  { progress: 0.80, position: [0.06, -0.02, -1.18], scale: 0.92, rotation: [0.002, -0.035, 0.002] },
  { progress: 1, position: [0, 0, -0.52], scale: 1, rotation: [0, 0, 0] },
]

const applySectionPose = (
  group,
  progress,
  poses,
  { compact = false, reducedMotion = false, preserveStart = false } = {},
) => {
  if (!group) return
  const safeProgress = THREE.MathUtils.clamp(progress, 0, 1)
  let poseIndex = poses.length - 2
  for (let index = 0; index < poses.length - 1; index += 1) {
    if (safeProgress <= poses[index + 1].progress) {
      poseIndex = index
      break
    }
  }

  const from = poses[poseIndex]
  const to = poses[poseIndex + 1]
  const blend = THREE.MathUtils.smoothstep(safeProgress, from.progress, to.progress)
  const finalPose = poses[poses.length - 1]
  const depthRange = reducedMotion ? 0.48 : compact ? 0.64 : 1
  const lateralRange = compact ? 0.70 : 1
  const rotationRange = reducedMotion ? 0 : compact ? 0.60 : 1
  // Reduced motion keeps the authored distant entry pose and shortens only
  // the forward travel. Anchoring at the final pose would pull the Club from
  // -6.8 to roughly -3.5 at progress 0 and create a discontinuous appearance.
  const depthAnchor = preserveStart || reducedMotion
    ? poses[0].position[2]
    : finalPose.position[2]
  const interpolatedZ = THREE.MathUtils.lerp(from.position[2], to.position[2], blend)

  group.position.set(
    THREE.MathUtils.lerp(from.position[0], to.position[0], blend) * lateralRange,
    THREE.MathUtils.lerp(from.position[1], to.position[1], blend) * (compact ? 0.76 : 1),
    depthAnchor + (interpolatedZ - depthAnchor) * depthRange,
  )
  group.scale.setScalar(THREE.MathUtils.lerp(from.scale, to.scale, blend))
  group.rotation.set(
    THREE.MathUtils.lerp(from.rotation[0], to.rotation[0], blend) * rotationRange,
    THREE.MathUtils.lerp(from.rotation[1], to.rotation[1], blend) * rotationRange,
    THREE.MathUtils.lerp(from.rotation[2], to.rotation[2], blend) * rotationRange,
  )
}

const getAccentColor = (progress, target = new THREE.Color()) => {
  const safeProgress = THREE.MathUtils.clamp(Number.isFinite(progress) ? progress : 0, 0, 1)
  const scaled = safeProgress * Math.max(EVENT_ACCENT_COLORS.length - 1, 1)
  const fromIndex = Math.min(EVENT_ACCENT_COLORS.length - 1, Math.floor(scaled))
  const toIndex = Math.min(EVENT_ACCENT_COLORS.length - 1, fromIndex + 1)
  const blend = THREE.MathUtils.smoothstep(scaled - fromIndex, 0, 1)
  return target.copy(EVENT_ACCENT_COLORS[fromIndex]).lerp(EVENT_ACCENT_COLORS[toIndex], blend)
}

const getEnvironmentAccent = (carouselProgress, sectionProgress, target, clubTarget) => {
  const clubColourProgress = THREE.MathUtils.smoothstep(sectionProgress, 0.38, 1)
  clubTarget.copy(CLUB_ACCENT_COLORS[0]).lerp(CLUB_ACCENT_COLORS[1], clubColourProgress * 0.64)
  return getAccentColor(carouselProgress, target).lerp(
    clubTarget,
    THREE.MathUtils.smoothstep(sectionProgress, 0.32, 0.82),
  )
}

const liquidVertexShader = /* glsl */ `
  uniform float uScrollProgress;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    float progress = uScrollProgress;
    vec2 stretchedPosition = position.xy * vec2(1.0 + progress * 0.055, 1.0 + progress * 0.035);
    stretchedPosition.y -= progress * 0.018;
    gl_Position = vec4(stretchedPosition, 0.0, 1.0);
  }
`

const liquidFragmentShader = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform vec2 uResolution;
  uniform vec2 uPointer;
  uniform vec2 uVelocity;
  uniform float uReducedMotion;
  uniform float uScrollProgress;
  uniform float uPointerInfluence;
  uniform vec3 uAmbientColor;
  uniform sampler2D uFluidState;
  uniform vec2 uFluidTexelSize;
  varying vec2 vUv;

  vec2 safeNormalize(vec2 value) { return value / max(length(value), 0.0001); }
  vec2 decodeFluidVelocity(vec2 value) {
    return (value - vec2(0.4980392157)) * 2.0;
  }
  float gridLine(float coordinate, float cells, float thickness) {
    float cell = abs(fract(coordinate * cells - 0.5) - 0.5);
    return 1.0 - smoothstep(thickness, thickness * 1.7, cell);
  }

  float roomGrid(vec2 point, float horizon, float aspect) {
    // A compact room projection: rays converge at the horizon and depth
    // lines compress toward it. This keeps the environment spatial without
    // adding another render pass or a second canvas.
    float floorAmount = smoothstep(horizon + 0.012, horizon + 0.22, point.y);
    float floorDepth = max(point.y - horizon, 0.008);
    float floorPerspectiveX = (point.x - 0.5) * aspect / floorDepth;
    float floorRays = gridLine(floorPerspectiveX, 7.0, 0.016);
    float floorDepthLines = gridLine(log(floorDepth + 0.018) * 2.8, 4.0, 0.018);

    float wallAmount = 1.0 - smoothstep(horizon - 0.28, horizon - 0.015, point.y);
    float wallX = (point.x - 0.5) * aspect;
    float wallY = (horizon - point.y) * 2.8;
    float wallVerticals = gridLine(wallX, 7.0, 0.010);
    float wallHorizontals = gridLine(wallY, 5.0, 0.012);

    return floorAmount * (floorRays * 0.72 + floorDepthLines * 0.52)
      + wallAmount * (wallVerticals * 0.46 + wallHorizontals * 0.34);
  }

  // These are intentionally local lights, not a fullscreen colour wash. They
  // are evaluated after the liquid UV has been displaced, which lets the
  // existing trail field refract the illumination without a second render pass.
  float softLight(vec2 point, vec2 origin, vec2 radius) {
    vec2 distanceFromLight = (point - origin) / radius;
    return exp(-dot(distanceFromLight, distanceFromLight) * 2.45);
  }

  vec3 neonField(vec2 point, float breathe) {
    float rearViolet = softLight(point, vec2(0.175, 0.235), vec2(0.29, 0.225));
    float sideBlue = softLight(point, vec2(0.805, 0.755), vec2(0.30, 0.255));
    float distantCyan = softLight(point, vec2(0.675, 0.305), vec2(0.105, 0.092));

    vec3 light = vec3(0.0);
    light += vec3(0.125, 0.042, 0.305) * rearViolet;
    light += vec3(0.032, 0.105, 0.315) * sideBlue;
    light += vec3(0.060, 0.285, 0.335) * distantCyan;
    // The active event tint is kept local to the room instead of washing the
    // entire background. This lets the carousel's continuous progress gently
    // recolour the grid and reflections without replacing the dark base.
    float eventPool = softLight(point, vec2(0.51, 0.46), vec2(0.42, 0.34));
    float eventArrival = smoothstep(0.72, 1.0, uScrollProgress);
    light += uAmbientColor * eventPool * 0.18 * eventArrival;
    return light * breathe;
  }

  void main() {
    float aspect = uResolution.x / max(uResolution.y, 1.0);
    float scrollProgress = clamp(uScrollProgress, 0.0, 1.0);
    float motionScale = mix(1.0, 0.32, uReducedMotion);
    vec2 centered = vUv - 0.5;
    vec2 ambient = vec2(
      sin(centered.y * 9.0 + uTime * 0.18) * 0.0010,
      cos(centered.x * 8.0 - uTime * 0.14) * 0.0008
    ) * motionScale;
    vec4 fluid = texture2D(uFluidState, vUv);
    // The feedback texture stores signed velocity in RG and persistent
    // disturbance density in B. Sampling neighbouring density turns the same
    // field into a refractive surface normal rather than an overlay trail.
    float densityLeft = texture2D(uFluidState, vUv - vec2(uFluidTexelSize.x * 2.0, 0.0)).b;
    float densityRight = texture2D(uFluidState, vUv + vec2(uFluidTexelSize.x * 2.0, 0.0)).b;
    float densityDown = texture2D(uFluidState, vUv - vec2(0.0, uFluidTexelSize.y * 2.0)).b;
    float densityUp = texture2D(uFluidState, vUv + vec2(0.0, uFluidTexelSize.y * 2.0)).b;
    vec2 densityNormal = vec2(densityLeft - densityRight, densityDown - densityUp);
    vec2 displacement = ambient + (
      decodeFluidVelocity(fluid.rg) * 0.030 + densityNormal * 0.082
    ) * motionScale * uPointerInfluence;
    float liquidEnergy = fluid.b * uPointerInfluence;

    vec2 liquidUv = vUv + displacement;
    // Stretch the same liquid field as the camera enters the room. Because
    // the grid and neon are sampled from this UV, the transition reads as a
    // physical pull through depth instead of a section crossfade.
    vec2 depthUv = vec2(0.5) + (liquidUv - 0.5)
      * vec2(1.0 + scrollProgress * 0.72, 1.0 + scrollProgress * 0.42);
    depthUv.y -= scrollProgress * 0.040;
    // The lights move very slowly when idle. Reduced-motion users receive a
    // still light field, while the rest of the scene remains predominantly dark.
    float lightBreathe = mix(
      0.955 + sin(uTime * 0.19) * 0.045,
      1.0,
      uReducedMotion
    );
    vec3 refractedNeon = neonField(depthUv + displacement * (0.42 + scrollProgress * 0.24), lightBreathe);
    vec3 untouchedNeon = neonField(vUv, lightBreathe);
    float distortionAmount = length(displacement * vec2(aspect, 1.0));
    float interactionAmount = smoothstep(0.006, 0.060, distortionAmount)
      * smoothstep(0.015, 0.38, liquidEnergy);

    // Keep the colour split tied to active liquid movement. Sampling just a
    // few thousandths along the flow gives violet/blue edges a tiny cyan fringe
    // during fast trails without creating a permanent RGB-glitch treatment.
    vec2 flowAxis = safeNormalize(displacement * vec2(aspect, 1.0));
    flowAxis.x /= aspect;
    float dispersionWidth = min(0.0065, distortionAmount * 0.12) * interactionAmount;
    vec2 dispersion = flowAxis * dispersionWidth;
    vec3 forwardNeon = neonField(depthUv + dispersion, lightBreathe);
    vec3 backwardNeon = neonField(depthUv - dispersion, lightBreathe);
    vec3 dispersedNeon = vec3(forwardNeon.r, refractedNeon.g, backwardNeon.b);
    refractedNeon = mix(refractedNeon, dispersedNeon, interactionAmount * 0.42);

    float majorVertical = gridLine(depthUv.x, 9.0, 0.009);
    float majorHorizontal = gridLine(depthUv.y, 9.0, 0.009);
    float minorVertical = gridLine(depthUv.x, 36.0, 0.0032);
    float minorHorizontal = gridLine(depthUv.y, 36.0, 0.0032);
    float majorGrid = max(majorVertical, majorHorizontal);
    float minorGrid = max(minorVertical, minorHorizontal);
    float spatialGrid = roomGrid(depthUv, mix(0.44, 0.62, scrollProgress), aspect);
    float depthStreak = gridLine(depthUv.y + depthUv.x * scrollProgress * 0.22, 15.0, 0.006);
    float edgeDistance = length((vUv - 0.5) * vec2(aspect, 1.0));
    float centreLift = 1.0 - smoothstep(0.10, 0.84, edgeDistance);
    float softLight = smoothstep(0.95, 0.0, edgeDistance) * 0.020;
    float fieldLight = smoothstep(0.02, 0.85, liquidEnergy) * 0.10;
    vec3 colour = vec3(0.018, 0.020, 0.020);
    colour += vec3(majorGrid * (0.042 + centreLift * 0.014));
    colour += vec3(minorGrid * 0.010);
    // The room grid is fed the same displaced UV as the liquid field, so
    // pointer trails visibly bend the perspective lines and floor depth.
    colour += vec3(spatialGrid * (0.032 + liquidEnergy * 0.075));
    colour += vec3(depthStreak * scrollProgress * 0.022);
    float eventArrival = smoothstep(0.72, 1.0, scrollProgress);
    colour += uAmbientColor * (majorGrid * 0.012 + spatialGrid * 0.018) * eventArrival;
    colour += vec3(softLight + fieldLight);
    // Light mostly lives inside the room. The grid only catches it where the
    // field reaches a surface; moving through it briefly brightens the same
    // refracted colour, so the interaction reads as illuminated liquid.
    float gridSurface = max(majorGrid * 0.82 + minorGrid * 0.22, spatialGrid);
    float refractedDifference = length(refractedNeon - untouchedNeon);
    colour += refractedNeon * (0.13 + gridSurface * 0.34 + liquidEnergy * 0.30);
    colour += refractedNeon * refractedDifference * (0.85 + liquidEnergy * 0.65);
    colour *= 1.0 - smoothstep(0.50, 1.03, edgeDistance) * 0.25;
    gl_FragColor = vec4(colour, 1.0);
  }
`

const liquidSimulationVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

const liquidSimulationFragmentShader = /* glsl */ `
  precision highp float;
  #define SPLAT_COUNT ${LIQUID_SPLAT_COUNT}
  const float VELOCITY_ZERO = 0.4980392157;

  uniform sampler2D uPreviousState;
  uniform vec2 uTexelSize;
  uniform float uAspect;
  uniform float uDelta;
  uniform float uInertia;
  uniform float uDissipation;
  uniform float uAdvectionStrength;
  uniform float uReducedMotion;
  uniform vec2 uSplatPosition[SPLAT_COUNT];
  uniform vec2 uSplatVelocity[SPLAT_COUNT];
  uniform float uSplatStrength[SPLAT_COUNT];
  uniform float uSplatRadius[SPLAT_COUNT];
  varying vec2 vUv;

  vec2 decodeVelocity(vec2 encoded) {
    return (encoded - vec2(VELOCITY_ZERO)) * 2.0;
  }

  vec2 encodeVelocity(vec2 velocity) {
    return clamp(vec2(VELOCITY_ZERO) + velocity * 0.5, 0.0, 1.0);
  }

  void main() {
    float frameScale = clamp(uDelta * 60.0, 0.0, 3.0);
    vec4 localState = texture2D(uPreviousState, vUv);
    vec2 localVelocity = decodeVelocity(localState.rg);
    float drift = 1.0 - uReducedMotion;
    vec2 advectedUv = clamp(
      vUv - localVelocity * uDelta * uAdvectionStrength * drift,
      uTexelSize,
      vec2(1.0) - uTexelSize
    );

    vec4 advectedState = texture2D(uPreviousState, advectedUv);
    vec2 velocity = decodeVelocity(advectedState.rg);
    float density = advectedState.b;
    float densityLeft = texture2D(uPreviousState, advectedUv - vec2(uTexelSize.x, 0.0)).b;
    float densityRight = texture2D(uPreviousState, advectedUv + vec2(uTexelSize.x, 0.0)).b;
    float densityDown = texture2D(uPreviousState, advectedUv - vec2(0.0, uTexelSize.y)).b;
    float densityUp = texture2D(uPreviousState, advectedUv + vec2(0.0, uTexelSize.y)).b;
    float neighbourDensity = (densityLeft + densityRight + densityDown + densityUp) * 0.25;
    float diffusion = min(0.12, uDelta * 2.6) * drift;
    density = mix(density, neighbourDensity, diffusion);

    // A tiny density-gradient curl bends the advected path without adding a
    // separate pressure solve or an additional fullscreen render pass.
    vec2 densityGradient = vec2(densityRight - densityLeft, densityUp - densityDown);
    velocity += vec2(-densityGradient.y, densityGradient.x) * uDelta * 0.18 * drift;
    velocity *= mix(pow(uInertia, frameScale), 0.0, uReducedMotion);
    density *= mix(pow(uDissipation, frameScale), pow(0.90, frameScale), uReducedMotion);

    // The field deliberately uses universally supported RGBA8 targets. Small
    // subtractive fades prevent low byte values from becoming permanent fixed
    // points after quantisation, while keeping desktop persistence near 3s.
    float velocityMagnitude = length(velocity);
    float velocityFade = mix(0.0042, 0.030, uReducedMotion) * frameScale;
    velocity *= max(velocityMagnitude - velocityFade, 0.0) / max(velocityMagnitude, 0.0001);
    density = max(density - mix(0.0010, 0.0060, uReducedMotion) * frameScale, 0.0);
    if (density < 0.020) density = 0.0;
    for (int i = 0; i < SPLAT_COUNT; i++) {
      float strength = uSplatStrength[i];
      vec2 offset = vUv - uSplatPosition[i];
      offset.x *= uAspect;
      float radius = max(uSplatRadius[i], 0.0001);
      float splat = exp(-dot(offset, offset) / (radius * radius)) * strength;
      density = min(1.0, density + splat * (1.0 - density * 0.42));
      velocity += uSplatVelocity[i] * splat;
    }

    float speed = length(velocity);
    if (speed > 0.92) velocity *= 0.92 / speed;
    float edgeFade = smoothstep(0.0, 0.032, min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y)));
    velocity *= mix(0.82, 1.0, edgeFade);
    density *= mix(0.90, 1.0, edgeFade);
    gl_FragColor = vec4(encodeVelocity(velocity), density, 1.0);
  }
`

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia(query).matches
  ))
  useEffect(() => {
    const media = window.matchMedia(query)
    const update = () => setMatches(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [query])
  return matches
}

function createLiquidUniforms(initialTexture, simulationResolution) {
  return {
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uPointer: { value: new THREE.Vector2() },
    uVelocity: { value: new THREE.Vector2() },
    uReducedMotion: { value: 0 },
    uScrollProgress: { value: 0 },
    uPointerInfluence: { value: 1 },
    uAmbientColor: { value: EVENT_ACCENT_COLORS[0].clone() },
    uFluidState: { value: initialTexture },
    uFluidTexelSize: { value: new THREE.Vector2(1 / simulationResolution, 1 / simulationResolution) },
  }
}

function createFluidRenderTarget(resolution) {
  const target = new THREE.WebGLRenderTarget(resolution, resolution, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    depthBuffer: false,
    stencilBuffer: false,
    generateMipmaps: false,
  })
  target.texture.colorSpace = THREE.NoColorSpace
  target.texture.name = 'tripo-liquid-feedback'
  return target
}

function createLiquidSimulation(simulationResolution) {
  const zeroData = new Uint8Array(simulationResolution * simulationResolution * 4)
  // Byte render targets cannot represent signed velocity directly. RG uses a
  // neutral midpoint so velocity can travel in both screen-space directions.
  for (let index = 0; index < zeroData.length; index += 4) {
    zeroData[index] = 127
    zeroData[index + 1] = 127
    zeroData[index + 3] = 255
  }
  const zeroTexture = new THREE.DataTexture(
    zeroData,
    simulationResolution,
    simulationResolution,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  )
  zeroTexture.colorSpace = THREE.NoColorSpace
  zeroTexture.minFilter = THREE.LinearFilter
  zeroTexture.magFilter = THREE.LinearFilter
  zeroTexture.needsUpdate = true

  const splatPositions = Array.from(
    { length: LIQUID_SPLAT_COUNT },
    () => new THREE.Vector2(-4, -4),
  )
  const splatVelocities = Array.from(
    { length: LIQUID_SPLAT_COUNT },
    () => new THREE.Vector2(),
  )
  const simulationUniforms = {
    uPreviousState: { value: zeroTexture },
    uTexelSize: { value: new THREE.Vector2(1 / simulationResolution, 1 / simulationResolution) },
    uAspect: { value: 1 },
    uDelta: { value: 1 / 60 },
    uInertia: { value: LIQUID_CONFIG.inertia },
    uDissipation: { value: LIQUID_CONFIG.dissipation },
    uAdvectionStrength: { value: LIQUID_CONFIG.advectionStrength },
    uReducedMotion: { value: 0 },
    uSplatPosition: { value: splatPositions },
    uSplatVelocity: { value: splatVelocities },
    uSplatStrength: { value: new Float32Array(LIQUID_SPLAT_COUNT) },
    uSplatRadius: { value: new Float32Array(LIQUID_SPLAT_COUNT).fill(LIQUID_CONFIG.trailRadius) },
  }
  const simulationMaterial = new THREE.ShaderMaterial({
    uniforms: simulationUniforms,
    vertexShader: liquidSimulationVertexShader,
    fragmentShader: liquidSimulationFragmentShader,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  })
  const simulationGeometry = new THREE.PlaneGeometry(2, 2)
  const simulationMesh = new THREE.Mesh(simulationGeometry, simulationMaterial)
  simulationMesh.frustumCulled = false
  const simulationScene = new THREE.Scene()
  simulationScene.add(simulationMesh)
  const simulationCamera = new THREE.Camera()

  return {
    zeroTexture,
    targets: [
      createFluidRenderTarget(simulationResolution),
      createFluidRenderTarget(simulationResolution),
    ],
    readIndex: 0,
    initialized: false,
    uniforms: simulationUniforms,
    material: simulationMaterial,
    geometry: simulationGeometry,
    scene: simulationScene,
    camera: simulationCamera,
  }
}

function LiquidDistortion({ pointerRef, scrollRef, reducedMotion, coarsePointer }) {
  const simulationResolution = coarsePointer
    ? LIQUID_CONFIG.coarseResolution
    : LIQUID_CONFIG.desktopResolution
  const simulationRef = useRef(null)
  const uniforms = useMemo(
    () => createLiquidUniforms(null, simulationResolution),
    [simulationResolution],
  )
  const lastSampleRef = useRef(null)
  const resolutionRef = useRef(new THREE.Vector2())
  const velocityRef = useRef(new THREE.Vector2())
  const injectionVelocityRef = useRef(new THREE.Vector2())
  const currentPositionRef = useRef(new THREE.Vector2())
  const frameTravelRef = useRef(new THREE.Vector2())
  const ambientColorRef = useRef(new THREE.Color())
  const clubColorRef = useRef(new THREE.Color())

  useLayoutEffect(() => {
    const simulation = createLiquidSimulation(simulationResolution)
    simulationRef.current = simulation
    lastSampleRef.current = null
    uniforms.uFluidState.value = simulation.zeroTexture
    return () => {
      if (simulationRef.current === simulation) simulationRef.current = null
      simulation.targets.forEach((target) => target.dispose())
      simulation.zeroTexture.dispose()
      simulation.material.dispose()
      simulation.geometry.dispose()
    }
  }, [simulationResolution, uniforms])

  useFrame(({ clock, gl }, delta) => {
    const simulation = simulationRef.current
    if (!simulation) return
    const pointer = pointerRef?.current ?? EMPTY_POINTER
    const safeDelta = THREE.MathUtils.clamp(delta, 1 / 240, 1 / 24)
    const scrollProgress = THREE.MathUtils.clamp(scrollRef?.current?.progress ?? 0, 0, 1)
    const carouselProgress = THREE.MathUtils.clamp(scrollRef?.current?.carouselProgress ?? 0, 0, 1)
    const sectionProgress = THREE.MathUtils.clamp(scrollRef?.current?.sectionProgress ?? 0, 0, 1)
    // Hero remains the strongest liquid moment, while later spaces retain a
    // restrained trace so the material language feels continuous site-wide.
    const pointerInfluence = THREE.MathUtils.lerp(
      coarsePointer ? 0.15 : 0.24,
      1,
      1 - THREE.MathUtils.smoothstep(scrollProgress, 0.02, 0.84),
    )
    // Raw target coordinates describe actual pointer events. The smoothed
    // coordinates remain dedicated to Hero parallax; using the raw target here
    // also means an idle pointer cannot keep injecting while parallax settles.
    const currentPosition = currentPositionRef.current.set(
      THREE.MathUtils.clamp(((pointer.targetX ?? pointer.x) + 1) * 0.5, 0, 1),
      THREE.MathUtils.clamp(((pointer.targetY ?? pointer.y) + 1) * 0.5, 0, 1),
    )
    const normalizedVelocity = velocityRef.current.set(
      THREE.MathUtils.clamp((pointer.velocityX || 0) * 0.5, -LIQUID_CONFIG.maxVelocity, LIQUID_CONFIG.maxVelocity),
      THREE.MathUtils.clamp((pointer.velocityY || 0) * 0.5, -LIQUID_CONFIG.maxVelocity, LIQUID_CONFIG.maxVelocity),
    ).clampLength(0, LIQUID_CONFIG.maxVelocity)
    const speed = normalizedVelocity.length()
    const simulationUniforms = simulation.uniforms
    simulationUniforms.uSplatStrength.value.fill(0)
    simulationUniforms.uSplatPosition.value.forEach((position) => position.set(-4, -4))
    simulationUniforms.uSplatVelocity.value.forEach((splatVelocity) => splatVelocity.set(0, 0))

    if (!pointer.isActive) {
      lastSampleRef.current = null
    } else if (!lastSampleRef.current) {
      lastSampleRef.current = currentPosition.clone()
    }

    const shouldInject = pointer.isActive && speed > 0.018 && pointerInfluence > 0.01
    if (shouldInject && lastSampleRef.current) {
      const travel = frameTravelRef.current.subVectors(currentPosition, lastSampleRef.current)
      const distance = travel.length()
      const canvasAspect = gl.domElement.width / Math.max(gl.domElement.height, 1)
      const aspectDistance = Math.hypot(travel.x * canvasAspect, travel.y)
      const spacing = (coarsePointer ? 0.054 : 0.026) * (reducedMotion ? 1.35 : 1)
      const steps = Math.min(
        LIQUID_SPLAT_COUNT,
        Math.max(1, Math.ceil(aspectDistance / spacing)),
      )
      const velocityMagnitude = THREE.MathUtils.clamp(speed / LIQUID_CONFIG.maxVelocity, 0, 1)
      const baseStrength = LIQUID_CONFIG.trailStrength
        * THREE.MathUtils.lerp(0.16, 1, velocityMagnitude)
        * pointerInfluence
        * (coarsePointer ? 0.62 : 1)
        * (reducedMotion ? 0.30 : 1)
      const authoredRadius = LIQUID_CONFIG.trailRadius
        * THREE.MathUtils.lerp(0.82, 1.22, velocityMagnitude)
        * (coarsePointer ? 1.15 : 1)
      // If a pointer crosses most of the viewport in one frame, enlarge the
      // bounded splats just enough that all 12 still form a continuous stroke.
      const radius = Math.min(
        0.12,
        Math.max(authoredRadius, (aspectDistance / Math.max(steps, 1)) * 0.74),
      )
      const injectionVelocity = injectionVelocityRef.current
        .copy(normalizedVelocity)
        .multiplyScalar(LIQUID_CONFIG.velocityInfluence * pointerInfluence * (coarsePointer ? 0.60 : 1))

      for (let index = 0; distance > 0.00025 && index < steps; index += 1) {
        const interpolation = steps === 1 ? 1 : (index + 1) / steps
        simulationUniforms.uSplatPosition.value[index]
          .copy(lastSampleRef.current)
          .lerp(currentPosition, interpolation)
        simulationUniforms.uSplatVelocity.value[index].copy(injectionVelocity)
        simulationUniforms.uSplatStrength.value[index] = baseStrength
        simulationUniforms.uSplatRadius.value[index] = radius
      }
      lastSampleRef.current.copy(currentPosition)
    }

    simulationUniforms.uDelta.value = safeDelta
    simulationUniforms.uAspect.value = gl.domElement.width / Math.max(gl.domElement.height, 1)
    simulationUniforms.uReducedMotion.value = reducedMotion ? 1 : 0
    simulationUniforms.uInertia.value = reducedMotion ? 0 : LIQUID_CONFIG.inertia
    simulationUniforms.uDissipation.value = reducedMotion ? 0.90 : LIQUID_CONFIG.dissipation
    simulationUniforms.uAdvectionStrength.value = reducedMotion ? 0 : LIQUID_CONFIG.advectionStrength

    const previousTarget = gl.getRenderTarget()
    const previousCubeFace = gl.getActiveCubeFace()
    const previousMipmapLevel = gl.getActiveMipmapLevel()
    const previousAutoClear = gl.autoClear
    const writeIndex = 1 - simulation.readIndex
    simulationUniforms.uPreviousState.value = simulation.initialized
      ? simulation.targets[simulation.readIndex].texture
      : simulation.zeroTexture
    gl.autoClear = false
    gl.setRenderTarget(simulation.targets[writeIndex])
    gl.clear(true, false, false)
    gl.render(simulation.scene, simulation.camera)
    gl.setRenderTarget(previousTarget, previousCubeFace, previousMipmapLevel)
    gl.autoClear = previousAutoClear
    simulation.readIndex = writeIndex
    simulation.initialized = true
    uniforms.uFluidState.value = simulation.targets[simulation.readIndex].texture

    gl.getDrawingBufferSize(resolutionRef.current)
    uniforms.uTime.value = clock.elapsedTime
    uniforms.uResolution.value.copy(resolutionRef.current)
    uniforms.uPointer.value.set(pointer.x, pointer.y)
    uniforms.uVelocity.value.copy(normalizedVelocity)
    uniforms.uReducedMotion.value = reducedMotion ? 1 : 0
    uniforms.uScrollProgress.value = scrollProgress
    uniforms.uPointerInfluence.value = pointerInfluence
    uniforms.uAmbientColor.value.copy(getEnvironmentAccent(
      carouselProgress,
      sectionProgress,
      ambientColorRef.current,
      clubColorRef.current,
    ))
  }, -1)

  return (
    <mesh frustumCulled={false} renderOrder={-1}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={liquidVertexShader}
        fragmentShader={liquidFragmentShader}
        depthTest={false}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  )
}

function HeroTitle3D({ pointerRef, scrollRef, reducedMotion, coarsePointer }) {
  const groupRef = useRef(null)
  const modelScaleRef = useRef(null)
  const keyLightRef = useRef(null)
  const violetLightRef = useRef(null)
  const cyanLightRef = useRef(null)
  const model = useLoader(GLTFLoader, HERO_MODEL_URL)
  const modelRoot = useMemo(() => {
    const root = model.scene.clone(true)
    // The supplied mesh is authored in an X/Z text plane with extrusion on Y.
    // +90° X maps its textured front toward the camera and puts TRIPO above CLUB.
    root.rotation.x = Math.PI / 2
    root.updateMatrixWorld(true)
    const bounds = new THREE.Box3().setFromObject(root)
    const center = bounds.getCenter(new THREE.Vector3())
    root.position.sub(center)
    root.updateMatrixWorld(true)
    root.traverse((object) => {
      if (!object.isMesh) return
      object.frustumCulled = true
      object.castShadow = false
      object.receiveShadow = false
      object.renderOrder = 2
      if (object.material) {
        object.material = object.material.clone()
        // Keep all GLB maps intact. These scalar values only lift the baked
        // front color out of a black reflection environment in this scene.
        object.material.metalness = Math.min(object.material.metalness, 0.46)
        object.material.roughness = Math.max(object.material.roughness, 0.32)
        object.material.envMapIntensity = 1.05
        object.material.side = THREE.DoubleSide
        object.material.needsUpdate = true
      }
    })
    return { root, bounds: new THREE.Box3().setFromObject(root) }
  }, [model])
  const boundsSize = useMemo(
    () => modelRoot.bounds.getSize(new THREE.Vector3()),
    [modelRoot],
  )

  useEffect(() => () => {
    modelRoot.root.traverse((object) => {
      if (!object.isMesh || !object.material) return
      object.material.dispose()
    })
  }, [modelRoot])

  useFrame(({ camera }, delta) => {
    const group = groupRef.current
    if (!group) return
    const pointer = pointerRef?.current ?? EMPTY_POINTER
    const progress = THREE.MathUtils.clamp(scrollRef?.current?.progress ?? 0, 0, 1)
    const easedProgress = THREE.MathUtils.smoothstep(progress, 0, 1)
    const pointerGate = 1 - THREE.MathUtils.smoothstep(progress, 0.02, 0.78)
    const compactViewport = coarsePointer || camera.aspect < 0.78
    const pointerMotionScale = reducedMotion ? 0 : compactViewport ? 0.54 : 1
    const scrollMotionScale = reducedMotion ? 0.18 : 1
    const targetRotationX = (
      -pointer.y * THREE.MathUtils.degToRad(3.2) * pointerGate * pointerMotionScale
      + easedProgress * THREE.MathUtils.degToRad(11.0) * scrollMotionScale
    )
    const targetRotationY = (
      pointer.x * THREE.MathUtils.degToRad(5.6) * pointerGate * pointerMotionScale
      - easedProgress * THREE.MathUtils.degToRad(8.0) * scrollMotionScale
    )
    const frameDamping = reducedMotion ? 15 : 8.5
    group.rotation.x = THREE.MathUtils.damp(group.rotation.x, targetRotationX, frameDamping, delta)
    group.rotation.y = THREE.MathUtils.damp(group.rotation.y, targetRotationY, frameDamping, delta)
    group.rotation.z = THREE.MathUtils.damp(
      group.rotation.z,
      pointer.x * pointer.y * -0.010 * pointerGate * pointerMotionScale,
      frameDamping,
      delta,
    )

    const initialZ = compactViewport ? 0.18 : 0.12
    const targetX = pointer.x * 0.070 * pointerGate * pointerMotionScale - easedProgress * 0.24
    // The supplied model is vertically centered in its measured bounds. Lift
    // it into the same editorial Hero safe area used by the former title so
    // the HTML kicker remains clear beneath the second line.
    const heroYOffset = compactViewport ? 0.22 : 0.30
    const targetY = heroYOffset
      + pointer.y * 0.042 * pointerGate * pointerMotionScale
      + easedProgress * 0.54
    const targetZ = initialZ - easedProgress * (compactViewport ? 8.4 : 10.2)
      + Math.hypot(pointer.x, pointer.y) * 0.025 * pointerGate * pointerMotionScale
    group.position.x = THREE.MathUtils.damp(group.position.x, targetX, frameDamping, delta)
    group.position.y = THREE.MathUtils.damp(group.position.y, targetY, frameDamping, delta)
    group.position.z = THREE.MathUtils.damp(group.position.z, targetZ, reducedMotion ? 18 : 10, delta)

    // Frame against the active perspective rather than CSS pixels. The title
    // keeps its authored proportions while gaining true camera depth on every
    // viewport, including the 390x844 compact layout.
    const cameraDistance = Math.max(0.5, camera.position.z - initialZ)
    const visibleHeight = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5) * cameraDistance
    const visibleWidth = visibleHeight * camera.aspect
    const widthShare = compactViewport ? 0.76 : 0.58
    const heightShare = compactViewport ? 0.245 : 0.34
    const framingScale = Math.min(
      (visibleWidth * widthShare) / Math.max(boundsSize.x, 0.001),
      (visibleHeight * heightShare) / Math.max(boundsSize.y, 0.001),
    )
    const scrollScale = THREE.MathUtils.lerp(1, reducedMotion ? 0.80 : 0.68, easedProgress)
    // Recession does the visual hand-off without transparent TextGeometry:
    // the object becomes physically tiny before it is culled, avoiding both
    // a visible pop and depth-sorting artefacts against the event frames.
    const exitScale = THREE.MathUtils.lerp(
      1,
      0.025,
      THREE.MathUtils.smoothstep(progress, 0.42, 0.72),
    )
    const targetScale = framingScale * scrollScale * exitScale
    const scaleDamping = reducedMotion ? 18 : 12
    if (modelScaleRef.current) {
      modelScaleRef.current.scale.setScalar(
        THREE.MathUtils.damp(modelScaleRef.current.scale.x, targetScale, scaleDamping, delta),
      )
    }

    const presence = 1 - THREE.MathUtils.smoothstep(progress, 0.34, 0.70)
    group.visible = progress < 0.72
    if (keyLightRef.current) keyLightRef.current.intensity = presence * 1.85
    if (violetLightRef.current) violetLightRef.current.intensity = presence * 2.35
    if (cyanLightRef.current) {
      cyanLightRef.current.intensity = presence * 1.15
      cyanLightRef.current.position.x = THREE.MathUtils.damp(
        cyanLightRef.current.position.x,
        pointer.x * 2.20 * pointerGate * pointerMotionScale,
        6,
        delta,
      )
      cyanLightRef.current.position.y = THREE.MathUtils.damp(
        cyanLightRef.current.position.y,
        pointer.y * 1.20 * pointerGate * pointerMotionScale,
        6,
        delta,
      )
    }
  })

  return (
    <group ref={groupRef} name="hero-title-3d-glb">
      <group ref={modelScaleRef}>
        <primitive object={modelRoot.root} />
      </group>
      <pointLight
        ref={keyLightRef}
        intensity={1.85}
        color="#ffffff"
        distance={7.5}
        decay={2}
        position={[-1.6, 2.6, 3.4]}
      />
      <pointLight
        ref={violetLightRef}
        intensity={2.35}
        color="#6f46ff"
        distance={6.5}
        decay={2}
        position={[-2.2, 0.1, 1.8]}
      />
      <pointLight
        ref={cyanLightRef}
        intensity={1.15}
        color="#5deaff"
        distance={5.8}
        decay={2}
        position={[2.0, -0.5, 1.7]}
      />
      <hemisphereLight
        color="#dce8ff"
        groundColor="#160c38"
        intensity={0.72}
      />
    </group>
  )
}

function createLabelTexture(lines, colour, width = 640, height = 180, emphasis = 1) {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) return null

  context.clearRect(0, 0, width, height)
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillStyle = colour
  context.font = `500 ${26 * emphasis}px SFMono-Regular, Consolas, Liberation Mono, monospace`
  context.globalAlpha = 0.92
  context.fillText(lines[0], width * 0.5, height * 0.36)
  context.font = `500 ${42 * emphasis}px SFMono-Regular, Consolas, Liberation Mono, monospace`
  context.globalAlpha = 0.58
  context.fillText(lines[1], width * 0.5, height * 0.70)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.needsUpdate = true
  return texture
}

const CAROUSEL_RADIUS = 1.42
const EVENT_HOVER_STOP_TOLERANCE = 0.045
const EVENT_HOVER_SPEED_TOLERANCE = 0.055
const EVENT_LAYOUT = EVENT_CONFIG.map((event, index) => ({
  ...event,
  angle: index * Math.PI * 0.5,
  // Depth, rather than event index, establishes the active hierarchy. This
  // keeps every event equally capable of becoming the primary front frame.
  scale: 0.90,
  edgeOpacity: 0.68,
  fillOpacity: 0.12,
  labelOpacity: 0.72,
  ringOpacity: 0.58,
}))

function SculptureVisual({ accent, reducedMotion }) {
  const groupRef = useRef(null)
  const coreRef = useRef(null)
  const ringRefs = useRef([])

  useFrame(({ clock }) => {
    if (!groupRef.current) return
    const time = clock.elapsedTime
    const motion = reducedMotion ? 0 : 1
    groupRef.current.rotation.y = time * 0.16 * motion
    groupRef.current.rotation.x = Math.sin(time * 0.33) * 0.09 * motion
    groupRef.current.position.y = Math.sin(time * 0.48) * 0.035 * motion
    if (coreRef.current) {
      const breathe = 1 + Math.sin(time * 0.72) * 0.055 * motion
      coreRef.current.scale.setScalar(breathe)
    }
    ringRefs.current.forEach((ring, index) => {
      if (!ring) return
      ring.rotation.z = time * (index % 2 ? -0.22 : 0.28) * motion
      ring.rotation.x = Math.sin(time * 0.29 + index) * 0.18 * motion
    })
  })

  return (
    <group ref={groupRef} position={[0, 0.02, 0]}>
      <mesh ref={coreRef} userData={{ baseOpacity: 0.72 }}>
        <icosahedronGeometry args={[0.28, 2]} />
        <meshStandardMaterial
          color="#100d22"
          emissive={accent}
          emissiveIntensity={0.75}
          metalness={0.86}
          roughness={0.28}
          transparent
          opacity={0.72}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh userData={{ baseOpacity: 0.62 }}>
        <icosahedronGeometry args={[0.34, 1]} />
        <meshBasicMaterial color={accent} wireframe transparent opacity={0.62} depthWrite={false} toneMapped={false} />
      </mesh>
      {[0.42, 0.53, 0.65].map((radius, index) => (
        <mesh
          key={`sculpture-ring-${radius}`}
          ref={(node) => { ringRefs.current[index] = node }}
          rotation={[index * 0.42, index * 0.28, index * 0.18]}
          userData={{ baseOpacity: 0.36 - index * 0.055 }}
        >
          <torusGeometry args={[radius, 0.012 + (2 - index) * 0.003, 8, 48]} />
          <meshBasicMaterial color={accent} transparent opacity={0.36 - index * 0.055} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
      <mesh rotation={[Math.PI * 0.5, 0, 0]} userData={{ baseOpacity: 0.28 }}>
        <sphereGeometry args={[0.47, 16, 10]} />
        <meshBasicMaterial color={accent} wireframe transparent opacity={0.28} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  )
}

function PortalVisual({ accent, reducedMotion }) {
  const groupRef = useRef(null)
  const orbRef = useRef(null)
  const ringRefs = useRef([])

  useFrame(({ clock }) => {
    if (!groupRef.current) return
    const time = clock.elapsedTime
    const motion = reducedMotion ? 0 : 1
    groupRef.current.rotation.y = Math.sin(time * 0.24) * 0.10 * motion
    groupRef.current.position.y = Math.sin(time * 0.42 + 0.6) * 0.028 * motion
    if (orbRef.current) {
      orbRef.current.position.z = Math.sin(time * 0.68) * 0.055 * motion
      orbRef.current.scale.setScalar(1 + Math.sin(time * 0.85) * 0.08 * motion)
    }
    ringRefs.current.forEach((ring, index) => {
      if (!ring) return
      ring.rotation.z = (index % 2 ? -1 : 1) * time * (0.16 + index * 0.045) * motion
      ring.position.z = (index - 1) * 0.075 + Math.sin(time * 0.44 + index) * 0.018 * motion
    })
  })

  return (
    <group ref={groupRef} position={[0, 0.02, 0]}>
      {[0.40, 0.52, 0.64].map((radius, index) => (
        <mesh
          key={`portal-ring-${radius}`}
          ref={(node) => { ringRefs.current[index] = node }}
          userData={{ baseOpacity: 0.47 - index * 0.065 }}
        >
          <torusGeometry args={[radius, 0.016 - index * 0.002, 10, 56]} />
          <meshBasicMaterial color={accent} transparent opacity={0.47 - index * 0.065} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
      <mesh ref={orbRef} position={[0, 0, 0]} userData={{ baseOpacity: 0.78 }}>
        <sphereGeometry args={[0.17, 18, 12]} />
        <meshStandardMaterial
          color="#071328"
          emissive={accent}
          emissiveIntensity={1.4}
          metalness={0.4}
          roughness={0.22}
          transparent
          opacity={0.78}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh userData={{ baseOpacity: 0.28 }}>
        <boxGeometry args={[0.94, 0.94, 0.025]} />
        <meshBasicMaterial color={accent} wireframe transparent opacity={0.28} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh rotation={[Math.PI * 0.5, 0, 0]} userData={{ baseOpacity: 0.22 }}>
        <ringGeometry args={[0.72, 0.735, 48]} />
        <meshBasicMaterial color={accent} transparent opacity={0.22} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  )
}

const NETWORK_NODES = [
  [-0.42, 0.15, 0.03],
  [-0.12, 0.36, -0.04],
  [0.22, 0.26, 0.02],
  [0.43, -0.07, -0.02],
  [0.08, -0.30, 0.04],
  [-0.30, -0.22, -0.01],
]

function NetworkVisual({ accent, reducedMotion }) {
  const groupRef = useRef(null)
  const nodeRefs = useRef([])
  const edgeGeometry = useMemo(() => {
    const points = []
    const edges = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [1, 4], [2, 5]]
    edges.forEach(([from, to]) => {
      points.push(new THREE.Vector3(...NETWORK_NODES[from]))
      points.push(new THREE.Vector3(...NETWORK_NODES[to]))
    })
    return new THREE.BufferGeometry().setFromPoints(points)
  }, [])

  useFrame(({ clock }) => {
    if (!groupRef.current) return
    const time = clock.elapsedTime
    const motion = reducedMotion ? 0 : 1
    groupRef.current.rotation.y = time * 0.12 * motion
    groupRef.current.rotation.x = Math.sin(time * 0.28) * 0.08 * motion
    nodeRefs.current.forEach((node, index) => {
      if (!node) return
      const pulse = 1 + Math.sin(time * 0.72 + index * 0.86) * 0.22 * motion
      node.scale.setScalar(pulse)
    })
  })

  return (
    <group ref={groupRef} position={[0, 0.02, 0]}>
      <lineSegments userData={{ baseOpacity: 0.54 }}>
        <primitive object={edgeGeometry} attach="geometry" />
        <lineBasicMaterial color={accent} transparent opacity={0.54} depthWrite={false} toneMapped={false} />
      </lineSegments>
      {NETWORK_NODES.map((position, index) => (
        <mesh
          key={`network-node-${index}`}
          ref={(node) => { nodeRefs.current[index] = node }}
          position={position}
          userData={{ baseOpacity: index === 0 ? 0.85 : 0.66 }}
        >
          <sphereGeometry args={[index === 0 ? 0.065 : 0.045, 10, 8]} />
          <meshBasicMaterial color={accent} transparent opacity={index === 0 ? 0.85 : 0.66} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
      <mesh rotation={[Math.PI * 0.5, 0, 0]} userData={{ baseOpacity: 0.28 }}>
        <torusGeometry args={[0.44, 0.009, 8, 48]} />
        <meshBasicMaterial color={accent} transparent opacity={0.28} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  )
}

function MonolithVisual({ accent, reducedMotion }) {
  const groupRef = useRef(null)
  const monolithRefs = useRef([])
  const geometry = useMemo(() => new THREE.BoxGeometry(0.30, 0.72, 0.30), [])

  useFrame(({ clock }) => {
    if (!groupRef.current) return
    const time = clock.elapsedTime
    const motion = reducedMotion ? 0 : 1
    groupRef.current.rotation.y = Math.sin(time * 0.20) * 0.13 * motion
    groupRef.current.rotation.x = Math.sin(time * 0.31) * 0.055 * motion
    monolithRefs.current.forEach((monolith, index) => {
      if (!monolith) return
      monolith.position.y = monolith.userData.baseY + Math.sin(time * 0.48 + index * 1.4) * 0.035 * motion
      monolith.rotation.z = Math.sin(time * 0.26 + index) * 0.045 * motion
    })
  })

  const placements = [
    [-0.32, 0.03, -0.04, 0.82, 0.85],
    [0.02, 0.10, 0.02, 1.0, 1.0],
    [0.34, -0.04, -0.02, 0.76, 0.72],
  ]

  return (
    <group ref={groupRef} position={[0, 0.01, 0]}>
      {placements.map(([x, y, z, scale, opacity], index) => (
        <group
          key={`monolith-${index}`}
          ref={(node) => { monolithRefs.current[index] = node }}
          position={[x, y, z]}
          scale={[scale, scale, scale]}
          userData={{ baseY: y }}
        >
          <mesh userData={{ baseOpacity: 0.32 * opacity }}>
            <primitive object={geometry} attach="geometry" />
            <meshBasicMaterial color="#100914" transparent opacity={0.32 * opacity} depthWrite={false} toneMapped={false} />
          </mesh>
          <mesh userData={{ baseOpacity: 0.62 * opacity }}>
            <primitive object={geometry} attach="geometry" />
            <meshBasicMaterial color={accent} wireframe transparent opacity={0.62 * opacity} depthWrite={false} toneMapped={false} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 0.06, 0.03]} rotation={[0, 0, Math.PI * 0.25]} userData={{ baseOpacity: 0.46 }}>
        <octahedronGeometry args={[0.31, 1]} />
        <meshBasicMaterial color={accent} wireframe transparent opacity={0.46} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  )
}

function EventCenterpiece({ event, reducedMotion }) {
  if (event.visualType === 'portal') return <PortalVisual accent={event.accent} reducedMotion={reducedMotion} />
  if (event.visualType === 'network') return <NetworkVisual accent={event.accent} reducedMotion={reducedMotion} />
  if (event.visualType === 'monolith') return <MonolithVisual accent={event.accent} reducedMotion={reducedMotion} />
  return <SculptureVisual accent={event.accent} reducedMotion={reducedMotion} />
}

function EventSpacePlaceholders({
  scrollRef,
  expansionRef,
  onOpenEvent,
  interactionApiRef,
  reducedMotion,
  coarsePointer,
  clubStackRef,
}) {
  const eventStackRef = useRef(null)
  const worldRef = useRef(null)
  const orbitRef = useRef(null)
  const eventRefs = useRef([])
  const presentationRefs = useRef([])
  const hoverRefs = useRef([])
  const centerpieceRefs = useRef([])
  const labelRefs = useRef([])
  const identityRef = useRef(null)
  const ambientLightRef = useRef(null)
  const accentLightRef = useRef(null)
  const hoverCursorIndexRef = useRef(null)
  const hoverGateRef = useRef({ enabled: false, activeIndex: 0 })
  const carouselMotionRef = useRef({ previous: null, speed: 0 })
  const hoverStatesRef = useRef(EVENT_LAYOUT.map(() => ({
    hovered: false,
    targetX: 0,
    targetY: 0,
    x: 0,
    y: 0,
    strength: 0,
  })))
  const frameGeometry = useMemo(() => new THREE.PlaneGeometry(1.62, 0.94), [])
  const edgeGeometry = useMemo(() => new THREE.EdgesGeometry(frameGeometry), [frameGeometry])
  const eventTextures = useMemo(() => EVENT_LAYOUT.map((event) => createLabelTexture([event.title, `${event.number} / ${event.subtitle}`], event.accent, 720, 180, 0.92)), [])
  const identityTexture = useMemo(() => createLabelTexture(['TRIPO CLUB', 'EVENT SPACE'], '#9ceaf0', 900, 180, 1.28), [])
  const worldPosition = useMemo(() => new THREE.Vector3(), [])
  const targetWorldPosition = useMemo(() => new THREE.Vector3(), [])
  const targetLocalPosition = useMemo(() => new THREE.Vector3(), [])
  const cameraDirection = useMemo(() => new THREE.Vector3(), [])
  const cameraWorldQuaternion = useMemo(() => new THREE.Quaternion(), [])
  const parentWorldQuaternion = useMemo(() => new THREE.Quaternion(), [])
  const parentWorldScale = useMemo(() => new THREE.Vector3(1, 1, 1), [])
  const targetLocalQuaternion = useMemo(() => new THREE.Quaternion(), [])
  const identityQuaternion = useMemo(() => new THREE.Quaternion(), [])
  const ambientColorRef = useRef(new THREE.Color())
  const clubColorRef = useRef(new THREE.Color())

  const clearCursorOverride = (index) => {
    if (hoverCursorIndexRef.current !== index) return
    interactionApiRef?.current?.clearOverride?.('active-event')
    hoverCursorIndexRef.current = null
  }

  const resetEventHover = (index) => {
    const hoverState = hoverStatesRef.current[index]
    if (hoverState) {
      hoverState.hovered = false
      hoverState.targetX = 0
      hoverState.targetY = 0
    }
    clearCursorOverride(index)
  }

  const updateEventHover = (pointerEvent, index) => {
    const gate = hoverGateRef.current
    if (!gate.enabled || gate.activeIndex !== index) {
      resetEventHover(index)
      return
    }

    pointerEvent.stopPropagation()
    const hoverState = hoverStatesRef.current[index]
    if (!hoverState) return
    const pointerX = pointerEvent.uv
      ? pointerEvent.uv.x * 2 - 1
      : pointerEvent.pointer?.x ?? 0
    const pointerY = pointerEvent.uv
      ? pointerEvent.uv.y * 2 - 1
      : pointerEvent.pointer?.y ?? 0
    hoverState.hovered = true
    hoverState.targetX = THREE.MathUtils.clamp(pointerX, -1, 1)
    hoverState.targetY = THREE.MathUtils.clamp(pointerY, -1, 1)

    if (hoverCursorIndexRef.current !== index) {
      if (hoverCursorIndexRef.current !== null) {
        interactionApiRef?.current?.clearOverride?.('active-event')
      }
      interactionApiRef?.current?.setOverride?.(
        'active-event',
        'explore',
        EVENT_LAYOUT[index].accent,
      )
      hoverCursorIndexRef.current = index
    }
  }

  useEffect(() => () => {
    interactionApiRef?.current?.clearOverride?.('active-event')
  }, [interactionApiRef])

  useFrame(({ camera }, delta) => {
    const transitionProgress = THREE.MathUtils.clamp(scrollRef?.current?.progress ?? 0, 0, 1)
    const carouselProgress = THREE.MathUtils.clamp(scrollRef?.current?.carouselProgress ?? 0, 0, 1)
    const sectionProgress = THREE.MathUtils.clamp(scrollRef?.current?.sectionProgress ?? 0, 0, 1)
    const roomProgress = THREE.MathUtils.smoothstep(transitionProgress, 0, 1)
    const cameraDrift = Math.sin(roomProgress * Math.PI)
    const carouselAngle = -carouselProgress * Math.PI * 1.5
    const ambientColor = getEnvironmentAccent(
      carouselProgress,
      sectionProgress,
      ambientColorRef.current,
      clubColorRef.current,
    )
    const expansion = expansionRef?.current ?? { phase: 'carousel', progress: 0, selectedIndex: null }
    const expansionProgress = THREE.MathUtils.clamp(expansion.progress ?? 0, 0, 1)
    const selectedIndex = expansion.selectedIndex
    const compact = coarsePointer || camera.aspect < 0.78
    const scaledCarouselProgress = carouselProgress * Math.max(EVENT_LAYOUT.length - 1, 1)
    const activeIndex = THREE.MathUtils.clamp(
      Math.round(scaledCarouselProgress),
      0,
      EVENT_LAYOUT.length - 1,
    )
    const previousCarouselProgress = carouselMotionRef.current.previous
    const carouselSpeed = previousCarouselProgress === null
      ? 0
      : Math.abs(carouselProgress - previousCarouselProgress) / Math.max(delta, 1 / 240)
    carouselMotionRef.current.previous = carouselProgress
    carouselMotionRef.current.speed = THREE.MathUtils.damp(
      carouselMotionRef.current.speed,
      carouselSpeed,
      12,
      delta,
    )
    const carouselIsSettled = (
      Math.abs(scaledCarouselProgress - activeIndex) <= EVENT_HOVER_STOP_TOLERANCE
      && carouselMotionRef.current.speed <= EVENT_HOVER_SPEED_TOLERANCE
    )
    const hoverEnabled = (
      !coarsePointer
      && transitionProgress > 0.985
      && sectionProgress < 0.025
      && expansion.phase === 'carousel'
      && expansionProgress < 0.001
      && carouselIsSettled
    )
    hoverGateRef.current.enabled = hoverEnabled
    hoverGateRef.current.activeIndex = activeIndex
    if (
      hoverCursorIndexRef.current !== null
      && (!hoverEnabled || hoverCursorIndexRef.current !== activeIndex)
    ) {
      resetEventHover(hoverCursorIndexRef.current)
    }
    const cameraSectionProgress = THREE.MathUtils.smoothstep(sectionProgress, 0.08, 1)
    const cameraMotionScale = reducedMotion ? 0.35 : compact ? 0.60 : 1
    const eventStackOpacity = THREE.MathUtils.lerp(
      1,
      0.12,
      THREE.MathUtils.smoothstep(sectionProgress, 0.40, 1),
    )

    camera.position.x = cameraDrift * 0.16
      + Math.sin(carouselAngle) * 0.035 * roomProgress
      - cameraSectionProgress * 0.06 * cameraMotionScale
    camera.position.y = Math.sin(roomProgress * Math.PI * 0.8) * 0.10
      + Math.cos(carouselAngle) * 0.018 * roomProgress
      + cameraSectionProgress * 0.035 * cameraMotionScale
    camera.position.z = THREE.MathUtils.lerp(5, 3.25, roomProgress)
      - cameraSectionProgress * 0.16 * cameraMotionScale
    camera.fov = THREE.MathUtils.lerp(45, 51, roomProgress)
      - cameraSectionProgress * 1.2 * cameraMotionScale
    camera.lookAt(
      -cameraSectionProgress * 0.012 * cameraMotionScale,
      cameraSectionProgress * 0.012 * cameraMotionScale,
      -1.2 - cameraSectionProgress * 0.18 * cameraMotionScale,
    )
    camera.updateProjectionMatrix()

    applySectionPose(eventStackRef.current, sectionProgress, EVENT_STACK_POSES, {
      compact,
      reducedMotion,
      preserveStart: true,
    })
    applySectionPose(clubStackRef?.current, sectionProgress, CLUB_STACK_POSES, {
      compact,
      reducedMotion,
    })
    // Keep the Club section mounted throughout the journey while ensuring the
    // established Hero and carousel are visually untouched at exact progress 0.
    if (clubStackRef?.current) clubStackRef.current.visible = sectionProgress > 0.001

    if (!worldRef.current || !orbitRef.current) return
    const viewportLayoutScale = THREE.MathUtils.clamp(camera.aspect / 1.15, 0.52, 1)
    worldRef.current.position.z = THREE.MathUtils.lerp(-11, -0.42, roomProgress)
    worldRef.current.position.y = THREE.MathUtils.lerp(0.10, 0, roomProgress)
    worldRef.current.scale.setScalar(THREE.MathUtils.lerp(0.16, 0.78, roomProgress) * viewportLayoutScale)
    worldRef.current.rotation.y = THREE.MathUtils.lerp(-0.08, 0.10, roomProgress)
    worldRef.current.rotation.x = THREE.MathUtils.lerp(0.05, -0.025, roomProgress)
    orbitRef.current.rotation.y = carouselAngle
    orbitRef.current.updateWorldMatrix(true, true)
    camera.getWorldDirection(cameraDirection)
    camera.getWorldQuaternion(cameraWorldQuaternion)

    if (ambientLightRef.current) {
      ambientLightRef.current.color.copy(ambientColor)
      ambientLightRef.current.intensity = THREE.MathUtils.lerp(0.02, 0.11, roomProgress) * eventStackOpacity
    }
    const activeHoverState = hoverStatesRef.current[activeIndex]
    const hoverMotionScale = reducedMotion ? 0.24 : 1
    const activeHoverStrength = (activeHoverState?.strength ?? 0) * hoverMotionScale
    if (accentLightRef.current) {
      accentLightRef.current.color.copy(ambientColor).lerp(
        EVENT_ACCENT_COLORS[activeIndex],
        activeHoverStrength * 0.34,
      )
      accentLightRef.current.intensity = (
        THREE.MathUtils.lerp(0.02, 0.48, roomProgress)
        + activeHoverStrength * 0.14
      ) * eventStackOpacity
      accentLightRef.current.position.set(
        (activeHoverState?.x ?? 0) * activeHoverStrength * 0.32,
        0.24 + (activeHoverState?.y ?? 0) * activeHoverStrength * 0.18,
        0.62 + activeHoverStrength * 0.32,
      )
    }

    eventRefs.current.forEach((eventGroup, index) => {
      if (!eventGroup) return
      const hoverState = hoverStatesRef.current[index]
      const hoverIsEligible = hoverEnabled && index === activeIndex
      if (!hoverIsEligible && hoverState.hovered) resetEventHover(index)
      const hoverTarget = hoverIsEligible && hoverState.hovered ? 1 : 0
      hoverState.strength = THREE.MathUtils.damp(
        hoverState.strength,
        hoverTarget,
        reducedMotion ? 6 : 11,
        delta,
      )
      hoverState.x = THREE.MathUtils.damp(
        hoverState.x,
        hoverTarget ? hoverState.targetX : 0,
        reducedMotion ? 6 : 10,
        delta,
      )
      hoverState.y = THREE.MathUtils.damp(
        hoverState.y,
        hoverTarget ? hoverState.targetY : 0,
        reducedMotion ? 6 : 10,
        delta,
      )
      const hoverStrength = hoverState.strength * hoverMotionScale
      const hoverGroup = hoverRefs.current[index]
      if (hoverGroup) {
        hoverGroup.rotation.x = -hoverState.y * hoverStrength * 0.052
        hoverGroup.rotation.y = hoverState.x * hoverStrength * 0.070
        hoverGroup.rotation.z = hoverState.x * hoverState.y * hoverStrength * -0.006
        hoverGroup.position.z = hoverStrength * 0.026
        hoverGroup.scale.setScalar(1 + hoverStrength * 0.016)
      }
      const centerpiece = centerpieceRefs.current[index]
      if (centerpiece) {
        centerpiece.position.set(
          hoverState.x * hoverStrength * 0.032,
          hoverState.y * hoverStrength * 0.024,
          hoverStrength * 0.018,
        )
      }
      eventGroup.getWorldPosition(worldPosition)
      const frontness = THREE.MathUtils.clamp((worldPosition.z + CAROUSEL_RADIUS) / (CAROUSEL_RADIUS * 2), 0, 1)
      const foreground = THREE.MathUtils.smoothstep(frontness, 0.18, 0.82)
      eventGroup.scale.setScalar(EVENT_LAYOUT[index].scale * THREE.MathUtils.lerp(0.76, 1.04, foreground))
      const isSelected = index === selectedIndex
      const otherEventFade = selectedIndex === null || isSelected
        ? 1
        : THREE.MathUtils.lerp(1, 0.10, expansionProgress)
      eventGroup.traverse((object) => {
        if (!object.material) return
        const baseOpacity = object.userData?.baseOpacity ?? 0
        const depthOpacity = THREE.MathUtils.lerp(0.42, 1, foreground)
        const selectedLift = isSelected ? THREE.MathUtils.lerp(1, 1.14, expansionProgress) : 1
        const hoverResponse = object.userData?.hoverResponse
          ?? (object.isLineSegments ? 0.72 : 0.24)
        const hoverLift = 1 + hoverStrength * hoverResponse * 0.26
        object.material.opacity = Math.min(1, baseOpacity
          * roomProgress
          * depthOpacity
          * otherEventFade
          * selectedLift
          * eventStackOpacity
          * hoverLift)
        if ('emissiveIntensity' in object.material) {
          if (!Number.isFinite(object.material.userData.eventBaseEmissiveIntensity)) {
            object.material.userData.eventBaseEmissiveIntensity = object.material.emissiveIntensity
          }
          object.material.emissiveIntensity = object.material.userData.eventBaseEmissiveIntensity
            * (1 + hoverStrength * 0.16)
        }
      })

      const presentation = presentationRefs.current[index]
      if (presentation) {
        if (isSelected && expansionProgress > 0) {
          const distance = THREE.MathUtils.lerp(1.52, 0.86, expansionProgress)
          targetWorldPosition.copy(camera.position).addScaledVector(cameraDirection, distance)
          targetWorldPosition.y += THREE.MathUtils.lerp(0.02, 0.03, expansionProgress)
          targetLocalPosition.copy(targetWorldPosition)
          eventGroup.worldToLocal(targetLocalPosition)
          eventGroup.getWorldQuaternion(parentWorldQuaternion)
          targetLocalQuaternion.copy(parentWorldQuaternion).invert().multiply(cameraWorldQuaternion)

          const verticalFov = THREE.MathUtils.degToRad(camera.fov)
          const viewportHeight = 2 * Math.tan(verticalFov * 0.5) * distance
          const viewportWidth = viewportHeight * camera.aspect
          eventGroup.getWorldScale(parentWorldScale)
          const parentScale = Math.max(parentWorldScale.x, 0.0001)
          const coverScale = Math.max(viewportWidth / 1.62, viewportHeight / 0.94) * 1.04 / parentScale
          presentation.position.copy(targetLocalPosition).multiplyScalar(expansionProgress)
          presentation.quaternion.copy(identityQuaternion).slerp(targetLocalQuaternion, expansionProgress)
          presentation.scale.setScalar(THREE.MathUtils.lerp(1, coverScale, expansionProgress))
        } else {
          presentation.position.set(0, 0, 0)
          presentation.quaternion.identity()
          presentation.scale.setScalar(1)
        }
      }
      const label = labelRefs.current[index]
      if (label) label.lookAt(camera.position)
    })

    if (identityRef.current) {
      identityRef.current.material.opacity = 0.58 * roomProgress * eventStackOpacity
      identityRef.current.lookAt(camera.position)
    }
  })

  return (
    <group ref={eventStackRef} name="event-space-section">
      <group ref={worldRef}>
        <group ref={orbitRef}>
        {EVENT_LAYOUT.map((event, index) => {
          const position = [
            Math.sin(event.angle) * CAROUSEL_RADIUS,
            0,
            Math.cos(event.angle) * CAROUSEL_RADIUS,
          ]
          return (
            <group
              key={`event-carousel-${event.id}`}
              ref={(node) => { eventRefs.current[index] = node }}
              position={position}
              rotation={[0.03 * Math.sin(event.angle), event.angle, 0]}
            >
              <group
                ref={(node) => { presentationRefs.current[index] = node }}
              >
                <mesh
                  name={`event-${event.id}-hit-area`}
                  position={[0, 0, 0.40]}
                  onPointerOver={(pointerEvent) => updateEventHover(pointerEvent, index)}
                  onPointerMove={(pointerEvent) => updateEventHover(pointerEvent, index)}
                  onPointerOut={() => resetEventHover(index)}
                  onClick={(pointerEvent) => {
                  const expansion = expansionRef?.current
                  const transitionProgress = scrollRef?.current?.progress ?? 0
                  const sectionProgress = scrollRef?.current?.sectionProgress ?? 0
                  const activeIndex = Math.round((scrollRef?.current?.carouselProgress ?? 0) * (EVENT_LAYOUT.length - 1))
                  if (
                    transitionProgress > 0.94
                    && sectionProgress < 0.10
                    && expansion?.phase === 'carousel'
                    && activeIndex === index
                  ) {
                    pointerEvent.stopPropagation()
                    onOpenEvent?.(index)
                  }
                }}
                >
                  <primitive object={frameGeometry} attach="geometry" />
                  <meshBasicMaterial transparent opacity={0} colorWrite={false} depthWrite={false} toneMapped={false} />
                </mesh>
                <group ref={(node) => { hoverRefs.current[index] = node }}>
                  <mesh userData={{ baseOpacity: event.fillOpacity, hoverResponse: 0.20 }}>
                    <primitive object={frameGeometry} attach="geometry" />
                    <meshBasicMaterial color="#071016" transparent opacity={0} depthWrite={false} toneMapped={false} />
                  </mesh>
                  <lineSegments userData={{ baseOpacity: event.edgeOpacity, hoverResponse: 1 }}>
                    <primitive object={edgeGeometry} attach="geometry" />
                    <lineBasicMaterial color={event.accent} transparent opacity={0} depthWrite={false} toneMapped={false} />
                  </lineSegments>
                  <mesh
                    ref={(node) => { labelRefs.current[index] = node }}
                    position={[0, 0, 0.022]}
                    userData={{ baseOpacity: event.labelOpacity, hoverResponse: 0.14 }}
                  >
                    <planeGeometry args={[1.16, 0.326]} />
                    <meshBasicMaterial map={eventTextures[index]} side={THREE.DoubleSide} transparent opacity={0} depthWrite={false} toneMapped={false} />
                  </mesh>
                  <mesh position={[0, 0, 0.032]} userData={{ baseOpacity: event.ringOpacity, hoverResponse: 0.72 }}>
                    <ringGeometry args={[0.17, 0.19, 40]} />
                    <meshBasicMaterial color={event.accent} transparent opacity={0} depthWrite={false} toneMapped={false} />
                  </mesh>
                  <group ref={(node) => { centerpieceRefs.current[index] = node }}>
                    <EventCenterpiece event={event} reducedMotion={reducedMotion} />
                  </group>
                </group>
              </group>
            </group>
          )
        })}
        </group>
        <ambientLight ref={ambientLightRef} color={EVENT_CONFIG[0].accent} intensity={0.02} />
        <pointLight ref={accentLightRef} color={EVENT_CONFIG[0].accent} intensity={0.02} distance={3.4} decay={2} position={[0, 0.24, 0.62]} />
        <mesh ref={identityRef} position={[0, 0.27, 0.055]} scale={[1.10, 1.10, 1]} userData={{ baseOpacity: 0.58 }}>
          <planeGeometry args={[1.42, 0.284]} />
          <meshBasicMaterial map={identityTexture} transparent opacity={0} depthWrite={false} toneMapped={false} />
        </mesh>
      </group>
    </group>
  )
}

function Scene({ pointerRef, scrollRef, expansionRef, onOpenEvent, interactionApiRef }) {
  const clubStackRef = useRef(null)
  const coarsePointer = useMediaQuery('(hover: none), (pointer: coarse)')
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  return (
    <div className="canvas-layer" aria-hidden="true">
      <Canvas
        camera={{ position: [0, 0, 5], fov: 45, near: 0.1, far: 100 }}
        dpr={[1, coarsePointer ? 1.25 : 1.6]}
        gl={{ antialias: false, alpha: false, powerPreference: 'high-performance' }}
      >
        <LiquidDistortion pointerRef={pointerRef} scrollRef={scrollRef} reducedMotion={reducedMotion} coarsePointer={coarsePointer} />
        <EventSpacePlaceholders
          scrollRef={scrollRef}
          expansionRef={expansionRef}
          onOpenEvent={onOpenEvent}
          interactionApiRef={interactionApiRef}
          reducedMotion={reducedMotion}
          coarsePointer={coarsePointer}
          clubStackRef={clubStackRef}
        />
        <Suspense fallback={null}>
          <HeroTitle3D
            pointerRef={pointerRef}
            scrollRef={scrollRef}
            reducedMotion={reducedMotion}
            coarsePointer={coarsePointer}
          />
        </Suspense>
        <ClubExperience3D
          groupRef={clubStackRef}
          scrollRef={scrollRef}
          reducedMotion={reducedMotion}
          coarsePointer={coarsePointer}
        />
      </Canvas>
    </div>
  )
}

export default Scene
