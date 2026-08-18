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

// SONRADAN DÜZELTME #2 (denendi, TERS ETKİ yaptığı için GERİ ALINDI — bkz. konuşma): kare-sayısı
// bazlı pencereleme (offline'la "birebir simetrik" görünen ama aslında YANLIŞ bir fikirdi) —
// push()'u hiç sınırlamayınca tarayıcı 34-60fps'e çıkıp pencereyi eğitimden KISA yapıyordu (
// DÜZELTME #3: push()'u throttle et), throttle edince de BU SEFER cihaz/tarayıcının GERÇEK
// MoveNet çıkarım hızı hedefin (30fps) ALTINDA kalabiliyor (ölçüldü: 17.8-18.2fps) — pencere
// eğitimden ÇOK UZUN oluyor (6sn, hedef ~3.67sn yerine). SONUÇ: canlı tarayıcının poz-çıkarım
// hızı fiziksel olarak KONTROL EDİLEMEZ (cihaza/CPU yüküne göre 17-60fps arası değişebiliyor,
// bkz. konuşma'daki iki farklı DEBUG_LOG turu) — kare SAYISINA dayalı hiçbir pencereleme stratejisi
// (throttle'lı ya da throttle'sız) tutarlı bir gerçek-süre üretemez.
//
// KALICI ÇÖZÜM (asıl doğru yaklaşım): pencereyi GERÇEK ZAMANA göre tampona alıp, sınıflandırma
// anında HER ZAMAN tam WINDOW_DURATION_SEC'e (aşağıda) karşılık gelen T=WINDOW_FRAMES noktaya
// lineer interpolasyonla yeniden örnekle — cihazın gerçek çıkarım hızı ne olursa olsun (17,
// 30, 60fps...) modele DAİMA eğitimdekiyle aynı gerçek-süreli bir pencere gider. Bu YÖNTEM daha
// önce de denenmişti ama ASSUMED_TRAIN_FPS=30 o zaman bir TAHMİNDİ; şimdi check_native_fps.py
// ile DOĞRULANDI: GAVD median=29.97fps (n=229), Toronto median=29.50fps (n=28) — yani hedef
// pencere süresi (WINDOW_FRAMES/30≈3.667sn) GAVD/Toronto için doğru. (WeightGait'in kendi
// native fps'i — 7.00, sabit — TAMAMEN AYRI bir konu: o TRAIN-TARAFI bir düzeltme gerektiriyordu,
// denendi ama metrikleri kötüleştirdiği için geri alındı, bkz. konuşma — deploy edilen model
// WeightGait düzeltmesinden ÖNCEKİ checkpoint. Canlı taraf sadece GAVD/Toronto'nun ~30fps
// rejimini hedefler, bu ikisi eğitim verisinin çoğunluğu ve en güvenilir kısmı.)
const ASSUMED_TRAIN_FPS = 30
const WINDOW_DURATION_SEC = WINDOW_FRAMES / ASSUMED_TRAIN_FPS // ~3.667sn
const STRIDE_DURATION_SEC = WINDOW_STRIDE / ASSUMED_TRAIN_FPS // ~1.833sn
// Bellek güvenliği için buffer'da bu süreden fazla veri tutmaya gerek yok (küçük bir marjla).
const MAX_BUFFER_AGE_SEC = WINDOW_DURATION_SEC + 1.0

const V = 18 // 17 COCO eklemi + sentetik 'Hip'
const C = 4  // x_norm, y_norm, skor, açı
const HIP_IDX = 17

// SKOR KANALI HOTFIX (2026-08-18, bkz. diag_live_offline_2x2.py E/F/G hücreleri): model
// offline TF-Hub MoveNet çıkarımının DÜŞÜK skor dağılımıyla (ortalama ~0.32) eğitildi;
// canlı TF.js MoveNet ise sistematik YÜKSEK skor üretiyor (ortalama ~0.62) — skor bir girdi
// kanalı olduğu için bu dağılım kayması TEK BAŞINA kararı deviriyordu (offline koordinat +
// canlı skor = 0.049; canlı koordinat + offline skor = 0.906; canlı koordinat + sabit 0.32
// = 0.951). Modele giden skor kanalı eğitim ortalamasına sabitleniyor; GERÇEK skorlar
// smoothing/geçerlilik kontrollerinde kullanılmaya devam ediyor. KALICI çözüm: skor kanalsız
// yeniden eğitim (skor kanalı üçüncü kez kısayol çıktı — Health&Gait hardcode=1.0 dersi).
const TRAIN_SCORE_MEAN = 0.32

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
  probNormal: number // son AGG_MAX_WINDOWS pencerenin ORTALAMA sigmoid(logit)'i — bkz. AGG_MAX_WINDOWS yorumu
  confidence: number
  windowProbNormal: number // SADECE bu pencerenin sigmoid(logit)'i (aggregation öncesi ham değer)
  nAggWindows: number // ortalamaya giren pencere sayısı (1..AGG_MAX_WINDOWS)
}

