// Canlı ST-GCN yürüyüş sınıflandırması — real-time roadmap madde C (bkz.
// docs/real-time-arastirma-raporu.md §3): eğitilmiş ST-GCN'i (scripts/stgcn/train.py,
// GAVD-only "gavd_gait_v1" checkpoint) tarayıcıya taşımak.
//
// Bu modül, offline pipeline'ın İKİ parçasının TypeScript portu:
//   1. scripts/stgcn/dataset.py normalize_sequence() — hip-orta merkezleme, gövde-uzunluğu
//      (omuz-orta<->kalça-orta, PENCERE İÇİ MEDYAN) ölçekleme, açı kanalı /180 normalize.
//   2. scripts/stgcn/stgcn_model.py GRAPH_JOINTS/V/HIP_IDX — 17 COCO eklemi + sentetik
//      orta-kalça 'Hip' düğümü (index 17), kanal sırası [x_norm, y_norm, skor, açı].
//
// Model onnxruntime-web ile WASM backend'inde çalışıyor (WebGL DEĞİL — GNN'in einsum/graph-conv
// operasyonları WASM'da daha güvenilir). Model dosyası scripts/gavd/export_stgcn_onnx.py ile
// üretiliyor; o script sabit T=WINDOW_FRAMES, lengths=[WINDOW_FRAMES] varsayımıyla export
// ediyor — bu yüzden burada da her tahmin TAM bir pencereyle yapılıyor, padding/mask yok
// (offline stgcn_infer.py'nin değişken-uzunluk senaryosunun aksine).
//
// Pencere/stride offline ile AYNI (bkz. scripts/stgcn/data_utils.py WINDOW_FRAMES/WINDOW_STRIDE)
// — eğitim/üretim dağılımı simetrik kalsın diye.
//
// ÖNEMLİ: paket kökünden ('onnxruntime-web') değil '/wasm' alt-yolundan import ediyoruz. Kök
// paket varsayılan olarak ort.bundle.min.mjs'ye çözümleniyor — bu, WebGPU/WebNN dahil TÜM
// execution provider'ları içeren "hepsi bir arada" bundle ve WASM ikilisini her zaman JSEP
// (WebGPU-uyumlu) varyantından (~27MB, ort-wasm-simd-threaded.jsep.*) istiyor, biz sadece o
// dosyayı public/ort/'a KOYMADIĞIMIZ için 404 ile sessizce (yakalanmış hata olarak) başarısız
// oluyordu. '/wasm' alt-yolu (ort.wasm.bundle.min.mjs) sadece CPU/WASM execution provider'ını
// içeriyor ve DAİMA sade 'ort-wasm-simd-threaded.wasm' dosyasını istiyor — public/ort/'a
// kopyaladığımız dosyayla birebir eşleşiyor.
//
// Ayrıca burada TİP-SADECE (type-only) import kullanıp gerçek modülü sadece load() çağrıldığında
// dinamik olarak indiriyoruz — LivePractice.tsx'teki tfjs/pose-detection dinamik import
// konvansiyonuyla AYNI sebep: MoveNet'in kendi model yükleme zaman aşımı/performansı bu
// (opsiyonel, deneysel) modülün bundle boyutundan hiçbir şekilde etkilenmesin.
import type * as OrtNS from 'onnxruntime-web/wasm'
import { MOVENET_KEYPOINT_NAMES, type Point2D, type LiveAngles } from './poseAngles'

