import React, { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { Eye, EyeOff, LogIn, AlertCircle } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

const LoginPage = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { login, isLoading, error, clearError } = useAuth()

  const [formData, setFormData] = useState({
    email: '',
    password: '',
  })
  const [showPassword, setShowPassword] = useState(false)

  const from = (location.state as any)?.from?.pathname || '/'

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
    if (error) clearError()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      await login(formData.email, formData.password)
      navigate(from, { replace: true })
    } catch (error) {
      // Handled in auth context
    }
  }

  const inputClasses =
    'w-full px-4 py-2.5 bg-gray-50 dark:bg-[#1a1d24] border border-gray-300 dark:border-neutral-700 rounded-xl text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-neutral-500 focus:ring-2 focus:ring-creamy-500 focus:border-transparent outline-none transition-colors text-sm font-medium'

  return (
    <div className="pt-24 pb-16 min-h-screen bg-gray-50 dark:bg-[#0e1014] text-gray-900 dark:text-white transition-colors duration-200 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="flex flex-col items-center justify-center">
          <div className="h-10 w-10 rounded-xl bg-creamy-500 flex items-center justify-center font-black text-black text-xl shadow-lg shadow-creamy-500/30 mb-2">
            ⚡
          </div>
          <h1 className="text-2xl font-black uppercase tracking-tight text-gray-900 dark:text-white font-anton">
            DRIVEFLY<span className="text-creamy-500">ELECTRIC</span>
          </h1>
          <span className="text-[10px] uppercase font-bold text-creamy-500 tracking-wider">
            electric microcars, minihelicopters & rides
          </span>
        </div>
        <h2 className="mt-4 text-xl font-black uppercase tracking-wider text-gray-800 dark:text-gray-200">
          Sign in to your account
        </h2>
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 font-medium">
          New to DriveFlyElectric?{' '}
          <Link to="/register" className="font-bold text-creamy-500 hover:text-creamy-400 transition-colors">
            Create an account
          </Link>
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <div className="bg-white dark:bg-[#16181e] border border-gray-200 dark:border-neutral-800 py-8 px-6 shadow-2xl rounded-2xl transition-colors">
          <form className="space-y-5" onSubmit={handleSubmit}>
            {error && (
              <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 text-xs font-bold px-4 py-3 rounded-xl flex items-center gap-2.5">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={formData.email}
                onChange={handleInputChange}
                className={inputClasses}
                placeholder="you@driveflyelectric.shop"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={formData.password}
                  onChange={handleInputChange}
                  className={`${inputClasses} pr-10`}
                  placeholder="••••••••••••"
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

            <div className="flex items-center justify-between text-xs">
              <label className="flex items-center gap-2 cursor-pointer text-gray-600 dark:text-gray-400 font-medium">
                <input
                  type="checkbox"
                  className="w-4 h-4 text-creamy-500 rounded border-gray-300 dark:border-neutral-700 focus:ring-creamy-400 accent-creamy-500"
                />
                <span>Remember me</span>
              </label>
              <a href="#forgot" className="font-bold text-creamy-500 hover:text-creamy-400 transition-colors">
                Forgot password?
              </a>
            </div>

            <div>
              <button
                type="submit"
                disabled={isLoading}
                className="w-full mt-2 bg-creamy-500 hover:bg-creamy-400 disabled:bg-gray-400 dark:disabled:bg-neutral-700 text-black font-black uppercase tracking-wider py-3.5 px-4 rounded-xl shadow-lg shadow-creamy-500/20 disabled:cursor-not-allowed transition-all text-xs flex items-center justify-center gap-2"
              >
                <LogIn className="h-4 w-4" />
                {isLoading ? 'Signing in...' : 'Sign in to Account'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

export default LoginPage