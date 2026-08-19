// src/features/dashboard/Dashboard.tsx
import { useRef, useState } from 'react'
import {
  Trash2, Play, Upload, User, LogOut, Stethoscope, Activity, UserPlus,
  Download, BarChart2, Clock, CheckCircle2, XCircle, Loader2, Film, Camera,
} from 'lucide-react'

import type { AnalysisMethod, UserRole, VideoRecord } from '../../types'
import { RecordingGuide } from './RecordingGuide'
import { useLang, LangToggle } from '../../lib/i18n'

interface DashboardProps {
  role: UserRole
  username: string
  onLogout: () => void
  videos: VideoRecord[]
  loadingVideos: boolean
  isUploading: boolean
  status: string
  handleFileChange: (method: AnalysisMethod) => (e: React.ChangeEvent<HTMLInputElement>) => void
  handleUploadFiles: (files: File[], method: AnalysisMethod) => void
  setActiveVideo: (url: string) => void
  confirmDelete: (video: VideoRecord) => void
  openAnalysis: (video: VideoRecord) => void
  onOpenLive: () => void
}

const METHOD_LABELS: Record<AnalysisMethod, { short: string; badge: string }> = {
  metrabs:      { short: '3D · MeTRAbs',       badge: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  hrnet_stgcn:  { short: '2D · HRNet+ST-GCN',  badge: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200' },
}

// ST-GCN sonuç rozeti — kartta durumun yanında ASIL bilgiyi (sınıflandırma sonucu) gösterir.
// İki etiket dönemi (bkz. types.ts StgcnLabel): normal/abnormal (yürüyüş) ve
// correct/incorrect (eski egzersiz kayıtları).
function ResultBadge({ label, confidence }: { label: string | null; confidence: number | null }) {
  if (!label) return null
  const positive = label === 'normal' || label === 'correct'
  const text = label === 'normal' ? 'Normal' : label === 'abnormal' ? 'Anormal'
    : label === 'correct' ? 'Doğru İcra' : 'Hatalı İcra'
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium border ${
      positive ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
      {positive ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
      {text}{confidence != null ? ` · %${(confidence * 100).toFixed(0)}` : ''}
    </span>
  )
}

function StatusBadge({ jobStatus }: { jobStatus: string | null }) {
  if (!jobStatus) return null
  if (jobStatus === 'queued') return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-amber-50 text-amber-700 border border-amber-200">
      <Clock className="w-3 h-3" /> Kuyrukta
    </span>
  )
  if (jobStatus === 'processing') return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-blue-50 text-blue-700 border border-blue-200">
      <Loader2 className="w-3 h-3 animate-spin" /> İşleniyor
    </span>
  )
  if (jobStatus === 'done') return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
      <CheckCircle2 className="w-3 h-3" /> Tamamlandı
    </span>
  )
  if (jobStatus === 'error') return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-red-50 text-red-700 border border-red-200">
      <XCircle className="w-3 h-3" /> Hata
    </span>
  )
  return null
}

function isPatientCheck(role: UserRole) { return role === 'patient' }

const STATUS_ACCENT: Record<string, string> = {
  done:       'from-emerald-500 to-teal-500',
  processing: 'from-blue-500 to-indigo-500',
  queued:     'from-amber-400 to-orange-400',
  error:      'from-red-500 to-rose-500',
}

