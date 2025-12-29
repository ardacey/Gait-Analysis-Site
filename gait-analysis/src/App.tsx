// src/App.tsx
import { useEffect, useState, useCallback } from 'react'
import { Button } from './components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from './components/ui/card'
import { X, CheckCircle2, AlertCircle, Activity } from 'lucide-react'

// Modüllerden import
import supabase, { supabaseBucket } from './lib/supabaseClient'
import { AuthScreen } from './components/AuthScreen'
import { Dashboard } from './components/Dashboard'
import { VideoRecord, UserRole, AuthMode, ToastMessage } from './types'

function App() {
  // --- STATE ---
  const [authMode, setAuthMode] = useState<AuthMode>('login')
  const [username, setUsername] = useState<string>('')
  const [role, setRole] = useState<UserRole>('patient')
  const [doctorCode, setDoctorCode] = useState<string>('') 
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [authLoading, setAuthLoading] = useState(false)
  
  const [videos, setVideos] = useState<VideoRecord[]>([])
  const [loadingVideos, setLoadingVideos] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [status, setStatus] = useState('')
  
  const [activeVideo, setActiveVideo] = useState<string | null>(null)
  const [toasts, setToasts] = useState<ToastMessage[]>([]) 
  const [videoToDelete, setVideoToDelete] = useState<VideoRecord | null>(null) 

  // --- TOAST FONKSİYONLARI ---
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Date.now()
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000)
  }
  const removeToast = (id: number) => setToasts((prev) => prev.filter((t) => t.id !== id))

  // --- AUTH İŞLEMLERİ ---
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!supabase) {
      showToast("Supabase bağlantısı eksik.", 'error')
      return
    }
    if (username.trim().length < 3) {
      showToast('Kullanıcı adı en az 3 karakter olmalıdır.', 'error')
      return
    }

    const SECRET_DOCTOR_KEY = "MED-2025-ADMIN" 
    
    if (authMode === 'register' && role === 'doctor') {
      if (doctorCode !== SECRET_DOCTOR_KEY) {
        showToast("Hatalı Doktor Kayıt Anahtarı!", 'error')
        return
      }
    }

    setAuthLoading(true)

    try {
      if (authMode === 'register') {
        const { data: existingUser } = await supabase
          .from('users')
          .select('username')
          .eq('username', username)
          .single()

        if (existingUser) {
          showToast('Bu kullanıcı adı zaten alınmış.', 'error')
          setAuthLoading(false)
          return
        }

        const { error } = await supabase.from('users').insert({
          username,
          role
        })

        if (error) throw error
        
        showToast('Kayıt başarılı! Şimdi giriş yapabilirsiniz.', 'success')
        setAuthMode('login') 
        setDoctorCode('')
      } else {
        const { data: user, error } = await supabase
          .from('users')
          .select('*')
          .eq('username', username)
          .eq('role', role) 
          .single()

        if (error || !user) {
          showToast('Kullanıcı bulunamadı veya rol hatalı.', 'error')
        } else {
          showToast(`Hoşgeldiniz, ${username}`, 'success')
          setIsLoggedIn(true)
        }
      }
    } catch (error) {
      console.error(error)
      showToast('Bir veritabanı hatası oluştu.', 'error')
    } finally {
      setAuthLoading(false)
    }
  }

  // --- DATA FETCHING ---
  const fetchVideos = useCallback(async () => {
    if (!supabase) return
    setLoadingVideos(true)
    
    let query = supabase.from('videos').select('*').order('created_at', { ascending: false })

    if (role === 'patient') {
      query = query.eq('user_name', username)
    }

    const { data, error } = await query
    if (error) console.error(error)
    else setVideos(data || [])
    setLoadingVideos(false)
  }, [username, role])

  useEffect(() => {
    if (isLoggedIn) fetchVideos()
  }, [isLoggedIn, fetchVideos])

  // --- UPLOAD ---
  const handleUploadFiles = async (files: File[]) => {
    if (!supabase || !supabaseBucket) return
    const MAX_SIZE_MB = 100
    for (const file of files) {
      if (file.size > MAX_SIZE_MB * 1024 * 1024) {
        showToast(`"${file.name}" çok büyük!`, 'error')
        return
      }
    }

    setIsUploading(true)
    setStatus('Yükleme başlatılıyor...')

    for (const file of files) {
      try {
        const timestamp = Date.now()
        const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
        const filePath = `${username}/${timestamp}-${safeName}`

        const { error: uploadError } = await supabase.storage
          .from(supabaseBucket)
          .upload(filePath, file, { contentType: file.type || 'video/mp4' })

        if (uploadError) throw uploadError

        const { data: publicUrlData } = supabase.storage
          .from(supabaseBucket)
          .getPublicUrl(filePath)

        const { error: dbError } = await supabase.from('videos').insert({
          user_name: username,
          file_name: file.name,
          file_path: filePath,
          file_url: publicUrlData.publicUrl
        })

        if (dbError) throw dbError
        showToast(`${file.name} başarıyla yüklendi.`, 'success')
      } catch (error) {
        console.error(error)
        showToast(`Hata: ${file.name} yüklenemedi.`, 'error')
      }
    }
    await fetchVideos()
    setIsUploading(false)
    setStatus('')
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = event.target.files ? Array.from(event.target.files) : []
    event.target.value = ''
    if (selectedFiles.length === 0) return
    void handleUploadFiles(selectedFiles)
  }

  // --- DELETE ---
  const handleDelete = async () => {
    if (!videoToDelete || !supabase || !supabaseBucket) return
    try {
      await supabase.storage.from(supabaseBucket).remove([videoToDelete.file_path])
      await supabase.from('videos').delete().eq('id', videoToDelete.id)
      setVideos(prev => prev.filter(v => v.id !== videoToDelete.id))
      if (activeVideo === videoToDelete.file_url) setActiveVideo(null)
      showToast('Video başarıyla silindi.', 'success')
    } catch (error) {
      console.error(error)
      showToast('Silme işlemi başarısız.', 'error')
    } finally {
      setVideoToDelete(null)
    }
  }

  return (
    <div className="relative">
      {/* Toast Container */}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 w-full max-w-sm pointer-events-none px-4 sm:px-0">
        {toasts.map((toast) => (
          <div key={toast.id} className={`pointer-events-auto flex items-center gap-3 p-4 rounded-lg shadow-lg border animate-in slide-in-from-right-full duration-300 bg-white ${toast.type === 'success' ? 'border-emerald-200 text-emerald-800' : toast.type === 'error' ? 'border-red-200 text-red-800' : 'border-blue-200 text-blue-800'}`}>
            {toast.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-500"/> : toast.type === 'error' ? <AlertCircle className="w-5 h-5 text-red-500"/> : <Activity className="w-5 h-5 text-blue-500"/>}
            <p className="text-sm font-medium flex-1">{toast.message}</p>
            <button onClick={() => removeToast(toast.id)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
          </div>
        ))}
      </div>

      {/* MODALS */}
      {activeVideo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-black w-full max-w-4xl rounded-2xl overflow-hidden shadow-2xl relative">
            <button onClick={() => setActiveVideo(null)} className="absolute top-4 right-4 bg-white/10 hover:bg-white/20 text-white p-2 rounded-full transition-all z-10"><X className="w-5 h-5" /></button>
            <video src={activeVideo} controls autoPlay className="w-full max-h-[80vh]" />
          </div>
        </div>
      )}

      {videoToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <Card className="w-full max-w-sm shadow-xl">
            <CardHeader>
              <CardTitle className="text-lg text-red-600 flex items-center gap-2"><AlertCircle className="w-5 h-5"/> Emin misiniz?</CardTitle>
              <CardDescription>Bu videoyu kalıcı olarak silmek üzeresiniz.</CardDescription>
            </CardHeader>
            <CardFooter className="flex justify-end gap-3 pt-4">
              <Button variant="outline" onClick={() => setVideoToDelete(null)}>Vazgeç</Button>
              <Button variant="destructive" onClick={handleDelete}>Evet, Sil</Button>
            </CardFooter>
          </Card>
        </div>
      )}

      {/* MAIN SCREENS */}
      {!isLoggedIn ? (
        <AuthScreen 
          authMode={authMode} setAuthMode={setAuthMode}
          username={username} setUsername={setUsername}
          role={role} setRole={setRole}
          doctorCode={doctorCode} setDoctorCode={setDoctorCode}
          handleAuth={handleAuth} authLoading={authLoading}
        />
      ) : (
        <Dashboard 
          role={role} username={username} setIsLoggedIn={setIsLoggedIn}
          videos={videos} loadingVideos={loadingVideos}
          isUploading={isUploading} status={status} handleFileChange={handleFileChange}
          setActiveVideo={setActiveVideo} confirmDelete={setVideoToDelete}
        />
      )}
    </div>
  )
}

export default App