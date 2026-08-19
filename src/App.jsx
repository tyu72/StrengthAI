import { Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { AppLayout, PlainLayout } from '@/components/AppLayout'
import Login from '@/pages/Login'
import Register from '@/pages/Register'
import ForgotPassword from '@/pages/ForgotPassword'
import ResetPassword from '@/pages/ResetPassword'
import Home from '@/pages/Home'
import Workout from '@/pages/Workout'
import Progress from '@/pages/Progress'
import Coach from '@/pages/Coach'
import CoachChat from '@/pages/CoachChat'
import SessionDetail from '@/pages/SessionDetail'
import Settings from '@/pages/Settings'
import Templates from '@/pages/Templates'
import TemplateEditor from '@/pages/TemplateEditor'

// The screen fade lives in the layout routes, not in a wrapper around <Routes>. Wrapping
// everything put the bottom nav inside the animated element, and the animation's retained
// transform re-anchored the nav's `position: fixed` to that box instead of the viewport.
function App() {
  return (
    <Routes>
      <Route element={<PlainLayout />}>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot" element={<ForgotPassword />} />
        <Route path="/reset" element={<ResetPassword />} />
      </Route>
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/workout/:sessionId" element={<Workout />} />
          <Route path="/progress" element={<Progress />} />
          {/* The Coach tab is the chat. The detection screen it replaced is still reachable
              at /coach/insights — plateau cards, goals and weekly reports all live there,
              and nothing has been deleted. */}
          <Route path="/coach" element={<CoachChat />} />
          <Route path="/coach/insights" element={<Coach />} />
          <Route path="/workouts" element={<Templates />} />
        </Route>
        <Route element={<PlainLayout />}>
          <Route path="/session/:sessionId" element={<SessionDetail />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/template/:templateId" element={<TemplateEditor />} />
        </Route>
      </Route>
    </Routes>
  )
}

export default App
