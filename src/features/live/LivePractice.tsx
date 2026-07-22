// Canlı Pratik — tamamen istemci-taraflı (tarayıcı) gerçek-zamanlı YÜRÜYÜŞ (gait) izleme.
//
// Kapsam (bkz. docs/scgnet-arastirma-raporu.md Bölüm 4, docs/real-time-arastirma-raporu.md):
// TRUBA/SLURM batch mimarisi gerçek-zamanlıya yapısal olarak uygun değil, bu yüzden bu mod
// TRUBA'ya hiç dokunmuyor — görüntü MoveNet (TensorFlow.js, WebGL backend) ile tamamen
// tarayıcıda işleniyor, hiçbir video/frame sunucuya gitmiyor.
//
// Şu an sağlanan canlı özellikler:
//  - İskelet overlay + açı paneli (diz/kalça/dirsek — ayak bileği açısı COCO-17'de ayak/parmak
//    noktası olmadığı için yok, offline HRNet-2D pipeline'ıyla aynı kısıt).
//  - Klinik normal aralık dışına çıkınca kırmızı/sarı renk kodlaması (bkz. lib/angleRanges.ts,
//    analiz sayfasıyla AYNI eşikler).
//  - Metrikler sekmesi: çalışan ortalama/açısal hız RMS/ROM (bkz. lib/liveMetrics.ts) + son
//    12sn'lik kayan grafik + sol/sağ simetri (diz ROM farkı, kalça ortalama farkı, adım süresi
//    farkı) + adım ritmi (ort. adım süresi + düzensizlik, bkz. lib/stepTiming.ts).
//  - Tepe-vadi tabanlı adım tespiti (bkz. lib/repCounter.ts) — video üzerinde canlı adım sayacı.
//  - YAKLAŞIK kadans/adım uzunluğu/yürüyüş hızı (bkz. lib/gaitMetrics.ts) — piksel->metre ölçek
//    tahminine dayanıyor, MeTRAbs'in 3D+derinlik kesinliğiyle eş değer DEĞİL.
//  - Geri Bildirim sekmesi: kural-tabanlı (ML DEĞİL) metinsel yorumlar (bkz. lib/liveFeedback.ts)
//    — offline analiz sayfasındaki GaitFeedback.tsx bileşeni yeniden kullanılıyor.
//  - Konumlanma/kadraj uyarısı (bkz. lib/framingCheck.ts) — tam boy görünmüyorsanız veya
//    kameraya dönük duruyorsanız video üzerinde bloklamayan bir bilgi bandı gösterir.
//  - Donmuş poz otomatik kurtarma (bkz. FREEZE_TIME_SEC) — MoveNet sabit bir nesneye (örn. bir
//    su şişesi) kilitlenip kişiyi kaybederse, birkaç saniye hareketsizlik sonrası otomatik
//    olarak detector.reset() ile tam-kare yeniden aramaya zorlanır.
//
//  - (Deneysel) ML tabanlı canlı yürüyüş sınıflandırması (bkz. lib/gaitClassifier.ts, real-time
//    roadmap madde C) — GAVD-only ST-GCN checkpoint'inin ONNX'e taşınmış hali, onnxruntime-web
//    ile tarayıcıda WASM backend'inde çalışıyor. Model dosyası (public/models/gavd_gait_v1.onnx)
//    repo'da yoksa yükleme sessizce başarısız olur ve rozet HİÇ görünmez — MoveNet/açı/metrik/
//    Geri Bildirim özellikleri bundan bağımsız, her zaman çalışır. Bu, "Geri Bildirim" sekmesinin
//    (kural-tabanlı) YERİNE değil, ona ek deneysel bir sinyal — REHAB24-6 tabanlı egzersiz-
//    doğruluğu sınıflandırmasıyla KARIŞTIRILMAMALI, bu tamamen ayrı bir GAVD yürüyüş-anormalliği
//    modeli (bkz. scripts/gavd/run_stgcn_train_gavd.sh yorumu — iki veri seti kasıtlı olarak
//    birleştirilmedi).
//
// İki kaynak modu var:
//  - 'camera': webcam, canlı — orijinal kullanım senaryosu.
//  - 'file': kullanıcının seçtiği bir video dosyası, kendi hızında oynatılırken aynı
//    pipeline'dan (MoveNet + canvas overlay + açı paneli) geçiyor. Amaç: her denemede kamera
//    karşısında durmak zorunda kalmadan, önceden kaydedilmiş bir videoyla karşılaştırma/test
//    yapabilmek. Kayıt/analiz sunucuya gitmiyor, sadece bu ekranda oynatılıyor.
import { useEffect, useRef, useState, useCallback } from 'react'
import { X, Loader2, AlertCircle, Camera, Gauge, Video, Upload, Play, Pause, RotateCcw, RefreshCw, Footprints } from 'lucide-react'
import type * as PoseDetectionNS from '@tensorflow-models/pose-detection'
import {
  MOVENET_KEYPOINT_NAMES, SKELETON_EDGES, MIN_SCORE,
  computeLiveAngles, torsoLengthPx, midpoint, type Point2D, type LiveAngles,
} from '../../lib/poseAngles'
import { LiveMetricsTracker, type JointStat, type LiveGraphPoint } from '../../lib/liveMetrics'
import { LiveAnglesGraph } from './LiveAnglesGraph'
import { getAngleColor } from '../../lib/angleRanges'
import { RepCounter } from '../../lib/repCounter'
import { GaitMetricsTracker } from '../../lib/gaitMetrics'
import { buildLiveFeedback, romSpan, MIN_STEPS_FOR_FEEDBACK } from '../../lib/liveFeedback'
import { GaitFeedback, type FeedbackItem } from '../../components/analysis/GaitFeedback'
import { computeStepTimingStats, type StepTimingStats } from '../../lib/stepTiming'
import { checkFraming } from '../../lib/framingCheck'
import { LiveGaitClassifier, type GaitClassification } from '../../lib/gaitClassifier'