// Pencere-düzeyi karar gürültülü: TRUBA'daki per-video hata analizi (eval_per_video.py,
// gavd_gait_extra_normal_v1 test split) pencere-düzeyi acc=0.886 iken pencere-ortalaması
// video-düzeyi acc=0.970 ölçtü — tek pencere kararları aynı videoda 0.16-0.72 arası
// salınabiliyor (vanilla_walk offline'da da aynı desen). Bu yüzden rozet, SON
// AGG_MAX_WINDOWS pencerenin ortalama probNormal'ine göre belirleniyor. 5 pencere x
// STRIDE_DURATION_SEC (~1.83sn) ≈ son ~9sn'lik yürüyüşü kapsar — canlı geri bildirim için
// yeterince taze, tek-pencere gürültüsünü bastıracak kadar geniş.
const AGG_MAX_WINDOWS = 5

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
  private recentWindowProbs: number[] = []

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

  /** Her karede çağrılır — buffer'a ham (zaman damgalı) kareyi ekler. Hız sınırlaması YOK
   * (bkz. yukarıdaki yorum — hem throttle'lı hem throttle'sız kare-sayısı yaklaşımı denendi,
   * ikisi de tutarsız cihaz hızı yüzünden başarısız oldu); sınıflandırma anında (buildInputTensor)
   * zaman-tabanlı yeniden örnekleme yapılıyor. Bellek için MAX_BUFFER_AGE_SEC'ten eski kareler atılır. */
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
    const windowProbNormal = 1 / (1 + Math.exp(-logit))

    // Aggregation (bkz. AGG_MAX_WINDOWS yorumu) — karar tek pencereye değil son pencerelerin
    // ortalamasına dayanıyor.
    this.recentWindowProbs.push(windowProbNormal)
    if (this.recentWindowProbs.length > AGG_MAX_WINDOWS) this.recentWindowProbs.shift()
    const probNormal = this.recentWindowProbs.reduce((s, p) => s + p, 0) / this.recentWindowProbs.length
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
        logit: logit.toFixed(4), windowProbNormal: windowProbNormal.toFixed(4),
        aggProbNormal: probNormal.toFixed(4), nAggWindows: this.recentWindowProbs.length, label,
      })
    }

    return { label, probNormal, confidence, windowProbNormal, nAggWindows: this.recentWindowProbs.length }
  }

  /** t zamanındaki değeri, buffer'daki en yakın iki ham kare arasında lineer interpolasyonla
   * hesaplar (t, buffer aralığının dışındaysa en yakın uca kenetlenir — clamp). */
  private interpolateAt(t: number): BufferedFrame {
    const buf = this.buffer
    if (t <= buf[0].t) return buf[0]
    if (t >= buf[buf.length - 1].t) return buf[buf.length - 1]

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

  private buildInputTensor(tEnd: number): OrtNS.Tensor {
    const T = WINDOW_FRAMES
    const data = new Float32Array(T * V * C)
    const tStart = tEnd - WINDOW_DURATION_SEC

    // Pencereyi GERÇEK ZAMANA göre T eşit noktaya yeniden örnekle (bkz. yukarıdaki yorum) —
    // cihazın gerçek çıkarım hızından bağımsız olarak modele her zaman eğitimdeki gibi
    // ~WINDOW_DURATION_SEC'lik, T=WINDOW_FRAMES noktalı bir pencere gitsin diye.
    let resampled: BufferedFrame[] = []
    for (let i = 0; i < T; i++) {
      const t = tStart + (i * WINDOW_DURATION_SEC) / (T - 1)
      resampled.push(this.interpolateAt(t))
    }
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
        const base = (t * V + j) * C
        data[base + 0] = (rawX - hipMidX) / scale
        data[base + 1] = (rawY - hipMidY) / scale
        // Eklem hiç algılanamadıysa 0 (offline "eksik -> sıfır" konvansiyonu), algılandıysa
        // TF.js'in kendi skoru DEĞİL eğitim ortalaması (bkz. TRAIN_SCORE_MEAN hotfix yorumu).
        data[base + 2] = p ? TRAIN_SCORE_MEAN : 0
      }

      // Sentetik Hip düğümü — tanım gereği normalize uzayda orijin.
      const hipBase = (t * V + HIP_IDX) * C
      data[hipBase + 0] = 0
      data[hipBase + 1] = 0
      data[hipBase + 2] = lh && rh ? TRAIN_SCORE_MEAN : 0

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
    // Video döngüsü/kaynak değişimi = yeni oturum; önceki pencere olasılıkları yeni içerikle
    // ilgisiz, ortalamayı kirletmesin.
    this.recentWindowProbs = []
  }
}
