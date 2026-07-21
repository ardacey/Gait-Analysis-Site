// Konumlanma/kadraj kontrolü — canlı pratik başlamadan/sırasında kişinin yürüyüş analizi için
// uygun şekilde konumlandığını (tam boy görünür, kabaca yandan duruyor) kontrol eden basit,
// ML OLMAYAN sezgisel bir katman. BLOKLAMAZ — sadece uyarı amaçlı, tıpkı lib/angleRanges.ts'in
// renk kodlaması gibi; ölçüm bu kontrole bakmaksızın devam eder.
//
// Yandan durma tespiti KABA bir sezgiseldir: 2D projeksiyonda yandan durunca omuz genişliği
// (x farkı) gövde uzunluğuna göre küçülür (omuzlar üst üste biner, derinlik yönünde ayrışır).
// Kesin değil — kollar hareket ederken veya kamera açısı tam 90° değilken yanılabilir, bu yüzden
// orta bantta (ne çok geniş ne çok dar) hiçbir yorum ÜRETMİYORUZ; belirsizlikte sessiz kalmak
// yanlış/gürültülü uyarı vermekten iyidir.

import type { Point2D } from './poseAngles'
import { MIN_SCORE, torsoLengthPx } from './poseAngles'

export interface FramingStatus {
  ok: boolean
  issue: string | null // en öncelikli TEK sorun mesajı (birden fazla varsa en önemlisi gösterilir)
}

const NEEDED_JOINTS = [
  'left_shoulder', 'right_shoulder', 'left_hip', 'right_hip',
  'left_knee', 'right_knee', 'left_ankle', 'right_ankle',
] as const

const MIN_BBOX_HEIGHT_FRAC = 0.35 // görünür noktaların dikey açıklığı canvas yüksekliğinin bu kadarından azsa "çok uzak"
const FRONTAL_RATIO_WARN = 0.5    // omuz genişliği / gövde uzunluğu bunun üstündeyse "kameraya dönük duruyor"

export function checkFraming(byName: Record<string, Point2D | undefined>, canvasHeightPx: number): FramingStatus {
  const visible = (name: string) => {
    const p = byName[name]
    return !!p && (p.score ?? 0) >= MIN_SCORE
  }
  const missing = NEEDED_JOINTS.filter(n => !visible(n))

  if (missing.length === NEEDED_JOINTS.length) {
    return { ok: false, issue: 'Kadrajda kimse algılanmıyor — kameranın karşısına geçin.' }
  }
  if (missing.includes('left_ankle') || missing.includes('right_ankle')) {
    return { ok: false, issue: 'Ayak bilekleriniz kadraj dışında — kameradan biraz uzaklaşın.' }
  }
  if (missing.includes('left_hip') || missing.includes('right_hip') || missing.includes('left_knee') || missing.includes('right_knee')) {
    return { ok: false, issue: 'Kalça/diz noktalarınız net görünmüyor — kadrajın ortasında, tam boy durun.' }
  }
  if (missing.includes('left_shoulder') || missing.includes('right_shoulder')) {
    return { ok: false, issue: 'Üst gövdeniz kadraj dışında — kameradan biraz uzaklaşın.' }
  }

  // Kadraj boyutu — görünür noktaların kabaca dikey açıklığı.
  if (canvasHeightPx > 0) {
    const visibleYs = NEEDED_JOINTS.map(n => byName[n]).filter((p): p is Point2D => !!p && (p.score ?? 0) >= MIN_SCORE).map(p => p.y)
    if (visibleYs.length > 0) {
      const bboxFrac = (Math.max(...visibleYs) - Math.min(...visibleYs)) / canvasHeightPx
      if (bboxFrac < MIN_BBOX_HEIGHT_FRAC) {
        return { ok: false, issue: 'Kameraya biraz daha yaklaşın — şu an çok küçük görünüyorsunuz.' }
      }
    }
  }

  // Yandan durma sezgiseli.
  const ls = byName.left_shoulder, rs = byName.right_shoulder
  const torsoLen = torsoLengthPx(byName)
  if (ls && rs && torsoLen != null && torsoLen > 5) {
    const shoulderWidth = Math.abs(ls.x - rs.x)
    const ratio = shoulderWidth / torsoLen
    if (ratio > FRONTAL_RATIO_WARN) {
      return { ok: false, issue: 'Kameraya dönük duruyor gibisiniz — yürüyüş analizi için kameraya yandan durun.' }
    }
  }

  return { ok: true, issue: null }
}
