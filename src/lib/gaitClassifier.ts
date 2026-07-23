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
// geliyordu. Canlıda push() her requestAnimationFrame karesinde çağrılıyor (~45-55fps ölçüldü,
// bkz. konuşma — DEBUG_LOG çıktısı), yani AYNI 110 kare canlıda sadece ~2sn'ye sıkışıyor: model
// öğrendiğinden çok daha "hızlandırılmış" bir hareket görüyor. Bu, gözlemlenen sistematik yanlış
// sınıflandırmanın (yüksek güvenle hep "anormal") olası kök nedeni. Burada push() akışını
// ~30fps'e THROTTLE ediyoruz (diğer canlı özellikler — açı paneli, metrikler, adım sayacı — bu
// sınıflandırıcıdan bağımsız, hâlâ her karede çalışmaya devam ediyor, SADECE bu deneysel
// modülün kendi buffer'ı yavaşlatılıyor). GAVD'nin gerçek per-video fps'i bilinmiyor (YouTube
// kaynaklı, değişken olabilir) — 30fps, projedeki mevcut REHAB24-6 varsayımıyla tutarlı bir
// ilk yaklaşım, kesin garanti değil.
const TARGET_FPS = 30
const MIN_FRAME_INTERVAL_SEC = 1 / TARGET_FPS

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
  private framesSinceLastInfer = 0

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

  /** Her karede çağrılır — kayan pencere buffer'ına (en fazla WINDOW_FRAMES) ekler.
   * TARGET_FPS'e throttle edilir (bkz. yukarıdaki yorum) — RAF'ın gerçek karesi değil, eğitim
   * verisinin varsayılan fps'ine yakın bir örnekleme oranı burada önemli olan. */
  push(byName: Record<string, Point2D | undefined>, angles: LiveAngles, tSec: number = performance.now() / 1000): void {
    const last = this.buffer[this.buffer.length - 1]
    if (last && tSec - last.t < MIN_FRAME_INTERVAL_SEC) return
    this.buffer.push({ byName, angles, t: tSec })
    if (this.buffer.length > WINDOW_FRAMES) this.buffer.shift()
    this.framesSinceLastInfer++
  }

  /** Pencere dolu VE WINDOW_STRIDE kare biriktiyse yeni bir tahmin döner, aksi halde null. */
  async maybeClassify(): Promise<GaitClassification | null> {
    if (!this.session || !this.ort) return null
    if (this.buffer.length < WINDOW_FRAMES) return null
    if (this.framesSinceLastInfer < WINDOW_STRIDE) return null
    this.framesSinceLastInfer = 0

    const x = this.buildInputTensor()
    const lengths = new this.ort.Tensor('int64', BigInt64Array.from([BigInt(WINDOW_FRAMES)]), [1])

    const results = await this.session.run({ x, lengths })
    const logit = Number(results.logit.data[0])
    const probNormal = 1 / (1 + Math.exp(-logit))
    const label: 'normal' | 'abnormal' = probNormal >= 0.5 ? 'normal' : 'abnormal'
    const confidence = label === 'normal' ? probNormal : 1 - probNormal

    if (DEBUG_LOG) {
      const windowDurationSec = this.buffer[this.buffer.length - 1].t - this.buffer[0].t
      const angleNonZeroFrac = this.buffer.filter(f =>
        !Number.isNaN(f.angles['L Knee']) || !Number.isNaN(f.angles['R Knee']) ||
        !Number.isNaN(f.angles['L Hip']) || !Number.isNaN(f.angles['R Hip']),
      ).length / this.buffer.length
      const xData = x.data as Float32Array
      let xMin = Infinity, xMax = -Infinity, xSum = 0, xAbsSum = 0
      for (let i = 0; i < xData.length; i += C) {
        const v = xData[i]
        if (v < xMin) xMin = v
        if (v > xMax) xMax = v
        xSum += v
        xAbsSum += Math.abs(v)
      }
      const nNodes = xData.length / C
      console.log('[gaitClassifier DEBUG]', {
        windowDurationSec: windowDurationSec.toFixed(2),
        impliedFps: (WINDOW_FRAMES / windowDurationSec).toFixed(1),
        angleChannelPresentFrac: angleNonZeroFrac.toFixed(2),
        xChannelMin: xMin.toFixed(3), xChannelMax: xMax.toFixed(3),
        xChannelMeanAbs: (xAbsSum / nNodes).toFixed(3),
        logit: logit.toFixed(4), probNormal: probNormal.toFixed(4), label,
      })
    }

    return { label, probNormal, confidence }
  }

  private buildInputTensor(): OrtNS.Tensor {
    const T = WINDOW_FRAMES
    const data = new Float32Array(T * V * C)

    // Gövde ölçeği: PENCERE İÇİ medyan omuz-orta<->kalça-orta mesafesi — dataset.py
    // normalize_sequence() ile AYNI (her pencere kendi ölçeğini bağımsız hesaplıyor).
    const torsoLens: number[] = []
    for (const f of this.buffer) {
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
      const f = this.buffer[t]
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
    this.framesSinceLastInfer = 0
  }
}
