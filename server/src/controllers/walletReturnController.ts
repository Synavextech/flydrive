import crypto from 'crypto'
import { Request, Response } from 'express'
import { z } from 'zod'
import { databaseService } from '../services/databaseService.js'
import { emailService } from '../utils/emailService.js'

const submitReturnSchema = z.object({
  orderId: z.string().trim().min(1, 'Order ID is required.').max(120),
  reasonType: z.enum(['NOT_AS_ORDERED_REFUND', 'EXCHANGE_EQUAL_VALUE']),
  reasonDetails: z.string().trim().max(1500).optional(),
  exchangeProductId: z.string().trim().max(120).optional().nullable(),
  returnTrackingNumber: z.string().trim().max(120).optional().nullable()
})

const processReturnSchema = z.object({
  action: z.enum([
    'APPROVE_SAME_DAY_WALLET_REFUND',
    'APPROVE_EXCHANGE',
    'MARK_RETURN_RECEIVED_COMPLETE',
    'REJECT'
  ]),
  adminNotes: z.string().trim().max(1000).optional(),
  returnTrackingNumber: z.string().trim().max(120).optional()
})

const adminWalletAdjustSchema = z.object({
  direction: z.enum(['CREDIT', 'DEBIT']),
  amount: z.coerce.number().positive('Adjustment amount must be positive.').max(1000000),
  description: z.string().trim().min(3, 'A reason/description is required.').max(400)
})

// ==================== CUSTOMER WALLET ENDPOINTS ====================

// @desc    Get authenticated customer's wallet balance and transaction ledger
// @route   GET /api/wallet
// @access  Private
export const getMyWallet = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id
    const summary = await databaseService.getWalletSummary(userId, 50)
    res.status(200).json({
      success: true,
      data: summary
    })
  } catch (error: any) {
    console.error('Error loading user wallet:', error)
    res.status(500).json({
      success: false,
      error: error?.message || 'Unable to load wallet balance.'
    })
  }
}

// ==================== CUSTOMER RETURN & EXCHANGE ENDPOINTS ====================

// @desc    List authenticated user's return & exchange requests
// @route   GET /api/returns
// @access  Private
export const getMyReturns = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id
    const returns = await databaseService.listReturnRequests({ userId, limit: 100 })
    res.status(200).json({
      success: true,
      data: returns
    })
  } catch (error: any) {
    console.error('Error fetching user returns:', error)
    res.status(500).json({
      success: false,
      error: error?.message || 'Unable to fetch return requests.'
    })
  }
}

// @desc    List eligible equal/close-value replacement catalog items for an order
// @route   GET /api/returns/eligible-products/:orderId
// @access  Private
export const getEligibleExchangeCatalog = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id
    const orderId = req.params.orderId
    const order = await databaseService.findOrderById(orderId)

    if (!order || (order.userId !== userId && req.user!.role !== 'ADMIN')) {
      return res.status(404).json({
        success: false,
        error: 'Order not found for your account.'
      })
    }

    const eligibility = databaseService.computeOrderReturnEligibility(order)
    const baseCatalogValue = databaseService.roundCurrency(Number(order.subtotal || order.total || 0))
    const excludeProductIds = (order.items || []).map((item) => item.productId)
    const products = await databaseService.getEligibleExchangeProducts(baseCatalogValue, excludeProductIds)

    res.status(200).json({
      success: true,
      data: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        baseCatalogValue,
        tolerancePercent: Math.round(databaseService.EXCHANGE_TOLERANCE_RATIO * 100),
        eligibility,
        products
      }
    })
  } catch (error: any) {
    console.error('Error loading eligible exchange items:', error)
    res.status(500).json({
      success: false,
      error: error?.message || 'Unable to load eligible exchange catalog items.'
    })
  }
}

// @desc    Submit a return or catalog exchange request (enforces 21-day return policy)
// @route   POST /api/returns
// @access  Private
export const submitReturnRequest = async (req: Request, res: Response) => {
  try {
    const parsed = submitReturnSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: parsed.error.issues[0]?.message || 'Invalid return request details.'
      })
    }

    const userId = req.user!.id
    const order = await databaseService.findOrderById(parsed.data.orderId)
    if (!order || order.userId !== userId) {
      return res.status(404).json({
        success: false,
        error: 'Order not found for your account.'
      })
    }

    const created = await databaseService.createReturnRequest({
      orderId: parsed.data.orderId,
      userId,
      reasonType: parsed.data.reasonType,
      reasonDetails: parsed.data.reasonDetails,
      exchangeProductId: parsed.data.exchangeProductId || null,
      returnTrackingNumber: parsed.data.returnTrackingNumber || null
    })

    emailService
      .sendReturnRequestedNotification(created, order)
      .catch((err) => console.error('Return request notification email error:', err))

    res.status(201).json({
      success: true,
      message: 'Return request submitted. Our support team offers same-day wallet balance deposit once processed.',
      data: created
    })
  } catch (error: any) {
    console.error('Error submitting return request:', error)
    res.status(400).json({
      success: false,
      error: error?.message || 'Unable to submit return request.'
    })
  }
}

