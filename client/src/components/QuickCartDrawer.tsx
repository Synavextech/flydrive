import React from 'react'
import { X, ShoppingBag, Plus, Minus, Trash2, ArrowRight, ShieldCheck, Truck } from 'lucide-react'
import { useCart } from '../contexts/CartContext'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

const getSafeMediaUrl = (url?: string) => {
  if (!url) return '/images/hero1.jpeg'
  if (url.startsWith('http://') || url.startsWith('https://')) return url
  const parts = url.split('/')
  return parts.map((p, idx) => idx === 0 && p === '' ? '' : encodeURIComponent(decodeURIComponent(p))).join('/')
}

interface QuickCartDrawerProps {
  isOpen: boolean
  onClose: () => void
  onPromptAuth: () => void
}

export const QuickCartDrawer: React.FC<QuickCartDrawerProps> = ({
  isOpen,
  onClose,
  onPromptAuth,
}) => {
  const { items, totalPrice, totalItems, updateQuantity, removeFromCart } = useCart()
  const { isAuthenticated } = useAuth()
  const navigate = useNavigate()

  if (!isOpen) return null

  const formatPrice = (price: number) => {
    return `$${(price || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const handleCheckoutClick = () => {
    onClose()
    navigate('/checkout')
  }

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-white dark:bg-[#131316] border-l border-gray-200 dark:border-white/10 shadow-2xl flex flex-col text-gray-900 dark:text-white transition-colors">
          {/* Header */}
          <div className="p-5 border-b border-gray-200 dark:border-white/10 flex items-center justify-between bg-gray-50 dark:bg-[#17171c] transition-colors">
            <div className="flex items-center gap-2.5">
              <div className="h-7 w-7 rounded-lg bg-amber-500 flex items-center justify-center font-black text-black text-sm">
                ⚡
              </div>
              <h2 className="font-anton text-xl uppercase tracking-wider text-gray-900 dark:text-white">Your Cart</h2>
              <span className="bg-amber-500 text-black text-[10px] font-black px-2 py-0.5 rounded-full">
                {totalItems} {totalItems === 1 ? 'rig' : 'rigs'}
              </span>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-white rounded-full hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Cart Items List */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {items.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-gray-500 dark:text-gray-400 space-y-3">
                <div className="w-16 h-16 bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-full flex items-center justify-center text-gray-400 dark:text-gray-500 mb-2">
                  <ShoppingBag className="w-8 h-8" />
                </div>
                <p className="font-anton text-2xl uppercase tracking-wider text-gray-900 dark:text-white">Your Cart is Empty</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 max-w-xs">
                  Explore The Full Range and add high-torque drift trikes, dirt bikes, or parts to your order.
                </p>
                <button
                  onClick={onClose}
                  className="mt-4 bg-amber-500 hover:bg-amber-400 text-black font-extrabold px-6 py-3 rounded-lg text-xs uppercase tracking-widest transition-all"
                >
                  Explore The Fleet
                </button>
              </div>
            ) : (
              items.map((item) => (
                <div
                  key={item.id}
                  className="flex gap-4 p-3.5 bg-gray-50 dark:bg-[#17171c] hover:border-amber-500/50 rounded-xl border border-gray-200 dark:border-white/10 transition-all"
                >
                  {/* Product Image */}
                  <div className="w-20 h-20 bg-gray-100 dark:bg-black rounded-lg overflow-hidden flex-shrink-0 relative border border-gray-200 dark:border-white/10">
                    {item.product?.images && item.product.images.length > 0 ? (
                      <img
                        src={getSafeMediaUrl(item.product.images[0])}
                        alt={item.product.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement
                          if (!target.src.endsWith('/images/hero1.jpeg')) {
                            target.src = '/images/hero1.jpeg'
                          }
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400 dark:text-gray-600 text-xs">
                        No image
                      </div>
                    )}
                  </div>

                  {/* Info & Quantity */}
                  <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="font-anton text-sm uppercase text-gray-900 dark:text-white truncate hover:text-amber-500 transition-colors">
                          {item.product?.name || 'Item'}
                        </h4>
                        <button
                          onClick={() => removeFromCart(item.id)}
                          className="text-gray-400 hover:text-red-500 transition-colors p-1"
                          title="Remove item"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <p className="text-amber-500 font-anton text-base mt-0.5">
                        {formatPrice(item.product?.price || 0)}
                      </p>
                    </div>

                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-200 dark:border-white/10">
                      {/* Quantity Controls */}
                      <div className="flex items-center border border-gray-200 dark:border-white/10 rounded-lg bg-white dark:bg-[#131316] overflow-hidden">
                        <button
                          onClick={() => updateQuantity(item.id, item.quantity - 1)}
                          className="p-1 hover:bg-gray-100 dark:hover:bg-white/10 text-gray-600 dark:text-gray-300 transition-colors"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="px-3 text-xs font-bold text-gray-900 dark:text-white">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => updateQuantity(item.id, item.quantity + 1)}
                          className="p-1 hover:bg-gray-100 dark:hover:bg-white/10 text-gray-600 dark:text-gray-300 transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <span className="text-xs font-bold text-gray-700 dark:text-gray-300">
                        {formatPrice((item.product?.price || 0) * item.quantity)}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer & Checkout */}
          {items.length > 0 && (
            <div className="p-5 border-t border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-[#17171c] space-y-4 transition-colors">
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider font-semibold">
                  <span>Subtotal</span>
                  <span className="text-gray-900 dark:text-white font-bold">{formatPrice(totalPrice)}</span>
                </div>
                <div className="flex justify-between text-[11px] text-gray-500 dark:text-gray-400">
                  <span className="flex items-center gap-1 text-green-600 dark:text-green-400 font-bold uppercase tracking-wider">
                    <Truck className="w-3.5 h-3.5" /> Free Fast Shipping
                  </span>
                  <span>Direct to doorstep</span>
                </div>
                <div className="pt-2 border-t border-gray-200 dark:border-white/10 flex items-center justify-between">
                  <span className="font-bold text-xs uppercase tracking-widest text-gray-900 dark:text-white">Total Due</span>
                  <span className="text-amber-500 font-anton text-2xl">{formatPrice(totalPrice)}</span>
                </div>
              </div>

              {/* Instant Checkout Action */}
              <button
                onClick={handleCheckoutClick}
                className="w-full bg-amber-500 hover:bg-amber-400 text-black font-extrabold py-3.5 px-4 rounded-xl shadow-lg shadow-amber-500/25 flex items-center justify-center gap-2 transition-all active:scale-95 text-xs uppercase tracking-widest"
              >
                <span>Proceed to Checkout</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              {!isAuthenticated && (
                <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs text-amber-700 dark:text-amber-300 flex items-center justify-between">
                  <span>By management! Create an account to track order.</span>
                  <span className="font-extrabold underline cursor-pointer hover:text-amber-800 dark:hover:text-white" onClick={onPromptAuth}>Sign In</span>
                </div>
              )}

              <div className="flex items-center justify-center gap-4 text-[11px] text-gray-500 dark:text-gray-400 pt-1">
                <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold">
                  <ShieldCheck className="w-3.5 h-3.5" /> Secure Checkout
                </span>
                <span>•</span>
                <span>Instant Order Tracking</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default QuickCartDrawer
