// Canlı pratik modu (LivePractice) için basit 2D poz yardımcıları.
// MoveNet'in ürettiği COCO-17 keypoint isimleri ve düz-hat iskelet bağlantıları,
// ve üç nokta arasındaki açıyı (derece) hesaplayan genel bir fonksiyon.

export type Point2D = { x: number; y: number; score?: number }

// MoveNet (@tensorflow-models/pose-detection) keypoint isimleri — COCO-17 sırası.
export const MOVENET_KEYPOINT_NAMES = [
  'nose', 'left_eye', 'right_eye', 'left_ear', 'right_ear',
  'left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow',
  'left_wrist', 'right_wrist', 'left_hip', 'right_hip',
  'left_knee', 'right_knee', 'left_ankle', 'right_ankle',
] as const

// Çizim için iskelet kenarları (isim çiftleri) — pycocotools'un standart COCO iskelet bağlantılarıyla aynı.
export const SKELETON_EDGES: [string, string][] = [
  ['left_shoulder', 'right_shoulder'],
  ['left_shoulder', 'left_elbow'], ['left_elbow', 'left_wrist'],
  ['right_shoulder', 'right_elbow'], ['right_elbow', 'right_wrist'],
  ['left_shoulder', 'left_hip'], ['right_shoulder', 'right_hip'],
  ['left_hip', 'right_hip'],
  ['left_hip', 'left_knee'], ['left_knee', 'left_ankle'],
  ['right_hip', 'right_knee'], ['right_knee', 'right_ankle'],
  ['nose', 'left_eye'], ['nose', 'right_eye'],
  ['left_eye', 'left_ear'], ['right_eye', 'right_ear'],
]

export const MIN_SCORE = 0.3

/** Üç nokta arasında b köşesindeki açı (derece, 0-180). a/c'den biri düşük güvenle geldiyse NaN döner. */
export function angleDeg(a: Point2D, b: Point2D, c: Point2D): number {
  const abx = a.x - b.x, aby = a.y - b.y
  const cbx = c.x - b.x, cby = c.y - b.y
  const magAB = Math.hypot(abx, aby)
  const magCB = Math.hypot(cbx, cby)
  if (magAB < 1e-6 || magCB < 1e-6) return NaN
  const cos = Math.max(-1, Math.min(1, (abx * cbx + aby * cby) / (magAB * magCB)))
  return Math.acos(cos) * (180 / Math.PI)
}

export interface LiveAngles {
  'L Knee': number
  'R Knee': number
  'L Hip': number
  'R Hip': number
  'L Elbow': number
  'R Elbow': number
}

/** hip-knee-ankle / shoulder-hip-knee / shoulder-elbow-wrist üçgenlerinden diz, kalça ve dirsek
 * açılarını hesaplar. Ayak bileği açısı burada YOK — COCO-17'de ayak/parmak noktası bulunmuyor,
 * bu offline HRNet-2D pipeline'ıyla (bkz. scripts/stgcn/feature_extraction_2d.py) aynı yapısal
 * kısıt. Bir üçgendeki nokta(lar) MIN_SCORE altındaysa o açı NaN döner (panelde '—' gösterilir). */
export function computeLiveAngles(byName: Record<string, Point2D | undefined>): LiveAngles {
  const ok = (...pts: (Point2D | undefined)[]) => pts.every(p => p && (p.score ?? 1) >= MIN_SCORE)

  const lHip = byName.left_hip, lKnee = byName.left_knee, lAnkle = byName.left_ankle, lShoulder = byName.left_shoulder
  const rHip = byName.right_hip, rKnee = byName.right_knee, rAnkle = byName.right_ankle, rShoulder = byName.right_shoulder
  const lElbow = byName.left_elbow, lWrist = byName.left_wrist
  const rElbow = byName.right_elbow, rWrist = byName.right_wrist

  return {
    'L Knee': ok(lHip, lKnee, lAnkle) ? angleDeg(lHip!, lKnee!, lAnkle!) : NaN,
    'R Knee': ok(rHip, rKnee, rAnkle) ? angleDeg(rHip!, rKnee!, rAnkle!) : NaN,
    'L Hip':  ok(lShoulder, lHip, lKnee) ? angleDeg(lShoulder!, lHip!, lKnee!) : NaN,
    'R Hip':  ok(rShoulder, rHip, rKnee) ? angleDeg(rShoulder!, rHip!, rKnee!) : NaN,
    'L Elbow': ok(lShoulder, lElbow, lWrist) ? angleDeg(lShoulder!, lElbow!, lWrist!) : NaN,
    'R Elbow': ok(rShoulder, rElbow, rWrist) ? angleDeg(rShoulder!, rElbow!, rWrist!) : NaN,
  }
}
