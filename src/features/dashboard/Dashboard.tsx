// src/features/dashboard/Dashboard.tsx
import { useRef, useState } from 'react'
import { Button } from '../../components/ui/button'
import { Card, CardContent } from '../../components/ui/card'
import {
  Trash2, Play, Upload, User, LogOut, Stethoscope, Activity, UserPlus,
  Download, BarChart2, Clock, CheckCircle2, XCircle, Loader2,
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
  if (jobStatus === 'queued') {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium bg-yellow-50 text-yellow-700 border-yellow-200">
        <Clock className="w-3 h-3" /> Kuyrukta
      </span>
    )
  }
  if (jobStatus === 'processing') {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium bg-blue-50 text-blue-700 border-blue-200">
        <Loader2 className="w-3 h-3 animate-spin" /> İşleniyor
      </span>
    )
  }
  if (jobStatus === 'done') {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium bg-emerald-50 text-emerald-700 border-emerald-200">
        <CheckCircle2 className="w-3 h-3" /> Tamamlandı
      </span>
    )
  }
  if (jobStatus === 'error') {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium bg-red-50 text-red-700 border-red-200">
        <XCircle className="w-3 h-3" /> Hata
      </span>
    )
  }
  return null
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

  return (
    <div className="min-h-screen bg-slate-50">

      {/* HEADER */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${role === 'doctor' ? 'bg-emerald-100 text-emerald-600' : 'bg-blue-100 text-blue-600'}`}>
              {role === 'doctor' ? <Stethoscope className="w-5 h-5"/> : <Activity className="w-5 h-5"/>}
            </div>
            <span className="font-bold text-slate-700 text-lg">Gait Analysis</span>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <div className="text-sm font-bold text-slate-800">{username}</div>
              <div className="text-xs text-slate-500 font-medium uppercase tracking-wide">{role === 'patient' ? 'Hasta Paneli' : 'Doktor Paneli'}</div>
            </div>
            <Button variant="outline" size="icon" onClick={onLogout} className="hover:bg-red-50 hover:text-red-600 border-slate-200">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-6 space-y-8">

        {/* YÜKLEME ALANI (Sadece Hasta) */}
        {role === 'patient' && (
          <div
            onDragEnter={onDragEnter}
            onDragLeave={onDragLeave}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onClick={() => !isUploading && inputRef.current?.click()}
            className={`relative rounded-2xl p-8 text-white shadow-xl cursor-pointer transition-all duration-200 select-none
              ${isDragging
                ? 'bg-indigo-500 ring-4 ring-white/50 scale-[1.01]'
                : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500'
              }`}
          >
            <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
              <div className="space-y-2 text-center sm:text-left">
                <h2 className="text-2xl font-bold">
                  {isDragging ? 'Dosyayı bırakın' : 'Yeni Analiz Başlat'}
                </h2>
                <p className="text-blue-100 max-w-md">
                  {isDragging
                    ? 'Video dosyasını buraya bırakarak yükleyin.'
                    : 'Videoyu sürükleyip bırakın veya tıklayarak seçin. Doktorunuz en kısa sürede inceleyecektir.'}
                </p>
              </div>
              <div className="flex flex-col items-center gap-3 bg-white/10 p-4 rounded-xl backdrop-blur-sm border border-white/20 pointer-events-none">
                {isUploading
                  ? <Loader2 className="w-8 h-8 animate-spin" />
                  : <Upload className={`w-8 h-8 transition-transform ${isDragging ? 'scale-125' : ''}`} />
                }
                <span className="text-sm font-medium">
                  {isUploading ? (status || 'Yükleniyor...') : isDragging ? 'Bırakın' : 'Tıkla veya Sürükle'}
                </span>
              </div>
            </div>
            <input ref={inputRef} type="file" accept="video/*" onChange={handleFileChange} className="hidden" aria-label="Video dosyası seç" />
          </div>
        )}

        {/* VİDEO LİSTESİ */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              {role === 'doctor' ? <UserPlus className="w-6 h-6 text-emerald-600"/> : <Play className="w-6 h-6 text-blue-600"/>}
              {role === 'doctor' ? 'Bekleyen Hasta Videoları' : 'Yüklenen Videolar'}
            </h3>
          </div>

          {loadingVideos ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-2xl border border-slate-200 overflow-hidden bg-white">
                  <div className="h-40 bg-slate-200 animate-pulse" />
                  <div className="p-4 space-y-3">
                    <div className="h-4 bg-slate-200 animate-pulse rounded w-3/4" />
                    <div className="h-3 bg-slate-100 animate-pulse rounded w-1/2" />
                    <div className="h-6 bg-slate-100 animate-pulse rounded w-1/3" />
                    <div className="h-8 bg-slate-200 animate-pulse rounded-lg mt-2" />
                  </div>
                </div>
              ))}
            </div>
          ) : videos.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-slate-300">
              <div className="mx-auto bg-slate-50 w-16 h-16 rounded-full flex items-center justify-center mb-4">
                <Upload className="w-8 h-8 text-slate-400" />
              </div>
              <p className="text-lg font-medium text-slate-900">Henüz video yok</p>
              <p className="text-slate-500">Yüklenen videolar burada listelenecektir.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {videos.map((video) => {
                const st = video.job_status
                const cardBorder =
                  st === 'done'       ? 'border-emerald-300 ring-1 ring-emerald-100' :
                  st === 'processing' ? 'border-blue-300 ring-1 ring-blue-100' :
                  st === 'queued'     ? 'border-yellow-300 ring-1 ring-yellow-100' :
                  st === 'error'      ? 'border-red-300 ring-1 ring-red-100' :
                  'border-slate-200'
                const thumbBg =
                  st === 'done'       ? 'bg-emerald-950' :
                  st === 'processing' ? 'bg-blue-950' :
                  st === 'queued'     ? 'bg-yellow-950' :
                  st === 'error'      ? 'bg-red-950' :
                  'bg-slate-900'
                return (
                  <Card key={video.id} className={`group overflow-hidden hover:shadow-xl transition-all duration-300 ${cardBorder}`}>
                    <div
                      className={`h-40 ${thumbBg} flex items-center justify-center relative cursor-pointer transition-colors`}
                      onClick={() => video.file_url && setActiveVideo(video.file_url)}
                    >
                      <Play className="w-12 h-12 text-white opacity-80 group-hover:scale-110 transition-transform" />
                      {/* Status overlay top-left */}
                      {st && (
                        <div className="absolute top-2 left-2">
                          <StatusBadge jobStatus={st} />
                        </div>
                      )}
                      {/* Processing pulse ring */}
                      {st === 'processing' && (
                        <div className="absolute inset-0 border-2 border-blue-400 rounded animate-pulse pointer-events-none" />
                      )}
                      <div className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded">MP4</div>
                    </div>

                    <CardContent className="p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div className="min-w-0 flex-1 mr-2">
                          <h4 className="font-bold text-slate-800 truncate" title={video.file_name}>{video.file_name}</h4>
                          <div className="flex items-center gap-1 text-xs text-slate-500 mt-1">
                            <User className="w-3 h-3" /> <span className="font-medium text-slate-700">{video.user_name}</span>
                          </div>
                        </div>
                        <span className="text-xs text-slate-400 bg-slate-100 px-2 py-1 rounded-full shrink-0">
                          {new Date(video.created_at).toLocaleDateString('tr-TR')}
                        </span>
                      </div>

                      {/* Orijinal video + sil */}
                      <div className="flex gap-2 mt-4">
                        <Button
                          className="flex-1 bg-slate-800 hover:bg-slate-900 text-white"
                          size="sm"
                          onClick={() => video.file_url && setActiveVideo(video.file_url)}
                        >
                          <Play className="w-3 h-3 mr-2" /> İncele
                        </Button>

                        <Button
                          variant="outline"
                          size="icon"
                          className="text-red-500 border-red-100 hover:bg-red-50 hover:text-red-600"
                          onClick={() => confirmDelete(video)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>

                      {/* Analiz butonları (job başlatılmışsa göster) */}
                      {video.job_status && (
                        <>
                          <div className="flex gap-2 mt-2">
                            <Button
                              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
                              size="sm"
                              disabled={video.job_status !== 'done'}
                              onClick={() => openAnalysis(video)}
                            >
                              <BarChart2 className="w-3 h-3 mr-2" /> Analizi İncele
                            </Button>

                            {video.features_url && (
                              <a
                                href={video.features_url}
                                download
                                className="inline-flex items-center justify-center gap-1 text-sm px-3 py-1.5 rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors font-medium"
                              >
                                <Download className="w-3 h-3" /> CSV
                              </a>
                            )}
                          </div>

                        </>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
