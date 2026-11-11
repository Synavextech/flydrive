import { useNavigate } from 'react-router-dom'
import { Plus, Minus, Trash2, ShoppingBag } from 'lucide-react'
import { useCart } from '../contexts/CartContext'

const ArrowLeft = ({ className }: { className?: string }) => (
  <svg className={className || "w-4 h-4"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m12 19-7-7 7-7" />
    <path d="M19 12H5" />
  </svg>
)

const getSafeMediaUrl = (url?: string) => {
  if (!url) return '/images/hero1.jpeg'
  if (url.startsWith('http://') || url.startsWith('https://')) return url
  const parts = url.split('/')
  return parts.map((p, idx) => idx === 0 && p === '' ? '' : encodeURIComponent(decodeURIComponent(p))).join('/')
}

const CartPage = () => {
  const navigate = useNavigate()
  const { items, isLoading, error, totalItems, totalPrice, updateQuantity, removeFromCart, clearCart } = useCart()

  // Helper function to format price in USD
  const formatPrice = (price: number) => {
    return `$${(price || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const handleQuantityChange = (itemId: string, newQuantity: number) => {
    if (newQuantity <= 0) {
      removeFromCart(itemId)
    } else {
      updateQuantity(itemId, newQuantity)
    }
  }

  const handleCheckout = () => {
    navigate('/checkout')
  }

  if (isLoading) {
    return (
      <div className="pt-24 min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#0e1014] text-gray-900 dark:text-white transition-colors duration-200">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400 font-bold text-sm">Loading your cart...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="pt-24 min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#0e1014] text-gray-900 dark:text-white transition-colors duration-200">
        <div className="text-center p-6 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 rounded-2xl max-w-md">
          <p className="text-red-600 dark:text-red-400 font-bold">Error loading cart: {error}</p>
          <button
            onClick={() => navigate('/')}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-xl text-xs font-bold"
          >
            Return to Store
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="pt-20 pb-16 min-h-screen bg-gray-50 dark:bg-[#0e1014] text-gray-900 dark:text-white transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex items-center justify-between mb-8 pb-4 border-b border-gray-200 dark:border-neutral-800">
          <div>
            <h1 className="text-3xl font-black uppercase tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
              <ShoppingBag className="w-7 h-7 text-amber-500" />
              Shopping Cart
            </h1>
            <p className="text-xs text-gray-500 dark:text-neutral-400 mt-1 font-medium">
              Review your items and adjust quantities before heading to checkout.
            </p>
          </div>
          {items.length > 0 && (
            <button
              onClick={clearCart}
              className="text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-900/50 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear Cart
            </button>
          )}
        </div>

        {items.length === 0 ? (
          <div className="bg-white dark:bg-[#16181e] border border-gray-200 dark:border-neutral-800 rounded-2xl shadow-xl p-12 text-center max-w-lg mx-auto">
            <div className="w-16 h-16 bg-amber-50 dark:bg-amber-500/10 text-amber-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <ShoppingBag className="w-8 h-8" />
            </div>
            <h2 className="text-lg font-black text-gray-900 dark:text-white mb-2 uppercase">Your cart is empty</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-6 font-medium">
              Explore our electric drift trikes, dirt bikes, and adrenaline performance gear.
            </p>
            <button
              onClick={() => navigate('/')}
              className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-black font-black uppercase tracking-wider px-6 py-3 rounded-xl transition-all shadow-lg shadow-amber-500/20"
            >
              <ArrowLeft className="w-4 h-4" />
              Shop Drift Rigs & Bikes
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Cart Items List */}
            <div className="lg:col-span-8">
              <div className="bg-white dark:bg-[#16181e] border border-gray-200 dark:border-neutral-800 rounded-2xl shadow-xl p-6">
                <h2 className="text-base font-black uppercase tracking-wider text-gray-900 dark:text-white mb-4 pb-3 border-b border-gray-100 dark:border-neutral-800">
                  Cart Items ({totalItems})
                </h2>

                <div className="space-y-4">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 border border-gray-200 dark:border-neutral-800 rounded-xl bg-gray-50/50 dark:bg-[#1a1d24] hover:border-gray-300 dark:hover:border-neutral-700 transition-all"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-20 h-20 bg-gray-100 dark:bg-neutral-800 rounded-xl overflow-hidden flex-shrink-0 border border-gray-200 dark:border-neutral-700">
                          {item.product.images && item.product.images.length > 0 ? (
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
                            <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">
                              Item
                            </div>
                          )}
                        </div>

                        <div>
                          <h3 className="font-bold text-sm text-gray-900 dark:text-white">
                            {item.product.name}
                          </h3>
                          <p className="text-xs font-semibold text-amber-500 mt-0.5">
                            {formatPrice(item.product.price)} each
                          </p>
                          <span className="inline-block mt-1 text-[10px] uppercase font-bold text-gray-400">
                            SKU: {item.product.sku}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-6 border-t sm:border-t-0 pt-3 sm:pt-0 border-gray-200 dark:border-neutral-800">
                        {/* Quantity controls */}
                        <div className="flex items-center border border-gray-300 dark:border-neutral-700 rounded-xl bg-white dark:bg-[#16181e] overflow-hidden">
                          <button
                            onClick={() => handleQuantityChange(item.id, item.quantity - 1)}
                            className="p-2 text-gray-600 dark:text-gray-300 hover:text-black dark:hover:text-white hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors"
                            aria-label="Decrease quantity"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="w-9 text-center text-xs font-bold text-gray-900 dark:text-white">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => handleQuantityChange(item.id, item.quantity + 1)}
                            className="p-2 text-gray-600 dark:text-gray-300 hover:text-black dark:hover:text-white hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors"
                            aria-label="Increase quantity"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Price Total & Remove */}
                        <div className="text-right min-w-[90px]">
                          <p className="font-black text-sm text-gray-900 dark:text-white">
                            {formatPrice(item.quantity * item.product.price)}
                          </p>
                          <button
                            onClick={() => removeFromCart(item.id)}
                            className="text-red-500 hover:text-red-600 dark:text-red-400 text-xs inline-flex items-center gap-1 mt-1 font-semibold"
                          >
                            <Trash2 className="w-3 h-3" />
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Order Summary Card */}
            <div className="lg:col-span-4">
              <div className="bg-white dark:bg-[#16181e] border border-gray-200 dark:border-neutral-800 rounded-2xl shadow-xl p-6 sticky top-24 transition-colors">
                <h2 className="text-base font-black uppercase tracking-wider text-gray-900 dark:text-white mb-4 pb-3 border-b border-gray-100 dark:border-neutral-800">
                  Cart Summary
                </h2>

                <div className="space-y-3 text-xs">
                  <div className="flex justify-between text-gray-600 dark:text-neutral-400 font-medium">
                    <span>Subtotal ({totalItems} items)</span>
                    <span className="font-bold text-gray-900 dark:text-white">{formatPrice(totalPrice)}</span>
                  </div>
                  <div className="flex justify-between text-gray-600 dark:text-neutral-400 font-medium">
                    <span>Express Shipping</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                      FREE ($0.00)
                    </span>
                  </div>
                  <div className="flex justify-between text-gray-600 dark:text-neutral-400 font-medium">
                    <span>Taxes</span>
                    <span className="text-gray-400 font-medium">Calculated at checkout</span>
                  </div>
                  <div className="pt-3 border-t border-gray-200 dark:border-neutral-800 flex justify-between items-baseline">
                    <span className="text-sm font-black uppercase text-gray-900 dark:text-white">Subtotal</span>
                    <span className="text-xl font-black text-amber-500">{formatPrice(totalPrice)}</span>
                  </div>
                </div>

                <button
                  onClick={handleCheckout}
                  className="w-full mt-6 bg-amber-500 hover:bg-amber-400 text-black font-black uppercase tracking-wider py-3.5 px-4 rounded-xl shadow-lg shadow-amber-500/20 transition-all text-sm flex items-center justify-center gap-2"
                >
                  Proceed to Checkout
                </button>

                <button
                  onClick={() => navigate('/')}
                  className="w-full mt-3 text-center text-xs font-bold text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                >
                  ← Continue Shopping
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default CartPage