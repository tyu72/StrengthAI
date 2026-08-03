import { Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { AppLayout } from '@/components/AppLayout'
import Login from '@/pages/Login'
import Register from '@/pages/Register'
import ForgotPassword from '@/pages/ForgotPassword'
import ResetPassword from '@/pages/ResetPassword'
import Home from '@/pages/Home'
import Workout from '@/pages/Workout'
import Progress from '@/pages/Progress'
import Coach from '@/pages/Coach'
import SessionDetail from '@/pages/SessionDetail'
import Settings from '@/pages/Settings'
import Templates from '@/pages/Templates'
import TemplateEditor from '@/pages/TemplateEditor'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot" element={<ForgotPassword />} />
      <Route path="/reset" element={<ResetPassword />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/workout/:sessionId" element={<Workout />} />
          <Route path="/progress" element={<Progress />} />
          <Route path="/coach" element={<Coach />} />
          <Route path="/workouts" element={<Templates />} />
        </Route>
        <Route path="/session/:sessionId" element={<SessionDetail />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/template/:templateId" element={<TemplateEditor />} />
      </Route>
    </Routes>
  )
}

export default App
