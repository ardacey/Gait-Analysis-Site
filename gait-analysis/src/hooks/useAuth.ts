import { useCallback, useState } from 'react'
import supabase from '../lib/supabaseClient'
import type { AuthMode, UserRole } from '../types'

const SECRET_DOCTOR_KEY = 'MED-2025-ADMIN'

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

      if (authMode === 'register' && role === 'doctor' && doctorCode !== SECRET_DOCTOR_KEY) {
        onToast('Hatalı Doktor Kayıt Anahtarı!', 'error')
        return
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
            onToast('Bu kullanıcı adı zaten alınmış.', 'error')
            setAuthLoading(false)
            return
          }

          const { error } = await supabase.from('users').insert({
            username,
            role
          })

          if (error) throw error

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
        onToast('Bir veritabanı hatası oluştu.', 'error')
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