interface LivePracticeProps {
  onClose: () => void
}

const ANGLE_LABELS: Record<keyof LiveAngles, string> = {
  'L Knee': 'Sol Diz', 'R Knee': 'Sağ Diz', 'L Hip': 'Sol Kalça', 'R Hip': 'Sağ Kalça',
  'L Elbow': 'Sol Dirsek', 'R Elbow': 'Sağ Dirsek',
}

const GRAPH_WINDOW_SEC = 12

// MoveNet Lightning performans için her karede TÜM görüntüde değil, önceki karenin etrafında
// küçük bir "crop" bölgesinde arama yapar (dahili akıllı takip). Gerçek kişi bu bölgeden çıkarsa
// (örn. sabit bir nesnenin — su şişesi vb. — arkasından geçip kaybolursa), model bazen o nesneye
// yeterince "insan gibi" bir güven skoruyla KİLİTLENİP kalabiliyor ve bir daha kendiliğinden
// düzelmiyor (gözlemlendi). Gerçek yürüyen bir kişi asla FREEZE_TIME_SEC boyunca aynı pikselde
// sabit kalmaz — bu süre boyunca poz merkezi FREEZE_PIXEL_THRESHOLD'dan az hareket ederse
// detector.reset() çağrılıp bir sonraki karede TÜM görüntüde yeniden arama zorlanıyor (bkz.
// draw() içindeki kullanım). Kısa bir mola/durma anında da tetiklenebilir ama bunun maliyeti
// düşük — reset sadece bir sonraki aramayı tüm-kareye genişletir, halen kadrajda duran kişiyi
// kaybettirmez.
const FREEZE_TIME_SEC = 2.5
const FREEZE_PIXEL_THRESHOLD = 10 // video-native piksel

// GAVD-only ST-GCN checkpoint'inin ONNX export'u (bkz. scripts/gavd/export_stgcn_onnx.py) —
// public/models/'a elle yerleştirilmesi gerekiyor (TRUBA'dan indirip kopyalanır). Dosya yoksa
// (404) model yükleme sessizce başarısız olur ve bu özellik UI'da hiç görünmez — MoveNet/açı/
// metrik özellikleri bundan etkilenmez, tamamen opsiyonel bir katman.
const GAIT_MODEL_URL = '/models/gavd_gait_v1.onnx'

// Bazı ağlarda (bkz. model yükleme effect'i) harici bir fetch hiç hata vermeden süresiz askıda
// kalabiliyor — bu yardımcı, promise'i bir süre sonra reddedip kullanıcının "Tekrar Dene"
// görmesini sağlıyor (aksi halde spinner sonsuza kadar döner).
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ])
}

type Mode = 'camera' | 'file'
type PanelTab = 'angles' | 'metrics' | 'feedback'
type LoadState = 'loading-model' | 'requesting-camera' | 'waiting-file' | 'loading-file' | 'running' | 'error'

