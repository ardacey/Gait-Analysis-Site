/// <reference types="@react-three/fiber" />
import { forwardRef, useImperativeHandle, useRef, useEffect, useMemo } from 'react'
import * as THREE from 'three'

export interface Skeleton3DHandle {
  updateFrame: (joints: [number, number, number][], angles?: Record<string, number>) => void
}

interface Skeleton3DProps {
  joints: [number, number, number][]
  jointNames: string[]
  edges: [number, number][]
  angles?: Record<string, number>
}

const LOWER_BODY = new Set(['LHip','LKnee','LAnkle','RHip','RKnee','RAnkle','LBigToe','LSmallToe','LHeel','RBigToe','RSmallToe','RHeel','Hip'])
const HEAD = new Set(['Nose','Neck','LEye','LEar','REye','REar'])

function jointColor(name: string): THREE.Color {
  if (HEAD.has(name)) return new THREE.Color('#94a3b8')
  if (LOWER_BODY.has(name)) return new THREE.Color('#f97316')
  return new THREE.Color('#60a5fa')
}

const JOINT_ANGLE_MAP: Record<string, string> = {
  LKnee: 'L Knee', RKnee: 'R Knee',
  LHip: 'L Hip',   RHip: 'R Hip',
  LAnkle: 'L Ankle', RAnkle: 'R Ankle',
  LElbow: 'L Elbow', RElbow: 'R Elbow',
}

function angleToColor(angle: number): THREE.Color {
  const t = Math.max(0, Math.min(1, (angle - 60) / 120))
  if (t > 0.7) return new THREE.Color('#60a5fa')
  if (t > 0.4) return new THREE.Color('#34d399')
  if (t > 0.2) return new THREE.Color('#fbbf24')
  return new THREE.Color('#ef4444')
}

function centerAndScale(
  joints: [number, number, number][],
  jointNames: string[],
): THREE.Vector3[] {
  const hipIdx = jointNames.indexOf('Hip') >= 0 ? jointNames.indexOf('Hip') : jointNames.indexOf('MidHip')
  const ref = joints[hipIdx >= 0 ? hipIdx : 0] ?? [0, 0, 0]
  const maxAbs = joints.flat().reduce((m, v) => Math.max(m, Math.abs(v)), 0)
  const scale = maxAbs > 10 ? 0.001 : 1
  return joints.map(j => new THREE.Vector3(
    (j[0] - ref[0]) * scale,
    -(j[1] - ref[1]) * scale,
    (j[2] - ref[2]) * scale,
  ))
}

const _up = new THREE.Vector3(0, 1, 0)
const _q  = new THREE.Quaternion()

function applyToScene(
  meshes: THREE.Mesh[],
  bones: THREE.Mesh[],
  edges: [number, number][],
  centered: THREE.Vector3[],
  jointNames: string[],
  angles?: Record<string, number>,
) {
  centered.forEach((pos, i) => {
    if (!meshes[i]) return
    meshes[i].position.copy(pos)
    const name = jointNames[i] ?? ''
    const mat = meshes[i].material as THREE.MeshStandardMaterial
    const angleKey = JOINT_ANGLE_MAP[name]
    mat.color = (angles && angleKey && angles[angleKey] != null)
      ? angleToColor(angles[angleKey])
      : jointColor(name)
  })

  edges.forEach(([a, b], i) => {
    const mesh = bones[i]
    if (!mesh || !centered[a] || !centered[b]) return
    const pa = centered[a]
    const pb = centered[b]
    const dir = pb.clone().sub(pa)
    const len = dir.length()
    if (len < 0.001) { mesh.visible = false; return }
    mesh.visible = true
    mesh.position.copy(pa).add(pb).multiplyScalar(0.5)
    mesh.scale.set(1, len, 1)
    _q.setFromUnitVectors(_up, dir.normalize())
    mesh.quaternion.copy(_q)
  })
}

