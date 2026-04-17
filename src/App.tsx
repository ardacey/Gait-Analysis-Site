// src/App.tsx
import { useState } from 'react'
import { AuthScreen } from './features/auth/AuthScreen'
import { Dashboard } from './features/dashboard/Dashboard'
import { ToastStack } from './components/feedback/ToastStack'
import { VideoPlayerModal } from './components/overlays/VideoPlayerModal'
import { DeleteConfirmModal } from './components/overlays/DeleteConfirmModal'
import { AnalysisViewer } from './features/analysis/AnalysisViewer'
import { useAuth } from './hooks/useAuth'
import { useToast } from './hooks/useToast'
import { useVideos } from './hooks/useVideos'
import type { VideoRecord } from './types'

function App() {
  const [analysisVideo, setAnalysisVideo] = useState<VideoRecord | null>(null)
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
    authLoading,
    handleAuth,
    logout,
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
    handleUploadFiles,
    handleDelete,
  } = useVideos({ username, role, isLoggedIn, onToast: showToast })

  return (
    <div className="relative">
      <ToastStack toasts={toasts} onDismiss={removeToast} />

      {analysisVideo && (
        <AnalysisViewer video={analysisVideo} onClose={() => setAnalysisVideo(null)} />
      )}

      {!analysisVideo && activeVideo && (
        <VideoPlayerModal src={activeVideo} onClose={() => setActiveVideo(null)} />
      )}

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
          role={role} username={username} onLogout={logout}
          videos={videos} loadingVideos={loadingVideos}
          isUploading={isUploading} status={status} handleFileChange={handleFileChange} handleUploadFiles={handleUploadFiles}
          setActiveVideo={setActiveVideo} confirmDelete={setVideoToDelete}
          openAnalysis={setAnalysisVideo}
        />
      )}
    </div>
  )
}

export default App
