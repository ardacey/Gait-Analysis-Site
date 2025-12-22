import { useEffect, useRef, useState } from 'react'
import { Button } from './components/ui/button'

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: {
            client_id: string
            scope: string
            callback: (tokenResponse: { access_token: string }) => void
          }) => {
            requestAccessToken: (options?: { prompt?: string }) => void
          }
        }
      }
    }
  }
}

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined
const SCOPES = 'https://www.googleapis.com/auth/drive.file'

function App() {
  const inputRef = useRef<HTMLInputElement>(null)
  const tokenClientRef = useRef<{
    requestAccessToken: (options?: { prompt?: string }) => void
  } | null>(null)
  const tokenRef = useRef<string | null>(null)
  const pendingFileRef = useRef<File | null>(null)
  const [status, setStatus] = useState('Google hazirlaniyor.')
  const [isUploading, setIsUploading] = useState(false)

  useEffect(() => {
    if (!CLIENT_ID) {
      setStatus('VITE_GOOGLE_CLIENT_ID eksik.')
      return
    }

    const scriptId = 'google-identity-services'
    const existingScript = document.getElementById(scriptId)

    const initTokenClient = () => {
      if (!window.google?.accounts?.oauth2) {
        setStatus('Google kimlik istemcisi hazır değil.')
        return
      }

      tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: (tokenResponse) => {
          tokenRef.current = tokenResponse.access_token
          const file = pendingFileRef.current
          pendingFileRef.current = null
          if (file) {
            void uploadFile(file)
          }
        },
      })
      setStatus('Video secmek icin butona basin.')
    }

    if (existingScript) {
      initTokenClient()
      return
    }

    const script = document.createElement('script')
    script.id = scriptId
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.onload = initTokenClient
    script.onerror = () => setStatus('Google betiği yüklenemedi.')
    document.body.appendChild(script)
  }, [])

  const uploadFile = async (file: File) => {
    if (!tokenRef.current) {
      setStatus('Yetkilendirme eksik.')
      return
    }

    setIsUploading(true)
    setStatus('Yükleniyor...')

    try {
      const metadata = {
        name: file.name,
        mimeType: file.type || 'video/mp4',
      }
      const form = new FormData()
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }))
      form.append('file', file)

      const response = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${tokenRef.current}`,
          },
          body: form,
        },
      )

      if (!response.ok) {
        const message = await response.text()
        throw new Error(message || 'Yükleme başarısız oldu.')
      }

      setStatus('Yükleme tamamlandı.')
    } catch (error) {
      console.error(error)
      setStatus('Yükleme başarısız oldu.')
    } finally {
      setIsUploading(false)
    }
  }

  const handleButtonClick = () => {
    if (!CLIENT_ID) {
      setStatus('VITE_GOOGLE_CLIENT_ID eksik.')
      return
    }
    inputRef.current?.click()
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    pendingFileRef.current = file

    if (tokenRef.current) {
      void uploadFile(file)
      return
    }

    if (!tokenClientRef.current) {
      setStatus('Google kimlik istemcisi hazır değil.')
      return
    }

    setStatus('Google ile yetkilendiriliyor...')
    tokenClientRef.current.requestAccessToken({ prompt: '' })
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-4">Video Yükle</h1>
        <p className="text-gray-600 mb-6">Video seçmek için butona tıklayın.</p>
        <Button
          type="button"
          onClick={handleButtonClick}
          disabled={isUploading}
          className="mb-4"
        >
          {isUploading ? 'Yükleniyor...' : 'Video Yükle'}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          onChange={handleFileChange}
          className="hidden"
        />
        <p className="text-sm text-gray-500">{status}</p>
      </div>
    </div>
  )
}

export default App