export function Dashboard({
  role, username, onLogout,
  videos, loadingVideos,
  isUploading, status, handleFileChange, handleUploadFiles,
  setActiveVideo, confirmDelete, openAnalysis, onOpenLive,
}: DashboardProps) {

  const { t } = useLang()
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  // Tek aktif yöntem (bkz. yöntem seçicinin kaldırıldığı yerdeki yorum) — setMethod bilinçli yok.
  const [method] = useState<AnalysisMethod>('hrnet_stgcn')
  const dragCounter = useRef(0)
  // Liste filtreleri — özellikle doktor tarafında video sayısı büyüyünce gerekli.
  const [showGuide, setShowGuide] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'all' | 'done' | 'processing' | 'queued' | 'error'>('all')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'name' | 'status'>('newest')

  const STATUS_ORDER: Record<string, number> = { processing: 0, queued: 1, error: 2, done: 3 }
  const filteredVideos = videos
    .filter(v => {
      if (statusFilter !== 'all' && v.job_status !== statusFilter) return false
      if (search) {
        const q = search.toLowerCase()
        if (!v.file_name.toLowerCase().includes(q) && !v.user_name.toLowerCase().includes(q)) return false
      }
      return true
    })
    .sort((a, b) => {
      if (sortBy === 'newest') return b.created_at.localeCompare(a.created_at)
      if (sortBy === 'oldest') return a.created_at.localeCompare(b.created_at)
      if (sortBy === 'name') return a.file_name.localeCompare(b.file_name, 'tr')
      return (STATUS_ORDER[a.job_status ?? ''] ?? 9) - (STATUS_ORDER[b.job_status ?? ''] ?? 9)
    })

  // Doktor görünümü: hastaya göre gruplama — düz grid hasta sayısı artınca dağılıyor.
  const groupedByPatient = !isPatientCheck(role) ? filteredVideos.reduce<Record<string, VideoRecord[]>>((acc, v) => {
    (acc[v.user_name] ??= []).push(v)
    return acc
  }, {}) : null

  // Üst istatistikler (filtre öncesi tüm liste üzerinden)
  const stats = {
    total: videos.length,
    done: videos.filter(v => v.job_status === 'done').length,
    pending: videos.filter(v => v.job_status === 'queued' || v.job_status === 'processing').length,
    abnormal: videos.filter(v => v.stgcn_label === 'abnormal' || v.stgcn_label === 'incorrect').length,
  }

  function onDragEnter(e: React.DragEvent) {
    e.preventDefault()
    dragCounter.current++
    if (e.dataTransfer.types.includes('Files')) setIsDragging(true)
  }
  function onDragLeave(e: React.DragEvent) {
    e.preventDefault()
    dragCounter.current--
    if (dragCounter.current === 0) setIsDragging(false)
  }
  function onDragOver(e: React.DragEvent) { e.preventDefault() }
  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    dragCounter.current = 0
    setIsDragging(false)
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('video/'))
    if (files.length > 0) handleUploadFiles(files, method)
  }

  const isPatient = role === 'patient'

  const renderVideoCard = (video: VideoRecord) => {
                const st = video.job_status ?? ''
                const accent = STATUS_ACCENT[st] ?? 'from-slate-400 to-slate-500'
                return (
                  <div
                    key={video.id}
                    className="group relative bg-white rounded-2xl border border-slate-200/80 overflow-hidden hover:shadow-lg hover:shadow-slate-200/60 hover:-translate-y-0.5 transition-all duration-200"
                  >
                    {/* Status accent bar */}
                    <div className={`h-1 w-full bg-gradient-to-r ${accent}`} />

                    {/* Önizleme — annotate'li video varsa ondan (iskeletli kare), yoksa ham
                        videodan. #t=0.5: ilk kare yerine yarım saniyedeki kare (siyah açılış
                        karelerini atlar). preload=metadata: sadece o kare indirilir. */}
                    {(video.annotated_url || video.file_url) && (
                      <div className="h-28 w-full bg-slate-100 overflow-hidden">
                        <video
                          src={`${video.annotated_url ?? video.file_url}#t=0.5`}
                          muted
                          playsInline
                          preload="metadata"
                          className="h-full w-full object-cover pointer-events-none"
                        />
                      </div>
                    )}

                    <div className="p-4 space-y-3">
                      {/* Title row */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <h4 className="font-semibold text-slate-800 text-sm truncate" title={video.file_name}>
                            {video.file_name}
                          </h4>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <User className="w-3 h-3 text-slate-400" />
                            <span className="text-xs text-slate-500">{video.user_name}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${METHOD_LABELS[video.analysis_method]?.badge ?? METHOD_LABELS.metrabs.badge}`}>
                              {METHOD_LABELS[video.analysis_method]?.short ?? METHOD_LABELS.metrabs.short}
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          {st === 'done' && video.stgcn_label
                            ? <ResultBadge label={video.stgcn_label} confidence={video.stgcn_confidence} />
                            : <StatusBadge jobStatus={st} />}
                          <span className="text-[10px] text-slate-400">
                            {new Date(video.created_at).toLocaleDateString('tr-TR')}
                          </span>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => video.file_url && setActiveVideo(video.file_url)}
                          className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                        >
                          <Play className="w-3 h-3" /> İncele
                        </button>

                        {video.job_status === 'done' && (
                          <button
                            type="button"
                            onClick={() => openAnalysis(video)}
                            className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                          >
                            <BarChart2 className="w-3 h-3" /> Analiz
                          </button>
                        )}

                        {video.job_status && video.job_status !== 'done' && (
                          <div className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium px-3 py-2 rounded-xl bg-slate-50 text-slate-400 border border-slate-100 cursor-default">
                            <BarChart2 className="w-3 h-3" /> Analiz
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={() => confirmDelete(video)}
                          className="p-2 rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                          title="Sil"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* CSV download */}
                      {video.features_url && (
                        <a
                          href={video.features_url}
                          download
                          className="flex items-center justify-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                        >
                          <Download className="w-3 h-3" /> CSV İndir
                        </a>
                      )}
                    </div>
                  </div>
                )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/40">

      {/* HEADER */}
      <header className="sticky top-0 z-10 border-b border-slate-200/70 bg-white/80 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-5 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl ${isPatient ? 'bg-blue-600 text-white' : 'bg-emerald-600 text-white'}`}>
              {isPatient ? <Activity className="w-4 h-4" /> : <Stethoscope className="w-4 h-4" />}
            </div>
            <span className="font-semibold text-slate-800 tracking-tight">Gait Analysis</span>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 bg-slate-100 rounded-full px-3 py-1.5">
              <User className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-sm font-medium text-slate-700">{username}</span>
              <span className="text-xs text-slate-400">·</span>
              <span className="text-xs text-slate-500">{isPatient ? 'Hasta' : 'Doktor'}</span>
            </div>
            {/* Canlı Pratik iki role de açık (2026-08-19): doktor muayene sırasında hastayı
                webcam'den canlı izleyebilsin */}
            <button
              type="button"
              onClick={onOpenLive}
              title="Canlı Pratik (Beta)"
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors"
            >
              <Camera className="w-3.5 h-3.5" /> {t('dash.livePractice')}
            </button>
            <LangToggle className="bg-white border-slate-200 text-slate-500 hover:bg-slate-50" />
            <button
              type="button"
              onClick={onLogout}
              className="p-2 rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
              title="Çıkış"
            >
              <LogOut className="w-4 h-4" />

            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-5 py-8 space-y-8">

        {/* İstatistik şeridi */}
        {!loadingVideos && videos.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: t('dash.stats.total'), value: stats.total, cls: 'text-slate-700' },
              { label: t('dash.stats.done'), value: stats.done, cls: 'text-emerald-600' },
              { label: t('dash.stats.pending'), value: stats.pending, cls: 'text-amber-600' },
              { label: t('dash.stats.abnormal'), value: stats.abnormal, cls: 'text-red-600' },
            ].map(c => (
              <div key={c.label} className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3">
                <div className={`text-2xl font-bold ${c.cls}`}>{c.value}</div>
                <div className="text-xs text-slate-400 mt-0.5">{c.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* YÜKLEME ALANI — Sadece Hasta */}
        {isPatient && (
          <div className="space-y-3">

            {/* MeTRAbs (3D) yolu emekliye ayrıldı (2026-08-18): TRUBA gpu_worker'ı durduruldu,
                yeni yüklemeler her zaman hrnet_stgcn ile işleniyor. Eski MeTRAbs kayıtları
                görüntülenmeye devam eder (AnalysisViewer + METHOD_LABELS 'metrabs'i tanıyor);
                yöntem geri getirilecekse buradaki seçici git geçmişinden geri alınabilir. */}

            <div
              onDragEnter={onDragEnter}
              onDragLeave={onDragLeave}
              onDragOver={onDragOver}
              onDrop={onDrop}
              onClick={() => !isUploading && inputRef.current?.click()}
              className={`relative overflow-hidden rounded-2xl cursor-pointer select-none transition-all duration-300
                ${isDragging
                  ? 'ring-2 ring-blue-400 ring-offset-2 scale-[1.005]'
                  : 'hover:shadow-lg hover:shadow-blue-100'
                }`}
            >
            {/* Gradient background */}
            <div className="absolute inset-0 bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800" />
            {/* Decorative blobs */}
            <div className="absolute -top-10 -right-10 w-48 h-48 bg-white/5 rounded-full blur-2xl" />
            <div className="absolute -bottom-12 -left-12 w-64 h-64 bg-indigo-400/10 rounded-full blur-3xl" />

            <div className="relative p-8 flex flex-col sm:flex-row items-center gap-6">
              {/* Left: text */}
              <div className="flex-1 text-center sm:text-left">
                <p className="text-blue-200 text-xs font-semibold uppercase tracking-widest mb-2">
                  Yürüyüş Analizi
                </p>
                <h2 className="text-2xl font-bold text-white mb-2">
                  {isDragging ? 'Dosyayı bırakın' : t('dash.newAnalysis')}
                </h2>
                <p className="text-blue-200/80 text-sm max-w-sm leading-relaxed">
                  {isDragging
                    ? 'Video dosyasını buraya bırakın, hemen yüklemeye başlayacağız.'
                    : 'Video dosyanızı sürükleyip bırakın ya da tıklayarak seçin. Doktorunuz en kısa sürede sonuçlarınızı inceleyecektir.'}
                </p>
              </div>

              {/* Right: icon box */}
              <div className={`shrink-0 flex flex-col items-center justify-center gap-2 w-32 h-28 rounded-2xl border transition-all duration-200
                ${isDragging
                  ? 'bg-white/20 border-white/50'
                  : 'bg-white/10 border-white/20 hover:bg-white/15'
                }`}
              >
                {isUploading
                  ? <Loader2 className="w-8 h-8 text-white animate-spin" />
                  : <Upload className={`w-8 h-8 text-white transition-transform duration-200 ${isDragging ? 'scale-125' : ''}`} />
                }
                <span className="text-xs text-blue-100 font-medium text-center leading-tight">
                  {isUploading ? (status || 'Yükleniyor…') : isDragging ? 'Bırakın' : 'Tıkla veya\nSürükle'}
                </span>
              </div>
            </div>

            <input ref={inputRef} type="file" accept="video/*" onChange={handleFileChange(method)} className="hidden" aria-label="Video dosyası seç" />
            </div>

            <button
              type="button"
              onClick={() => setShowGuide(true)}
              className="text-xs text-blue-600 hover:text-blue-700 hover:underline font-medium"
            >
              {t('dash.guide')}
            </button>
          </div>
        )}

        {showGuide && <RecordingGuide onClose={() => setShowGuide(false)} />}

        {/* VİDEO LİSTESİ */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-700 flex items-center gap-2">
              {isPatient
                ? <><Film className="w-4 h-4 text-blue-500" /> {t('dash.myVideos')}</>
                : <><UserPlus className="w-4 h-4 text-emerald-500" /> {t('dash.pendingVideos')}</>
              }
              {!loadingVideos && videos.length > 0 && (
                <span className="text-xs font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{filteredVideos.length}/{videos.length}</span>
              )}
            </h3>

            {videos.length > 3 && (
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1">
                  {([['all', 'Tümü'], ['done', 'Tamamlandı'], ['processing', 'İşleniyor'], ['queued', 'Kuyrukta'], ['error', 'Hata']] as const).map(([k, label]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setStatusFilter(k)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                        statusFilter === k
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <input
                  type="search"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder={isPatient ? 'Dosya ara…' : 'Hasta/dosya ara…'}
                  className="text-xs px-3 py-1.5 rounded-full border border-slate-200 bg-white text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-200 w-40"
                />
                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value as typeof sortBy)}
                  aria-label="Sıralama"
                  className="text-xs px-2.5 py-1.5 rounded-full border border-slate-200 bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-200"
                >
                  <option value="newest">Yeni → Eski</option>
                  <option value="oldest">Eski → Yeni</option>
                  <option value="name">Ada göre</option>
                  <option value="status">Duruma göre</option>
                </select>
              </div>
            )}
          </div>

          {loadingVideos ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                  <div className="h-2 bg-slate-200 animate-pulse" />
                  <div className="p-5 space-y-3">
                    <div className="h-4 bg-slate-100 animate-pulse rounded-lg w-3/4" />
                    <div className="h-3 bg-slate-100 animate-pulse rounded-lg w-1/2" />
                    <div className="h-8 bg-slate-100 animate-pulse rounded-xl mt-4" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredVideos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 rounded-2xl border border-dashed border-slate-200 bg-white/60">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                <Film className="w-7 h-7 text-slate-300" />
              </div>
              <p className="font-semibold text-slate-700">{videos.length === 0 ? 'Henüz video yok' : 'Filtreyle eşleşen video yok'}</p>
              <p className="text-sm text-slate-400 mt-1">
                {videos.length > 0
                  ? 'Filtreyi veya aramayı temizleyin.'
                  : isPatient ? 'Yeni analiz başlatmak için yukarıya video yükleyin.' : 'Hasta videoları burada görünecek.'}
              </p>
            </div>
          ) : groupedByPatient ? (
              <div className="space-y-6">
                {Object.entries(groupedByPatient).map(([patient, vids]) => (
                  <div key={patient} className="space-y-3">
                    <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-600">
                      <User className="w-3.5 h-3.5 text-emerald-500" /> {patient}
                      <span className="text-xs font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{vids.length}</span>
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {vids.map(renderVideoCard)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredVideos.map(renderVideoCard)}
              </div>
            )}
        </div>
      </main>
    </div>
  )
}