let ortModulePromise: Promise<typeof OrtNS> | null = null
function loadOrtModule(): Promise<typeof OrtNS> {
  if (!ortModulePromise) {
    ortModulePromise = import('onnxruntime-web/wasm').then(ort => {
      // onnxruntime-web'in WASM ikili dosyaları public/ort/'ta statik olarak sunuluyor (bkz. o
      // klasör — node_modules/onnxruntime-web/dist'ten kopyalandı, sadece 'threaded' SIMD
      // varyantı, ~13MB). numThreads=1: Netlify gibi statik hosting'lerde çoklu-thread WASM için
      // gereken Cross-Origin-Opener/Embedder-Policy header'ları yok — SharedArrayBuffer
      // gerektirmeyen tek-thread moduna sabitleniyor (model küçük olduğu için performans sorun
      // değil).
      ort.env.wasm.wasmPaths = '/ort/'
      ort.env.wasm.numThreads = 1
      return ort
    })
  }
  return ortModulePromise
}

export const WINDOW_FRAMES = 110
export const WINDOW_STRIDE = 55

// GAVD/REHAB24-6 kaynak videoları ~30fps varsayımıyla işlendi (bkz. scripts/stgcn/data_utils.py
// yorumu) — WINDOW_FRAMES=110 orada ~3.7sn'lik (birkaç adım döngüsü) bir pencereye karşılık
// geliyordu.
//
// SONRADAN DÜZELTME (bkz. konuşma — DEBUG_LOG çıktısı): "push()'u 30fps'e throttle et" fikri
// YETERSİZ çıktı — throttle sadece hızı YUKARI SINIRLAYABİLİYOR, tarayıcı/cihaz zaten 30fps'in
// ALTINDA çalışıyorsa (ölçülen: ~22fps) hızlandıramıyor. Sonuç: 110 "kare" toplanana kadar
// gerçekte ~4.9sn geçiyordu (beklenen ~3.67sn yerine) — modele eğitimdekinden ~%33 daha
// "yavaşlatılmış/uzatılmış" bir hareket besleniyordu, bu da sistematik yanlış sınıflandırmayı
// açıklıyor. KALICI ÇÖZÜM: pencereyi KARE SAYISINA değil GERÇEK ZAMANA göre tamponlayıp, bu
// pencereyi her zaman tam WINDOW_FRAMES noktaya yeniden örnekliyoruz (lineer interpolasyon) —
// böylece tarayıcının gerçek yakalama hızı ne olursa olsun (22, 30, 45fps...) modele her zaman
// eğitimdeki gibi ~WINDOW_DURATION_SEC'lik bir pencere gidiyor.
const ASSUMED_TRAIN_FPS = 30
const WINDOW_DURATION_SEC = WINDOW_FRAMES / ASSUMED_TRAIN_FPS // ~3.667sn
const STRIDE_DURATION_SEC = WINDOW_STRIDE / ASSUMED_TRAIN_FPS // ~1.833sn
// Buffer'da bu süreden fazla veri tutmaya gerek yok (küçük bir marjla) — bellek sınırlı kalsın.
const MAX_BUFFER_AGE_SEC = WINDOW_DURATION_SEC + 1.0

const V = 18 // 17 COCO eklemi + sentetik 'Hip'
const C = 4  // x_norm, y_norm, skor, açı
const HIP_IDX = 17

// MOVENET_KEYPOINT_NAMES ile scripts/stgcn/data_utils.py JOINT_ORDER AYNI COCO-17 sırasında.
const L_SHOULDER = 5, R_SHOULDER = 6
const L_HIP = 11, R_HIP = 12
const L_KNEE = 13, R_KNEE = 14

interface BufferedFrame {
  byName: Record<string, Point2D | undefined>
  angles: LiveAngles
  t: number
}

// GEÇİCİ TEŞHİS ANAHTARI: canlıda yüksek-güvenle sistematik yanlış sınıflandırma (bkz.
// konuşma — letterbox/pad düzeltmesinden SONRA bile devam etti) araştırılırken, modele
// gerçekte ne beslendiğini (ölçek, pencere süresi, açı kanalı) doğrudan gözlemlemek için.
// Kök neden bulunup doğrulandıktan sonra false yapılıp/kaldırılabilir.
const DEBUG_LOG = true

