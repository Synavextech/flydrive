import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react'
import { User, AuthState } from '../types'

// Auth actions
type AuthAction =
  | { type: 'AUTH_START' }
  | { type: 'AUTH_SUCCESS'; payload: User }
  | { type: 'AUTH_FAILURE'; payload: string }
  | { type: 'LOGOUT' }
  | { type: 'CLEAR_ERROR' }

// Auth reducer
const authReducer = (state: AuthState, action: AuthAction): AuthState => {
  switch (action.type) {
    case 'AUTH_START':
      return {
        ...state,
        isLoading: true,
        error: null,
      }
    case 'AUTH_SUCCESS':
      return {
        ...state,
        user: action.payload,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      }
    case 'AUTH_FAILURE':
      return {
        ...state,
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: action.payload,
      }
    case 'LOGOUT':
      return {
        ...state,
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      }
    case 'CLEAR_ERROR':
      return {
        ...state,
        error: null,
      }
    default:
      return state
  }
}

// Initial state
const initialState: AuthState = {
  user: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,
}

// Create context
interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<void>
  register: (userData: RegisterData) => Promise<void>
  logout: () => void
  clearError: () => void
  setAuthenticatedUser: (user: User, token: string) => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

interface RegisterData {
  firstName: string
  lastName: string
  email: string
  password: string
  phone?: string
}

// Auth provider props
interface AuthProviderProps {
  children: ReactNode
}

// API base URL
const API_URL = (import.meta as any).env?.VITE_API_URL || '/api'

// Auth provider component
export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState)

  // Check for existing token on mount
  useEffect(() => {
    const token = localStorage.getItem('token')
    if (token) {
      // Verify token with backend
      verifyToken()
    }
  }, [])

  // Verify token with backend
  const verifyToken = async () => {
    try {
      const token = localStorage.getItem('token')
      if (!token) return

      const response = await fetch(`${API_URL}/auth/verify`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      const contentType = response.headers.get('content-type') || ''
      if (response.ok && contentType.includes('application/json')) {
        const userData = await response.json()
        if (userData?.data) {
          dispatch({ type: 'AUTH_SUCCESS', payload: userData.data })
          return
        }
      }
      localStorage.removeItem('token')
    } catch (error) {
      localStorage.removeItem('token')
    }
  }

  // Login function
  const login = async (email: string, password: string) => {
    dispatch({ type: 'AUTH_START' })

    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      })

      const contentType = response.headers.get('content-type') || ''
      let data: any = null
      if (contentType.includes('application/json')) {
        try {
          data = await response.json()
        } catch {
          data = null
        }
      }

      if (!response.ok) {
        let errMessage = data?.error || data?.message
        if (!errMessage || errMessage.toLowerCase().includes('invalid credential')) {
          errMessage = 'Incorrect email or password. Please check your credentials and try again.'
        }
        throw new Error(errMessage)
      }

      if (!data || !data.data?.token || !data.data?.user) {
        throw new Error('Invalid response received from authentication server')
      }

      const { token, user } = data.data

      localStorage.setItem('token', token)
      dispatch({ type: 'AUTH_SUCCESS', payload: user })
    } catch (error) {
      dispatch({ type: 'AUTH_FAILURE', payload: error instanceof Error ? error.message : 'Login failed' })
      throw error
    }
  }

  // Register function
  const register = async (userData: RegisterData) => {
    dispatch({ type: 'AUTH_START' })

    try {
      const response = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userData),
      })

      const contentType = response.headers.get('content-type') || ''
      let data: any = null
      if (contentType.includes('application/json')) {
        try {
          data = await response.json()
        } catch {
          data = null
        }
      }

      if (!response.ok) {
        const errMessage = data?.error || data?.message || `Registration failed (${response.status} ${response.statusText || 'Error'})`
        throw new Error(errMessage)
      }

      if (!data || !data.data?.token || !data.data?.user) {
        throw new Error('Invalid response received from authentication server')
      }

      const { token, user } = data.data

      localStorage.setItem('token', token)
      dispatch({ type: 'AUTH_SUCCESS', payload: user })
    } catch (error) {
      dispatch({ type: 'AUTH_FAILURE', payload: error instanceof Error ? error.message : 'Registration failed' })
      throw error
    }
  }

  // Logout function
  const logout = () => {
    localStorage.removeItem('token')
    dispatch({ type: 'LOGOUT' })
  }

  // Clear error function
  const clearError = () => {
    dispatch({ type: 'CLEAR_ERROR' })
  }

  // Set authenticated user directly (e.g. from inline checkout account creation)
  const setAuthenticatedUser = (user: User, token: string) => {
    localStorage.setItem('token', token)
    dispatch({ type: 'AUTH_SUCCESS', payload: user })
  }

  const value: AuthContextType = {
    ...state,
    login,
    register,
    logout,
    clearError,
    setAuthenticatedUser,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// Custom hook to use auth context
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}