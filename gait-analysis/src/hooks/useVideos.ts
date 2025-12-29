import { useCallback, useEffect, useState } from 'react'
import supabase, { supabaseBucket } from '../lib/supabaseClient'
import type { UserRole, VideoRecord } from '../types'

interface UseVideosOptions {
  username: string
  role: UserRole
  isLoggedIn: boolean
  onToast: (message: string, type?: 'success' | 'error' | 'info') => void
}

export function useVideos({ username, role, isLoggedIn, onToast }: UseVideosOptions) {
  const [videos, setVideos] = useState<VideoRecord[]>([])
  const [loadingVideos, setLoadingVideos] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [status, setStatus] = useState('')
  const [activeVideo, setActiveVideo] = useState<string | null>(null)
  const [videoToDelete, setVideoToDelete] = useState<VideoRecord | null>(null)

  const fetchVideos = useCallback(async () => {
    if (!supabase) return
    setLoadingVideos(true)

    let query = supabase.from('videos').select('*').order('created_at', { ascending: false })

    if (role === 'patient') {
      query = query.eq('user_name', username)
    }

    const { data, error } = await query
    if (error) {
      console.error(error)
    } else {
      setVideos(data || [])
    }
    setLoadingVideos(false)
  }, [role, username])

  useEffect(() => {
    if (isLoggedIn) {
      void fetchVideos()
    }
  }, [fetchVideos, isLoggedIn])

  const handleUploadFiles = useCallback(
    async (files: File[]) => {
      if (!supabase || !supabaseBucket) return
      const MAX_SIZE_MB = 100
      for (const file of files) {
        if (file.size > MAX_SIZE_MB * 1024 * 1024) {
          onToast(`"${file.name}" çok büyük!`, 'error')
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
          onToast(`${file.name} başarıyla yüklendi.`, 'success')
        } catch (error) {
          console.error(error)
          onToast(`Hata: ${file.name} yüklenemedi.`, 'error')
        }
      }

      await fetchVideos()
      setIsUploading(false)
      setStatus('')
    },
    [fetchVideos, onToast, username]
  )

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = event.target.files ? Array.from(event.target.files) : []
      event.target.value = ''
      if (selectedFiles.length === 0) return
      void handleUploadFiles(selectedFiles)
    },
    [handleUploadFiles]
  )

  const handleDelete = useCallback(async () => {
    if (!videoToDelete || !supabase || !supabaseBucket) return
    try {
      await supabase.storage.from(supabaseBucket).remove([videoToDelete.file_path])
      await supabase.from('videos').delete().eq('id', videoToDelete.id)
      setVideos((prev) => prev.filter((video) => video.id !== videoToDelete.id))
      if (activeVideo === videoToDelete.file_url) setActiveVideo(null)
      onToast('Video başarıyla silindi.', 'success')
    } catch (error) {
      console.error(error)
      onToast('Silme işlemi başarısız.', 'error')
    } finally {
      setVideoToDelete(null)
    }
  }, [activeVideo, onToast, videoToDelete])

  return {
    videos,
    loadingVideos,
    isUploading,
    status,
    activeVideo,
    setActiveVideo,
    videoToDelete,
    setVideoToDelete,
    handleFileChange,
    handleDelete
  }
}