export const Skeleton3D = forwardRef<Skeleton3DHandle, Skeleton3DProps>(
  function Skeleton3D({ joints, jointNames, edges, angles }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const sceneRef = useRef<{
      renderer: THREE.WebGLRenderer
      scene: THREE.Scene
      camera: THREE.PerspectiveCamera
      jointMeshes: THREE.Mesh[]
      boneMeshes: THREE.Mesh[]
      animId: number
      spherical: THREE.Spherical
    } | null>(null)

    const jointNamesRef = useRef(jointNames)
    jointNamesRef.current = jointNames
    const edgesRef = useRef(edges)
    edgesRef.current = edges

    // Expose imperative update (used during playback to skip React re-render)
    useImperativeHandle(ref, () => ({
      updateFrame(newJoints, newAngles) {
        const s = sceneRef.current
        if (!s) return
        const centered = centerAndScale(newJoints, jointNamesRef.current)
        applyToScene(s.jointMeshes, s.boneMeshes, edgesRef.current, centered, jointNamesRef.current, newAngles)
      }
    }))

    // Initial centered positions (for scrubbing via props)
    const centered = useMemo(
      () => centerAndScale(joints, jointNames),
      [joints, jointNames],
    )

    // One-time Three.js setup
    useEffect(() => {
      const canvas = canvasRef.current
      if (!canvas) return

      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
      renderer.setPixelRatio(window.devicePixelRatio)
      renderer.setClearColor(0x0f172a)

      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(45, canvas.clientWidth / canvas.clientHeight, 0.01, 100)
      const spherical = new THREE.Spherical(3, Math.PI / 2.5, 0)
      camera.position.setFromSpherical(spherical)
      camera.lookAt(0, 0, 0)

      scene.add(new THREE.AmbientLight(0xffffff, 0.7))
      const dir = new THREE.DirectionalLight(0xffffff, 0.8)
      dir.position.set(2, 3, 2)
      scene.add(dir)

      const grid = new THREE.GridHelper(2, 10, 0x1e293b, 0x1e293b)
      grid.position.y = -0.9
      scene.add(grid)

      const jointMeshes: THREE.Mesh[] = []
      const sphereGeo = new THREE.SphereGeometry(0.04, 8, 8)
      for (let i = 0; i < jointNamesRef.current.length; i++) {
        const mat = new THREE.MeshStandardMaterial({ color: jointColor(jointNamesRef.current[i] ?? '') })
        const mesh = new THREE.Mesh(sphereGeo, mat)
        scene.add(mesh)
        jointMeshes.push(mesh)
      }

      const boneMeshes: THREE.Mesh[] = []
      for (let i = 0; i < edgesRef.current.length; i++) {
        const cyl = new THREE.CylinderGeometry(0.015, 0.015, 1, 6)
        const mat = new THREE.MeshStandardMaterial({ color: 0x475569 })
        const mesh = new THREE.Mesh(cyl, mat)
        scene.add(mesh)
        boneMeshes.push(mesh)
      }

      let animId = 0
      const animate = () => {
        animId = requestAnimationFrame(animate)
        const w = canvas.clientWidth, h = canvas.clientHeight
        if (renderer.domElement.width !== w || renderer.domElement.height !== h) {
          renderer.setSize(w, h, false)
          camera.aspect = w / h
          camera.updateProjectionMatrix()
        }
        renderer.render(scene, camera)
      }
      animate()

      let dragging = false
      const mouse = { x: 0, y: 0 }
      const onDown  = (e: MouseEvent) => { dragging = true; mouse.x = e.clientX; mouse.y = e.clientY }
      const onUp    = () => { dragging = false }
      const onMove  = (e: MouseEvent) => {
        if (!dragging) return
        spherical.theta -= (e.clientX - mouse.x) * 0.01
        spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, spherical.phi + (e.clientY - mouse.y) * 0.01))
        mouse.x = e.clientX; mouse.y = e.clientY
        camera.position.setFromSpherical(spherical)
        camera.lookAt(0, 0, 0)
      }
      const onWheel = (e: WheelEvent) => {
        e.preventDefault()
        spherical.radius = Math.max(0.5, Math.min(8, spherical.radius + e.deltaY * 0.005))
        camera.position.setFromSpherical(spherical)
        camera.lookAt(0, 0, 0)
      }
      canvas.addEventListener('mousedown', onDown)
      window.addEventListener('mouseup', onUp)
      window.addEventListener('mousemove', onMove)
      canvas.addEventListener('wheel', onWheel, { passive: false })

      sceneRef.current = { renderer, scene, camera, jointMeshes, boneMeshes, animId, spherical }

      return () => {
        cancelAnimationFrame(animId)
        canvas.removeEventListener('mousedown', onDown)
        window.removeEventListener('mouseup', onUp)
        window.removeEventListener('mousemove', onMove)
        canvas.removeEventListener('wheel', onWheel)
        renderer.dispose()
        sceneRef.current = null
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Sync when scrubbing (props change, not during playback)
    useEffect(() => {
      const s = sceneRef.current
      if (!s) return
      applyToScene(s.jointMeshes, s.boneMeshes, edgesRef.current, centered, jointNamesRef.current, angles)
    }, [centered, angles])

    return (
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
        style={{ display: 'block' }}
      />
    )
  }
)
