// src/features/auth/AuthScreen.tsx
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card'
import { Activity, User, Stethoscope, CheckCircle2, Lock } from 'lucide-react'
import type { UserRole, AuthMode } from '../../types'

interface AuthScreenProps {
  authMode: AuthMode
  setAuthMode: (mode: AuthMode) => void
  username: string
  setUsername: (name: string) => void
  role: UserRole
  setRole: (role: UserRole) => void
  doctorCode: string
  setDoctorCode: (code: string) => void
  handleAuth: (e: React.FormEvent) => void
  authLoading: boolean
}

export function AuthScreen({
  authMode, setAuthMode,
  username, setUsername,
  role, setRole,
  doctorCode, setDoctorCode,
  handleAuth, authLoading
}: AuthScreenProps) {
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-slate-50 to-blue-50 px-4">
      <Card className="w-full max-w-lg shadow-2xl border-0">
        {/* Sekmeler */}
        <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-t-xl">
          <button
            onClick={() => { setAuthMode('login'); setDoctorCode(''); }}
            className={`px-2 py-3 text-sm font-semibold rounded-lg transition-all ${
              authMode === 'login' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Giriş Yap
          </button>
          <button
            onClick={() => { setAuthMode('register'); setDoctorCode(''); }}
            className={`px-2 py-3 text-sm font-semibold rounded-lg transition-all ${
              authMode === 'register' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Kayıt Ol
          </button>
        </div>

        <CardHeader className="text-center space-y-4 pt-8">
          <div className="mx-auto bg-blue-100 p-4 rounded-full w-fit">
            <Activity className="w-10 h-10 text-blue-600" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold text-slate-800">
              {authMode === 'login' ? 'Tekrar Hoşgeldiniz' : 'Hesap Oluşturun'}
            </CardTitle>
            <CardDescription className="mt-2">
              {authMode === 'login' 
                ? 'Gait Analysis platformuna giriş yapın.' 
                : 'Doktor veya hasta olarak kayıt olun.'}
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleAuth} className="space-y-6">
            <div className="space-y-3">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Kim Olarak {authMode === 'login' ? 'Gireceksiniz?' : 'Kaydolacaksınız?'}
              </label>
              <div className="grid grid-cols-2 gap-4">
                <div 
                  onClick={() => setRole('patient')}
                  className={`cursor-pointer relative border-2 rounded-xl p-4 flex flex-col items-center gap-2 transition-all hover:shadow-md ${
                    role === 'patient' 
                      ? 'border-blue-500 bg-blue-50 text-blue-700' 
                      : 'border-slate-100 bg-white text-slate-500 hover:border-slate-300'
                  }`}
                >
                  {role === 'patient' && <CheckCircle2 className="absolute top-2 right-2 w-4 h-4 text-blue-500" />}
                  <User className="w-8 h-8" />
                  <span className="font-medium">Hasta</span>
                </div>

                <div 
                  onClick={() => setRole('doctor')}
                  className={`cursor-pointer relative border-2 rounded-xl p-4 flex flex-col items-center gap-2 transition-all hover:shadow-md ${
                    role === 'doctor' 
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700' 
                      : 'border-slate-100 bg-white text-slate-500 hover:border-slate-300'
                  }`}
                >
                  {role === 'doctor' && <CheckCircle2 className="absolute top-2 right-2 w-4 h-4 text-emerald-500" />}
                  <Stethoscope className="w-8 h-8" />
                  <span className="font-medium">Doktor</span>
                </div>
              </div>
            </div>

            {/* DOKTOR ŞİFRESİ */}
            {authMode === 'register' && role === 'doctor' && (
              <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                <label className="text-sm font-bold text-emerald-700 flex items-center gap-2">
                  <Lock className="w-4 h-4"/> Doktor Kayıt Anahtarı
                </label>
                <input
                  type="password"
                  value={doctorCode}
                  onChange={(e) => setDoctorCode(e.target.value)}
                  placeholder="Yönetici şifresini giriniz..."
                  className="flex h-12 w-full rounded-lg border-2 border-emerald-100 bg-emerald-50 px-3 text-sm focus:outline-none focus:border-emerald-500 transition-all"
                  required
                />
                <p className="text-[10px] text-emerald-600 font-medium">
                  * Şifre: MED-2025-ADMIN
                </p>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Kullanıcı Adı</label>
              <div className="relative">
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={role === 'patient' ? "Örn: ahmet123" : "Örn: dr_ayse"}
                  className="flex h-12 w-full pl-10 rounded-lg border border-slate-300 bg-slate-50 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  required
                />
                <User className="absolute left-3 top-3.5 w-5 h-5 text-slate-400" />
              </div>
            </div>

            <Button 
              type="submit" 
              disabled={authLoading}
              className={`w-full h-12 text-base font-semibold shadow-lg transition-all ${
                role === 'doctor' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {authLoading ? 'İşlem yapılıyor...' : (authMode === 'login' ? 'Giriş Yap' : 'Kayıt Ol')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