// ==================== ADMIN RETURN & WALLET ENDPOINTS ====================

// @desc    List all customer return & exchange requests (Admin)
// @route   GET /api/admin/returns
// @access  Private/Admin
export const getAdminReturns = async (req: Request, res: Response) => {
  try {
    if (req.user!.role !== 'ADMIN') {
      return res.status(403).json({ success: false, error: 'Admin access required' })
    }
    const statusFilter = typeof req.query.status === 'string' && req.query.status ? req.query.status : undefined
    const returns = await databaseService.listReturnRequests({ status: statusFilter, limit: 200 })
    res.status(200).json({
      success: true,
      data: returns
    })
  } catch (error: any) {
    console.error('Error fetching admin return requests:', error)
    res.status(500).json({
      success: false,
      error: error?.message || 'Failed to fetch return requests.'
    })
  }
}

// @desc    Process return: Same-Day Wallet Refund Deposit, Catalog Exchange, Completion, or Rejection
// @route   PUT /api/admin/returns/:id/process
// @access  Private/Admin
export const processAdminReturnRequest = async (req: Request, res: Response) => {
  try {
    if (req.user!.role !== 'ADMIN') {
      return res.status(403).json({ success: false, error: 'Admin access required' })
    }

    const parsed = processReturnSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: parsed.error.issues[0]?.message || 'Invalid return processing action.'
      })
    }

    const returnId = req.params.id
    const returnReq = await databaseService.findReturnRequestById(returnId)
    if (!returnReq) {
      return res.status(404).json({ success: false, error: 'Return request not found.' })
    }

    const order = await databaseService.findOrderById(returnReq.orderId)
    if (!order) {
      return res.status(404).json({ success: false, error: 'Associated order record not found.' })
    }

    const { action, adminNotes, returnTrackingNumber } = parsed.data
    const nowIso = new Date().toISOString()

    if (action === 'APPROVE_SAME_DAY_WALLET_REFUND') {
      if (returnReq.status === 'REJECTED' || returnReq.status === 'EXPIRED' || returnReq.status === 'COMPLETED') {
        return res.status(400).json({
          success: false,
          error: `Cannot deposit refund for a return request in ${returnReq.status} status.`
        })
      }

      if (returnReq.walletCredited) {
        return res.status(200).json({
          success: true,
          message: 'Wallet refund was already credited for this return request.',
          data: returnReq
        })
      }

      const creditTx = await databaseService.creditWalletAtomic({
        userId: returnReq.userId,
        type: 'REFUND_DEPOSIT',
        amount: returnReq.refundAmount,
        description: `Same-day refund deposit awaiting return shipment (${returnReq.returnNumber} • Order #${order.orderNumber})`,
        orderId: order.id,
        returnRequestId: returnReq.id,
        referenceId: `return_refund:${returnReq.id}`,
        createdBy: req.user!.id
      })

      const updated = await databaseService.updateReturnRequest(returnReq.id, {
        status: 'WALLET_CREDITED',
        walletCredited: true,
        walletTransactionId: creditTx.transactionId,
        returnTrackingNumber: returnTrackingNumber || returnReq.returnTrackingNumber || `RTN-${order.orderNumber}`,
        adminNotes: adminNotes ?? returnReq.adminNotes,
        processedBy: req.user!.id,
        processedAt: nowIso
      })

      emailService
        .sendReturnWalletCreditedNotification(updated, order, creditTx.balance)
        .catch((err) => console.error('Wallet refund notification error:', err))

      return res.status(200).json({
        success: true,
        message: `Same-day refund of $${returnReq.refundAmount.toFixed(2)} USD deposited to customer wallet.`,
        data: updated
      })
    }

    if (action === 'APPROVE_EXCHANGE') {
      if (returnReq.reasonType !== 'EXCHANGE_EQUAL_VALUE' || !returnReq.exchangeProductId) {
        return res.status(400).json({
          success: false,
          error: 'This return request is not a catalog item exchange.'
        })
      }
      if (returnReq.exchangeOrderId) {
        return res.status(200).json({
          success: true,
          message: 'Exchange replacement order has already been generated.',
          data: returnReq
        })
      }
      if (returnReq.status !== 'PENDING_REVIEW') {
        return res.status(400).json({
          success: false,
          error: `Cannot approve exchange when status is ${returnReq.status}.`
        })
      }

      const replacementProduct = await databaseService.findProductById(returnReq.exchangeProductId)
      if (!replacementProduct || !replacementProduct.isActive || Number(replacementProduct.stock || 0) < 1) {
        return res.status(400).json({
          success: false,
          error: 'Selected replacement catalog item is currently unavailable or out of stock.'
        })
      }

      const delta = Number(returnReq.exchangePriceDelta || 0)
      let settledWalletBalance: number | undefined
      let exchangeTxId: string | null = null

      if (delta < -0.01) {
        const creditAmount = databaseService.roundCurrency(Math.abs(delta))
        const creditRes = await databaseService.creditWalletAtomic({
          userId: returnReq.userId,
          type: 'EXCHANGE_CREDIT',
          amount: creditAmount,
          description: `Exchange value difference credited (${returnReq.returnNumber} • ${replacementProduct.name})`,
          orderId: order.id,
          returnRequestId: returnReq.id,
          referenceId: `exchange_credit:${returnReq.id}`,
          createdBy: req.user!.id
        })
        settledWalletBalance = creditRes.balance
        exchangeTxId = creditRes.transactionId
      } else if (delta > 0.01) {
        const debitRes = await databaseService.debitWalletAtomic({
          userId: returnReq.userId,
          type: 'CHECKOUT_PAYMENT',
          amount: databaseService.roundCurrency(delta),
          description: `Exchange upgrade balance settled (${returnReq.returnNumber} • ${replacementProduct.name})`,
          orderId: order.id,
          returnRequestId: returnReq.id,
          referenceId: `exchange_debit:${returnReq.id}`,
          createdBy: req.user!.id
        })
        settledWalletBalance = debitRes.balance
        exchangeTxId = debitRes.transactionId
      }

      const replacementOrder = await databaseService.createOrder({
        userId: returnReq.userId,
        total: 0,
        subtotal: replacementProduct.price,
        tax: 0,
        shipping: 0,
        discount: replacementProduct.price,
        walletAmountUsed: delta > 0.01 ? databaseService.roundCurrency(delta) : 0,
        paymentMethod: 'WALLET',
        paymentId: `EXCHANGE-${returnReq.returnNumber}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`,
        paymentStatus: 'COMPLETED',
        paymentVerified: true,
        receiptToken: crypto.randomBytes(24).toString('hex'),
        status: 'PROCESSING',
        shippingAddressId: order.shippingAddressId || undefined,
        billingAddressId: order.billingAddressId || undefined,
        notes: `Catalog Exchange Replacement (${returnReq.returnNumber}) for Original Order #${order.orderNumber}.`,
        skipCartClear: true,
        items: [
          {
            productId: replacementProduct.id,
            quantity: 1,
            price: replacementProduct.price
          }
        ]
      })

      if (exchangeTxId) {
        await databaseService.linkWalletTransactionOrderId(exchangeTxId, replacementOrder.id).catch(() => {})
      }

      const updated = await databaseService.updateReturnRequest(returnReq.id, {
        status: 'EXCHANGE_APPROVED',
        exchangeOrderId: replacementOrder.id,
        walletCredited: delta < -0.01 ? true : returnReq.walletCredited,
        walletTransactionId: exchangeTxId || returnReq.walletTransactionId,
        returnTrackingNumber: returnTrackingNumber || returnReq.returnTrackingNumber || `RTN-${order.orderNumber}`,
        adminNotes: adminNotes ?? returnReq.adminNotes,
        processedBy: req.user!.id,
        processedAt: nowIso
      })

      emailService
        .sendReturnExchangeApprovedNotification(updated, order, replacementOrder, settledWalletBalance)
        .catch((err) => console.error('Exchange approval notification error:', err))

      return res.status(200).json({
        success: true,
        message: `Catalog exchange approved. Replacement order #${replacementOrder.orderNumber} created.`,
        data: updated
      })
    }

    if (action === 'MARK_RETURN_RECEIVED_COMPLETE') {
      if (returnReq.status === 'REJECTED' || returnReq.status === 'EXPIRED') {
        return res.status(400).json({
          success: false,
          error: `Cannot mark return complete from ${returnReq.status} status.`
        })
      }

      let walletTxId = returnReq.walletTransactionId
      let walletCredited = returnReq.walletCredited

      if (returnReq.reasonType === 'NOT_AS_ORDERED_REFUND' && !returnReq.walletCredited) {
        const creditTx = await databaseService.creditWalletAtomic({
          userId: returnReq.userId,
          type: 'REFUND_DEPOSIT',
          amount: returnReq.refundAmount,
          description: `Return completed & wallet refund deposited (${returnReq.returnNumber} • Order #${order.orderNumber})`,
          orderId: order.id,
          returnRequestId: returnReq.id,
          referenceId: `return_refund:${returnReq.id}`,
          createdBy: req.user!.id
        })
        walletTxId = creditTx.transactionId
        walletCredited = true
      }

      const updated = await databaseService.updateReturnRequest(returnReq.id, {
        status: 'COMPLETED',
        walletCredited,
        walletTransactionId: walletTxId,
        returnTrackingNumber: returnTrackingNumber || returnReq.returnTrackingNumber,
        adminNotes: adminNotes ?? returnReq.adminNotes,
        processedBy: req.user!.id,
        processedAt: returnReq.processedAt ? new Date(returnReq.processedAt).toISOString() : nowIso
      })

      if (returnReq.reasonType === 'NOT_AS_ORDERED_REFUND') {
        await databaseService.updateOrderPaymentAndStatus(order.id, {
          status: 'REFUNDED',
          paymentStatus: 'REFUNDED'
        })
      }

      emailService
        .sendReturnOutcomeNotification(updated, order)
        .catch((err) => console.error('Return completed notification error:', err))

      return res.status(200).json({
        success: true,
        message: 'Return marked received and completed.',
        data: updated
      })
    }

    // REJECT action
    if (returnReq.walletCredited || returnReq.exchangeOrderId) {
      return res.status(400).json({
        success: false,
        error: 'Cannot reject a return request after a wallet deposit or exchange order has already been issued.'
      })
    }

    const updated = await databaseService.updateReturnRequest(returnReq.id, {
      status: 'REJECTED',
      adminNotes: adminNotes || 'Return request declined upon review.',
      processedBy: req.user!.id,
      processedAt: nowIso
    })

    emailService
      .sendReturnOutcomeNotification(updated, order)
      .catch((err) => console.error('Return rejection notification error:', err))

    res.status(200).json({
      success: true,
      message: 'Return request updated.',
      data: updated
    })
  } catch (error: any) {
    console.error('Error processing return request:', error)
    res.status(500).json({
      success: false,
      error: error?.message || 'Unable to process return request.'
    })
  }
}

