import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'

const CLUB_COLOURS = {
  violet: '#866cff',
  blue: '#527dff',
  cyan: '#55dfe5',
  ink: '#050912',
  panel: '#08111d',
}

const DESKTOP_FRAMES = [
  { position: [-1.78, 0.24, -2.18], scale: [1.22, 2.18, 0.16], rotation: [0.02, 0.18, -0.025], colour: CLUB_COLOURS.violet, opacity: 0.25 },
  { position: [1.72, 0.34, -2.02], scale: [1.10, 1.72, 0.14], rotation: [-0.02, -0.20, 0.03], colour: CLUB_COLOURS.cyan, opacity: 0.22 },
  { position: [-1.34, -0.20, -1.18], scale: [0.82, 1.34, 0.12], rotation: [0.01, 0.28, -0.04], colour: CLUB_COLOURS.blue, opacity: 0.29 },
  { position: [1.32, -0.16, -0.92], scale: [0.74, 1.22, 0.12], rotation: [-0.02, -0.30, 0.035], colour: CLUB_COLOURS.violet, opacity: 0.30 },
  { position: [-0.76, 0.72, -1.72], scale: [0.64, 0.72, 0.10], rotation: [0.03, 0.12, 0.08], colour: CLUB_COLOURS.cyan, opacity: 0.21 },
  { position: [0.88, 0.76, -1.44], scale: [0.56, 0.68, 0.10], rotation: [-0.02, -0.12, -0.07], colour: CLUB_COLOURS.blue, opacity: 0.22 },
]

const MOBILE_FRAMES = [
  { position: [-0.74, 0.22, -2.08], scale: [0.48, 1.76, 0.12], rotation: [0.01, 0.16, -0.025], colour: CLUB_COLOURS.violet, opacity: 0.24 },
  { position: [0.72, 0.30, -1.90], scale: [0.46, 1.42, 0.12], rotation: [-0.01, -0.17, 0.025], colour: CLUB_COLOURS.cyan, opacity: 0.23 },
  { position: [-0.59, -0.28, -0.92], scale: [0.38, 0.92, 0.10], rotation: [0, 0.22, -0.04], colour: CLUB_COLOURS.blue, opacity: 0.27 },
  { position: [0.58, -0.20, -0.76], scale: [0.36, 0.86, 0.10], rotation: [0, -0.23, 0.035], colour: CLUB_COLOURS.violet, opacity: 0.28 },
]

const DESKTOP_PANELS = [
  { position: [-1.47, 0.08, -1.48], scale: [0.78, 1.34, 0.045], rotation: [0, 0.25, -0.025], edge: CLUB_COLOURS.violet },
  { position: [1.45, -0.12, -1.18], scale: [0.72, 1.20, 0.045], rotation: [0, -0.27, 0.025], edge: CLUB_COLOURS.cyan },
  { position: [0.28, 0.88, -2.18], scale: [1.32, 0.44, 0.04], rotation: [-0.04, -0.06, 0.015], edge: CLUB_COLOURS.blue },
]

const MOBILE_PANELS = [
  { position: [-0.61, 0.04, -1.34], scale: [0.36, 1.06, 0.035], rotation: [0, 0.20, -0.02], edge: CLUB_COLOURS.violet },
  { position: [0.61, -0.16, -1.08], scale: [0.34, 0.92, 0.035], rotation: [0, -0.21, 0.02], edge: CLUB_COLOURS.cyan },
]

function smoothstep(value, minimum, maximum) {
  const amount = THREE.MathUtils.clamp((value - minimum) / Math.max(maximum - minimum, 0.0001), 0, 1)
  return amount * amount * (3 - 2 * amount)
}

