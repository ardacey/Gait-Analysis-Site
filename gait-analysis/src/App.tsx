import { useRef, useState } from 'react'
import { Button } from './components/ui/button'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
const supabaseBucket = import.meta.env.VITE_SUPABASE_BUCKET as string | undefined

const supabase =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null

function App() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState('Video seçmek için butona basın.')
  const [isUploading, setIsUploading] = useState(false)
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null,
  )

  const uploadFiles = async (files: File[]) => {
    if (!supabase || !supabaseBucket) {
      setStatus('Supabase ayarları eksik.')
      return
    }

    setIsUploading(true)
    setAlert(null)
    setStatus('Yükleniyor...')
    let successCount = 0
    let failureCount = 0

    try {
      for (const file of files) {
        try {
          setStatus(`Yükleniyor: ${file.name}`)
          const safeName = file.name.replace(/\s+/g, '-')
          const filePath = `uploads/${Date.now()}-${safeName}`
          const { error } = await supabase.storage.from(supabaseBucket).upload(filePath, file, {
            contentType: file.type || 'video/mp4',
          })
          if (error) throw error
          successCount += 1
        } catch (error) {
          console.error(error)
          failureCount += 1
        }
      }
    } finally {
      setIsUploading(false)
    }

    if (successCount > 0 && failureCount === 0) {
      setAlert({ type: 'success', message: 'Tüm videolar başarıyla yüklendi.' })
      setStatus('Yükleme tamamlandı.')
      return
    }

    if (successCount > 0) {
      setAlert({
        type: 'error',
        message: `${successCount} video yüklendi, ${failureCount} video başarısız oldu.`,
      })
      setStatus('Kısmi yükleme tamamlandı.')
      return
    }

    setAlert({ type: 'error', message: 'Yükleme başarısız oldu.' })
    setStatus('Yükleme başarısız oldu.')
  }

  const handleButtonClick = () => {
    if (!supabase || !supabaseBucket) {
      setStatus('Supabase ayarları eksik.')
      return
    }
    inputRef.current?.click()
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = event.target.files ? Array.from(event.target.files) : []
    event.target.value = ''
    if (selectedFiles.length === 0) return
    void uploadFiles(selectedFiles)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-12">
      <div className="text-center w-full max-w-md bg-white shadow-sm rounded-2xl p-6 sm:p-8">
        <h1 className="text-2xl sm:text-3xl font-bold mb-3">Video Yükle</h1>
        <p className="text-sm sm:text-base text-gray-600 mb-6">
          Birden fazla video seçebilirsiniz.
        </p>
        {alert && (
          <div
            role="status"
            className={`mb-4 rounded-lg px-4 py-3 text-sm ${
              alert.type === 'success'
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-rose-50 text-rose-700'
            }`}
          >
            {alert.message}
          </div>
        )}
        <Button
          type="button"
          onClick={handleButtonClick}
          disabled={isUploading}
          className="mb-4 w-full sm:w-auto"
        >
          {isUploading ? 'Yükleniyor...' : 'Video Yükle'}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          onChange={handleFileChange}
          multiple
          className="hidden"
        />
        <p className="text-sm text-gray-500">{status}</p>
      </div>
    </div>
  )
}

export default App