// @desc    List all customer wallets & recent ledger history (Admin)
// @route   GET /api/admin/wallets
// @access  Private/Admin
export const getAdminWallets = async (req: Request, res: Response) => {
  try {
    if (req.user!.role !== 'ADMIN') {
      return res.status(403).json({ success: false, error: 'Admin access required' })
    }
    const wallets = await databaseService.listAllWallets(100)
    res.status(200).json({
      success: true,
      data: wallets
    })
  } catch (error: any) {
    console.error('Error fetching admin wallets:', error)
    res.status(500).json({
      success: false,
      error: error?.message || 'Failed to fetch customer wallets.'
    })
  }
}

// @desc    Adjust a customer's wallet balance with an audit ledger record (Admin)
// @route   POST /api/admin/wallets/:userId/adjust
// @access  Private/Admin
export const adjustUserWallet = async (req: Request, res: Response) => {
  try {
    if (req.user!.role !== 'ADMIN') {
      return res.status(403).json({ success: false, error: 'Admin access required' })
    }

    const parsed = adminWalletAdjustSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: parsed.error.issues[0]?.message || 'Invalid wallet adjustment payload.'
      })
    }

    const userId = req.params.userId
    const targetUser = await databaseService.findUserById(userId)
    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'Customer account not found.' })
    }

    const tx = await databaseService.applyWalletTransaction({
      userId,
      type: 'ADMIN_ADJUSTMENT',
      direction: parsed.data.direction,
      amount: parsed.data.amount,
      description: parsed.data.description,
      referenceId: `admin_adj:${req.user!.id}:${Date.now()}:${crypto.randomBytes(2).toString('hex')}`,
      createdBy: req.user!.id
    })

    res.status(200).json({
      success: true,
      message: `Wallet ${parsed.data.direction === 'CREDIT' ? 'credited' : 'debited'} by $${parsed.data.amount.toFixed(2)} USD.`,
      data: tx
    })
  } catch (error: any) {
    console.error('Error adjusting user wallet:', error)
    res.status(400).json({
      success: false,
      error: error?.message || 'Unable to adjust wallet balance.'
    })
  }
}
