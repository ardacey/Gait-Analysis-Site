// Canlı Pratik — tamamen istemci-taraflı (tarayıcı) gerçek-zamanlı poz izleme demosu.
//
// Kapsam (bkz. docs/scgnet-arastirma-raporu.md, Bölüm 4): TRUBA/SLURM batch mimarisi
// gerçek-zamanlıya yapısal olarak uygun değil, bu yüzden bu mod TRUBA'ya hiç dokunmuyor —
// webcam görüntüsü MoveNet (TensorFlow.js, WebGL backend) ile tamamen tarayıcıda işleniyor,
// hiçbir video/frame sunucuya gitmiyor. İlk faz: sadece iskelet overlay + canlı açı sayıları.
// ML tabanlı canlı doğru/yanlış sınıflandırması kapsam dışı (nedensel bir model gerektirir,
// ayrı bir eğitim işi — bkz. rapor).
import { useEffect, useRef, useState, useCallback } from 'react'
import { X, Loader2, AlertCircle, Camera, Gauge } from 'lucide-react'
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

type LoadState = 'loading-model' | 'requesting-camera' | 'running' | 'error'

export function LivePractice({ onClose }: LivePracticeProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const detectorRef = useRef<PoseDetectionNS.PoseDetector | null>(null)
  const rafRef = useRef<number | null>(null)
  const anglesElRef = useRef<Record<string, HTMLSpanElement | null>>({})
  const fpsElRef = useRef<HTMLSpanElement | null>(null)

  const [state, setState] = useState<LoadState>('loading-model')
  const [error, setError] = useState<string | null>(null)

  const stop = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    detectorRef.current?.dispose()
    detectorRef.current = null
    streamRef.current = null
  }, [])

  useEffect(() => {
    let cancelled = false

    async function setup() {
      try {
        setState('loading-model')
        // Dinamik import: tfjs + pose-detection sadece bu ekran açıldığında indirilsin
        // (ana bundle'ı büyütmemek için).
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

        setState('requesting-camera')
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
          audio: false,
        })
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream

        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        await video.play()

        setState('running')
        runLoop()
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Bilinmeyen hata')
        setState('error')
      }
    }

    function runLoop() {
      let frameCount = 0
      let fpsAccum = performance.now()

      const loop = async () => {
        const detector = detectorRef.current
        const video = videoRef.current
        const canvas = canvasRef.current
        if (!detector || !video || !canvas || video.readyState < 2) {
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

      // Ayna görüntü (selfie-view) — kullanıcı için doğal.
      ctx.save()
      ctx.translate(w, 0)
      ctx.scale(-1, 1)
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

    void setup()
    return () => { cancelled = true; stop() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
        <button type="button" onClick={onClose} title="Kapat"
          className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex flex-1 min-h-0">
        <div className="flex-1 min-w-0 relative flex items-center justify-center bg-black">
          <video ref={videoRef} playsInline muted className="hidden" />
          <canvas ref={canvasRef} className="max-w-full max-h-full" />

          {(state === 'loading-model' || state === 'requesting-camera') && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-400 bg-slate-950/80">
              <Loader2 className="w-6 h-6 animate-spin" />
              <span>{state === 'loading-model' ? 'MoveNet modeli yükleniyor...' : 'Kamera izni bekleniyor...'}</span>
            </div>
          )}
          {state === 'error' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-red-400 bg-slate-950/80 px-6 text-center">
              <AlertCircle className="w-6 h-6" />
              <span>{error ?? 'Bilinmeyen hata'}</span>
              <span className="text-xs text-slate-500 max-w-sm">
                Kamera izni verildiğinden ve HTTPS (veya localhost) üzerinden çalıştığınızdan emin olun.
              </span>
            </div>
          )}
          {state === 'running' && (
            <div className="absolute top-3 left-3 flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg bg-slate-900/70 text-slate-300">
              <Gauge className="w-3.5 h-3.5 text-emerald-400" />
              <span ref={fpsElRef}>0</span> fps
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
            kaydedilmez. Doğru/yanlış icra sınıflandırması bu ilk sürümde henüz yok; detaylı
            analiz + rapor için mevcut video yükleme akışını kullanın.
          </p>
        </div>
      </div>
    </div>
  )
}
