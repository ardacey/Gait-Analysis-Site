import { useCallback, useEffect, useRef, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import supabase, { supabaseBucket } from '../lib/supabaseClient'
import type { Database } from '../lib/database.types'
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

  const client = supabase as SupabaseClient<Database> | null
  const onToastRef = useRef(onToast)
  onToastRef.current = onToast
  // Track which video IDs were already done when page loaded (no toast for those)
  const initialDoneIds = useRef<Set<number>>(new Set())
  const initialized = useRef(false)

  const fetchVideos = useCallback(async () => {
    if (!client) return
    setLoadingVideos(true)

    let query = client.from('videos').select('*').order('created_at', { ascending: false })
    if (role === 'patient') {
      query = query.eq('user_name', username)
    }

    const { data, error } = await query
    if (error) {
      console.error(error)
    } else {
      const records = (data || []) as VideoRecord[]

      if (!initialized.current) {
        // First load: remember which jobs are already done — no toast for these
        records.forEach(v => {
          if (v.job_status === 'done') initialDoneIds.current.add(v.id)
        })
        initialized.current = true
      } else {
        // Subsequent fetches: detect newly completed jobs
        setVideos(prev => {
          const prevMap = new Map(prev.map(v => [v.id, v]))
          records.forEach(v => {
            const was = prevMap.get(v.id)
            if (v.job_status === 'done' && was?.job_status !== 'done' && !initialDoneIds.current.has(v.id)) {
              onToastRef.current('Video analizi tamamlandı! Analizi inceleyebilirsiniz.', 'success')
              initialDoneIds.current.add(v.id)
            }
            if (v.job_status === 'error' && was?.job_status !== 'error' && !initialDoneIds.current.has(v.id)) {
              onToastRef.current('Video analizi başarısız oldu.', 'error')
              initialDoneIds.current.add(v.id)
            }
          })
          return records
        })
        setLoadingVideos(false)
        return
      }

      setVideos(records)
    }
    setLoadingVideos(false)
  }, [client, role, username])

  useEffect(() => {
    if (isLoggedIn) {
      void fetchVideos()
    } else {
      // Reset on logout
      initialized.current = false
      initialDoneIds.current = new Set()
    }
  }, [fetchVideos, isLoggedIn])

  // Realtime subscription with polling fallback
  useEffect(() => {
    if (!isLoggedIn || !client) return

    let pollId: ReturnType<typeof setInterval> | null = null

    const handleUpdate = (updated: VideoRecord) => {
      if (role === 'patient' && updated.user_name !== username) return
      setVideos(prev => {
        const was = prev.find(v => v.id === updated.id)
        if (updated.job_status === 'done' && was?.job_status !== 'done' && !initialDoneIds.current.has(updated.id)) {
          onToastRef.current('Video analizi tamamlandı! Analizi inceleyebilirsiniz.', 'success')
          initialDoneIds.current.add(updated.id)
        }
        if (updated.job_status === 'error' && was?.job_status !== 'error' && !initialDoneIds.current.has(updated.id)) {
          onToastRef.current('Video analizi başarısız oldu.', 'error')
          initialDoneIds.current.add(updated.id)
        }
        return prev.map(v => v.id === updated.id ? updated : v)
      })
    }

    const channel = client
      .channel('videos-realtime')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'videos' },
        (payload) => handleUpdate(payload.new as VideoRecord)
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'videos' },
        (payload) => {
          const inserted = payload.new as VideoRecord
          if (role === 'patient' && inserted.user_name !== username) return
          setVideos(prev => prev.some(v => v.id === inserted.id) ? prev : [inserted, ...prev])
        }
      )
      .subscribe((status) => {
        console.log('[Realtime] status:', status)
        if (status === 'SUBSCRIBED') {
          // Realtime çalışıyor, polling'e gerek yok
          if (pollId) { clearInterval(pollId); pollId = null }
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          // Realtime başarısız, 15sn polling'e geri dön
          console.warn('[Realtime] bağlantı kurulamadı, polling başlatılıyor')
          if (!pollId) pollId = setInterval(() => void fetchVideos(), 15_000)
        }
      })

    return () => {
      void client.removeChannel(channel)
      if (pollId) clearInterval(pollId)
    }
  }, [isLoggedIn, client, role, username, fetchVideos])

  const handleUploadFiles = useCallback(
    async (files: File[]) => {
      if (!client || !supabaseBucket) return
      const MAX_SIZE_MB = 100
      if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
        onToast('Geçersiz kullanıcı adı formatı.', 'error')
        return
      }
      for (const file of files) {
        if (file.size > MAX_SIZE_MB * 1024 * 1024) {
          onToast(`"${file.name}" çok büyük!`, 'error')
          return
        }
      }

      setIsUploading(true)

      for (const file of files) {
        try {
          setStatus('Supabase\'e yükleniyor...')
          const timestamp = Date.now()
          const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
          const filePath = `${username}/${timestamp}-${safeName}`

          const { error: uploadError } = await client.storage
            .from(supabaseBucket)
            .upload(filePath, file, { contentType: file.type || 'video/mp4' })

          if (uploadError) throw uploadError

          const { data: publicUrlData } = client.storage
            .from(supabaseBucket)
            .getPublicUrl(filePath)

          const { error: dbError } = await client
            .from('videos')
            .insert({
              user_name: username,
              file_name: file.name,
              file_path: filePath,
              file_url: publicUrlData.publicUrl,
              job_status: 'queued',
            })

          if (dbError) throw dbError

          onToast(`${file.name} başarıyla yüklendi.`, 'success')
        } catch (error) {
          console.error(error)
          onToast(`Hata: ${file.name} yüklenemedi.`, 'error')
        }
      }

      setIsUploading(false)
      setStatus('')
    },
    [client, onToast, username]
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
    if (!videoToDelete || !client || !supabaseBucket) return
    try {
      const { data: removedFiles, error: storageError } = await client.storage
        .from(supabaseBucket)
        .remove([videoToDelete.file_path])
      if (storageError || !removedFiles?.length) {
        onToast('Storage silinemedi. Policy veya path kontrol edin.', 'error')
        return
      }
      await client.from('videos').delete().eq('id', videoToDelete.id)
      setVideos(prev => prev.filter(v => v.id !== videoToDelete.id))
      if (activeVideo === videoToDelete.file_url) setActiveVideo(null)
      onToast('Video başarıyla silindi.', 'success')
    } catch (error) {
      console.error(error)
      onToast('Silme işlemi başarısız.', 'error')
    } finally {
      setVideoToDelete(null)
    }
  }, [activeVideo, client, onToast, videoToDelete])

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
    handleUploadFiles,
    handleDelete,
  }
}