export function LivePractice({ onClose }: LivePracticeProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const objectUrlRef = useRef<string | null>(null)
  const detectorRef = useRef<PoseDetectionNS.PoseDetector | null>(null)
  const rafRef = useRef<number | null>(null)
  const anglesElRef = useRef<Record<string, HTMLSpanElement | null>>({})
  const angleDivRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const fpsElRef = useRef<HTMLSpanElement | null>(null)
  const framingElRef = useRef<HTMLDivElement | null>(null)
  const freezeCheckRef = useRef<{ lastPos: Point2D | null; stableSinceT: number | null }>({ lastPos: null, stableSinceT: null })
  const mirrorRef = useRef(true)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const metricsTrackerRef = useRef(new LiveMetricsTracker())
  const metricsElRefs = useRef<Record<string, { mean?: HTMLSpanElement | null; vel?: HTMLSpanElement | null; rom?: HTMLSpanElement | null }>>({})
  const lastGraphUpdateRef = useRef(0)
  const repCounterRef = useRef(new RepCounter())
  const repCountElRef = useRef<HTMLSpanElement | null>(null)
  const gaitTrackerRef = useRef(new GaitMetricsTracker())
  const gaitElRefs = useRef<{ cadence?: HTMLSpanElement | null; stepLength?: HTMLSpanElement | null; speed?: HTMLSpanElement | null }>({})
  const symmetryElRefs = useRef<{ knee?: HTMLSpanElement | null; hip?: HTMLSpanElement | null; stepTime?: HTMLSpanElement | null }>({})
  const rhythmElRefs = useRef<{ meanTime?: HTMLSpanElement | null; cv?: HTMLSpanElement | null }>({})
  const stepCountRef = useRef(0)
  const stepTimingRef = useRef<StepTimingStats>({ stepTimeMeanSec: null, stepTimeCvPct: null, lrDiffPct: null })
  const lastFeedbackUpdateRef = useRef(0)
  // Deneysel canlı ST-GCN sınıflandırıcı (bkz. lib/gaitClassifier.ts) — MoveNet modelinden
  // BAĞIMSIZ, kendi model dosyasını kendi yükler; yoksa `ready` hep false kalır ve tüm push/
  // maybeClassify çağrıları no-op'a yakın davranır (sadece küçük bir bellek buffer'ı doldurur).
  const gaitClassifierRef = useRef(new LiveGaitClassifier())

  const [mode, setMode] = useState<Mode>('camera')
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [modelReady, setModelReady] = useState(false)
  const [state, setState] = useState<LoadState>('loading-model')
  const [error, setError] = useState<string | null>(null)
  const [playing, setPlaying] = useState(true)
  const [tab, setTab] = useState<PanelTab>('angles')
  const [graphData, setGraphData] = useState<LiveGraphPoint[]>([])
  const [liveFeedback, setLiveFeedback] = useState<FeedbackItem[]>([])
  // null = henüz sınıflandırma yok (model yüklenmedi / henüz yeterli kare birikmedi) — rozet bu
  // durumda hiç render edilmiyor, kullanıcı .onnx dosyası eklenene kadar özelliğin varlığını
  // fark etmez bile.
  const [gaitClassification, setGaitClassification] = useState<GaitClassification | null>(null)
  // Kamera izni reddedilince/hata olunca "Tekrar Dene" butonu bunu artırıp aşağıdaki kaynak
  // bağlama effect'ini (mode/videoFile değişmese bile) yeniden tetikler.
  const [retryKey, setRetryKey] = useState(0)

  mirrorRef.current = mode === 'camera'

  const stopCurrentSource = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    if (objectUrlRef.current) { URL.revokeObjectURL(objectUrlRef.current); objectUrlRef.current = null }
    const video = videoRef.current
    if (video) { video.pause(); video.srcObject = null; video.removeAttribute('src'); video.load() }
    // Yeni kaynak = yeni oturum; önceki kaynaktan kalan ROM/ortalama/adım sayısı anlamsız.
    metricsTrackerRef.current.reset()
    repCounterRef.current.reset()
    gaitTrackerRef.current.reset()
    stepCountRef.current = 0
    stepTimingRef.current = { stepTimeMeanSec: null, stepTimeCvPct: null, lrDiffPct: null }
    freezeCheckRef.current = { lastPos: null, stableSinceT: null }
    gaitClassifierRef.current.reset()
    setGraphData([])
    setLiveFeedback([])
    setGaitClassification(null)
  }, [])

  // ── Model yükleme — mount'ta, retryKey her artışta da (bkz. kaynak-bağlama
  //    effect'indeki AYNI mekanizma — "Tekrar Dene" butonu ikisini de tetikler) ──
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setState('loading-model')
        // Dinamik import: tfjs + pose-detection sadece bu ekran açıldığında indirilsin.
        const tf = await import('@tensorflow/tfjs')
        await import('@tensorflow/tfjs-backend-webgl')
        const poseDetection = await import('@tensorflow-models/pose-detection')

        await tf.setBackend('webgl')
        await tf.ready()

        // Varsayılan model URL'i (tfhub.dev) Kaggle'a, oradan da imzalı bir GCS URL'ine
        // yönlendiriyor — bu zincirin KENDİSİ doğru çalışıyor (gözlemlendi: tarayıcı network
        // panelinde geçerli bir imzalı URL'e kadar ulaşıyor), ama son indirme adımı bazı
        // ağlarda ara sıra hiç hata vermeden askıda kalabiliyor. (Not: bunun yerine denenen
        // sabit bir GCS mirror URL'i - storage.googleapis.com/tfjs-models/... - artık kaldırılmış
        // olduğundan 404 verdi, o yüzden varsayılan çözümlemeye geri dönüldü.) Tüm yükleme
        // sürecine bir zaman aşımı sarıyoruz ki askıda kalma durumunda kullanıcı süresiz
        // spinner yerine hata + "Tekrar Dene" görsün (transient bir ağ sorunuysa tekrar deneme
        // genelde yeterli).
        const detector = await withTimeout(
          poseDetection.createDetector(
            poseDetection.SupportedModels.MoveNet,
            { modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING },
          ),
          25000,
          'Model yükleme 25 saniyeden uzun sürdü — internet bağlantınızı kontrol edip tekrar deneyin.',
        )
        if (cancelled) { detector.dispose(); return }
        detectorRef.current = detector
        setModelReady(true)
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Model yüklenemedi')
        setState('error')
      }
    })()
    return () => {
      cancelled = true
      detectorRef.current?.dispose()
      detectorRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryKey])

  // ── Deneysel ST-GCN yürüyüş sınıflandırıcısı — MoveNet'ten mantıksal olarak bağımsız, sessiz
  //    başarısızlık. public/models/gavd_gait_v1.onnx henüz repo'da yoksa (ki export TRUBA'da
  //    henüz çalıştırılmadıysa böyledir) bu fetch 404 verir, konsola bir uyarı yazılır ve
  //    `gaitClassifierRef.current.ready` hep false kalır — geri kalan her şey (açılar, metrikler,
  //    Geri Bildirim) bundan tamamen etkilenmez.
  //    BİLE BİLE `modelReady`ye bağlı: MoveNet'in kendi yüklemesi (yukarıdaki effect) zaten
  //    kırılgan bir harici zincire (tfhub->Kaggle->imzalı GCS URL) bağlı ve zaman zaman ağır
  //    ağlarda askıda kalabiliyor (bkz. FREEZE/withTimeout yorumları). Bu sınıflandırıcının
  //    kendi indirmesi (~13.5MB WASM + ~1.2MB model) MoveNet ile AYNI ANDA (mount'ta paralel)
  //    başlarsa, aynı bant genişliğini paylaşarak MoveNet'in zaten sınırda olan 25sn'lik zaman
  //    aşımını gereksiz yere zorlayabilir — gözlemlendi. Bu yüzden MoveNet başarıyla yüklenip
  //    `modelReady` true olana kadar bu indirme hiç başlamıyor.
  useEffect(() => {
    if (!modelReady) return
    gaitClassifierRef.current.load(GAIT_MODEL_URL).catch(e => {
      console.warn('Deneysel yürüyüş sınıflandırma modeli yüklenemedi (opsiyonel özellik, göz ardı edilebilir):', e)
    })
  }, [modelReady])

  // ── Kaynak bağlama — model hazır olunca ve mod/dosya değiştikçe ──────────
  useEffect(() => {
    if (!modelReady) return
    let cancelled = false
    const video = videoRef.current
    if (!video) return

    stopCurrentSource()

    async function attachCamera() {
      try {
        setState('requesting-camera')
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
          audio: false,
        })
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        video!.srcObject = stream
        await video!.play()
        setPlaying(true)
        setState('running')
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Kameraya erişilemedi')
        setState('error')
      }
    }

    async function attachFile(file: File) {
      try {
        setState('loading-file')
        const url = URL.createObjectURL(file)
        objectUrlRef.current = url
        video!.srcObject = null
        video!.loop = true
        video!.src = url
        await video!.play()
        if (cancelled) return
        setPlaying(true)
        setState('running')
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Video oynatılamadı')
        setState('error')
      }
    }

    if (mode === 'camera') {
      void attachCamera()
    } else if (mode === 'file' && videoFile) {
      void attachFile(videoFile)
    } else {
      setState('waiting-file')
    }

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, videoFile, modelReady, stopCurrentSource, retryKey])

  // ── Algılama döngüsü — model hazır olduğu sürece sürekli çalışır,
  //    aktif kaynaktan kare gelmiyorsa (henüz hazır değilse) sessizce bekler ──
  useEffect(() => {
    if (!modelReady) return
    let frameCount = 0
    let fpsAccum = performance.now()

    const loop = async () => {
      const detector = detectorRef.current
      const video = videoRef.current
      const canvas = canvasRef.current
      if (!detector || !video || !canvas || video.readyState < 2 || video.paused) {
        rafRef.current = requestAnimationFrame(loop)
        return
      }

      const poses = await detector.estimatePoses(video, { flipHorizontal: false })
      draw(video, canvas, poses[0]?.keypoints as (Point2D & { name?: string })[] | undefined)

      // Deneysel ST-GCN sınıflandırması — model yüklenmediyse (bkz. yukarıdaki effect) `ready`
      // false'tur ve bu no-op'tur. Kendi iç WINDOW_STRIDE throttle'ı var (bkz. gaitClassifier.ts
      // maybeClassify), o yüzden burada ekstra bir hız sınırlama gerekmiyor.
      if (gaitClassifierRef.current.ready) {
        const classification = await gaitClassifierRef.current.maybeClassify()
        if (classification) setGaitClassification(classification)
      }

      frameCount++
      const now = performance.now()
      if (now - fpsAccum > 500) {
        const fps = (frameCount * 1000) / (now - fpsAccum)
        if (fpsElRef.current) fpsElRef.current.textContent = fps.toFixed(0)
        frameCount = 0
        fpsAccum = now
      }
      // Grafik (recharts) React state gerektiriyor — DOM ref'lerinin aksine her karede
      // setState çağırmak yerine 4Hz'e (250ms) throttle ediyoruz.
      if (now - lastGraphUpdateRef.current > 250) {
        lastGraphUpdateRef.current = now
        setGraphData(metricsTrackerRef.current.getGraphData().slice())
      }
      // Kural-tabanlı geri bildirim listesi de React state — daha da düşük sıklıkta (1Hz)
      // yeniden hesaplanması yeterli, kart metinleri her karede değişecek kadar oynak değil.
      if (now - lastFeedbackUpdateRef.current > 1000) {
        lastFeedbackUpdateRef.current = now
        setLiveFeedback(buildLiveFeedback(
          metricsTrackerRef.current.getStats(), gaitTrackerRef.current.getStats(), stepCountRef.current, stepTimingRef.current,
        ))
      }
      rafRef.current = requestAnimationFrame(loop)
    }

    function draw(
      video: HTMLVideoElement,
      canvas: HTMLCanvasElement,
      keypoints: (Point2D & { name?: string })[] | undefined,
    ) {
      const w = video.videoWidth, h = video.videoHeight
      if (w === 0 || h === 0) return
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h }
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      ctx.save()
      if (mirrorRef.current) {
        // Kamera modunda ayna görüntü (selfie-view) — kullanıcı için doğal.
        ctx.translate(w, 0)
        ctx.scale(-1, 1)
      }
      ctx.drawImage(video, 0, 0, w, h)

      // Donmuş poz tespiti (bkz. FREEZE_TIME_SEC yorumu) — su şişesi gibi sabit bir nesneye
      // kilitlenme durumunu MoveNet'in kendi crop-takip mantığından bağımsız olarak yakalıyoruz.
      if (keypoints && keypoints.length > 0) {
        const visiblePts = keypoints.filter(p => (p.score ?? 0) >= MIN_SCORE)
        if (visiblePts.length > 0) {
          const cx = visiblePts.reduce((s, p) => s + p.x, 0) / visiblePts.length
          const cy = visiblePts.reduce((s, p) => s + p.y, 0) / visiblePts.length
          const fc = freezeCheckRef.current
          const nowSec = performance.now() / 1000
          if (fc.lastPos == null || fc.stableSinceT == null) {
            fc.lastPos = { x: cx, y: cy }
            fc.stableSinceT = nowSec
          } else {
            const moved = Math.hypot(cx - fc.lastPos.x, cy - fc.lastPos.y)
            if (moved > FREEZE_PIXEL_THRESHOLD) {
              fc.lastPos = { x: cx, y: cy }
              fc.stableSinceT = nowSec
            } else if (nowSec - fc.stableSinceT > FREEZE_TIME_SEC) {
              // Donmuş — muhtemelen sabit bir nesneye takılı. Sıfırla, bir sonraki karede
              // tüm görüntüde yeniden arasın.
              detectorRef.current?.reset()
              fc.lastPos = null
              fc.stableSinceT = null
            }
          }
        }
      } else {
        freezeCheckRef.current = { lastPos: null, stableSinceT: null }
      }

      // byName pose varlığından BAĞIMSIZ olarak (boş obje ile) hesaplanıyor ki konumlanma
      // kontrolü (bkz. lib/framingCheck.ts) kimse algılanmadığında da çalışabilsin.
      const byName: Record<string, Point2D | undefined> = {}
      if (keypoints) for (const kp of keypoints) if (kp.name) byName[kp.name] = kp

      // Konumlanma/kadraj kontrolü — bloklamayan, sadece uyarı amaçlı.
      const framing = checkFraming(byName, h)
      if (framingElRef.current) {
        if (framing.ok || !framing.issue) {
          framingElRef.current.classList.add('hidden')
        } else {
          framingElRef.current.classList.remove('hidden')
          framingElRef.current.textContent = framing.issue
        }
      }

      if (keypoints && keypoints.length > 0) {
        ctx.lineWidth = 3
        ctx.strokeStyle = '#475569'
        for (const [a, b] of SKELETON_EDGES) {
          const pa = byName[a], pb = byName[b]
          if (!pa || !pb || (pa.score ?? 0) < MIN_SCORE || (pb.score ?? 0) < MIN_SCORE) continue
          ctx.beginPath()
          ctx.moveTo(pa.x, pa.y)
          ctx.lineTo(pb.x, pb.y)
          ctx.stroke()
        }

        for (const name of MOVENET_KEYPOINT_NAMES) {
          const p = byName[name]
          if (!p || (p.score ?? 0) < MIN_SCORE) continue
          ctx.beginPath()
          ctx.arc(p.x, p.y, 5, 0, Math.PI * 2)
          ctx.fillStyle = '#60a5fa'
          ctx.fill()
        }

        const angles = computeLiveAngles(byName)

        // Deneysel ST-GCN sınıflandırıcı buffer'ına ekleniyor — model henüz yüklenmediyse bu
        // sadece küçük bir bellek buffer'ı biriktirir, hiçbir hesaplama tetiklemez (bkz.
        // gaitClassifier.ts push/maybeClassify ayrımı).
        gaitClassifierRef.current.push(byName, angles)

        for (const key of Object.keys(ANGLE_LABELS) as (keyof LiveAngles)[]) {
          const val = angles[key]
          const el = anglesElRef.current[key]
          if (el) el.textContent = Number.isNaN(val) ? '—' : `${val.toFixed(0)}°`
          // Klinik normal aralık dışına çıkınca kırmızı/sarı — analiz sayfasıyla (AnalysisViewer)
          // aynı eşikler, bkz. lib/angleRanges.ts. NaN (takip kaybı) her zaman nötr renge düşer.
          const div = angleDivRefs.current[key]
          if (div) {
            const { bg, text } = getAngleColor(key, val)
            div.className = `rounded-lg px-3 py-2 transition-colors ${bg}`
            if (el) el.className = `text-sm font-bold font-mono ${text}`
          }
        }

        // Çalışan metrik takibi (ortalama, açısal hız RMS, ROM) — bkz. lib/liveMetrics.ts.
        // performance.now() kullanıyoruz: video.currentTime dosya modunda loop=true olduğunda
        // döngü başına 0'a sıfırlanıyor, bu da hız hesabında sahte sıçrama yaratır.
        metricsTrackerRef.current.push(angles, performance.now() / 1000)
        const stats = metricsTrackerRef.current.getStats()
        for (const key of Object.keys(ANGLE_LABELS) as (keyof LiveAngles)[]) {
          const refs = metricsElRefs.current[key]
          if (!refs) continue
          const s: JointStat | undefined = stats[key]
          if (refs.mean) refs.mean.textContent = s ? `${s.mean.toFixed(0)}°` : '—'
          if (refs.vel) refs.vel.textContent = s ? `${s.angularVelocityRms.toFixed(0)}°/sn` : '—'
          if (refs.rom) refs.rom.textContent = s && !Number.isNaN(s.romMin) ? `${s.romMin.toFixed(0)}°–${s.romMax.toFixed(0)}°` : '—'
        }

        // Sol/sağ simetri (bkz. lib/liveFeedback.ts romSpan) — diz ROM farkı ve kalça ortalama
        // açı farkı, mutlak derece cinsinden. Geri Bildirim sekmesindeki metinsel yorumla AYNI
        // hesabı kullanıyor (DRY), burada sadece ham sayı olarak gösteriliyor.
        const lKneeRomV = romSpan(stats['L Knee'])
        const rKneeRomV = romSpan(stats['R Knee'])
        if (symmetryElRefs.current.knee) {
          symmetryElRefs.current.knee.textContent =
            (lKneeRomV != null && rKneeRomV != null) ? `${Math.abs(lKneeRomV - rKneeRomV).toFixed(0)}°` : '—'
        }
        const lHipS = stats['L Hip'], rHipS = stats['R Hip']
        if (symmetryElRefs.current.hip) {
          symmetryElRefs.current.hip.textContent =
            (lHipS && rHipS) ? `${Math.abs(lHipS.mean - rHipS.mean).toFixed(0)}°` : '—'
        }

        // Tepe-vadi tabanlı adım tespiti (bkz. lib/repCounter.ts) — bir dizin en çok büktüğü
        // an (salınım fazı ortası) o bacağın adımının vekili. Sol+sağ diz toplamı = adım sayısı.
        const tSec = performance.now() / 1000
        repCounterRef.current.push(angles, tSec)
        const reps = repCounterRef.current.getReps()
        const stepCount = (reps['L Knee'] ?? 0) + (reps['R Knee'] ?? 0)
        stepCountRef.current = stepCount
        if (repCountElRef.current) repCountElRef.current.textContent = String(stepCount)

        // Adım ritmi (bkz. lib/stepTiming.ts) — adımlar arası süre düzenliliği + sol/sağ süre farkı.
        const timestamps = repCounterRef.current.getTimestamps()
        const stepTiming = computeStepTimingStats(timestamps['L Knee'] ?? [], timestamps['R Knee'] ?? [])
        stepTimingRef.current = stepTiming
        if (rhythmElRefs.current.meanTime) {
          rhythmElRefs.current.meanTime.textContent = stepTiming.stepTimeMeanSec != null ? `${stepTiming.stepTimeMeanSec.toFixed(2)}sn` : '—'
        }
        if (rhythmElRefs.current.cv) {
          rhythmElRefs.current.cv.textContent = stepTiming.stepTimeCvPct != null ? `%${stepTiming.stepTimeCvPct.toFixed(0)}` : '—'
        }
        if (symmetryElRefs.current.stepTime) {
          symmetryElRefs.current.stepTime.textContent = stepTiming.lrDiffPct != null ? `%${stepTiming.lrDiffPct.toFixed(0)}` : '—'
        }

        // Yaklaşık yürüyüş metrikleri (kadans/adım uzunluğu/hız) — bkz. lib/gaitMetrics.ts.
        const lHipG = byName.left_hip, rHipG = byName.right_hip
        const hipMidX = (lHipG && (lHipG.score ?? 1) >= MIN_SCORE) && (rHipG && (rHipG.score ?? 1) >= MIN_SCORE)
          ? midpoint(lHipG, rHipG).x
          : null
        gaitTrackerRef.current.pushFrame(hipMidX, torsoLengthPx(byName), performance.now() / 1000, stepCount)
        const gaitStats = gaitTrackerRef.current.getStats()
        if (gaitElRefs.current.cadence) gaitElRefs.current.cadence.textContent = gaitStats.cadence != null ? gaitStats.cadence.toFixed(0) : '—'
        if (gaitElRefs.current.stepLength) gaitElRefs.current.stepLength.textContent = gaitStats.stepLength != null ? `${gaitStats.stepLength.toFixed(2)}m` : '—'
        if (gaitElRefs.current.speed) gaitElRefs.current.speed.textContent = gaitStats.walkingSpeed != null ? `${gaitStats.walkingSpeed.toFixed(2)}m/sn` : '—'
      }
      ctx.restore()
    }

    rafRef.current = requestAnimationFrame(loop)
    return () => { if (rafRef.current != null) cancelAnimationFrame(rafRef.current) }
  }, [modelReady])

  // Bileşen kapanınca kaynağı tamamen serbest bırak
  useEffect(() => () => stopCurrentSource(), [stopCurrentSource])

  function handleModeChange(next: Mode) {
    if (next === mode) return
    setMode(next)
    if (next === 'camera') setVideoFile(null)
  }

  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) setVideoFile(f)
    e.target.value = ''
  }

  function togglePlay() {
    const video = videoRef.current
    if (!video) return
    if (video.paused) { void video.play(); setPlaying(true) }
    else { video.pause(); setPlaying(false) }
  }

  function restart() {
    const video = videoRef.current
    if (!video) return
    video.currentTime = 0
    void video.play()
    setPlaying(true)
  }

  const showLoadingOverlay = state === 'loading-model' || state === 'requesting-camera' || state === 'loading-file'

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950 text-white overflow-hidden">
      <div className="flex items-center justify-between px-4 h-12 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-3">
          <Camera className="w-5 h-5 text-blue-400" />
          <span className="font-bold text-slate-200">Canlı Pratik</span>
          <span className="text-xs px-2 py-0.5 rounded-full border font-medium bg-blue-500/20 text-blue-300 border-blue-500/40">
            Beta — sadece tarayıcıda çalışır, kayıt yapılmaz
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Kaynak modu seçici */}
          <div className="inline-flex rounded-lg border border-slate-700 bg-slate-900 p-0.5 gap-0.5">
            <button
              type="button"
              onClick={() => handleModeChange('camera')}
              className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md transition-colors
                ${mode === 'camera' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
            >
              <Camera className="w-3.5 h-3.5" /> Kamera
            </button>
            <button
              type="button"
              onClick={() => handleModeChange('file')}
              className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md transition-colors
                ${mode === 'file' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
            >
              <Video className="w-3.5 h-3.5" /> Video Dosyası
            </button>
          </div>

          {mode === 'file' && (
            <>
              <input ref={fileInputRef} type="file" accept="video/*" onChange={handleFilePick} className="hidden" aria-label="Video dosyası seç" />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
              >
                <Upload className="w-3.5 h-3.5" /> {videoFile ? 'Videoyu Değiştir' : 'Video Seç'}
              </button>
            </>
          )}

          <button type="button" onClick={onClose} title="Kapat"
            className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        <div className="flex-1 min-w-0 relative flex items-center justify-center bg-black">
          <video ref={videoRef} playsInline muted className="hidden" />
          <canvas ref={canvasRef} className="max-w-full max-h-full" />

          {showLoadingOverlay && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-400 bg-slate-950/80">
              <Loader2 className="w-6 h-6 animate-spin" />
              <span>
                {state === 'loading-model' ? 'MoveNet modeli yükleniyor...'
                  : state === 'requesting-camera' ? 'Kamera izni bekleniyor...'
                  : 'Video yükleniyor...'}
              </span>
            </div>
          )}
          {state === 'waiting-file' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-400 bg-slate-950/80 px-6 text-center">
              <Video className="w-8 h-8 text-slate-600" />
              <span>Analiz etmek için bir video dosyası seçin</span>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors"
              >
                <Upload className="w-3.5 h-3.5" /> Video Seç
              </button>
            </div>
          )}
          {state === 'error' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-red-400 bg-slate-950/80 px-6 text-center">
              <AlertCircle className="w-6 h-6" />
              <span>{error ?? 'Bilinmeyen hata'}</span>
              {mode === 'camera' && (
                <span className="text-xs text-slate-500 max-w-sm">
                  Kamera izni verildiğinden ve HTTPS (veya localhost) üzerinden çalıştığınızdan emin olun.
                </span>
              )}
              <button
                type="button"
                onClick={() => { setError(null); setRetryKey(k => k + 1) }}
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Tekrar Dene
              </button>
            </div>
          )}
          {state === 'running' && (
            <div className="absolute top-3 left-3 flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg bg-slate-900/70 text-slate-300">
              <Gauge className="w-3.5 h-3.5 text-emerald-400" />
              <span ref={fpsElRef}>0</span> fps
            </div>
          )}
          {state === 'running' && (
            <div className="absolute top-3 right-3 flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg bg-slate-900/70 text-slate-300">
              <Footprints className="w-3.5 h-3.5 text-blue-400" />
              <span ref={repCountElRef} className="text-base font-bold text-white leading-none">0</span>
              <span className="text-slate-400">adım</span>
            </div>
          )}
          {state === 'running' && gaitClassification && (
            // Deneysel ST-GCN rozeti — SADECE gerçek bir sınıflandırma sonucu üretildiğinde
            // (yani public/models/gavd_gait_v1.onnx başarıyla yüklenip en az bir tam pencere
            // biriktiğinde) görünür; model dosyası yoksa bu blok hiç render edilmez.
            <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg bg-slate-900/70 text-slate-300">
              <span className={gaitClassification.label === 'normal' ? 'text-emerald-400' : 'text-amber-400'}>●</span>
              <span className="font-semibold text-white">
                {gaitClassification.label === 'normal' ? 'Yürüyüş: Normal' : 'Yürüyüş: Anormal'}
              </span>
              <span className="text-slate-500">%{(gaitClassification.confidence * 100).toFixed(0)}</span>
            </div>
          )}
          {state === 'running' && (
            // Konumlanma/kadraj uyarısı (bkz. lib/framingCheck.ts) — bloklamayan, sadece bilgilendirme.
            // Varsayılan 'hidden', draw() sorun tespit ettiğinde kaldırıp metni dolduruyor.
            <div
              ref={framingElRef}
              className="hidden absolute top-14 left-1/2 -translate-x-1/2 max-w-[85%] text-center text-xs px-3 py-1.5 rounded-lg bg-amber-900/85 text-amber-200 border border-amber-700/50"
            />
          )}
          {state === 'running' && mode === 'file' && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-slate-900/80 rounded-lg p-1">
              <button type="button" onClick={togglePlay} title={playing ? 'Duraklat' : 'Oynat'}
                className="p-1.5 rounded-md hover:bg-slate-700 text-slate-200 transition-colors">
                {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </button>
              <button type="button" onClick={restart} title="Başa sar"
                className="p-1.5 rounded-md hover:bg-slate-700 text-slate-200 transition-colors">
                <RotateCcw className="w-4 h-4" />
              </button>
              {videoFile && <span className="text-[11px] text-slate-400 px-2 truncate max-w-[180px]">{videoFile.name}</span>}
            </div>
          )}
        </div>

        <div className="w-64 shrink-0 border-l border-slate-800 flex flex-col">
          {/* Tabs */}
          <div className="flex border-b border-slate-800 shrink-0 px-2 pt-1">
            {([
              { id: 'angles', label: 'Açılar' },
              { id: 'metrics', label: 'Metrikler' },
              { id: 'feedback', label: 'Geri Bildirim' },
            ] as { id: PanelTab; label: string }[]).map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`flex-1 py-1.5 text-xs font-medium transition-colors rounded-t
                  ${tab === t.id
                    ? 'text-blue-400 border-b-2 border-blue-400'
                    : 'text-slate-400 hover:text-slate-200'
                  }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
            {/* AÇILAR — CSS ile gizleniyor, ref'lerin kalıcı olması için hiç unmount edilmiyor */}
            <div className={tab !== 'angles' ? 'hidden' : 'grid grid-cols-2 gap-1.5'}>
              {(Object.keys(ANGLE_LABELS) as (keyof LiveAngles)[]).map(key => (
                <div
                  key={key}
                  ref={el => { angleDivRefs.current[key] = el }}
                  className="rounded-lg px-3 py-2 bg-slate-800/60 transition-colors"
                >
                  <div className="text-xs text-slate-500">{ANGLE_LABELS[key]}</div>
                  <span
                    ref={el => { anglesElRef.current[key] = el }}
                    className="text-sm font-bold font-mono text-slate-100"
                  >
                    —
                  </span>
                </div>
              ))}
            </div>

            {/* METRİKLER — aynı şekilde hep mount, CSS ile gizleniyor */}
            <div className={tab !== 'metrics' ? 'hidden' : 'flex flex-col gap-1.5'}>
              {/* Yürüyüş özeti (yaklaşık) — bkz. lib/gaitMetrics.ts, kadans/adım/hız */}
              <div className="rounded-lg px-3 py-2 bg-blue-950/30 border border-blue-900/40">
                <div className="text-[9px] text-blue-400/80 uppercase tracking-wide mb-1">Yürüyüş (yaklaşık)</div>
                <div className="grid grid-cols-3 gap-1 text-center">
                  <div>
                    <div className="text-[9px] text-slate-600">Kadans</div>
                    <span ref={el => { gaitElRefs.current.cadence = el }} className="text-xs font-bold font-mono text-slate-100">—</span>
                  </div>
                  <div>
                    <div className="text-[9px] text-slate-600">Adım Uz.</div>
                    <span ref={el => { gaitElRefs.current.stepLength = el }} className="text-xs font-bold font-mono text-slate-100">—</span>
                  </div>
                  <div>
                    <div className="text-[9px] text-slate-600">Hız</div>
                    <span ref={el => { gaitElRefs.current.speed = el }} className="text-xs font-bold font-mono text-slate-100">—</span>
                  </div>
                </div>
              </div>

              {/* Sol/sağ simetri — bkz. lib/liveFeedback.ts romSpan, lib/stepTiming.ts */}
              <div className="rounded-lg px-3 py-2 bg-purple-950/30 border border-purple-900/40">
                <div className="text-[9px] text-purple-400/80 uppercase tracking-wide mb-1">Simetri (Sol-Sağ Fark)</div>
                <div className="grid grid-cols-3 gap-1 text-center">
                  <div>
                    <div className="text-[9px] text-slate-600">Diz ROM</div>
                    <span ref={el => { symmetryElRefs.current.knee = el }} className="text-xs font-bold font-mono text-slate-100">—</span>
                  </div>
                  <div>
                    <div className="text-[9px] text-slate-600">Kalça Ort.</div>
                    <span ref={el => { symmetryElRefs.current.hip = el }} className="text-xs font-bold font-mono text-slate-100">—</span>
                  </div>
                  <div>
                    <div className="text-[9px] text-slate-600">Adım Süresi</div>
                    <span ref={el => { symmetryElRefs.current.stepTime = el }} className="text-xs font-bold font-mono text-slate-100">—</span>
                  </div>
                </div>
              </div>

              {/* Adım ritmi (bkz. lib/stepTiming.ts) — düzenlilik göstergesi, YAKLAŞIK (2D/webcam
                  hassasiyeti mocap ile kıyaslanamaz, sadece oturum-içi göreli bir sinyal). */}
              <div className="rounded-lg px-3 py-2 bg-teal-950/30 border border-teal-900/40">
                <div className="text-[9px] text-teal-400/80 uppercase tracking-wide mb-1">Adım Ritmi</div>
                <div className="grid grid-cols-2 gap-1 text-center">
                  <div>
                    <div className="text-[9px] text-slate-600">Ort. Süre</div>
                    <span ref={el => { rhythmElRefs.current.meanTime = el }} className="text-xs font-bold font-mono text-slate-100">—</span>
                  </div>
                  <div>
                    <div className="text-[9px] text-slate-600">Düzensizlik</div>
                    <span ref={el => { rhythmElRefs.current.cv = el }} className="text-xs font-bold font-mono text-slate-100">—</span>
                  </div>
                </div>
              </div>

              {(Object.keys(ANGLE_LABELS) as (keyof LiveAngles)[]).map(key => (
                <div key={key} className="rounded-lg px-3 py-2 bg-slate-800/60">
                  <div className="text-xs text-slate-500 mb-1">{ANGLE_LABELS[key]}</div>
                  <div className="grid grid-cols-3 gap-1 text-center">
                    <div>
                      <div className="text-[9px] text-slate-600">Ort.</div>
                      <span ref={el => { (metricsElRefs.current[key] ??= {}).mean = el }} className="text-xs font-bold font-mono text-slate-100">—</span>
                    </div>
                    <div>
                      <div className="text-[9px] text-slate-600">Açısal Hız</div>
                      <span ref={el => { (metricsElRefs.current[key] ??= {}).vel = el }} className="text-xs font-bold font-mono text-slate-100">—</span>
                    </div>
                    <div>
                      <div className="text-[9px] text-slate-600">ROM</div>
                      <span ref={el => { (metricsElRefs.current[key] ??= {}).rom = el }} className="text-xs font-bold font-mono text-slate-100">—</span>
                    </div>
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() => {
                  metricsTrackerRef.current.reset()
                  repCounterRef.current.reset()
                  gaitTrackerRef.current.reset()
                  stepCountRef.current = 0
                  stepTimingRef.current = { stepTimeMeanSec: null, stepTimeCvPct: null, lrDiffPct: null }
                  gaitClassifierRef.current.reset()
                  setGraphData([])
                  setLiveFeedback([])
                  setGaitClassification(null)
                  if (repCountElRef.current) repCountElRef.current.textContent = '0'
                  if (gaitElRefs.current.cadence) gaitElRefs.current.cadence.textContent = '—'
                  if (gaitElRefs.current.stepLength) gaitElRefs.current.stepLength.textContent = '—'
                  if (gaitElRefs.current.speed) gaitElRefs.current.speed.textContent = '—'
                  if (symmetryElRefs.current.knee) symmetryElRefs.current.knee.textContent = '—'
                  if (symmetryElRefs.current.hip) symmetryElRefs.current.hip.textContent = '—'
                  if (symmetryElRefs.current.stepTime) symmetryElRefs.current.stepTime.textContent = '—'
                  if (rhythmElRefs.current.meanTime) rhythmElRefs.current.meanTime.textContent = '—'
                  if (rhythmElRefs.current.cv) rhythmElRefs.current.cv.textContent = '—'
                }}
                className="flex items-center justify-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors mt-1"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Metrikleri ve Sayacı Sıfırla
              </button>
            </div>

            {/* GERİ BİLDİRİM — aynı şekilde hep mount, CSS ile gizleniyor. Kural-tabanlı
                (ML sınıflandırması DEĞİL) — bkz. lib/liveFeedback.ts başlık yorumu. */}
            <div className={tab !== 'feedback' ? 'hidden' : 'flex flex-col gap-3'}>
              <GaitFeedback feedback={liveFeedback} variant="dark" />
              <p className="text-[10px] text-slate-600 leading-relaxed">
                Basit eşik kurallarına dayanır (ML sınıflandırması değildir) — en az {MIN_STEPS_FOR_FEEDBACK} adım
                biriktikten sonra görünür. Video üzerindeki "Yürüyüş: Normal/Anormal" rozeti
                (görünüyorsa) ayrı, deneysel bir ST-GCN modelinden gelir — bu ikisi birbirinin
                yerine geçmez, farklı yöntemlerdir.
              </p>
            </div>

            <p className="text-[11px] text-slate-500 leading-relaxed mt-auto pt-2">
              Bu mod tamamen tarayıcınızda çalışır — hiçbir görüntü sunucuya gönderilmez veya
              kaydedilmez. "Video Dosyası" modunda seçtiğiniz dosya da sadece bu sekmede oynatılıp
              işlenir, hiçbir yere yüklenmez. Metrikler, adım sayacı ve grafik oturum başından
              (veya son sıfırlamadan) itibaren canlı hesaplanıyor. Kadans/adım uzunluğu/hız
              YAKLAŞIK değerlerdir (derinlik yok, gövde uzunluğu ≈0.5m varsayımı, kameranın
              yandan çektiği varsayılıyor) — kesin ölçüm için mevcut video yükleme akışını
              kullanın. Video üzerinde görünebilecek "Yürüyüş: Normal/Anormal" rozeti deneysel bir
              ST-GCN modelinden gelir (GAVD veri setiyle eğitildi, REHAB24-6 tabanlı egzersiz
              doğruluğu sınıflandırmasıyla karıştırılmamalı) ve klinik bir teşhis yerine geçmez.
            </p>
          </div>
        </div>
      </div>

      {state === 'running' && (
        <div className="shrink-0 border-t border-slate-800 px-4 pt-2 pb-3">
          <LiveAnglesGraph data={graphData} windowSec={GRAPH_WINDOW_SEC} />
        </div>
      )}
    </div>
  )
}
