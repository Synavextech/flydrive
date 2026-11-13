import React, { useEffect, useState } from 'react'
import { CalendarClock, CheckCircle2, Globe, Mail, Phone, Sparkles, User, X } from 'lucide-react'
import { Product, ProductBooking } from '../types'
import { useAuth } from '../contexts/AuthContext'
import { productApi } from '../services/api'
import { COUNTRIES, POPULAR_COUNTRY_CODES } from '../data/countries'

interface BookComingSoonModalProps {
  product: Product | null
  isOpen: boolean
  onClose: () => void
}

const getSafeMediaUrl = (url?: string) => {
  if (!url) return '/images/hero1.jpeg'
  if (url.startsWith('http://') || url.startsWith('https://')) return url
  const parts = url.split('/')
  return parts.map((p, idx) => (idx === 0 && p === '' ? '' : encodeURIComponent(decodeURIComponent(p)))).join('/')
}

export const BookComingSoonModal: React.FC<BookComingSoonModalProps> = ({
  product,
  isOpen,
  onClose,
}) => {
  const { user } = useAuth()

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [country, setCountry] = useState('United States')
  const [quantity, setQuantity] = useState(1)
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [confirmedBooking, setConfirmedBooking] = useState<ProductBooking | null>(null)

  useEffect(() => {
    if (!isOpen || !product) return
    const defaultName = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim()
    setFullName(defaultName)
    setEmail(user?.email || '')
    setPhone(user?.phone || '')
    setCountry('United States')
    setQuantity(1)
    setNotes('')
    setErrorMsg(null)
    setConfirmedBooking(null)
  }, [isOpen, product?.id, user])

  useEffect(() => {
    if (!isOpen) return
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [isOpen, onClose])

  if (!isOpen || !product) return null

  const popularCountries = POPULAR_COUNTRY_CODES
    .map((code) => COUNTRIES.find((c) => c.code === code))
    .filter((c): c is NonNullable<typeof c> => Boolean(c))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!fullName.trim() || fullName.trim().length < 2) {
      setErrorMsg('Please enter your full name.')
      return
    }
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setErrorMsg('Please provide a valid email address.')
      return
    }

    try {
      setIsSubmitting(true)
      setErrorMsg(null)
      const res = await productApi.bookComingSoonVehicle(product.id, {
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        country,
        quantity,
        notes: notes.trim() || undefined,
      })

      if (!res.success || !res.data) {
        throw new Error(res.error || 'Could not submit reservation request.')
      }

      setConfirmedBooking(res.data)
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to complete booking reservation right now. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const inputClasses =
    'w-full px-3.5 py-2.5 bg-gray-50 dark:bg-[#101217] border border-gray-300 dark:border-white/15 rounded-xl text-xs text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-creamy-500'

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative bg-white dark:bg-[#17181e] border border-gray-200 dark:border-white/15 rounded-2xl max-w-lg w-full p-6 shadow-2xl text-gray-900 dark:text-white my-auto"
      >
        <div className="flex items-start justify-between gap-3 pb-4 border-b border-gray-200 dark:border-white/10">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src={getSafeMediaUrl(product.images?.[0])}
              alt={product.name}
              onError={(e) => {
                const target = e.target as HTMLImageElement
                target.src = '/images/hero1.jpeg'
              }}
              className="w-14 h-14 rounded-xl object-cover border border-gray-200 dark:border-white/10 shrink-0"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/20 text-amber-600 dark:text-amber-400 text-[9px] font-black uppercase tracking-widest">
                  <Sparkles className="w-2.5 h-2.5" />
                  Coming Soon
                </span>
                {product.comingSoonRelease && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-creamy-500/15 text-creamy-600 dark:text-creamy-400 text-[9px] font-bold uppercase tracking-wider">
                    <CalendarClock className="w-2.5 h-2.5" />
                    ETA: {product.comingSoonRelease}
                  </span>
                )}
              </div>
              <h3 className="font-anton text-xl uppercase leading-tight truncate mt-1">
                {product.name}
              </h3>
              <p className="text-[11px] font-bold text-creamy-500">
                Est. Build Price: ${Number(product.price || 0).toLocaleString()} USD
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close booking modal"
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {confirmedBooking ? (
          <div className="py-6 text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-500 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500">
                Priority Slot Reserved
              </p>
              <h4 className="font-anton text-2xl uppercase text-gray-900 dark:text-white mt-1">
                Booking Confirmed
              </h4>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-sm mx-auto">
                Our Austin dispatch team has logged your priority request for <strong>{product.name}</strong> and sent confirmation to{' '}
                <span className="font-mono text-gray-800 dark:text-gray-200">{email}</span>.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-gray-50 dark:bg-[#101217] border border-gray-200 dark:border-white/10 text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Booking Reference:</span>
                <span className="font-mono font-black text-creamy-500">{confirmedBooking.bookingReference}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Reserved Units:</span>
                <span className="font-bold">{confirmedBooking.quantity}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Destination:</span>
                <span className="font-bold">{confirmedBooking.country}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-full py-3 rounded-xl bg-creamy-500 hover:bg-creamy-400 text-black font-black uppercase tracking-wider text-xs transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3.5 pt-4">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Reserve build priority with zero upfront charge. We will contact you first when allocations open for crate dispatch.
            </p>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-500 text-xs font-semibold">
                {errorMsg}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-1">
                  <User className="w-3 h-3 text-creamy-500" />
                  <span>Full Name *</span>
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Alex Rivera"
                  className={inputClasses}
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-1">
                  <Mail className="w-3 h-3 text-creamy-500" />
                  <span>Email Address *</span>
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="alex@example.com"
                  className={inputClasses}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-1">
                  <Phone className="w-3 h-3 text-creamy-500" />
                  <span>Phone / WhatsApp</span>
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 (512) 000-0000"
                  className={inputClasses}
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Units to Reserve
                </label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.min(20, Math.max(1, parseInt(e.target.value, 10) || 1)))}
                  className={inputClasses}
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-1">
                <Globe className="w-3 h-3 text-creamy-500" />
                <span>Delivery Country *</span>
              </label>
              <select
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                required
                className={inputClasses}
              >
                <optgroup label="Popular Destinations">
                  {popularCountries.map((c) => (
                    <option key={`book-pop-${c.code}`} value={c.name}>
                      {c.name} ({c.code})
                    </option>
                  ))}
                </optgroup>
                <optgroup label="All Countries & Territories">
                  {COUNTRIES.map((c) => (
                    <option key={`book-${c.code}`} value={c.name}>
                      {c.name} ({c.code})
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-1">
                Configuration Notes / Preferred Color (Optional)
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Preferred color option, fleet use, or delivery notes..."
                className={inputClasses}
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-gray-200 dark:border-white/10">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2.5 rounded-xl bg-creamy-500 hover:bg-creamy-400 disabled:opacity-50 text-black font-black uppercase tracking-wider text-xs transition-all active:scale-95"
              >
                {isSubmitting ? 'Reserving Slot...' : 'Book Now (Priority Hold)'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

export default BookComingSoonModal