function createGridGeometry({ width, depth, columns, rows, vertical = false }) {
  const positions = []
  const halfWidth = width * 0.5
  const halfDepth = depth * 0.5

  for (let column = 0; column <= columns; column += 1) {
    const x = THREE.MathUtils.lerp(-halfWidth, halfWidth, column / columns)
    if (vertical) positions.push(x, -halfDepth, 0, x, halfDepth, 0)
    else positions.push(x, 0, -halfDepth, x, 0, halfDepth)
  }

  for (let row = 0; row <= rows; row += 1) {
    const axis = THREE.MathUtils.lerp(-halfDepth, halfDepth, row / rows)
    if (vertical) positions.push(-halfWidth, axis, 0, halfWidth, axis, 0)
    else positions.push(-halfWidth, 0, axis, halfWidth, 0, axis)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  return geometry
}

function createParticleGeometry(count, compact) {
  // A local seeded generator keeps the atmosphere stable across renders and
  // makes the exact same scroll position reconstruct the same composition.
  let seed = 0x3c71b5
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 0x100000000
  }

  const positions = new Float32Array(count * 3)
  const colours = new Float32Array(count * 3)
  const palette = [
    new THREE.Color(CLUB_COLOURS.violet),
    new THREE.Color(CLUB_COLOURS.blue),
    new THREE.Color(CLUB_COLOURS.cyan),
  ]
  const spreadX = compact ? 2.0 : 6.2
  const spreadY = compact ? 2.8 : 3.5

  for (let index = 0; index < count; index += 1) {
    const offset = index * 3
    positions[offset] = (random() - 0.5) * spreadX
    positions[offset + 1] = (random() - 0.5) * spreadY
    positions[offset + 2] = THREE.MathUtils.lerp(-2.65, 0.58, random())
    palette[index % palette.length].toArray(colours, offset)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3))
  geometry.computeBoundingSphere()
  return geometry
}

function ArchitecturalFrame({ geometry, frame }) {
  return (
    <lineSegments
      geometry={geometry}
      position={frame.position}
      rotation={frame.rotation}
      scale={frame.scale}
    >
      <lineBasicMaterial
        color={frame.colour}
        transparent
        opacity={frame.opacity}
        depthWrite={false}
        toneMapped={false}
        userData={{ clubBaseOpacity: frame.opacity, clubRevealFloor: 0.22 }}
      />
    </lineSegments>
  )
}

function TranslucentPanel({ boxGeometry, edgeGeometry, panel }) {
  return (
    <group position={panel.position} rotation={panel.rotation} scale={panel.scale}>
      <mesh geometry={boxGeometry}>
        <meshStandardMaterial
          color={CLUB_COLOURS.panel}
          emissive={panel.edge}
          emissiveIntensity={0.055}
          metalness={0.42}
          roughness={0.48}
          transparent
          opacity={0.43}
          depthWrite={false}
          userData={{ clubBaseOpacity: 0.43, clubRevealFloor: 0.28 }}
        />
      </mesh>
      <lineSegments geometry={edgeGeometry}>
        <lineBasicMaterial
          color={panel.edge}
          transparent
          opacity={0.34}
          depthWrite={false}
          toneMapped={false}
          userData={{ clubBaseOpacity: 0.34, clubRevealFloor: 0.20 }}
        />
      </lineSegments>
    </group>
  )
}

function PortalBar({ geometry, edgeGeometry, position, scale, colour }) {
  return (
    <group position={position} scale={scale}>
      <mesh geometry={geometry}>
        <meshStandardMaterial
          color={CLUB_COLOURS.ink}
          emissive={colour}
          emissiveIntensity={0.045}
          metalness={0.64}
          roughness={0.34}
          depthWrite
        />
      </mesh>
      <lineSegments geometry={edgeGeometry}>
        <lineBasicMaterial
          color={colour}
          transparent
          opacity={0.42}
          depthWrite={false}
          toneMapped={false}
          userData={{ clubBaseOpacity: 0.42, clubRevealFloor: 0.18 }}
        />
      </lineSegments>
    </group>
  )
}

/**
 * A persistent R3F section for the Step 08 Club Experience.
 *
 * `groupRef` is intentionally owned by the parent scene. The parent may move,
 * rotate and scale this root during the stacking transition; this component
 * only animates descendants and never reads or writes the camera.
 */
