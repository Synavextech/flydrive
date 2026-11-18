import React from 'react'
import { Link } from 'react-router-dom'
import {
  BookOpen,
  CreditCard,
  Truck,
  RotateCcw,
  Wallet,
  MessageSquare,
  ArrowLeft,
  ShieldCheck
} from 'lucide-react'

const openTalkToPerson = (topic: string = 'General Inquiry') => {
  window.dispatchEvent(
    new CustomEvent('dfe:open-livechat', {
      detail: { topic, focusComposer: true }
    })
  )
}

export const FaqPage: React.FC = () => {
  return (
    <div className="pt-24 pb-16 min-h-screen bg-gray-50 dark:bg-[#0e1014] text-gray-900 dark:text-white transition-colors">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        <div>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-gray-900 dark:hover:text-white mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Fleet Store
          </Link>
          <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-creamy-500 bg-creamy-500/10 px-2.5 py-1 rounded-full border border-creamy-500/20">
            <BookOpen className="w-3 h-3" />
            DriveFlyElectric.shop Support Center
          </span>
          <h1 className="text-3xl font-black uppercase tracking-tight font-anton mt-2">
            Frequently Asked Questions &amp; 21-Day Return Policy
          </h1>
          <p className="text-xs sm:text-sm text-gray-600 dark:text-neutral-300 mt-1">
            Answers on integrated taxes, total doorstep delivery costs, Wallet checkout, active-shipment WhatsApp access, and same-day refund deposits.
          </p>
        </div>

        {/* Payments & Taxes Section */}
        <section
          id="payments"
          className="bg-white dark:bg-[#16181e] border border-gray-200 dark:border-neutral-800 rounded-2xl p-6 space-y-4"
        >
          <h2 className="text-base font-black uppercase tracking-wider flex items-center gap-2 text-creamy-500">
            <CreditCard className="w-5 h-5" />
            Payment Queries, Taxes &amp; Doorstep Costs
          </h2>
          <div className="space-y-3 text-xs leading-relaxed text-gray-700 dark:text-neutral-300">
            <div>
              <h3 className="font-bold text-gray-900 dark:text-white">
                I have a question about making payment — what methods are supported?
              </h3>
              <p className="mt-1">
                We accept <strong>DriveFlyElectric Wallet Balance</strong>, <strong>PayPal</strong> (including integrated Debit/Credit cards), and <strong>Stripe</strong> 3D-Secure card payments in USD. If your Wallet balance covers part of your total, you can apply it directly and settle only the remaining balance via PayPal or Stripe.
              </p>
            </div>
            <div>
              <h3 className="font-bold text-gray-900 dark:text-white">
                Are taxes integrated for my country?
              </h3>
              <p className="mt-1">
                Checkout calculates and displays estimated tax (5%) and final USD order totals transparently before payment confirmation. If you need assistance confirming country delivery documentation before paying, always contact support in LiveChat first for directions.
              </p>
            </div>
            <div>
              <h3 className="font-bold text-gray-900 dark:text-white">
                Help me understand total costs to my doorstep
              </h3>
              <p className="mt-1">
                Express crated freight delivery is <strong>FREE ($0.00)</strong> worldwide. Your total shown in Checkout includes the unit price plus 5% estimated tax, with no extra freight surcharge at checkout.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => openTalkToPerson('Payment Queries')}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-creamy-500 text-black font-black text-xs uppercase tracking-wider"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Talk to a Person About Payment
          </button>
        </section>

        {/* Shipping & WhatsApp Section */}
        <section
          id="shipping"
          className="bg-white dark:bg-[#16181e] border border-gray-200 dark:border-neutral-800 rounded-2xl p-6 space-y-4"
        >
          <h2 className="text-base font-black uppercase tracking-wider flex items-center gap-2 text-creamy-500">
            <Truck className="w-5 h-5" />
            Shipping Inquiry &amp; WhatsApp Access
          </h2>
          <div className="space-y-3 text-xs leading-relaxed text-gray-700 dark:text-neutral-300">
            <div>
              <h3 className="font-bold text-gray-900 dark:text-white">
                How does LiveChat vs. WhatsApp Support work?
              </h3>
              <p className="mt-1">
                <strong>LiveChat Support</strong> is our primary channel for all account-linked product, payment, return, and pre-purchase questions. <strong>WhatsApp</strong> is a secondary channel unlocked specifically when your signed-in account has an active order recorded in{' '}
                <strong>PROCESSING</strong> or <strong>SHIPPED</strong> status.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => openTalkToPerson('Shipping Inquiry')}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-creamy-500/40 text-creamy-600 dark:text-creamy-400 font-black text-xs uppercase tracking-wider hover:bg-creamy-500/10"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Open LiveChat Shipping Support
          </button>
        </section>

        {/* 21-Day Return Policy & Same-Day Wallet Refund Section */}
        <section
          id="returns"
          className="bg-white dark:bg-[#16181e] border border-gray-200 dark:border-neutral-800 rounded-2xl p-6 space-y-4"
        >
          <h2 className="text-base font-black uppercase tracking-wider flex items-center gap-2 text-creamy-500">
            <RotateCcw className="w-5 h-5" />
            21-Day Return Policy &amp; Same-Day Wallet Balance Deposit
          </h2>
          <div className="space-y-3 text-xs leading-relaxed text-gray-700 dark:text-neutral-300">
            <div className="p-3.5 rounded-xl bg-creamy-500/10 border border-creamy-500/30 flex items-start gap-2.5">
              <Wallet className="w-5 h-5 text-creamy-500 shrink-0 mt-0.5" />
              <p>
                <strong>Same-Day Balance Deposit:</strong> We offer same-day refund deposit straight to your DriveFlyElectric Wallet upon processing of your return by a customer support agent while awaiting return shipping, within our <strong>21-day return time window</strong>.
              </p>
            </div>
            <div>
              <h3 className="font-bold text-gray-900 dark:text-white">Your Two Return Options:</h3>
              <ul className="list-disc pl-5 mt-1 space-y-1">
                <li>
                  <strong>Option 1 — Item not what I ordered:</strong> Request your money back; once processed by support, funds are credited same-day to your Wallet balance for immediate checkout use.
                </li>
                <li>
                  <strong>Option 2 — I want to change:</strong> Select a different in-stock item from our catalog of equal or close value (±10% band, with small differences settled cleanly via Wallet).
                </li>
              </ul>
            </div>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <Link
              to="/account?tab=returns"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-creamy-500 text-black font-black text-xs uppercase tracking-wider"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              Request Return in My Account
            </Link>
            <button
              type="button"
              onClick={() => openTalkToPerson('Return Policy')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-black font-black text-xs uppercase tracking-wider"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              Talk to a Person
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}

export default FaqPage
