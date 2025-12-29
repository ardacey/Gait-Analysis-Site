// src/features/dashboard/Dashboard.tsx
import { useRef } from 'react'
import { Button } from '../../components/ui/button'
import { Card, CardContent } from '../../components/ui/card'
import { Trash2, Play, Upload, User, LogOut, Stethoscope, Activity, UserPlus } from 'lucide-react'
import type { UserRole, VideoRecord } from '../../types'

interface DashboardProps {
  role: UserRole
  username: string
  setIsLoggedIn: (val: boolean) => void
  videos: VideoRecord[]
  loadingVideos: boolean
  isUploading: boolean
  status: string
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  setActiveVideo: (url: string) => void
  confirmDelete: (video: VideoRecord) => void
}

export function Dashboard({
  role, username, setIsLoggedIn,
  videos, loadingVideos,
  isUploading, status, handleFileChange,
  setActiveVideo, confirmDelete
}: DashboardProps) {
  
  const inputRef = useRef<HTMLInputElement>(null)

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
            <Button variant="outline" size="icon" onClick={() => setIsLoggedIn(false)} className="hover:bg-red-50 hover:text-red-600 border-slate-200">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-6 space-y-8">

        {/* YÜKLEME ALANI (Sadece Hasta) */}
        {role === 'patient' && (
          <div className="bg-linear-to-r from-blue-600 to-indigo-600 rounded-2xl p-8 text-white shadow-xl flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="space-y-2 text-center sm:text-left">
              <h2 className="text-2xl font-bold">Yeni Analiz Başlat</h2>
              <p className="text-blue-100 max-w-md">Yürüyüş analizi için videonuzu buraya yükleyin. Doktorunuz en kısa sürede inceleyecektir.</p>
            </div>
            <div className="flex flex-col items-center gap-3 bg-white/10 p-4 rounded-xl backdrop-blur-sm border border-white/20">
              <Button 
                onClick={() => inputRef.current?.click()} 
                disabled={isUploading}
                className="bg-white text-blue-600 hover:bg-blue-50 border-0 font-bold px-8 py-6 h-auto text-lg shadow-lg"
              >
                {isUploading ? 'Yükleniyor...' : 'Video Yükle'} <Upload className="ml-2 w-5 h-5" />
              </Button>
              {status && <span className="text-sm font-medium animate-pulse">{status}</span>}
            </div>
            <input ref={inputRef} type="file" accept="video/*" onChange={handleFileChange} className="hidden" />
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
             <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>
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
              {videos.map((video) => (
                <Card key={video.id} className="group overflow-hidden hover:shadow-xl transition-all duration-300 border-slate-200">
                  <div className="h-40 bg-slate-900 flex items-center justify-center relative group-hover:bg-slate-800 transition-colors cursor-pointer" onClick={() => video.file_url && setActiveVideo(video.file_url)}>
                    <Play className="w-12 h-12 text-white opacity-80 group-hover:scale-110 transition-transform" />
                    <div className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded">MP4</div>
                  </div>
                  
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h4 className="font-bold text-slate-800 truncate w-40" title={video.file_name}>{video.file_name}</h4>
                        <div className="flex items-center gap-1 text-xs text-slate-500 mt-1">
                           <User className="w-3 h-3" /> <span className="font-medium text-slate-700">{video.user_name}</span>
                        </div>
                      </div>
                      <span className="text-xs text-slate-400 bg-slate-100 px-2 py-1 rounded-full">
                        {new Date(video.created_at).toLocaleDateString('tr-TR')}
                      </span>
                    </div>

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
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
