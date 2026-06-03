import { useCallback, useState } from 'react'
import supabase from '../lib/supabaseClient'
import type { AuthMode, UserRole } from '../types'

const SESSION_KEY = 'gait_session'

function readSession(): { username: string; role: UserRole } | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as { username: string; role: UserRole }) : null
  } catch { return null }
}

interface UseAuthOptions {
  onToast: (message: string, type?: 'success' | 'error' | 'info') => void
}

export function useAuth({ onToast }: UseAuthOptions) {
  const [authMode, setAuthMode] = useState<AuthMode>('login')
  const saved = readSession()
  const [username, setUsername] = useState<string>(saved?.username ?? '')
  const [password, setPassword] = useState<string>('')
  const [role, setRole] = useState<UserRole>(saved?.role ?? 'patient')
  const [doctorCode, setDoctorCode] = useState<string>('')
  const [isLoggedIn, setIsLoggedIn] = useState(!!saved)
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
      if (!/^[a-zA-Z0-9_-]+$/.test(username.trim())) {
        onToast('Kullanıcı adı yalnızca harf, rakam, _ ve - içerebilir.', 'error')
        return
      }
      if (!password.trim()) {
        onToast('Şifre boş olamaz.', 'error')
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
              body: { username, secret: doctorCode, password }
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
              role,
              password,
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
            .eq('password', password)
            .single()

          if (error || !user) {
            onToast('Kullanıcı adı, şifre veya rol hatalı.', 'error')
          } else {
            localStorage.setItem(SESSION_KEY, JSON.stringify({ username: username.trim(), role }))
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
    [authMode, doctorCode, onToast, password, role, username]
  )

  const logout = useCallback(() => {
    localStorage.removeItem(SESSION_KEY)
    setIsLoggedIn(false)
    setUsername('')
    setPassword('')
  }, [])

  return {
    authMode,
    setAuthMode,
    username,
    setUsername,
    password,
    setPassword,
    role,
    setRole,
    doctorCode,
    setDoctorCode,
    isLoggedIn,
    setIsLoggedIn,
    authLoading,
    handleAuth,
    logout,
  }
}