function ClubExperience3D({
  groupRef,
  scrollRef,
  reducedMotion = false,
  coarsePointer = false,
}) {
  const contentRef = useRef(null)
  const installationRef = useRef(null)
  const coreRef = useRef(null)
  const particleRef = useRef(null)
  const ringRefs = useRef([])
  const lightRefs = useRef([])
  const revealMaterialsRef = useRef([])

  const compact = coarsePointer
  const frames = compact ? MOBILE_FRAMES : DESKTOP_FRAMES
  const panels = compact ? MOBILE_PANELS : DESKTOP_PANELS
  const portalHalfWidth = compact ? 0.90 : 2.34
  const portalHalfHeight = compact ? 1.36 : 1.54
  const portalDepth = compact ? -0.10 : 0.30
  const installationScale = compact ? 0.78 : 1

  const boxGeometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), [])
  const boxEdgeGeometry = useMemo(() => new THREE.EdgesGeometry(boxGeometry), [boxGeometry])
  const floorGridGeometry = useMemo(() => createGridGeometry({
    width: compact ? 3.5 : 7.2,
    depth: 4.9,
    columns: compact ? 10 : 20,
    rows: compact ? 14 : 22,
  }), [compact])
  const wallGridGeometry = useMemo(() => createGridGeometry({
    width: compact ? 3.4 : 7.0,
    depth: 3.2,
    columns: compact ? 10 : 20,
    rows: compact ? 9 : 13,
    vertical: true,
  }), [compact])
  const particleGeometry = useMemo(() => createParticleGeometry(compact ? 20 : 48, compact), [compact])

  useEffect(() => {
    const materials = []
    contentRef.current?.traverse((object) => {
      if (!object.material) return
      const objectMaterials = Array.isArray(object.material) ? object.material : [object.material]
      objectMaterials.forEach((material) => {
        if (Number.isFinite(material.userData?.clubBaseOpacity)) materials.push(material)
      })
    })
    revealMaterialsRef.current = materials
    return () => { revealMaterialsRef.current = [] }
  }, [compact])

  useEffect(() => () => {
    floorGridGeometry.dispose()
    wallGridGeometry.dispose()
    particleGeometry.dispose()
  }, [floorGridGeometry, wallGridGeometry, particleGeometry])

  useFrame(({ clock }) => {
    const sectionProgress = THREE.MathUtils.clamp(scrollRef?.current?.sectionProgress ?? 0, 0, 1)
    const reveal = smoothstep(sectionProgress, 0.04, 0.78)

    revealMaterialsRef.current.forEach((material) => {
      const baseOpacity = material.userData.clubBaseOpacity
      const revealFloor = material.userData.clubRevealFloor ?? 0.18
      material.opacity = baseOpacity * THREE.MathUtils.lerp(revealFloor, 1, reveal)
    })

    const lightScale = THREE.MathUtils.lerp(0.18, 1, reveal)
    const lightIntensities = compact ? [0.72, 0.62, 0.48] : [1.02, 0.88, 0.66]
    lightRefs.current.forEach((light, index) => {
      if (light) light.intensity = lightIntensities[index] * lightScale
    })

    const time = clock.elapsedTime
    const motion = reducedMotion ? 0 : 1
    if (installationRef.current) {
      installationRef.current.rotation.y = Math.sin(time * 0.18) * 0.035 * motion
      installationRef.current.position.y = Math.sin(time * 0.31) * 0.014 * motion
    }
    if (coreRef.current) {
      coreRef.current.rotation.x = 0.30 + Math.sin(time * 0.24) * 0.045 * motion
      coreRef.current.rotation.y = Math.PI * 0.25 + time * 0.075 * motion
      const breathe = 1 + Math.sin(time * 0.46) * 0.018 * motion
      coreRef.current.scale.setScalar(breathe)
    }
    ringRefs.current.forEach((ring, index) => {
      if (!ring) return
      ring.rotation.z = (index === 0 ? 0.10 : -0.18) + time * (index === 0 ? 0.055 : -0.042) * motion
      ring.rotation.y = (index === 0 ? 0.38 : -0.48) + Math.sin(time * 0.20 + index) * 0.04 * motion
    })
    if (particleRef.current) {
      particleRef.current.rotation.y = Math.sin(time * 0.055) * 0.025 * motion
      particleRef.current.position.y = Math.sin(time * 0.13) * 0.018 * motion
    }
  })

  return (
    <group ref={groupRef} name="club-experience-section">
      <group ref={contentRef}>
        {/* Far layer: a dark technical room, kept light enough for the liquid
            environment to remain visible behind it. */}
        <lineSegments geometry={wallGridGeometry} position={[0, 0.12, -2.72]}>
          <lineBasicMaterial
            color="#396276"
            transparent
            opacity={0.12}
            depthWrite={false}
            toneMapped={false}
            userData={{ clubBaseOpacity: 0.12, clubRevealFloor: 0.16 }}
          />
        </lineSegments>
        <lineSegments geometry={floorGridGeometry} position={[0, -1.22, -0.52]}>
          <lineBasicMaterial
            color="#31556d"
            transparent
            opacity={0.15}
            depthWrite={false}
            toneMapped={false}
            userData={{ clubBaseOpacity: 0.15, clubRevealFloor: 0.14 }}
          />
        </lineSegments>
        <lineSegments
          geometry={boxEdgeGeometry}
          position={[0, 0.12, -2.68]}
          scale={[compact ? 3.05 : 6.25, 2.88, 0.055]}
        >
          <lineBasicMaterial
            color={CLUB_COLOURS.blue}
            transparent
            opacity={0.20}
            depthWrite={false}
            toneMapped={false}
            userData={{ clubBaseOpacity: 0.20, clubRevealFloor: 0.18 }}
          />
        </lineSegments>

        {frames.map((frame, index) => (
          <ArchitecturalFrame key={`club-frame-${index}`} geometry={boxEdgeGeometry} frame={frame} />
        ))}
        {panels.map((panel, index) => (
          <TranslucentPanel
            key={`club-panel-${index}`}
            boxGeometry={boxGeometry}
            edgeGeometry={boxEdgeGeometry}
            panel={panel}
          />
        ))}

        <points ref={particleRef} geometry={particleGeometry} frustumCulled={false}>
          <pointsMaterial
            vertexColors
            size={compact ? 0.020 : 0.025}
            sizeAttenuation
            transparent
            opacity={0.42}
            depthWrite={false}
            toneMapped={false}
            blending={THREE.AdditiveBlending}
            userData={{ clubBaseOpacity: 0.42, clubRevealFloor: 0.12 }}
          />
        </points>

        {/* Mid layer: an opaque monolithic core creates genuine occlusion,
            while the rings and edge cage retain the restrained neon language. */}
        <group ref={installationRef} position={[0, 0, -0.08]} scale={installationScale}>
          <mesh geometry={boxGeometry} scale={[0.58, 1.50, 0.42]} position={[0, -0.03, -0.13]}>
            <meshStandardMaterial
              color="#050a13"
              emissive={CLUB_COLOURS.blue}
              emissiveIntensity={0.095}
              metalness={0.76}
              roughness={0.27}
              depthWrite
            />
          </mesh>
          <lineSegments geometry={boxEdgeGeometry} scale={[0.58, 1.50, 0.42]} position={[0, -0.03, -0.13]}>
            <lineBasicMaterial
              color={CLUB_COLOURS.blue}
              transparent
              opacity={0.48}
              depthWrite={false}
              toneMapped={false}
              userData={{ clubBaseOpacity: 0.48, clubRevealFloor: 0.24 }}
            />
          </lineSegments>
          <mesh geometry={boxGeometry} scale={[0.88, 0.24, 0.62]} position={[0, -0.76, 0.03]}>
            <meshStandardMaterial
              color="#07101a"
              emissive={CLUB_COLOURS.violet}
              emissiveIntensity={0.075}
              metalness={0.68}
              roughness={0.34}
              depthWrite
            />
          </mesh>
          <lineSegments geometry={boxEdgeGeometry} scale={[0.88, 0.24, 0.62]} position={[0, -0.76, 0.03]}>
            <lineBasicMaterial
              color={CLUB_COLOURS.violet}
              transparent
              opacity={0.36}
              depthWrite={false}
              toneMapped={false}
              userData={{ clubBaseOpacity: 0.36, clubRevealFloor: 0.22 }}
            />
          </lineSegments>

          <group ref={coreRef} position={[0, 0.14, 0.20]} rotation={[0.30, Math.PI * 0.25, 0]}>
            <mesh>
              <octahedronGeometry args={[0.30, 1]} />
              <meshStandardMaterial
                color="#091426"
                emissive={CLUB_COLOURS.cyan}
                emissiveIntensity={0.52}
                metalness={0.72}
                roughness={0.22}
                depthWrite
              />
            </mesh>
            <mesh scale={1.17}>
              <octahedronGeometry args={[0.30, 1]} />
              <meshBasicMaterial
                color={CLUB_COLOURS.cyan}
                wireframe
                transparent
                opacity={0.54}
                depthWrite={false}
                toneMapped={false}
                userData={{ clubBaseOpacity: 0.54, clubRevealFloor: 0.30 }}
              />
            </mesh>
          </group>

          <mesh position={[0, 0.04, 0.33]}>
            <cylinderGeometry args={[0.012, 0.012, 2.20, 8]} />
            <meshBasicMaterial
              color={CLUB_COLOURS.cyan}
              transparent
              opacity={0.58}
              depthWrite={false}
              toneMapped={false}
              userData={{ clubBaseOpacity: 0.58, clubRevealFloor: 0.26 }}
            />
          </mesh>
          <mesh
            ref={(node) => { ringRefs.current[0] = node }}
            position={[0, 0.14, 0.31]}
            rotation={[1.08, 0.38, 0.10]}
          >
            <torusGeometry args={[0.55, 0.010, 8, compact ? 40 : 64]} />
            <meshBasicMaterial
              color={CLUB_COLOURS.violet}
              transparent
              opacity={0.44}
              depthWrite={false}
              toneMapped={false}
              userData={{ clubBaseOpacity: 0.44, clubRevealFloor: 0.20 }}
            />
          </mesh>
          <mesh
            ref={(node) => { ringRefs.current[1] = node }}
            position={[0, 0.14, 0.27]}
            rotation={[0.58, -0.48, -0.18]}
          >
            <torusGeometry args={[0.70, 0.008, 8, compact ? 40 : 64]} />
            <meshBasicMaterial
              color={CLUB_COLOURS.blue}
              transparent
              opacity={0.30}
              depthWrite={false}
              toneMapped={false}
              userData={{ clubBaseOpacity: 0.30, clubRevealFloor: 0.18 }}
            />
          </mesh>
          <mesh position={[0, -0.88, -0.02]} rotation={[Math.PI * 0.5, 0, 0]}>
            <torusGeometry args={[0.58, 0.012, 8, compact ? 40 : 64]} />
            <meshBasicMaterial
              color={CLUB_COLOURS.cyan}
              transparent
              opacity={0.32}
              depthWrite={false}
              toneMapped={false}
              userData={{ clubBaseOpacity: 0.32, clubRevealFloor: 0.20 }}
            />
          </mesh>
        </group>

        {/* Foreground layer: a sparse portal frame gives the final scene a
            room threshold without filling or cropping every viewport edge. */}
        <group position={[0, 0, portalDepth]}>
          <PortalBar
            geometry={boxGeometry}
            edgeGeometry={boxEdgeGeometry}
            position={[-portalHalfWidth, 0, 0]}
            scale={[compact ? 0.035 : 0.055, portalHalfHeight * 2, 0.065]}
            colour={CLUB_COLOURS.violet}
          />
          <PortalBar
            geometry={boxGeometry}
            edgeGeometry={boxEdgeGeometry}
            position={[portalHalfWidth, 0, 0]}
            scale={[compact ? 0.035 : 0.055, portalHalfHeight * 2, 0.065]}
            colour={CLUB_COLOURS.cyan}
          />
          <PortalBar
            geometry={boxGeometry}
            edgeGeometry={boxEdgeGeometry}
            position={[0, portalHalfHeight, 0]}
            scale={[portalHalfWidth * 2, 0.045, 0.065]}
            colour={CLUB_COLOURS.blue}
          />
        </group>

        <pointLight
          ref={(node) => { lightRefs.current[0] = node }}
          color={CLUB_COLOURS.violet}
          intensity={0.18}
          distance={compact ? 2.5 : 3.7}
          decay={2}
          position={compact ? [-0.72, 0.78, 0.34] : [-1.58, 0.92, 0.40]}
        />
        <pointLight
          ref={(node) => { lightRefs.current[1] = node }}
          color={CLUB_COLOURS.blue}
          intensity={0.16}
          distance={compact ? 2.4 : 3.5}
          decay={2}
          position={compact ? [0.72, -0.40, 0.20] : [1.54, -0.46, 0.24]}
        />
        <pointLight
          ref={(node) => { lightRefs.current[2] = node }}
          color={CLUB_COLOURS.cyan}
          intensity={0.12}
          distance={compact ? 2.2 : 3.2}
          decay={2}
          position={[0, 0.45, -1.20]}
        />
      </group>
    </group>
  )
}

export default ClubExperience3D
