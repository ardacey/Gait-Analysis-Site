// src/App.tsx
import { AuthScreen } from './features/auth/AuthScreen'
import { Dashboard } from './features/dashboard/Dashboard'
import { ToastStack } from './components/feedback/ToastStack'
import { VideoPlayerModal } from './components/overlays/VideoPlayerModal'
import { DeleteConfirmModal } from './components/overlays/DeleteConfirmModal'
import { useAuth } from './hooks/useAuth'
import { useToast } from './hooks/useToast'
import { useVideos } from './hooks/useVideos'

function App() {
  const { toasts, showToast, removeToast } = useToast()
  const {
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
  } = useAuth({ onToast: showToast })

  const {
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
  } = useVideos({ username, role, isLoggedIn, onToast: showToast })

  return (
    <div className="relative">
      <ToastStack toasts={toasts} onDismiss={removeToast} />

      {activeVideo && <VideoPlayerModal src={activeVideo} onClose={() => setActiveVideo(null)} />}

      {videoToDelete && (
        <DeleteConfirmModal onCancel={() => setVideoToDelete(null)} onConfirm={handleDelete} />
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
