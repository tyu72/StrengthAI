import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { AuthShell } from '@/components/auth/AuthShell'

export default function ResetPassword() {
  const { updatePassword } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await updatePassword(password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthShell
      title="New password"
      subtitle="Choose something you will actually remember."
      submitLabel="Save and log in"
      submitting={submitting}
      error={error}
      onSubmit={handleSubmit}
      fields={[
        {
          name: 'password',
          label: 'Password',
          type: 'password',
          placeholder: '••••••••',
          value: password,
          onChange: (e) => setPassword(e.target.value),
          autoComplete: 'new-password',
        },
      ]}
      links={[{ pre: '', text: 'Back to log in', to: '/login' }]}
    />
  )
}
