import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { AuthShell } from '@/components/auth/AuthShell'

export default function Login() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await signIn(email, password)
      navigate(location.state?.from?.pathname ?? '/', { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Your training history is waiting."
      submitLabel="Log in"
      submitting={submitting}
      error={error}
      onSubmit={handleSubmit}
      fields={[
        {
          name: 'email',
          label: 'Email',
          type: 'email',
          placeholder: 'you@example.com',
          value: email,
          onChange: (e) => setEmail(e.target.value),
          autoComplete: 'email',
        },
        {
          name: 'password',
          label: 'Password',
          type: 'password',
          placeholder: '••••••••',
          value: password,
          onChange: (e) => setPassword(e.target.value),
          autoComplete: 'current-password',
        },
      ]}
      links={[
        { pre: 'No account yet? ', text: 'Create one', to: '/register' },
        { pre: '', text: 'Forgot your password?', to: '/forgot' },
      ]}
    />
  )
}
