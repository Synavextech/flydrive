import React from 'react'
import { Navigate, useLocation, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { ShieldAlert } from 'lucide-react'

const ArrowLeft = ({ className }: { className?: string }) => (
  <svg className={className || "w-4 h-4"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m12 19-7-7 7-7" />
    <path d="M19 12H5" />
  </svg>
)

interface ProtectedRouteProps {
  children: React.ReactNode
  requiredRole?: 'ADMIN' | 'CUSTOMER'
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requiredRole,
}) => {
  const { user, isAuthenticated, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="pt-24 min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#0e1014] text-gray-900 dark:text-white transition-colors duration-200">
        <div className="text-center p-8 bg-white dark:bg-[#16181e] border border-gray-200 dark:border-neutral-800 rounded-2xl shadow-xl">
          <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Verifying permissions...</p>
        </div>
      </div>
    )
  }

  // Not authenticated -> redirect to login with return intent
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  // Role restriction check
  if (requiredRole && user?.role !== requiredRole) {
    return (
      <div className="pt-24 min-h-screen bg-gray-50 dark:bg-[#0e1014] text-gray-900 dark:text-white transition-colors duration-200 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-[#16181e] border border-red-200 dark:border-red-900/40 p-8 rounded-2xl shadow-2xl text-center">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400 rounded-full flex items-center justify-center mx-auto mb-4">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-black uppercase text-gray-900 dark:text-white mb-2">Access Restricted</h2>
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-6 font-medium leading-relaxed">
            Administrative permissions required. Your current account role is{' '}
            <span className="font-bold text-amber-500 uppercase">{user?.role}</span>.
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-black font-black uppercase tracking-wider py-2.5 px-6 rounded-xl transition-all text-xs"
          >
            <ArrowLeft className="w-4 h-4" />
            Return to Store
          </Link>
        </div>
      </div>
    )
  }

  return <>{children}</>
}

export default ProtectedRoute
