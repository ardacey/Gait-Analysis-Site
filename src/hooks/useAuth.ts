import { useCallback, useState } from 'react'
import supabase from '../lib/supabaseClient'
import type { AuthMode, UserRole } from '../types'

interface UseAuthOptions {
  onToast: (message: string, type?: 'success' | 'error' | 'info') => void
}

export function useAuth({ onToast }: UseAuthOptions) {
  const [authMode, setAuthMode] = useState<AuthMode>('login')
  const [username, setUsername] = useState<string>('')
  const [role, setRole] = useState<UserRole>('patient')
  const [doctorCode, setDoctorCode] = useState<string>('')
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [authLoading, setAuthLoading] = useState(false)

  const handleAuth = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault()
      if (!supabase) {
        onToast('Supabase bağlantısı eksik.', 'error')
        return
      }
      if (username.trim().length < 3) {
        onToast('Kullanıcı adı en az 3 karakter olmalıdır.', 'error')
        return
      }

      if (authMode === 'register' && role === 'doctor' && !doctorCode.trim()) {
        onToast('Doktor kayıt anahtarı zorunludur.', 'error')
        return
      }

      setAuthLoading(true)

      try {
        if (authMode === 'register') {
          const { data: existingUser, error: existingUserError } = await supabase
            .from('users')
            .select('username')
            .eq('username', username)
            .maybeSingle()

          if (existingUserError) {
            throw existingUserError
          }

          if (existingUser) {
            onToast('Bu kullanıcı adı zaten alınmış.', 'error')
            setAuthLoading(false)
            return
          }

          if (role === 'doctor') {
            const { data, error } = await supabase.functions.invoke('create-doctor', {
              body: { username, secret: doctorCode }
            })

            if (error) {
              const rawMessage = error.message || 'İşlem başarısız.'
              const message = rawMessage.toLowerCase().includes('non-2xx') || rawMessage.includes('401')
                ? 'Hatalı Doktor Kayıt Anahtarı!'
                : rawMessage
              throw new Error(message)
            }

            if (data?.error) {
              const rawMessage = data.error || 'İşlem başarısız.'
              const message = rawMessage.toLowerCase().includes('invalid secret')
                ? 'Hatalı Doktor Kayıt Anahtarı!'
                : rawMessage
              throw new Error(message)
            }
          } else {
            const { error } = await supabase.from('users').insert({
              username,
              role
            })

            if (error) throw error
          }

          onToast('Kayıt başarılı! Şimdi giriş yapabilirsiniz.', 'success')
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
            onToast('Kullanıcı bulunamadı veya rol hatalı.', 'error')
          } else {
            onToast(`Hoşgeldiniz, ${username}`, 'success')
            setIsLoggedIn(true)
          }
        }
      } catch (error) {
        console.error(error)
        const message = error instanceof Error ? error.message : 'Bir veritabanı hatası oluştu.'
        onToast(message, 'error')
      } finally {
        setAuthLoading(false)
      }
    },
    [authMode, doctorCode, onToast, role, username]
  )

  return {
    authMode,
    setAuthMode,
    username,
    setUsername,
    role,
    setRole,
    doctorCode,
    setDoctorCode,
    isLoggedIn,
    setIsLoggedIn,
    authLoading,
    handleAuth
  }
}