export interface GaitClassification {
  label: 'normal' | 'abnormal'
  probNormal: number // sigmoid(logit) — eğitimde label=1=normal yürüyüş (bkz. download_gavd.py)
  confidence: number
}

function median(sortedAsc: number[]): number {
  const n = sortedAsc.length
  if (n === 0) return NaN
  const mid = Math.floor(n / 2)
  return n % 2 === 0 ? (sortedAsc[mid - 1] + sortedAsc[mid]) / 2 : sortedAsc[mid]
}

export class LiveGaitClassifier {
  private ort: typeof OrtNS | null = null
  private session: OrtNS.InferenceSession | null = null
  private loadPromise: Promise<void> | null = null
  private buffer: BufferedFrame[] = []
  private lastInferAtT = -Infinity

  get ready(): boolean {
    return this.session != null
  }

  async load(modelUrl: string): Promise<void> {
    if (this.session) return
    if (!this.loadPromise) {
      this.loadPromise = loadOrtModule().then(async ort => {
        const session = await ort.InferenceSession.create(modelUrl, { executionProviders: ['wasm'] })
        this.ort = ort
        this.session = session
      })
    }
    return this.loadPromise
  }

  /** Her karede çağrılır — buffer'a ham (zaman damgalı) kareyi ekler. Artık burada bir hız
   * sınırlaması YOK (bkz. yukarıdaki yorum — throttle yetersizdi); gerçek yakalama hızı ne
   * olursa olsun, sınıflandırma anında (buildInputTensor) zaman-tabanlı yeniden örnekleme
   * yapılıyor. Sadece bellek sınırlı kalsın diye MAX_BUFFER_AGE_SEC'ten eski kareler atılıyor. */
  push(byName: Record<string, Point2D | undefined>, angles: LiveAngles, tSec: number = performance.now() / 1000): void {
    this.buffer.push({ byName, angles, t: tSec })
    const cutoff = tSec - MAX_BUFFER_AGE_SEC
    while (this.buffer.length > 0 && this.buffer[0].t < cutoff) this.buffer.shift()
  }

  /** Buffer en az WINDOW_DURATION_SEC'lik GERÇEK ZAMAN kapsıyorsa VE son tahminden bu yana
   * en az STRIDE_DURATION_SEC geçtiyse yeni bir tahmin döner, aksi halde null. */
  async maybeClassify(): Promise<GaitClassification | null> {
    if (!this.session || !this.ort) return null
    if (this.buffer.length < 2) return null

    const tEnd = this.buffer[this.buffer.length - 1].t
    const tStart = this.buffer[0].t
    if (tEnd - tStart < WINDOW_DURATION_SEC) return null
    if (tEnd - this.lastInferAtT < STRIDE_DURATION_SEC) return null
    this.lastInferAtT = tEnd

    const x = this.buildInputTensor(tEnd)
    const lengths = new this.ort.Tensor('int64', BigInt64Array.from([BigInt(WINDOW_FRAMES)]), [1])

    const results = await this.session.run({ x, lengths })
    const logit = Number(results.logit.data[0])
    const probNormal = 1 / (1 + Math.exp(-logit))
    const label: 'normal' | 'abnormal' = probNormal >= 0.5 ? 'normal' : 'abnormal'
    const confidence = label === 'normal' ? probNormal : 1 - probNormal

    if (DEBUG_LOG) {
      const xData = x.data as Float32Array
      let xMin = Infinity, xMax = -Infinity, xAbsSum = 0
      let anglePresentCount = 0
      for (let t = 0; t < WINDOW_FRAMES; t++) {
        let hasAngle = false
        for (let j = 0; j < V; j++) {
          const base = (t * V + j) * C
          const v = xData[base + 0]
          if (v < xMin) xMin = v
          if (v > xMax) xMax = v
          xAbsSum += Math.abs(v)
          if (xData[base + 3] !== 0) hasAngle = true
        }
        if (hasAngle) anglePresentCount++
      }
      const nNodes = WINDOW_FRAMES * V
      console.log('[gaitClassifier DEBUG]', {
        windowDurationSec: WINDOW_DURATION_SEC.toFixed(2),
        rawBufferSpanSec: (tEnd - tStart).toFixed(2),
        rawBufferImpliedFps: (this.buffer.length / (tEnd - tStart)).toFixed(1),
        angleChannelPresentFrac: (anglePresentCount / WINDOW_FRAMES).toFixed(2),
        xChannelMin: xMin.toFixed(3), xChannelMax: xMax.toFixed(3),
        xChannelMeanAbs: (xAbsSum / nNodes).toFixed(3),
        logit: logit.toFixed(4), probNormal: probNormal.toFixed(4), label,
      })
    }

    return { label, probNormal, confidence }
  }

