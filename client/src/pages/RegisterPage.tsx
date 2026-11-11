import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, UserPlus } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

const RegisterPage = () => {
  const navigate = useNavigate()
  const { register, isLoading, error, clearError } = useAuth()

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
  })
  const [showPassword, setShowPassword] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
    if (error) clearError()
    if (validationError) setValidationError(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (formData.password !== formData.confirmPassword) {
      setValidationError('Passwords do not match')
      return
    }

    try {
      await register({
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        password: formData.password,
      })
      navigate('/')
    } catch (err) {
      // Handled in auth context
    }
  }

  const inputClasses =
    'w-full px-4 py-2.5 bg-gray-50 dark:bg-[#1a1d24] border border-gray-300 dark:border-neutral-700 rounded-xl text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-neutral-500 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none transition-colors text-sm font-medium'

  return (
    <div className="pt-24 pb-16 min-h-screen bg-gray-50 dark:bg-[#0e1014] text-gray-900 dark:text-white transition-colors duration-200 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="flex flex-col items-center justify-center">
          <div className="h-10 w-10 rounded-xl bg-amber-500 flex items-center justify-center font-black text-black text-xl shadow-lg shadow-amber-500/30 mb-2">
            ⚡
          </div>
          <h1 className="text-2xl font-black uppercase tracking-tight text-gray-900 dark:text-white font-anton">
            DRIVEFLY<span className="text-amber-500">ELECTRIC</span>
          </h1>
          <span className="text-[10px] uppercase font-bold text-amber-500 tracking-wider">
            electric microcars, minihelicopters & rides
          </span>
        </div>
        <h2 className="mt-4 text-xl font-black uppercase tracking-wider text-gray-800 dark:text-gray-200">
          Create your account
        </h2>
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 font-medium">
          Already have an account?{' '}
          <Link to="/login" className="font-bold text-amber-500 hover:text-amber-400 transition-colors">
            Sign in
          </Link>
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <div className="bg-white dark:bg-[#16181e] border border-gray-200 dark:border-neutral-800 py-8 px-6 shadow-2xl rounded-2xl transition-colors">
          <form className="space-y-4" onSubmit={handleSubmit}>
            {(error || validationError) && (
              <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 text-red-600 dark:text-red-400 text-xs font-bold px-4 py-3 rounded-xl">
                {validationError || error}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  First Name *
                </label>
                <input
                  type="text"
                  name="firstName"
                  required
                  value={formData.firstName}
                  onChange={handleInputChange}
                  className={inputClasses}
                  placeholder="John"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Last Name *
                </label>
                <input
                  type="text"
                  name="lastName"
                  required
                  value={formData.lastName}
                  onChange={handleInputChange}
                  className={inputClasses}
                  placeholder="Doe"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                Email address *
              </label>
              <input
                type="email"
                name="email"
                autoComplete="email"
                required
                value={formData.email}
                onChange={handleInputChange}
                className={inputClasses}
                placeholder="john@example.com"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                Password *
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  autoComplete="new-password"
                  required
                  value={formData.password}
                  onChange={handleInputChange}
                  className={`${inputClasses} pr-10`}
                  placeholder="Minimum 6 characters"
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                Confirm Password *
              </label>
              <input
                type="password"
                name="confirmPassword"
                autoComplete="new-password"
                required
                value={formData.confirmPassword}
                onChange={handleInputChange}
                className={inputClasses}
                placeholder="Re-enter your password"
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-amber-500 hover:bg-amber-400 disabled:bg-gray-400 dark:disabled:bg-neutral-700 text-black font-black uppercase tracking-wider py-3.5 px-4 rounded-xl shadow-lg shadow-amber-500/20 disabled:cursor-not-allowed transition-all text-xs flex items-center justify-center gap-2"
              >
                <UserPlus className="h-4 w-4" />
                {isLoading ? 'Creating account...' : 'Create Account'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

export default RegisterPage