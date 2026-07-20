// Canlı Pratik — tamamen istemci-taraflı (tarayıcı) gerçek-zamanlı poz izleme demosu.
//
// Kapsam (bkz. docs/scgnet-arastirma-raporu.md, Bölüm 4): TRUBA/SLURM batch mimarisi
// gerçek-zamanlıya yapısal olarak uygun değil, bu yüzden bu mod TRUBA'ya hiç dokunmuyor —
// görüntü MoveNet (TensorFlow.js, WebGL backend) ile tamamen tarayıcıda işleniyor, hiçbir
// video/frame sunucuya gitmiyor. İlk faz: sadece iskelet overlay + canlı açı sayıları.
// ML tabanlı canlı doğru/yanlış sınıflandırması kapsam dışı (nedensel bir model gerektirir,
// ayrı bir eğitim işi — bkz. rapor).
//
// İki kaynak modu var:
//  - 'camera': webcam, canlı — orijinal kullanım senaryosu.
//  - 'file': kullanıcının seçtiği bir video dosyası, kendi hızında oynatılırken aynı
//    pipeline'dan (MoveNet + canvas overlay + açı paneli) geçiyor. Amaç: her denemede kamera
//    karşısında durmak zorunda kalmadan, önceden kaydedilmiş bir videoyla karşılaştırma/test
//    yapabilmek. Kayıt/analiz sunucuya gitmiyor, sadece bu ekranda oynatılıyor.
import { useEffect, useRef, useState, useCallback } from 'react'
import { X, Loader2, AlertCircle, Camera, Gauge, Video, Upload, Play, Pause, RotateCcw } from 'lucide-react'
import type * as PoseDetectionNS from '@tensorflow-models/pose-detection'
import {
  MOVENET_KEYPOINT_NAMES, SKELETON_EDGES, MIN_SCORE,
  computeLiveAngles, type Point2D, type LiveAngles,
} from '../../lib/poseAngles'

interface LivePracticeProps {
  onClose: () => void
}

const ANGLE_LABELS: Record<keyof LiveAngles, string> = {
  'L Knee': 'Sol Diz', 'R Knee': 'Sağ Diz', 'L Hip': 'Sol Kalça', 'R Hip': 'Sağ Kalça',
}

type Mode = 'camera' | 'file'
type LoadState = 'loading-model' | 'requesting-camera' | 'waiting-file' | 'loading-file' | 'running' | 'error'

export function LivePractice({ onClose }: LivePracticeProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const objectUrlRef = useRef<string | null>(null)
  const detectorRef = useRef<PoseDetectionNS.PoseDetector | null>(null)
  const rafRef = useRef<number | null>(null)
  const anglesElRef = useRef<Record<string, HTMLSpanElement | null>>({})
  const fpsElRef = useRef<HTMLSpanElement | null>(null)
  const mirrorRef = useRef(true)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [mode, setMode] = useState<Mode>('camera')
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [modelReady, setModelReady] = useState(false)
  const [state, setState] = useState<LoadState>('loading-model')
  const [error, setError] = useState<string | null>(null)
  const [playing, setPlaying] = useState(true)

  mirrorRef.current = mode === 'camera'

  const stopCurrentSource = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    if (objectUrlRef.current) { URL.revokeObjectURL(objectUrlRef.current); objectUrlRef.current = null }
    const video = videoRef.current
    if (video) { video.pause(); video.srcObject = null; video.removeAttribute('src'); video.load() }
  }, [])

  // ── Model yükleme — bir kere, mount'ta ────────────────────────────────────
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

        const detector = await poseDetection.createDetector(
          poseDetection.SupportedModels.MoveNet,
          { modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING },
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
  }, [])

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
  }, [mode, videoFile, modelReady, stopCurrentSource])

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

      frameCount++
      const now = performance.now()
      if (now - fpsAccum > 500) {
        const fps = (frameCount * 1000) / (now - fpsAccum)
        if (fpsElRef.current) fpsElRef.current.textContent = fps.toFixed(0)
        frameCount = 0
        fpsAccum = now
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

      if (keypoints && keypoints.length > 0) {
        const byName: Record<string, Point2D | undefined> = {}
        for (const kp of keypoints) if (kp.name) byName[kp.name] = kp

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
        for (const key of Object.keys(ANGLE_LABELS) as (keyof LiveAngles)[]) {
          const el = anglesElRef.current[key]
          if (el) el.textContent = Number.isNaN(angles[key]) ? '—' : `${angles[key].toFixed(0)}°`
        }
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
            </div>
          )}
          {state === 'running' && (
            <div className="absolute top-3 left-3 flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg bg-slate-900/70 text-slate-300">
              <Gauge className="w-3.5 h-3.5 text-emerald-400" />
              <span ref={fpsElRef}>0</span> fps
            </div>
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

        <div className="w-64 shrink-0 border-l border-slate-800 flex flex-col p-4 gap-3">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Canlı Açılar</div>
          <div className="grid grid-cols-2 gap-1.5">
            {(Object.keys(ANGLE_LABELS) as (keyof LiveAngles)[]).map(key => (
              <div key={key} className="rounded-lg px-3 py-2 bg-slate-800/60">
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
          <p className="text-[11px] text-slate-500 leading-relaxed mt-2">
            Bu mod tamamen tarayıcınızda çalışır — hiçbir görüntü sunucuya gönderilmez veya
            kaydedilmez. "Video Dosyası" modunda seçtiğiniz dosya da sadece bu sekmede oynatılıp
            işlenir, hiçbir yere yüklenmez. Doğru/yanlış icra sınıflandırması bu ilk sürümde
            henüz yok; detaylı analiz + rapor için mevcut video yükleme akışını kullanın.
          </p>
        </div>
      </div>
    </div>
  )
}