  /** t zamanındaki değeri, buffer'daki en yakın iki ham kare arasında lineer interpolasyonla
   * hesaplar (t, buffer aralığının dışındaysa en yakın uca kenetlenir — clamp). */
  private interpolateAt(t: number): BufferedFrame {
    const buf = this.buffer
    if (t <= buf[0].t) return buf[0]
    if (t >= buf[buf.length - 1].t) return buf[buf.length - 1]

    // Buffer zaman sırasına göre artan olduğu için doğrusal tarama yeterli (T=110 hedef nokta x
    // ~birkaç yüz ham kare — trivial maliyet, ihtiyaç halinde ikili aramaya çevrilebilir).
    let lo = 0
    while (lo + 1 < buf.length && buf[lo + 1].t < t) lo++
    const a = buf[lo]
    const b = buf[Math.min(lo + 1, buf.length - 1)]
    const span = b.t - a.t
    const alpha = span > 1e-6 ? (t - a.t) / span : 0

    const lerp = (x: number, y: number) => x + (y - x) * alpha
    const byName: Record<string, Point2D | undefined> = {}
    for (const name of MOVENET_KEYPOINT_NAMES) {
      const pa = a.byName[name]
      const pb = b.byName[name]
      if (!pa && !pb) { byName[name] = undefined; continue }
      const ax = pa?.x ?? 0, ay = pa?.y ?? 0, asc = pa?.score ?? 0
      const bx = pb?.x ?? 0, by = pb?.y ?? 0, bsc = pb?.score ?? 0
      byName[name] = { x: lerp(ax, bx), y: lerp(ay, by), score: lerp(asc, bsc) }
    }
    const lerpAngle = (x: number, y: number) => {
      if (Number.isNaN(x) && Number.isNaN(y)) return NaN
      if (Number.isNaN(x)) return y
      if (Number.isNaN(y)) return x
      return lerp(x, y)
    }
    const angles = {
      'L Knee': lerpAngle(a.angles['L Knee'], b.angles['L Knee']),
      'R Knee': lerpAngle(a.angles['R Knee'], b.angles['R Knee']),
      'L Hip': lerpAngle(a.angles['L Hip'], b.angles['L Hip']),
      'R Hip': lerpAngle(a.angles['R Hip'], b.angles['R Hip']),
      'L Elbow': lerpAngle(a.angles['L Elbow'], b.angles['L Elbow']),
      'R Elbow': lerpAngle(a.angles['R Elbow'], b.angles['R Elbow']),
    } as LiveAngles
    return { byName, angles, t }
  }

