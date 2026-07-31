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

// SONRADAN DÜZELTME #2 (bkz. konuşma — classify_test_video_offline.py ile offline/canlı KESİN
// karşılaştırması): "gerçek zamana göre WINDOW_DURATION_SEC=~3.667sn'e zorla yeniden örnekle"
// fikri (bir önceki sürüm) YANLIŞ bir varsayıma dayanıyordu. movenet_pose_extractor.py (TÜM
// eğitim verisi — GAVD/WeightGait/Toronto — bundan geçiyor) videoyu NATIVE FPS'te, HİÇBİR
// resampling/normalize olmadan okuyor (bkz. o dosyadaki extract_video() — düz cap.read()
// döngüsü); data_utils.py sliding_windows_from_full_video de WINDOW_FRAMES=110'u SAF KARE
// SAYISI olarak kullanıyor (frame_idx ile indeksleme, gerçek zamanla hiç ilgisi yok).
// ASSUMED_TRAIN_FPS=30 varsayımı sadece ÇOK ÖNCEKİ REHAB24-6-only döneminden (o veri seti
// gerçekten 30fps'ti) kalma bir mirastı — GAVD/WeightGait/Toronto'nun karışık kaynaklı ham
// videolarının native fps'i muhtemelen 30'dan farklı, bu yüzden pencereyi zorla 3.667 gerçek
// saniyeye interpolasyonla sıkıştırmak/uzatmak modele SİSTEMATİK OLARAK YANLIŞ HIZDA bir
// yürüyüş besliyordu. KANIT: classify_test_video_offline.py (native fps, resampling yok) AYNI
// videoyu ve AYNI checkpoint'i kullanarak "normal" diyor (probNormal 0.56-0.76), canlı (zamana
// göre zorla yeniden örnekleyen eski kod) ise ısrarla "anormal" diyordu.
//
// KALICI ÇÖZÜM: offline'la BİREBİR SİMETRİK ol — pencereyi KARE SAYISINA göre oluştur (son
// WINDOW_FRAMES ham push edilmiş kare, interpolasyon/resampling YOK), gerçek süresi ne olursa
// olsun (tıpkı offline'da farklı native-fps videoların da öyle işlenmesi gibi).
// Bellek/duraklama güvenliği için buffer'ı yine de makul bir üst sınırla tutuyoruz (gerçek
// pencere boyutuyla ilgisi yok, sadece video duraklatılırsa vs. sonsuz büyümesin diye).
const MAX_BUFFER_FRAMES = WINDOW_FRAMES * 3

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
  private totalPushed = 0
  private lastInferAtPushCount = 0

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

  /** Her karede çağrılır — buffer'a ham (zaman damgalı) kareyi ekler. KARE SAYISINA göre
   * sınırlanıyor (bkz. yukarıdaki yorum — offline'la simetrik olsun diye), zamana göre DEĞİL. */
  push(byName: Record<string, Point2D | undefined>, angles: LiveAngles, tSec: number = performance.now() / 1000): void {
    this.buffer.push({ byName, angles, t: tSec })
    this.totalPushed++
    while (this.buffer.length > MAX_BUFFER_FRAMES) this.buffer.shift()
  }

  /** Buffer en az WINDOW_FRAMES ham kare biriktiyse VE son tahminden bu yana en az
   * WINDOW_STRIDE yeni ham kare push edildiyse yeni bir tahmin döner, aksi halde null. */
  async maybeClassify(): Promise<GaitClassification | null> {
    if (!this.session || !this.ort) return null
    if (this.buffer.length < WINDOW_FRAMES) return null
    if (this.totalPushed - this.lastInferAtPushCount < WINDOW_STRIDE) return null
    this.lastInferAtPushCount = this.totalPushed

    const x = this.buildInputTensor()
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
      const windowFrames = this.buffer.slice(-WINDOW_FRAMES)
      const winSpanSec = windowFrames[windowFrames.length - 1].t - windowFrames[0].t
      console.log('[gaitClassifier DEBUG]', {
        windowFrames: WINDOW_FRAMES,
        windowSpanSec: winSpanSec.toFixed(2),
        windowImpliedFps: (winSpanSec > 0 ? (WINDOW_FRAMES - 1) / winSpanSec : 0).toFixed(1),
        angleChannelPresentFrac: (anglePresentCount / WINDOW_FRAMES).toFixed(2),
        xChannelMin: xMin.toFixed(3), xChannelMax: xMax.toFixed(3),
        xChannelMeanAbs: (xAbsSum / nNodes).toFixed(3),
        logit: logit.toFixed(4), probNormal: probNormal.toFixed(4), label,
      })
    }

    return { label, probNormal, confidence }
  }

  /** dataset.py _smooth_keypoints() ile BİREBİR AYNI mantık (bkz. o fonksiyonun docstring'i —
   * neden hem burada hem orada gerekli): 3 kareli hareketli MEDYAN, sadece score>0 komşular
   * arasında; eksik (score<=0) kareler DEĞİŞTİRİLMİYOR, en az 2 geçerli komşu yoksa kare de
   * değiştirilmiyor. Girdi/çıktı: yeniden örneklenmiş T'lik BufferedFrame dizisi. */
  private smoothResampled(frames: BufferedFrame[]): BufferedFrame[] {
    const T = frames.length
    const out: BufferedFrame[] = frames.map(f => ({ byName: { ...f.byName }, angles: f.angles, t: f.t }))
    for (const name of MOVENET_KEYPOINT_NAMES) {
      for (let t = 0; t < T; t++) {
        const p = frames[t].byName[name]
        if (!p || (p.score ?? 0) <= 0) continue
        const lo = Math.max(0, t - 1), hi = Math.min(T, t + 2)
        const xs: number[] = [], ys: number[] = []
        for (let tt = lo; tt < hi; tt++) {
          const pp = frames[tt].byName[name]
          if (pp && (pp.score ?? 0) > 0) { xs.push(pp.x); ys.push(pp.y) }
        }
        if (xs.length >= 2) {
          xs.sort((a, b) => a - b); ys.sort((a, b) => a - b)
          const mid = Math.floor(xs.length / 2)
          const medX = xs.length % 2 === 0 ? (xs[mid - 1] + xs[mid]) / 2 : xs[mid]
          const medY = ys.length % 2 === 0 ? (ys[mid - 1] + ys[mid]) / 2 : ys[mid]
          out[t].byName[name] = { x: medX, y: medY, score: p.score }
        }
      }
    }
    return out
  }

  private buildInputTensor(): OrtNS.Tensor {
    const T = WINDOW_FRAMES
    const data = new Float32Array(T * V * C)

    // Pencere = son T ham push edilmiş kare, AYNEN offline'daki gibi (data_utils.py
    // extract_sequence — ardışık frame_idx, gerçek zamanla ilgisi yok). İnterpolasyon/yeniden
    // örnekleme YOK (bkz. yukarıdaki yorum — eski sürüm bunu yapıyordu, yanlıştı).
    let resampled: BufferedFrame[] = this.buffer.slice(-T)
    // Tek-kare poz tespiti sıçramalarını (bkz. konuşma — analyze_gait_speed.py'de gözlemlenen
    // ~180° diz ROM sıçraması) yumuşat — dataset.py _smooth_keypoints() ile SİMETRİK, aksi
    // halde train/inference dağılım kayması yaratırdık.
    resampled = this.smoothResampled(resampled)

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
    this.totalPushed = 0
    this.lastInferAtPushCount = 0
  }
}
