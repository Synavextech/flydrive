import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Share2, Copy, Check, Mail, ExternalLink, X, MessageCircle } from 'lucide-react'
import { Product } from '../types'
import { useAuth } from '../contexts/AuthContext'
import { analyticsApi } from '../services/api'

interface ShareProductButtonProps {
  product: Pick<Product, 'id' | 'name' | 'price'>
  variant?: 'card' | 'detail'
  className?: string
}

interface PopoverCoords {
  top: number
  left: number
}

const POPOVER_WIDTH = 300
const POPOVER_HEIGHT_ESTIMATE = 285

export const ShareProductButton: React.FC<ShareProductButtonProps> = ({
  product,
  variant = 'card',
  className = '',
}) => {
  const { user } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [coords, setCoords] = useState<PopoverCoords>({ top: 0, left: 0 })

  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const copyTimerRef = useRef<number | null>(null)

  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://driveflyelectric.com'
  const shareUrl = `${origin}/product/${encodeURIComponent(product.id)}`
  const sharePrice = product.price
    ? `$${Number(product.price).toLocaleString()}`
    : ''
  const shareText = `Check out ${product.name}${sharePrice ? ` (${sharePrice})` : ''} on DriveFlyElectric:`

  const updatePopoverPosition = () => {
    if (!triggerRef.current || typeof window === 'undefined') return
    const rect = triggerRef.current.getBoundingClientRect()
    const viewportW = window.innerWidth
    const viewportH = window.innerHeight

    let left = rect.right - POPOVER_WIDTH
    if (left < 12) left = 12
    if (left + POPOVER_WIDTH > viewportW - 12) {
      left = Math.max(12, viewportW - POPOVER_WIDTH - 12)
    }

    const fitsBelow = rect.bottom + 8 + POPOVER_HEIGHT_ESTIMATE <= viewportH - 12
    const top = fitsBelow
      ? rect.bottom + 8
      : Math.max(12, rect.top - POPOVER_HEIGHT_ESTIMATE - 8)

    setCoords({ top, left })
  }

  useEffect(() => {
    if (!isOpen) return

    updatePopoverPosition()

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        popoverRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      ) {
        return
      }
      setIsOpen(false)
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false)
    }

    const handleReposition = () => updatePopoverPosition()

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', handleReposition)
    window.addEventListener('scroll', handleReposition, true)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', handleReposition)
      window.removeEventListener('scroll', handleReposition, true)
    }
  }, [isOpen])

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) {
        window.clearTimeout(copyTimerRef.current)
      }
    }
  }, [])

  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const nextOpen = !isOpen
    setIsOpen(nextOpen)
    if (nextOpen && user?.role !== 'ADMIN') {
      analyticsApi.trackProductView({
        productId: product.id,
        productName: product.name,
        price: Number(product.price || 0),
        source: 'SHARE'
      })
    }
  }

  const handleCopyLink = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(shareUrl)
      } else {
        const textarea = document.createElement('textarea')
        textarea.value = shareUrl
        textarea.setAttribute('readonly', '')
        textarea.style.position = 'fixed'
        textarea.style.left = '-9999px'
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
      }
      setCopied(true)
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current)
      copyTimerRef.current = window.setTimeout(() => setCopied(false), 2200)
    } catch {
      // Clipboard blocked cleanly; link remains selectable in input
    }
  }

  const handleNativeShare = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return
    try {
      await navigator.share({
        title: `${product.name} | DriveFlyElectric`,
        text: shareText,
        url: shareUrl,
      })
      setIsOpen(false)
    } catch {
      // User dismissed native share sheet
    }
  }

  const socialChannels = [
    {
      name: 'WhatsApp',
      href: `https://wa.me/?text=${encodeURIComponent(`${shareText} ${shareUrl}`)}`,
      bg: 'bg-[#25D366]/15 text-[#168C43] dark:text-[#4ade80] hover:bg-[#25D366] hover:text-black',
    },
    {
      name: 'X / Twitter',
      href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`,
      bg: 'bg-gray-100 dark:bg-white/10 text-gray-800 dark:text-gray-200 hover:bg-gray-900 hover:text-white dark:hover:bg-white dark:hover:text-black',
    },
    {
      name: 'Facebook',
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`,
      bg: 'bg-[#1877F2]/15 text-[#1877F2] dark:text-[#60a5fa] hover:bg-[#1877F2] hover:text-white',
    },
    {
      name: 'LinkedIn',
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`,
      bg: 'bg-[#0A66C2]/15 text-[#0A66C2] dark:text-[#38bdf8] hover:bg-[#0A66C2] hover:text-white',
    },
  ]

  const emailShareUrl = `mailto:?subject=${encodeURIComponent(`${product.name} — DriveFlyElectric`)}&body=${encodeURIComponent(`${shareText}\n\n${shareUrl}`)}`
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  const triggerButton =
    variant === 'detail' ? (
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggle}
        aria-label={`Share ${product.name}`}
        aria-expanded={isOpen}
        className={`px-5 py-4 rounded-xl border font-black uppercase tracking-wider text-xs flex items-center justify-center gap-1.5 transition-all bg-white dark:bg-[#16181e] border-gray-300 dark:border-white/20 text-gray-700 dark:text-gray-300 hover:border-creamy-500 hover:text-creamy-500 ${className}`}
        title="Copy or share product link"
      >
        <Share2 className="w-4 h-4" />
        <span>Share</span>
      </button>
    ) : (
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggle}
        aria-label={`Share ${product.name}`}
        aria-expanded={isOpen}
        title="Share exact product link"
        className={`inline-flex items-center justify-center p-1.5 rounded-lg border border-gray-200 dark:border-white/10 bg-gray-100/80 dark:bg-white/5 text-gray-600 dark:text-gray-300 hover:border-creamy-500 hover:bg-creamy-500 hover:text-black transition-all shrink-0 ${className}`}
      >
        <Share2 className="w-3.5 h-3.5" />
      </button>
    )

  const popoverPanel =
    isOpen && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={popoverRef}
            onClick={(e) => e.stopPropagation()}
            style={{ top: `${coords.top}px`, left: `${coords.left}px`, width: `${POPOVER_WIDTH}px` }}
            role="dialog"
            aria-label={`Share ${product.name}`}
            className="fixed z-[90] rounded-2xl border border-gray-200 dark:border-white/15 bg-white dark:bg-[#171920] shadow-2xl p-4 text-gray-900 dark:text-white animate-fadeIn"
          >
            <div className="flex items-center justify-between gap-2 pb-2.5 mb-3 border-b border-gray-100 dark:border-white/10">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-creamy-500">
                  Share Product Link
                </p>
                <p className="text-xs font-bold truncate text-gray-900 dark:text-white">
                  {product.name}
                </p>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setIsOpen(false)
                }}
                aria-label="Close share menu"
                className="p-1 rounded-lg text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Exact Product Link + Copy Button */}
            <div className="flex items-center gap-1.5 mb-3">
              <input
                type="text"
                readOnly
                value={shareUrl}
                onFocus={(e) => e.currentTarget.select()}
                aria-label="Direct product URL"
                className="flex-1 min-w-0 px-2.5 py-2 rounded-lg bg-gray-100 dark:bg-[#101217] border border-gray-200 dark:border-white/10 text-[11px] font-mono text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-creamy-500"
              />
              <button
                type="button"
                onClick={handleCopyLink}
                className={`px-3 py-2 rounded-lg font-black text-[10px] uppercase tracking-wider flex items-center gap-1 transition-all shrink-0 ${
                  copied
                    ? 'bg-emerald-500 text-black'
                    : 'bg-creamy-500 hover:bg-creamy-400 text-black'
                }`}
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied!' : 'Copy'}</span>
              </button>
            </div>

            {/* Social Media Share Channels */}
            <div className="grid grid-cols-2 gap-2">
              {socialChannels.map((channel) => (
                <a
                  key={channel.name}
                  href={channel.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className={`px-2.5 py-2 rounded-lg text-[11px] font-bold flex items-center justify-between gap-1.5 transition-colors ${channel.bg}`}
                >
                  <span className="flex items-center gap-1.5 truncate">
                    {channel.name === 'WhatsApp' && <MessageCircle className="w-3.5 h-3.5 shrink-0" />}
                    <span className="truncate">{channel.name}</span>
                  </span>
                  <ExternalLink className="w-3 h-3 opacity-70 shrink-0" />
                </a>
              ))}
            </div>

            {/* Email & Native Device Share Row */}
            <div className={`grid gap-2 mt-2 ${canNativeShare ? 'grid-cols-2' : 'grid-cols-1'}`}>
              <a
                href={emailShareUrl}
                onClick={(e) => e.stopPropagation()}
                className="px-2.5 py-2 rounded-lg bg-gray-100 dark:bg-white/10 hover:bg-creamy-500 hover:text-black text-[11px] font-bold flex items-center justify-center gap-1.5 text-gray-800 dark:text-gray-200 transition-colors"
              >
                <Mail className="w-3.5 h-3.5" />
                <span>Email Link</span>
              </a>

              {canNativeShare && (
                <button
                  type="button"
                  onClick={handleNativeShare}
                  className="px-2.5 py-2 rounded-lg bg-creamy-500/15 hover:bg-creamy-500 text-creamy-700 dark:text-creamy-400 hover:text-black text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>More Apps</span>
                </button>
              )}
            </div>
          </div>,
          document.body
        )
      : null

  return (
    <>
      {triggerButton}
      {popoverPanel}
    </>
  )
}

export default ShareProductButton