  private buildInputTensor(tEnd: number): OrtNS.Tensor {
    const T = WINDOW_FRAMES
    const data = new Float32Array(T * V * C)
    const tStart = tEnd - WINDOW_DURATION_SEC

    // Pencereyi GERÇEK ZAMANA göre T eşit noktaya yeniden örnekle (bkz. yukarıdaki yorum) —
    // tarayıcının gerçek yakalama hızından bağımsız olarak modele her zaman eğitimdeki gibi
    // ~WINDOW_DURATION_SEC'lik, T=WINDOW_FRAMES noktalı bir pencere gitsin diye.
    const resampled: BufferedFrame[] = []
    for (let i = 0; i < T; i++) {
      const t = tStart + (i * WINDOW_DURATION_SEC) / (T - 1)
      resampled.push(this.interpolateAt(t))
    }

    // Gövde ölçeği: PENCERE İÇİ (yeniden örneklenmiş) medyan omuz-orta<->kalça-orta mesafesi —
    // dataset.py normalize_sequence() ile AYNI (her pencere kendi ölçeğini bağımsız hesaplıyor).
    const torsoLens: number[] = []
    for (const f of resampled) {
      const ls = f.byName[MOVENET_KEYPOINT_NAMES[L_SHOULDER]]
      const rs = f.byName[MOVENET_KEYPOINT_NAMES[R_SHOULDER]]
      const lh = f.byName[MOVENET_KEYPOINT_NAMES[L_HIP]]
      const rh = f.byName[MOVENET_KEYPOINT_NAMES[R_HIP]]
      if (ls && rs && lh && rh) {
        const shMidX = (ls.x + rs.x) / 2, shMidY = (ls.y + rs.y) / 2
        const hipMidX = (lh.x + rh.x) / 2, hipMidY = (lh.y + rh.y) / 2
        const d = Math.hypot(shMidX - hipMidX, shMidY - hipMidY)
        if (d > 1e-3) torsoLens.push(d)
      }
    }
    let scale = torsoLens.length > 0 ? median([...torsoLens].sort((a, b) => a - b)) : 1.0
    scale = Math.max(scale, 1e-3)

    for (let t = 0; t < T; t++) {
      const f = resampled[t]
      const lh = f.byName[MOVENET_KEYPOINT_NAMES[L_HIP]]
      const rh = f.byName[MOVENET_KEYPOINT_NAMES[R_HIP]]
      // Kalça (ya da tüm frame) algılanamadıysa offline pipeline'daki "eksik frame -> tüm sıfır"
      // (bkz. data_utils.py extract_sequence) konvansiyonuyla tutarlı olsun diye 0,0 kullanılıyor.
      const hipMidX = lh && rh ? (lh.x + rh.x) / 2 : 0
      const hipMidY = lh && rh ? (lh.y + rh.y) / 2 : 0

      for (let j = 0; j < 17; j++) {
        const p = f.byName[MOVENET_KEYPOINT_NAMES[j]]
        const rawX = p ? p.x : 0
        const rawY = p ? p.y : 0
        const score = p ? (p.score ?? 0) : 0
        const base = (t * V + j) * C
        data[base + 0] = (rawX - hipMidX) / scale
        data[base + 1] = (rawY - hipMidY) / scale
        data[base + 2] = score
      }

      // Sentetik Hip düğümü — tanım gereği normalize uzayda orijin, skor = (L_Hip+R_Hip)/2.
      const hipBase = (t * V + HIP_IDX) * C
      data[hipBase + 0] = 0
      data[hipBase + 1] = 0
      data[hipBase + 2] = ((lh?.score ?? 0) + (rh?.score ?? 0)) / 2

      // Açı kanalı (derece -> /180 normalize), sadece ilgili 4 düğüme yerleştirilir.
      const a = f.angles
      const setAngle = (jointIdx: number, deg: number) => {
        if (Number.isNaN(deg)) return
        data[(t * V + jointIdx) * C + 3] = deg / 180
      }
      setAngle(L_KNEE, a['L Knee'])
      setAngle(R_KNEE, a['R Knee'])
      setAngle(L_HIP, a['L Hip'])
      setAngle(R_HIP, a['R Hip'])
    }

    return new this.ort!.Tensor('float32', data, [1, T, V, C])
  }

  reset(): void {
    this.buffer = []
    this.lastInferAtT = -Infinity
  }
}
