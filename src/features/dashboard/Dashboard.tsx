// src/features/dashboard/Dashboard.tsx
import { useRef, useState } from 'react'
import {
  Trash2, Play, Upload, User, LogOut, Stethoscope, Activity, UserPlus,
  Download, BarChart2, Clock, CheckCircle2, XCircle, Loader2, Film,
} from 'lucide-react'

import type { UserRole, VideoRecord } from '../../types'

interface DashboardProps {
  role: UserRole
  username: string
  onLogout: () => void
  videos: VideoRecord[]
  loadingVideos: boolean
  isUploading: boolean
  status: string
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  handleUploadFiles: (files: File[]) => void
  setActiveVideo: (url: string) => void
  confirmDelete: (video: VideoRecord) => void
  openAnalysis: (video: VideoRecord) => void
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
  setActiveVideo, confirmDelete, openAnalysis,
}: DashboardProps) {

  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const dragCounter = useRef(0)

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
    if (files.length > 0) handleUploadFiles(files)
  }

  const isPatient = role === 'patient'

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

        {/* YÜKLEME ALANI — Sadece Hasta */}
        {isPatient && (
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
                  {isDragging ? 'Dosyayı bırakın' : 'Yeni Analiz Başlat'}
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

            <input ref={inputRef} type="file" accept="video/*" onChange={handleFileChange} className="hidden" aria-label="Video dosyası seç" />
          </div>
        )}

        {/* VİDEO LİSTESİ */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-700 flex items-center gap-2">
              {isPatient
                ? <><Film className="w-4 h-4 text-blue-500" /> Videolarım</>
                : <><UserPlus className="w-4 h-4 text-emerald-500" /> Bekleyen Hasta Videoları</>
              }
              {!loadingVideos && videos.length > 0 && (
                <span className="text-xs font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{videos.length}</span>
              )}
            </h3>
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
          ) : videos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 rounded-2xl border border-dashed border-slate-200 bg-white/60">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                <Film className="w-7 h-7 text-slate-300" />
              </div>
              <p className="font-semibold text-slate-700">Henüz video yok</p>
              <p className="text-sm text-slate-400 mt-1">
                {isPatient ? 'Yeni analiz başlatmak için yukarıya video yükleyin.' : 'Hasta videoları burada görünecek.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {videos.map((video) => {
                const st = video.job_status ?? ''
                const accent = STATUS_ACCENT[st] ?? 'from-slate-400 to-slate-500'
                return (
                  <div
                    key={video.id}
                    className="group relative bg-white rounded-2xl border border-slate-200/80 overflow-hidden hover:shadow-lg hover:shadow-slate-200/60 hover:-translate-y-0.5 transition-all duration-200"
                  >
                    {/* Status accent bar */}
                    <div className={`h-1 w-full bg-gradient-to-r ${accent}`} />

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
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <StatusBadge jobStatus={st} />
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
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
