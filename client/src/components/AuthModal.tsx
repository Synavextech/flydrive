import React, { useState } from 'react'
import { X, Eye, EyeOff, Lock, Mail, User, Phone, CheckCircle, ArrowRight } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

interface AuthModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
  initialMode?: 'login' | 'register'
  message?: string
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialMode = 'login',
  message = 'Sign in or create an account to complete your checkout in seconds.'
}) => {
  const { login, register, isLoading, error, clearError } = useAuth()
  const [mode, setMode] = useState<'login' | 'register'>(initialMode)
  const [showPassword, setShowPassword] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
  })

  if (!isOpen) return null

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    if (error) clearError()
    if (localError) setLocalError(null)
  }

  const switchMode = (newMode: 'login' | 'register') => {
    setMode(newMode)
    clearError()
    setLocalError(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLocalError(null)

    if (!formData.email || !formData.password) {
      setLocalError('Please fill in all required fields.')
      return
    }

    try {
      if (mode === 'login') {
        await login(formData.email, formData.password)
      } else {
        if (!formData.firstName || !formData.lastName) {
          setLocalError('First and last name are required.')
          return
        }
        await register({
          firstName: formData.firstName,
          lastName: formData.lastName,
          email: formData.email,
          phone: formData.phone || undefined,
          password: formData.password,
        })
      }

      onClose()
      if (onSuccess) {
        onSuccess()
      }
    } catch (err: any) {
      // Error handled in AuthContext or localError
      setLocalError(err.message || 'Authentication failed. Please try again.')
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      <div className="flex min-h-full items-center justify-center p-4 text-center sm:p-0">
        <div className="relative transform overflow-hidden rounded-2xl bg-white dark:bg-[#17171c] text-left shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-md border border-gray-200 dark:border-white/10 text-gray-900 dark:text-white">
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-white rounded-full hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Modal Header */}
          <div className="px-6 pt-6 pb-4 border-b border-gray-100 dark:border-white/10">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xl font-anton text-creamy-500 uppercase tracking-wide">
                DRIVEFLY<span className="text-gray-900 dark:text-white">ELECTRIC</span>
              </span>
              <span className="text-[10px] bg-creamy-100 dark:bg-creamy-500/20 text-creamy-800 dark:text-creamy-400 font-bold px-2 py-0.5 rounded-full uppercase">Fast Checkout</span>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              {message}
            </p>

            {/* Mode Tabs */}
            <div className="flex mt-4 bg-gray-100 dark:bg-white/5 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => switchMode('login')}
                className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${
                  mode === 'login'
                    ? 'bg-white dark:bg-[#131316] text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => switchMode('register')}
                className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${
                  mode === 'register'
                    ? 'bg-white dark:bg-[#131316] text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                Create Account
              </button>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {(error || localError) && (
              <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-400 rounded-xl text-sm flex items-start gap-2">
                <span className="font-medium">{error || localError}</span>
              </div>
            )}

            {mode === 'register' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">First Name *</label>
                    <div className="relative">
                      <User className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                      <input
                        type="text"
                        name="firstName"
                        required
                        value={formData.firstName}
                        onChange={handleInputChange}
                        placeholder="John"
                        className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 dark:border-white/10 rounded-lg bg-white dark:bg-[#131316] text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-creamy-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Last Name *</label>
                    <div className="relative">
                      <User className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                      <input
                        type="text"
                        name="lastName"
                        required
                        value={formData.lastName}
                        onChange={handleInputChange}
                        placeholder="Doe"
                        className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 dark:border-white/10 rounded-lg bg-white dark:bg-[#131316] text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-creamy-500"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Phone Number</label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                    <input
                      type="tel"
                      name="phone"
                      value={formData.phone}
                      onChange={handleInputChange}
                      placeholder="+1 (555) 000-0000"
                      className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 dark:border-white/10 rounded-lg bg-white dark:bg-[#131316] text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-creamy-500"
                    />
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Email Address *</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                <input
                  type="email"
                  name="email"
                  required
                  value={formData.email}
                  onChange={handleInputChange}
                  placeholder="you@example.com"
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 dark:border-white/10 rounded-lg bg-white dark:bg-[#131316] text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-creamy-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Password *</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  required
                  value={formData.password}
                  onChange={handleInputChange}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-10 py-2 text-sm border border-gray-300 dark:border-white/10 rounded-lg bg-white dark:bg-[#131316] text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-creamy-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 dark:hover:text-white"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 bg-creamy-500 hover:bg-creamy-400 text-black font-extrabold py-3 px-4 rounded-xl shadow-lg shadow-creamy-500/20 transition-all flex items-center justify-center gap-2 text-xs uppercase tracking-widest disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <span>{mode === 'login' ? 'Sign In & Proceed to Checkout' : 'Create Account & Checkout'}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            <div className="pt-2 text-center text-xs text-gray-500 dark:text-gray-400 flex items-center justify-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5 text-green-500" />
              <span>Instant checkout & auto-synced cart items</span>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

export default AuthModal
