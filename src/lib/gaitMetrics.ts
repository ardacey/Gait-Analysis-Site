// Yürüyüş-özel (kadans, adım uzunluğu, yürüyüş hızı) YAKLAŞIK canlı metrikler.
//
// Bağlam: "Canlı Pratik" modu yürüyüş analizi için kullanılıyor. Bu modül, MeTRAbs offline
// pipeline'ının (3D+derinlik) kadans/adım/hız hesaplarının kaba, tek-kamera 2D yaklaşıklamasıdır
// — gerçek MeTRAbs sonuçlarıyla KARIŞTIRILMAMALI. Sınırlamalar:
//   - Derinlik yok (MoveNet 2D) — piksel->metre ölçeği, gövde (omuz-orta ↔ kalça-orta)
//     uzunluğunun tipik bir yetişkinde ~0.5m olduğu VARSAYIMINA dayanıyor (bkz. poseAngles.ts
//     torsoLengthPx — scripts/stgcn/feature_extraction_2d.py'deki _estimate_pixel_scale ile
//     aynı yöntem).
//   - Kamera YANDAN (sagittal düzlem) çekiyor varsayılıyor — kişi kareyi yatay yönde kat ediyor.
//     Kameraya doğru/kameradan uzağa yürüyüşte bu hesaplar anlamsızlaşır.
//   - Adım genişliği (step width) burada YOK — yan görüşte iki ayak üst üste bindiği için
//     mediolateral ayrım 2D'den çıkarılamıyor.
//   - "Adım" tespiti gerçek topuk vuruşu değil, diz açısındaki tepe-vadi (bkz. repCounter.ts) —
//     bir dizin en çok büktüğü an (salınım fazı ortası) o bacağın adımının vekili olarak
//     kullanılıyor. Duruş fazındaki küçük ikincil bükülme (~15-20°) PROMINENCE_DEG eşiğiyle
//     büyük ölçüde elenir ama nadiren yanlış pozitif üretebilir.

export interface GaitStats {
  cadence: number | null      // adım/dk
  stepLength: number | null   // m (ortalama)
  walkingSpeed: number | null // m/s
}

const SPEED_WINDOW_SEC = 4   // yürüyüş hızı bu kayan pencere üzerinden hesaplanıyor
const MIN_TORSO_PX = 5
const MIN_SCALE_SAMPLES = 5  // yeterli örnek birikmeden ölçeğe güvenme

interface HipSample { t: number; x: number }

export class GaitMetricsTracker {
  private scaleSamples: number[] = []
  private hipBuffer: HipSample[] = []
  private startT: number | null = null
  private lastT: number | null = null
  private stepCount = 0
  private totalDistanceM = 0
  private lastHipX: number | null = null

  private currentScale(): number | null {
    if (this.scaleSamples.length < MIN_SCALE_SAMPLES) return null
    const sorted = [...this.scaleSamples].sort((a, b) => a - b)
    const medianPx = sorted[Math.floor(sorted.length / 2)]
    return medianPx > MIN_TORSO_PX ? 0.5 / medianPx : null
  }

  /** hipMidX/torsoLenPx: piksel cinsinden. tSec: performance.now()/1000. stepEventCount:
   * o ana kadar (L Knee reps + R Knee reps) toplamı — bkz. repCounter.ts. */
  pushFrame(hipMidX: number | null, torsoLenPx: number | null, tSec: number, stepEventCount: number): void {
    if (this.startT == null) this.startT = tSec
    this.lastT = tSec
    this.stepCount = stepEventCount

    if (torsoLenPx != null && torsoLenPx > MIN_TORSO_PX) {
      this.scaleSamples.push(torsoLenPx)
      if (this.scaleSamples.length > 90) this.scaleSamples.shift() // ~3sn@30fps kadar tut
    }

    if (hipMidX == null) return
    const scale = this.currentScale()
    if (scale != null && this.lastHipX != null) {
      this.totalDistanceM += Math.abs(hipMidX - this.lastHipX) * scale
    }
    this.lastHipX = hipMidX

    this.hipBuffer.push({ t: tSec, x: hipMidX })
    const cutoff = tSec - SPEED_WINDOW_SEC
    while (this.hipBuffer.length > 1 && this.hipBuffer[0].t < cutoff) this.hipBuffer.shift()
  }

  getStats(): GaitStats {
    const scale = this.currentScale()
    if (scale == null || this.startT == null || this.lastT == null) {
      return { cadence: null, stepLength: null, walkingSpeed: null }
    }

    const elapsedMin = (this.lastT - this.startT) / 60
    const cadence = elapsedMin > 0.05 ? this.stepCount / elapsedMin : null
    const stepLength = this.stepCount > 0 ? this.totalDistanceM / this.stepCount : null

    let walkingSpeed: number | null = null
    if (this.hipBuffer.length >= 2) {
      const first = this.hipBuffer[0]
      const last = this.hipBuffer[this.hipBuffer.length - 1]
      const dt = last.t - first.t
      if (dt > 0.3) walkingSpeed = (Math.abs(last.x - first.x) * scale) / dt
    }

    return { cadence, stepLength, walkingSpeed }
  }

  reset(): void {
    this.scaleSamples = []
    this.hipBuffer = []
    this.startT = null
    this.lastT = null
    this.stepCount = 0
    this.totalDistanceM = 0
    this.lastHipX = null
  }
}
