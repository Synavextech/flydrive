import nodemailer from 'nodemailer'
import dotenv from 'dotenv'
import { EventEmitter } from 'events'
import {
  buildReceiptDataFromOrder,
  generateReceiptPdfBuffer,
  generateReceiptText,
  ServerOrderReceiptData
} from './receiptPdf.js'
import {
  escapeHtml,
  getAdminContactEmail,
  getInquirySenderEmail,
  getSystemNotificationEmails,
  isValidEmailAddress,
  resolveOrderCustomerEmails
} from '../middleware/security.js'
import { databaseService } from '../services/databaseService.js'
import type {
  CartReminderRecord,
  Product,
  ProductBooking,
  ProductReview,
  SystemActivityRecord,
  SystemActivityType
} from '../types/database.js'

dotenv.config()

export type { SystemActivityType }
export type SystemActivityEvent = SystemActivityRecord

export const UNPAID_CART_REMINDER_STAGES_HOURS = [1, 6, 12, 24, 48, 72] as const

class EmailService {
  public activityEmitter = new EventEmitter()
  public supportEmitter = new EventEmitter()
  private recentActivities: SystemActivityEvent[] = []
  private cachedTransporter: nodemailer.Transporter | null = null
  private cachedTransportSignature: string = ''
  private cartReminderTimer: NodeJS.Timeout | null = null
  private cartReminderStartupTimer: NodeJS.Timeout | null = null
  private cartReminderSweepRunning = false

  constructor() {
    this.activityEmitter.setMaxListeners(100)
    this.supportEmitter.setMaxListeners(200)
  }

  private getTransporter(): {
    transporter: nodemailer.Transporter | null
    isConfigured: boolean
    fromAddress: string
    adminContactEmail: string
    systemEmails: string[]
  } {
    const host = (process.env.SMTP_HOST || 'mail.privateemail.com').trim()
    const port = parseInt(process.env.SMTP_PORT || '465', 10)
    const secure =
      process.env.SMTP_SECURE === 'true' ||
      port === 465

    const rawUser = (process.env.SMTP_USER || '').trim()
    const senderEmail = getInquirySenderEmail()
    const user = (isValidEmailAddress(rawUser) ? rawUser : senderEmail).trim()
    const pass = (process.env.SMTP_PASS || process.env.SMTP_PASSWORD || '').trim()

    let fromAddress = (process.env.FROM_EMAIL || '').trim()
    if (!fromAddress || fromAddress.includes('<>')) {
      fromAddress = `DriveFlyElectric <${senderEmail}>`
    }

    const adminContactEmail = getAdminContactEmail()
    const systemEmails = getSystemNotificationEmails()

    if (!user || !pass) {
      return {
        transporter: null,
        isConfigured: false,
        fromAddress,
        adminContactEmail,
        systemEmails
      }
    }

    const signature = `${host}:${port}:${secure}:${user}:${pass}`
    if (!this.cachedTransporter || this.cachedTransportSignature !== signature) {
      if (this.cachedTransporter) {
        try {
          this.cachedTransporter.close()
        } catch {
          // Ignore close error on transporter refresh
        }
      }
      this.cachedTransporter = nodemailer.createTransport({
        host,
        port,
        secure,
        pool: true,
        maxConnections: 5,
        maxMessages: 100,
        auth: { user, pass },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000
      })
      this.cachedTransportSignature = signature
    }

    return {
      transporter: this.cachedTransporter,
      isConfigured: true,
      fromAddress,
      adminContactEmail,
      systemEmails
    }
  }

  public async verifySmtpConnection(): Promise<boolean> {
    const { transporter, isConfigured, fromAddress, adminContactEmail } = this.getTransporter()
    if (!isConfigured || !transporter) {
      console.warn('⚠️  SMTP is not configured (missing SMTP_USER/SMTP_PASSWORD). Outbound notifications disabled.')
      return false
    }
    try {
      await transporter.verify()
      console.log(
        `✅ SMTP verified & pooled | Outbound Inquiry Sender: ${fromAddress} | Admin Contact/Alerts: ${adminContactEmail}`
      )
      return true
    } catch (err: any) {
      console.error('⚠️  SMTP verification warning:', err?.message || err)
      return false
    }
  }

  public recordActivity(event: Omit<SystemActivityEvent, 'id' | 'timestamp'>): SystemActivityEvent {
    const fullEvent: SystemActivityEvent = {
      ...event,
      id: `act_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString()
    }
    this.recentActivities = [
      fullEvent,
      ...this.recentActivities.filter((item) => item.id !== fullEvent.id)
    ].slice(0, 100)
    this.activityEmitter.emit('activity', fullEvent)

    databaseService.recordSystemActivity(fullEvent).catch((err) => {
      console.warn('Notice: Failed to persist system activity:', err?.message || err)
    })

    return fullEvent
  }

  public emitSupportSync(session: any, type: string = 'session_updated'): void {
    if (!session?.id) return
    const payload = {
      sessionId: session.id,
      type,
      session,
      timestamp: new Date().toISOString()
    }
    this.supportEmitter.emit(`session:${session.id}`, payload)
    this.activityEmitter.emit('support_sync', payload)
  }

  public emitAnalyticsSync(kind: 'visit' | 'product_view', data: any): void {
    this.activityEmitter.emit('analytics_sync', {
      kind,
      data,
      timestamp: new Date().toISOString()
    })
  }

  public getRecentActivities(limit: number = 25): SystemActivityEvent[] {
    return this.recentActivities.slice(0, limit)
  }

  public async loadRecentActivities(limit: number = 50): Promise<SystemActivityEvent[]> {
    const persisted = await databaseService.listSystemActivities(limit).catch(() => [])
    const merged = new Map<string, SystemActivityEvent>()

    for (const item of this.recentActivities) {
      merged.set(item.id, item)
    }
    for (const item of persisted) {
      if (!merged.has(item.id)) {
        merged.set(item.id, item)
      }
    }

    const sorted = Array.from(merged.values())
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 100)

    this.recentActivities = sorted
    return sorted.slice(0, limit)
  }

  private async dispatchMail(mailOptions: nodemailer.SendMailOptions): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const { transporter, isConfigured, fromAddress, adminContactEmail } = this.getTransporter()
    const finalOptions: nodemailer.SendMailOptions = {
      from: fromAddress,
      replyTo: adminContactEmail,
      ...mailOptions
    }

    if (!isConfigured || !transporter) {
      console.log(
        `📧 [SMTP Notification Queued/Logged - Set SMTP_USER & SMTP_PASS in .env for live relay] To: ${finalOptions.to} | Subject: ${finalOptions.subject}`
      )
      return { success: false, error: 'SMTP credentials not yet configured in .env' }
    }

    try {
      const info = await transporter.sendMail(finalOptions)
      console.log(`✅ [SMTP Sent] To: ${finalOptions.to} | Subject: ${finalOptions.subject} | MessageID: ${info.messageId}`)
      return { success: true, messageId: info.messageId }
    } catch (err: any) {
      console.error(`⚠️ [SMTP Send Error] To: ${finalOptions.to} | Subject: ${finalOptions.subject}:`, err?.message || err)
      return { success: false, error: err?.message || 'SMTP dispatch failed' }
    }
  }

  /**
   * Sends real-time purchase confirmation & PDF receipt to the user's account email
   * AND sends a real-time purchase settlement notification & PDF receipt to system/admin mail.
   */
  async sendPurchaseNotifications(
    order: any,
    customerContext?: {
      accountEmail?: string
      shippingEmail?: string
      firstName?: string
      lastName?: string
      fullAddress?: string
    }
  ): Promise<{
    userEmailSent: boolean
    systemEmailSent: boolean
    receiptData: ServerOrderReceiptData
  }> {
    const receiptData = buildReceiptDataFromOrder(order, {
      firstName: customerContext?.firstName,
      lastName: customerContext?.lastName,
      email: customerContext?.accountEmail || customerContext?.shippingEmail,
      address: customerContext?.fullAddress
    })

    const receiptText = generateReceiptText(receiptData)
    const pdfBuffer = generateReceiptPdfBuffer(receiptData)
    const pdfAttachment = {
      filename: `Receipt-${receiptData.orderNumber}.pdf`,
      content: pdfBuffer,
      contentType: 'application/pdf'
    }

    // Collect recipient user emails (declared account email + shipping email + guest order notes email)
    const userRecipients = resolveOrderCustomerEmails(
      order,
      customerContext?.accountEmail,
      customerContext?.shippingEmail
    )
    const { adminContactEmail, systemEmails } = this.getTransporter()

    const itemsHtml =
      receiptData.items && receiptData.items.length > 0
        ? receiptData.items
            .map(
              (item) => `
              <tr>
                <td style="padding: 8px 10px; border-bottom: 1px solid #e5e7eb; font-size: 13px;"><strong>${escapeHtml(item.name)}</strong></td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #e5e7eb; font-size: 13px; text-align: center;">${escapeHtml(item.quantity)}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #e5e7eb; font-size: 13px; text-align: right;">${escapeHtml(item.price)}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #e5e7eb; font-size: 13px; text-align: right; font-weight: bold;">${escapeHtml(item.total)}</td>
              </tr>`
            )
            .join('')
        : ''

    // 1. Send Purchase Confirmation + PDF Receipt to User Email
    let userEmailSent = false
    const trackingNumber = receiptData.trackingNumber || `TRK-${receiptData.orderNumber}`
    const safeOrderNumber = escapeHtml(receiptData.orderNumber)
    const safeTrackingNumber = escapeHtml(trackingNumber)
    const safeUserName = escapeHtml(receiptData.userName)
    const safeFinalCost = escapeHtml(receiptData.finalCost)
    const safePaymentSource = escapeHtml(receiptData.paymentSource)
    const safeTransactionId = escapeHtml(receiptData.transactionId)
    const safeAddress = escapeHtml(receiptData.address)
    const safeReceiptText = escapeHtml(receiptText)

    if (userRecipients.length > 0) {
      const userHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #111827; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
          <div style="background-color: #111318; color: #ffffff; padding: 24px;">
            <span style="background-color: #58b970; color: #000000; font-size: 11px; font-weight: 800; padding: 4px 10px; border-radius: 9999px; text-transform: uppercase;">Payment Verified & Settled</span>
            <h1 style="margin: 12px 0 4px; font-size: 22px; color: #ffffff;">Order Confirmed • #${safeOrderNumber}</h1>
            <p style="margin: 0; font-size: 13px; color: #9de0ab; font-weight: bold;">Shipment Tracking Number: ${safeTrackingNumber}</p>
            <p style="margin: 4px 0 0; font-size: 12px; color: #9ca3af;">DriveFlyElectric • Official Purchase Receipt (PDF Attached)</p>
          </div>
          <div style="padding: 24px;">
            <p style="font-size: 14px; line-height: 1.6;">Hello <strong>${safeUserName}</strong>,</p>
            <p style="font-size: 14px; line-height: 1.6;">Thank you for shopping with <strong>DriveFlyElectric</strong>. Your payment has been verified and your order is being prepared for express fulfillment. Your official <strong>PDF Receipt (Receipt-${safeOrderNumber}.pdf)</strong> is attached to this email.</p>

            <div style="margin: 16px 0; padding: 14px 16px; background-color: #f2fbf4; border: 1px solid #9de0ab; border-radius: 10px;">
              <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #357c47; font-weight: 800;">Official Shipment Tracking Number</div>
              <div style="font-size: 18px; font-family: monospace; font-weight: 900; color: #111827; margin-top: 4px;">${safeTrackingNumber}</div>
              <div style="font-size: 12px; color: #4b5563; margin-top: 4px;">Use the <strong>Track Order</strong> option on <a href="https://driveflyelectric.shop" style="color: #429b58; font-weight: bold;">driveflyelectric.shop</a> to follow dispatch updates.</div>
            </div>

            ${
              itemsHtml
                ? `
            <h3 style="font-size: 14px; text-transform: uppercase; color: #374151; margin-top: 20px;">Purchased Units</h3>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
              <thead>
                <tr style="background-color: #f3f4f6; text-align: left; font-size: 12px; color: #6b7280;">
                  <th style="padding: 8px 10px;">Item</th>
                  <th style="padding: 8px 10px; text-align: center;">Qty</th>
                  <th style="padding: 8px 10px; text-align: right;">Unit Price</th>
                  <th style="padding: 8px 10px; text-align: right;">Total</th>
                </tr>
              </thead>
              <tbody>${itemsHtml}</tbody>
            </table>`
                : ''
            }

            <h3 style="font-size: 14px; text-transform: uppercase; color: #374151; margin-top: 20px;">Official Receipt Summary</h3>
            <pre style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; font-family: 'Courier New', Courier, monospace; font-size: 12px; line-height: 1.5; white-space: pre-wrap; overflow-x: auto;">${safeReceiptText}</pre>

            <p style="font-size: 12px; color: #6b7280; margin-top: 20px;">Need assistance? Contact our Customer Support team at <a href="mailto:${escapeHtml(adminContactEmail)}" style="color: #429b58;">${escapeHtml(adminContactEmail)}</a>.</p>
          </div>
        </div>
      `

      const userMailRes = await this.dispatchMail({
        to: userRecipients.join(', '),
        subject: `Official Purchase Receipt & Tracking #${trackingNumber} - Order #${receiptData.orderNumber}`,
        text: receiptText,
        html: userHtml,
        attachments: [pdfAttachment]
      })
      userEmailSent = userMailRes.success
    }

    // 2. Send Real-Time Purchase Notification + PDF Receipt to System / Admin Mail
    let systemEmailSent = false
    if (systemEmails.length > 0) {
      const safeRecipientSummary = escapeHtml(userRecipients.join(', ') || 'Guest Checkout')
      const adminHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #111827; border: 1px solid #58b970; border-radius: 12px; overflow: hidden;">
          <div style="background-color: #111318; color: #ffffff; padding: 20px 24px;">
            <span style="background-color: #58b970; color: #000000; font-size: 11px; font-weight: 800; padding: 4px 10px; border-radius: 9999px; text-transform: uppercase;">Order Alert • Verified Purchase</span>
            <h2 style="margin: 10px 0 2px; font-size: 20px; color: #76cf89;">New Purchase Order #${safeOrderNumber} (${safeFinalCost})</h2>
            <p style="margin: 0; font-size: 12px; color: #9ca3af;">Tracking #: ${safeTrackingNumber} • Timestamp: ${escapeHtml(new Date().toUTCString())}</p>
          </div>
          <div style="padding: 24px;">
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 13px;">
              <tr><td style="padding: 6px 0; color: #6b7280; width: 160px;">Customer Name:</td><td style="padding: 6px 0; font-weight: bold;">${safeUserName}</td></tr>
              <tr><td style="padding: 6px 0; color: #6b7280;">Customer Email:</td><td style="padding: 6px 0; font-weight: bold;">${safeRecipientSummary}</td></tr>
              <tr><td style="padding: 6px 0; color: #6b7280;">Tracking Number:</td><td style="padding: 6px 0; font-family: monospace; font-weight: bold; color: #357c47;">${safeTrackingNumber}</td></tr>
              <tr><td style="padding: 6px 0; color: #6b7280;">Payment Method:</td><td style="padding: 6px 0; font-weight: bold;">${safePaymentSource}</td></tr>
              <tr><td style="padding: 6px 0; color: #6b7280;">Transaction ID:</td><td style="padding: 6px 0; font-family: monospace;">${safeTransactionId}</td></tr>
              <tr><td style="padding: 6px 0; color: #6b7280;">Settled Total (USD):</td><td style="padding: 6px 0; font-weight: bold; color: #429b58;">${safeFinalCost}</td></tr>
              <tr><td style="padding: 6px 0; color: #6b7280;">Shipping Address:</td><td style="padding: 6px 0;">${safeAddress}</td></tr>
            </table>

            <h3 style="font-size: 13px; text-transform: uppercase; color: #374151;">Generated Receipt (PDF Attached)</h3>
            <pre style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px; font-family: 'Courier New', Courier, monospace; font-size: 11.5px; line-height: 1.45; white-space: pre-wrap;">${safeReceiptText}</pre>
          </div>
        </div>
      `

      const sysMailRes = await this.dispatchMail({
        to: systemEmails.join(', '),
        subject: `[SYSTEM NOTIFICATION] New Purchase #${receiptData.orderNumber} - ${receiptData.finalCost} (${receiptData.userName})`,
        text: `SYSTEM PURCHASE ALERT\nCustomer Email: ${userRecipients.join(', ')}\n\n${receiptText}`,
        html: adminHtml,
        attachments: [pdfAttachment]
      })
      systemEmailSent = sysMailRes.success
    }

    this.recordActivity({
      type: 'ORDER_PURCHASED',
      title: `New Purchase Settled • #${receiptData.orderNumber}`,
      message: `${receiptData.userName} (${userRecipients[0] || 'Customer'}) completed purchase of ${receiptData.finalCost} via ${receiptData.paymentSource}. PDF Receipt generated.`,
      userEmail: userRecipients[0],
      orderNumber: receiptData.orderNumber,
      amount: Number(order.total || 0),
      emailDispatched: userEmailSent,
      systemMailDispatched: systemEmailSent
    })

    return {
      userEmailSent,
      systemEmailSent,
      receiptData
    }
  }

  /**
   * Sends welcome email to user email declared during account creation
   * AND sends real-time system activity alert to system mail.
   */
  async sendAccountRegistrationNotifications(
    user: { id?: string; email: string; firstName?: string | null; lastName?: string | null; phone?: string | null; role?: string },
    source: string = 'Direct Account Registration'
  ): Promise<{ userEmailSent: boolean; systemEmailSent: boolean }> {
    const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Valued Customer'
    const storeUrl = process.env.PRODUCTION_URL || process.env.PRODUCTION_url || 'https://driveflyelectric.shop'
    const safeFullName = escapeHtml(fullName)
    const safeEmail = escapeHtml(user.email)
    const safePhone = escapeHtml(user.phone || 'N/A')
    const safeSource = escapeHtml(source)
    const safeStoreUrl = escapeHtml(storeUrl)

    const { adminContactEmail, systemEmails } = this.getTransporter()

    // 1. Welcome email to the newly registered user
    const userHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #111827; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
        <div style="background-color: #111318; color: #ffffff; padding: 24px;">
          <span style="background-color: #58b970; color: #000000; font-size: 11px; font-weight: 800; padding: 4px 10px; border-radius: 9999px; text-transform: uppercase;">Account Active</span>
          <h1 style="margin: 12px 0 4px; font-size: 22px; color: #ffffff;">Welcome to DriveFlyElectric!</h1>
        </div>
        <div style="padding: 24px; font-size: 14px; line-height: 1.6;">
          <p>Hello <strong>${safeFullName}</strong>,</p>
          <p>Your account (<strong style="color: #429b58;">${safeEmail}</strong>) has been successfully created on <strong>DriveFlyElectric</strong>.</p>
          <p>All future purchase confirmations, official PDF receipts, and real-time order dispatch updates will be sent directly to this email address.</p>
          <div style="margin: 24px 0;">
            <a href="${safeStoreUrl}" style="background-color: #58b970; color: #000000; font-weight: bold; text-decoration: none; padding: 12px 24px; border-radius: 8px; display: inline-block;">Explore Fleet Catalog</a>
          </div>
          <p style="font-size: 12px; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 16px;">Questions? Reach our support desk at <a href="mailto:${escapeHtml(adminContactEmail)}" style="color: #429b58;">${escapeHtml(adminContactEmail)}</a>.</p>
        </div>
      </div>
    `

    const userRes = await this.dispatchMail({
      to: user.email,
      subject: `Welcome to DriveFlyElectric - Account Confirmed`,
      text: `Hello ${fullName},\n\nYour account (${user.email}) has been registered at DriveFlyElectric. All order confirmations and official PDF purchase receipts will be sent to this email.\n\nSupport: ${adminContactEmail}\nVisit: ${storeUrl}`,
      html: userHtml
    })

    // 2. Real-time system notification email to Admin/System mail
    let sysSent = false
    if (systemEmails.length > 0) {
      const sysHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
          <div style="background-color: #111318; color: #ffffff; padding: 18px 24px;">
            <h2 style="margin: 0; font-size: 18px; color: #76cf89;">[Account Activity] New User Registered</h2>
          </div>
          <div style="padding: 20px 24px; font-size: 13px; line-height: 1.6;">
            <p><strong>Name:</strong> ${safeFullName}</p>
            <p><strong>Email:</strong> ${safeEmail}</p>
            <p><strong>Phone:</strong> ${safePhone}</p>
            <p><strong>Registration Channel:</strong> ${safeSource}</p>
            <p><strong>Timestamp:</strong> ${escapeHtml(new Date().toUTCString())}</p>
          </div>
        </div>
      `
      const sysRes = await this.dispatchMail({
        to: systemEmails.join(', '),
        subject: `[SYSTEM NOTIFICATION] New Account Registered - ${user.email}`,
        text: `New User Registered\nName: ${fullName}\nEmail: ${user.email}\nChannel: ${source}\nTimestamp: ${new Date().toUTCString()}`,
        html: sysHtml
      })
      sysSent = sysRes.success
    }

    this.recordActivity({
      type: 'USER_REGISTERED',
      title: `New Customer Account • ${fullName}`,
      message: `Account registered for ${user.email} (${source}). Welcome email dispatched.`,
      userEmail: user.email,
      emailDispatched: userRes.success,
      systemMailDispatched: sysSent
    })

    return {
      userEmailSent: userRes.success,
      systemEmailSent: sysSent
    }
  }

  // Backward-compatible wrapper for order confirmation
  async sendOrderConfirmation(order: any, userEmail: string) {
    return this.sendPurchaseNotifications(order, { accountEmail: userEmail })
  }

  // Send order status update email to customer (registered or guest) + system notification
  async sendOrderStatusUpdate(order: any, userEmail?: string) {
    const customerRecipients = resolveOrderCustomerEmails(order, userEmail)
    const targetEmail = customerRecipients[0]
    const receiptData = buildReceiptDataFromOrder(order, { email: targetEmail })
    const trackingNumber = receiptData.trackingNumber || `TRK-${receiptData.orderNumber}`
    const pdfBuffer = generateReceiptPdfBuffer(receiptData)
    const { adminContactEmail, systemEmails } = this.getTransporter()

    const statusMessages: { [key: string]: string } = {
      PENDING: 'Your order has been logged and is awaiting processing.',
      PROCESSING: 'Your order payment is settled and our warehouse team is preparing your vehicle for dispatch.',
      SHIPPED: 'Your order has been dispatched via Global Express Crated Freight!',
      DELIVERED: 'Your order has been marked as delivered. Thank you for riding & flying with DriveFlyElectric!',
      CANCELLED: 'Your order has been cancelled. Contact support if you have any questions.',
      REFUNDED: 'A refund has been issued for your order. Please allow standard processor clearing times for statement posting.'
    }

    let userSent = false
    if (customerRecipients.length > 0) {
      const safeOrderNum = escapeHtml(receiptData.orderNumber)
      const safeTrk = escapeHtml(trackingNumber)
      const safeName = escapeHtml(receiptData.userName)
      const safeStatus = escapeHtml(order.status)
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
          <div style="background-color: #111318; color: #ffffff; padding: 20px 24px;">
            <h2 style="margin: 0; font-size: 20px; color: #76cf89;">Order Status Update • #${safeOrderNum}</h2>
            <p style="margin: 4px 0 0; font-size: 12px; color: #9de0ab;">Tracking Number: <strong>${safeTrk}</strong></p>
          </div>
          <div style="padding: 24px; font-size: 14px; line-height: 1.6;">
            <p>Hello <strong>${safeName}</strong>,</p>
            <p>The status of your order <strong>#${safeOrderNum}</strong> (Tracking: <strong>${safeTrk}</strong>) has been updated to: <strong style="color: #429b58;">${safeStatus}</strong>.</p>
            <p>${escapeHtml(statusMessages[order.status] || 'Your order status has been updated.')}</p>
            <p style="font-size: 12px; color: #6b7280; margin-top: 20px;">Your updated PDF purchase receipt is attached for your records. Need help? Contact <a href="mailto:${escapeHtml(adminContactEmail)}" style="color: #429b58;">${escapeHtml(adminContactEmail)}</a>.</p>
          </div>
        </div>
      `
      const res = await this.dispatchMail({
        to: customerRecipients.join(', '),
        subject: `Order #${receiptData.orderNumber} (${trackingNumber}) Status Update: ${order.status}`,
        text: `Hello ${receiptData.userName},\n\nYour order #${receiptData.orderNumber} (Tracking: ${trackingNumber}) status has been updated to ${order.status}.\n${statusMessages[order.status] || ''}\n\nSupport: ${adminContactEmail}`,
        html,
        attachments: [
          {
            filename: `Receipt-${receiptData.orderNumber}.pdf`,
            content: pdfBuffer,
            contentType: 'application/pdf'
          }
        ]
      })
      userSent = res.success
    }

    let sysSent = false
    if (systemEmails.length > 0) {
      const sysRes = await this.dispatchMail({
        to: systemEmails.join(', '),
        subject: `[SYSTEM NOTIFICATION] Order #${receiptData.orderNumber} (${trackingNumber}) Status -> ${order.status}`,
        text: `Order #${receiptData.orderNumber} (Tracking: ${trackingNumber}) for ${receiptData.userName} (${customerRecipients.join(', ') || 'Guest'}) was updated to status: ${order.status}.`
      })
      sysSent = sysRes.success
    }

    const activityType: SystemActivityType =
      order.status === 'CANCELLED'
        ? 'ORDER_CANCELLED'
        : order.status === 'REFUNDED'
        ? 'ORDER_REFUNDED'
        : 'ORDER_STATUS_UPDATED'

    this.recordActivity({
      type: activityType,
      title: `Order #${receiptData.orderNumber} -> ${order.status}`,
      message: `Status updated to ${order.status} for ${receiptData.userName} (${targetEmail || 'Customer'}).`,
      userEmail: targetEmail,
      orderNumber: receiptData.orderNumber,
      amount: Number(order.total || 0),
      emailDispatched: userSent,
      systemMailDispatched: sysSent
    })

    return { success: userSent || sysSent }
  }

  /**
   * Records a client LiveChat support inquiry in the Real-Time System Activity feed
   * and dispatches an SMTP notification to the system support email.
   */
  async sendSupportInquiryAlert(session: any, clientMessage: string): Promise<void> {
    const visitorLabel = session.visitorName || 'Store Visitor'
    const contactInfo = session.visitorEmail || session.visitorPhone || 'Anonymous Visitor'
    const topic = session.topic || 'General Inquiry'
    const selectedList = Array.isArray(session.selectedProducts) && session.selectedProducts.length > 0
      ? session.selectedProducts.map((p: any) => `${p.name} ($${Number(p.price || 0).toLocaleString()})`).join(', ')
      : 'None selected'

    const { systemEmails } = this.getTransporter()
    let sysSent = false

    // Dispatch SMTP alert on initial inquiries or follow-ups after inactivity unless an admin is actively chatting
    const clientMessages = (session.messages || []).filter((m: any) => m.senderRole === 'CLIENT')
    const clientMsgCount = clientMessages.length
    const prevClientMsg = clientMessages.length >= 2 ? clientMessages[clientMessages.length - 2] : null
    const idleSincePrevClientMs = prevClientMsg
      ? Date.now() - new Date(prevClientMsg.createdAt).getTime()
      : Infinity
    const latestAdminMsg = (session.messages || [])
      .slice()
      .reverse()
      .find((m: any) => m.senderRole === 'ADMIN')
    const adminActiveLast5m =
      Boolean(latestAdminMsg) &&
      Date.now() - new Date(latestAdminMsg.createdAt).getTime() < 5 * 60 * 1000
    const shouldEmailAdminAlert =
      clientMsgCount <= 2 ||
      (!adminActiveLast5m && idleSincePrevClientMs >= 3 * 60 * 1000)

    if (systemEmails.length > 0 && shouldEmailAdminAlert) {
      const safeVisitor = escapeHtml(visitorLabel)
      const safeContact = escapeHtml(contactInfo)
      const safeTopic = escapeHtml(topic)
      const safeSelected = escapeHtml(selectedList)
      const safeClientMsg = escapeHtml(clientMessage)
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #58b970; border-radius: 12px; overflow: hidden;">
          <div style="background-color: #111318; color: #ffffff; padding: 18px 24px;">
            <span style="background-color: #58b970; color: #000000; font-size: 10px; font-weight: 800; padding: 3px 8px; border-radius: 9999px; text-transform: uppercase;">Support Inquiry</span>
            <h2 style="margin: 8px 0 0; font-size: 18px; color: #ffffff;">${safeVisitor} • ${safeTopic}</h2>
          </div>
          <div style="padding: 20px 24px; font-size: 13px; line-height: 1.6; color: #111827;">
            <p><strong>Visitor Name:</strong> ${safeVisitor}</p>
            <p><strong>Visitor Contact:</strong> ${safeContact}</p>
            <p><strong>Selected Topic:</strong> ${safeTopic}</p>
            <p><strong>Selected Products:</strong> ${safeSelected}</p>
            <div style="margin-top: 14px; padding: 12px 16px; background-color: #f9fafb; border-left: 4px solid #58b970; border-radius: 6px;">
              <strong>Customer Message:</strong><br/>${safeClientMsg}
            </div>
            <p style="font-size: 12px; color: #6b7280; margin-top: 16px;">Open the <strong>Admin Portal &rarr; Support Tab</strong> on DriveFlyElectric to reply live.</p>
          </div>
        </div>
      `
      const sysRes = await this.dispatchMail({
        to: systemEmails.join(', '),
        replyTo: isValidEmailAddress(session.visitorEmail) ? session.visitorEmail.trim() : undefined,
        subject: `[LIVECHAT INQUIRY] ${topic} from ${visitorLabel} (${contactInfo})`,
        text: `LiveChat Inquiry (${topic})\nVisitor: ${visitorLabel} (${contactInfo})\nSelected Rigs: ${selectedList}\nMessage: ${clientMessage}`,
        html
      })
      sysSent = sysRes.success
    }

    this.recordActivity({
      type: 'SUPPORT_INQUIRY',
      title: `LiveChat Inquiry (${topic}) • ${visitorLabel}`,
      message: `"${clientMessage.slice(0, 120)}" ${selectedList !== 'None selected' ? `[Rigs: ${selectedList}]` : ''}`,
      userEmail: session.visitorEmail || undefined,
      metadata: {
        sessionId: session.id,
        userId: session.userId || undefined
      },
      emailDispatched: false,
      systemMailDispatched: sysSent
    })
  }

  /**
   * Dispatches an email copy of an Admin's LiveChat reply to the client (if visitorEmail is known)
   * and logs the reply to the Real-Time System Activity stream.
   */
  async sendSupportReplyNotification(session: any, replyContent: string, adminName: string): Promise<void> {
    const visitorLabel = session.visitorName || 'Valued Customer'
    const targetEmail = (session.visitorEmail || '').trim()
    const { adminContactEmail } = this.getTransporter()
    let userSent = false

    if (isValidEmailAddress(targetEmail)) {
      const storeUrl = process.env.PRODUCTION_URL || process.env.PRODUCTION_url || 'https://driveflyelectric.shop'
      const safeVisitor = escapeHtml(visitorLabel)
      const safeAdmin = escapeHtml(adminName)
      const safeTopic = escapeHtml(session.topic || 'General Inquiry')
      const safeReply = escapeHtml(replyContent)
      const safeUrl = escapeHtml(storeUrl)
      const safeSupportEmail = escapeHtml(adminContactEmail)
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
          <div style="background-color: #111318; color: #ffffff; padding: 20px 24px;">
            <span style="background-color: #58b970; color: #000000; font-size: 10px; font-weight: 800; padding: 3px 8px; border-radius: 9999px; text-transform: uppercase;">Support Reply</span>
            <h2 style="margin: 8px 0 0; font-size: 19px; color: #76cf89;">DriveFlyElectric Support Specialist Replied</h2>
          </div>
          <div style="padding: 24px; font-size: 14px; line-height: 1.6; color: #111827;">
            <p>Hello <strong>${safeVisitor}</strong>,</p>
            <p>Our support specialist (<strong>${safeAdmin}</strong>) has replied to your <strong>${safeTopic}</strong> on <strong>DriveFlyElectric</strong>:</p>
            <div style="margin: 16px 0; padding: 16px; background-color: #f9fafb; border-left: 4px solid #58b970; border-radius: 8px; font-size: 14px;">
              ${safeReply}
            </div>
            <p>You can continue chatting in real time using the Support button on <a href="${safeUrl}" style="color: #429b58; font-weight: bold;">${safeUrl}</a> or contact us directly at <a href="mailto:${safeSupportEmail}" style="color: #429b58; font-weight: bold;">${safeSupportEmail}</a>.</p>
          </div>
        </div>
      `
      const mailRes = await this.dispatchMail({
        to: targetEmail,
        subject: `DriveFlyElectric Support Reply - ${session.topic || 'Your Inquiry'}`,
        text: `Hello ${visitorLabel},\n\n${adminName} replied to your inquiry on DriveFlyElectric:\n\n"${replyContent}"\n\nContinue chatting at: ${storeUrl}\nDirect Admin Support: ${adminContactEmail}`,
        html
      })
      userSent = mailRes.success
    }

    this.recordActivity({
      type: 'SUPPORT_REPLY',
      title: `Support Reply Sent • To ${visitorLabel}`,
      message: `${adminName}: "${replyContent.slice(0, 120)}"`,
      userEmail: targetEmail || undefined,
      metadata: {
        sessionId: session.id,
        userId: session.userId || undefined
      },
      emailDispatched: userSent,
      systemMailDispatched: false
    })
  }

  async sendBookingNotifications(booking: any, product?: any): Promise<void> {
    const productName = product?.name || booking.product?.name || 'Upcoming Model'
    const safeRef = escapeHtml(booking.bookingReference)
    const safeName = escapeHtml(booking.fullName)
    const safeProduct = escapeHtml(productName)
    const safeEmail = escapeHtml(booking.email)
    const safePhone = escapeHtml(booking.phone || 'N/A')
    const safeCountry = escapeHtml(booking.country || 'United States')
    const safeQty = escapeHtml(booking.quantity || 1)
    const safeNotes = escapeHtml(booking.notes || 'None')
    const storeUrl = escapeHtml(process.env.PRODUCTION_URL || process.env.PRODUCTION_url || 'https://driveflyelectric.shop')

    const { adminContactEmail, systemEmails } = this.getTransporter()
    let userSent = false
    if (isValidEmailAddress(booking.email)) {
      const customerHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
          <div style="background-color: #111318; color: #ffffff; padding: 20px 24px;">
            <span style="background-color: #58b970; color: #000000; font-size: 10px; font-weight: 800; padding: 3px 8px; border-radius: 9999px; text-transform: uppercase;">Priority Reservation Confirmed</span>
            <h2 style="margin: 10px 0 0; font-size: 20px; color: #ffffff;">Coming Soon Booking • ${safeRef}</h2>
          </div>
          <div style="padding: 24px; font-size: 14px; line-height: 1.6; color: #111827;">
            <p>Hello <strong>${safeName}</strong>,</p>
            <p>We have received your priority reservation for <strong>${safeProduct}</strong> (Quantity: <strong>${safeQty}</strong>).</p>
            <div style="background-color: #f2fbf4; border: 1px solid #9de0ab; border-radius: 8px; padding: 14px; margin: 16px 0;">
              <div><strong>Booking Reference:</strong> <span style="font-family: monospace;">${safeRef}</span></div>
              <div><strong>Destination Country:</strong> ${safeCountry}</div>
              <div><strong>Status:</strong> Priority Release Queue</div>
            </div>
            <p>No payment has been charged for this reservation. Our specialist team will notify you first as soon as build slots open.</p>
            <p style="font-size: 12px; color: #6b7280;">Explore our fleet anytime at <a href="${storeUrl}" style="color: #429b58;">${storeUrl}</a> or email <a href="mailto:${escapeHtml(adminContactEmail)}" style="color: #429b58;">${escapeHtml(adminContactEmail)}</a>.</p>
          </div>
        </div>
      `
      const userRes = await this.dispatchMail({
        to: booking.email,
        subject: `Reservation Confirmed (${booking.bookingReference}) - ${productName}`,
        text: `Hello ${booking.fullName},\n\nYour reservation (${booking.bookingReference}) for ${productName} (Qty: ${booking.quantity}) is confirmed. We will notify you first when inventory opens.\n\nSupport: ${adminContactEmail}`,
        html: customerHtml
      })
      userSent = userRes.success
    }

    let sysSent = false
    if (systemEmails.length > 0) {
      const adminHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #58b970; border-radius: 12px; overflow: hidden;">
          <div style="background-color: #111318; color: #ffffff; padding: 18px 24px;">
            <h2 style="margin: 0; font-size: 18px; color: #76cf89;">New Coming Soon Reservation • ${safeRef}</h2>
          </div>
          <div style="padding: 20px 24px; font-size: 13px; line-height: 1.6; color: #111827;">
            <p><strong>Product:</strong> ${safeProduct}</p>
            <p><strong>Quantity:</strong> ${safeQty}</p>
            <p><strong>Customer:</strong> ${safeName} (${safeEmail})</p>
            <p><strong>Phone / WhatsApp:</strong> ${safePhone}</p>
            <p><strong>Country:</strong> ${safeCountry}</p>
            <p><strong>Notes:</strong> ${safeNotes}</p>
          </div>
        </div>
      `
      const sysRes = await this.dispatchMail({
        to: systemEmails.join(', '),
        replyTo: isValidEmailAddress(booking.email) ? booking.email.trim() : undefined,
        subject: `[RESERVATION] ${booking.bookingReference} - ${productName} (${booking.fullName})`,
        text: `New Booking ${booking.bookingReference}\nProduct: ${productName}\nQty: ${booking.quantity}\nCustomer: ${booking.fullName} (${booking.email})\nPhone: ${booking.phone || 'N/A'}\nCountry: ${booking.country}\nNotes: ${booking.notes || 'None'}`,
        html: adminHtml
      })
      sysSent = sysRes.success
    }

    this.recordActivity({
      type: 'PRODUCT_BOOKING_CREATED',
      title: `Coming Soon Booking • ${booking.bookingReference}`,
      message: `${booking.fullName} (${booking.email}) reserved ${booking.quantity}x ${productName}.`,
      userEmail: booking.email,
      metadata: {
        bookingId: booking.id,
        bookingReference: booking.bookingReference,
        productId: booking.productId
      },
      emailDispatched: userSent,
      systemMailDispatched: sysSent
    })
  }

  async sendBookingStatusNotification(booking: ProductBooking): Promise<void> {
    const productName = booking.product?.name || 'Upcoming DriveFlyElectric Model'
    const { adminContactEmail, systemEmails } = this.getTransporter()

    const statusCopy: Record<ProductBooking['status'], string> = {
      PENDING: 'Your priority reservation remains active in our queue.',
      CONFIRMED: 'Your priority reservation slot has been confirmed by our Austin allocations desk.',
      NOTIFIED: 'Build allocation is now open for your reserved vehicle! Our team has reached out with next steps.',
      CANCELLED: 'Your Coming Soon reservation request has been cancelled as requested.'
    }

    let userSent = false
    if (booking.status !== 'PENDING' && isValidEmailAddress(booking.email)) {
      const safeRef = escapeHtml(booking.bookingReference)
      const safeName = escapeHtml(booking.fullName)
      const safeProduct = escapeHtml(productName)
      const safeStatus = escapeHtml(booking.status)
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
          <div style="background-color: #111318; color: #ffffff; padding: 20px 24px;">
            <span style="background-color: #58b970; color: #000000; font-size: 10px; font-weight: 800; padding: 3px 8px; border-radius: 9999px; text-transform: uppercase;">Reservation Update</span>
            <h2 style="margin: 10px 0 0; font-size: 20px; color: #ffffff;">${safeProduct} • ${safeRef}</h2>
          </div>
          <div style="padding: 24px; font-size: 14px; line-height: 1.6; color: #111827;">
            <p>Hello <strong>${safeName}</strong>,</p>
            <p>Your Coming Soon reservation <strong>${safeRef}</strong> for <strong>${safeProduct}</strong> (Qty: ${escapeHtml(booking.quantity)}) has been updated to: <strong style="color: #429b58;">${safeStatus}</strong>.</p>
            <p>${escapeHtml(statusCopy[booking.status])}</p>
            <p style="font-size: 12px; color: #6b7280; margin-top: 20px;">Questions? Contact our allocations team at <a href="mailto:${escapeHtml(adminContactEmail)}" style="color: #429b58;">${escapeHtml(adminContactEmail)}</a>.</p>
          </div>
        </div>
      `
      const mailRes = await this.dispatchMail({
        to: booking.email,
        subject: `Reservation ${booking.bookingReference} Update (${booking.status}) - ${productName}`,
        text: `Hello ${booking.fullName},\n\nYour reservation ${booking.bookingReference} for ${productName} is now ${booking.status}.\n${statusCopy[booking.status]}\n\nSupport: ${adminContactEmail}`,
        html
      })
      userSent = mailRes.success
    }

    let sysSent = false
    if (systemEmails.length > 0 && booking.status !== 'PENDING') {
      const sysRes = await this.dispatchMail({
        to: systemEmails.join(', '),
        subject: `[RESERVATION UPDATE] ${booking.bookingReference} -> ${booking.status}`,
        text: `Reservation ${booking.bookingReference} (${productName}) for ${booking.fullName} (${booking.email}) updated to ${booking.status}.`
      })
      sysSent = sysRes.success
    }

    this.recordActivity({
      type: 'PRODUCT_BOOKING_UPDATED',
      title: `Booking ${booking.bookingReference} -> ${booking.status}`,
      message: `${booking.fullName} (${booking.email}) reservation for ${productName} updated to ${booking.status}.`,
      userEmail: booking.email,
      metadata: {
        bookingId: booking.id,
        bookingReference: booking.bookingReference,
        status: booking.status
      },
      emailDispatched: userSent,
      systemMailDispatched: sysSent
    })
  }

  async sendReviewSubmittedNotification(review: ProductReview, product: Product): Promise<void> {
    const { systemEmails } = this.getTransporter()
    let sysSent = false

    if (systemEmails.length > 0) {
      const safeProduct = escapeHtml(product.name)
      const safeReviewer = escapeHtml(review.reviewerName || 'Verified Buyer')
      const safeEmail = escapeHtml(review.reviewerEmail || 'Not provided')
      const safeTitle = escapeHtml(review.title || 'Customer Feedback')
      const safeComment = escapeHtml(review.comment || '')
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #58b970; border-radius: 12px; overflow: hidden;">
          <div style="background-color: #111318; color: #ffffff; padding: 18px 24px;">
            <span style="background-color: #58b970; color: #000000; font-size: 10px; font-weight: 800; padding: 3px 8px; border-radius: 9999px; text-transform: uppercase;">New Product Review • ${review.rating}/5 Stars</span>
            <h2 style="margin: 8px 0 0; font-size: 18px; color: #ffffff;">${safeProduct}</h2>
          </div>
          <div style="padding: 20px 24px; font-size: 13px; line-height: 1.6; color: #111827;">
            <p><strong>Reviewer:</strong> ${safeReviewer} (${safeEmail})</p>
            <p><strong>Rating:</strong> ${review.rating} / 5</p>
            <p><strong>Headline:</strong> ${safeTitle}</p>
            <div style="margin-top: 12px; padding: 12px 16px; background-color: #f9fafb; border-left: 4px solid #58b970; border-radius: 6px;">
              ${safeComment}
            </div>
          </div>
        </div>
      `
      const sysRes = await this.dispatchMail({
        to: systemEmails.join(', '),
        replyTo: isValidEmailAddress(review.reviewerEmail) ? review.reviewerEmail.trim() : undefined,
        subject: `[NEW REVIEW] ${review.rating}/5 ★ on ${product.name} by ${review.reviewerName}`,
        text: `New ${review.rating}/5 review on ${product.name}\nReviewer: ${review.reviewerName}\nTitle: ${review.title || 'N/A'}\nComment: ${review.comment}`,
        html
      })
      sysSent = sysRes.success
    }

    this.recordActivity({
      type: 'PRODUCT_REVIEW_SUBMITTED',
      title: `New ${review.rating}★ Review • ${product.name}`,
      message: `${review.reviewerName}: "${(review.comment || '').slice(0, 110)}"`,
      userEmail: review.reviewerEmail || undefined,
      metadata: {
        productId: product.id,
        reviewId: review.id,
        rating: review.rating
      },
      emailDispatched: false,
      systemMailDispatched: sysSent
    })
  }

  async recordPaymentFailure(context: {
    gateway: 'STRIPE' | 'PAYPAL'
    stage: string
    amount?: number
    userEmail?: string
    referenceId?: string
    reason: string
    notifySystem?: boolean
  }): Promise<void> {
    const { systemEmails } = this.getTransporter()
    let sysSent = false

    if (context.notifySystem !== false && systemEmails.length > 0) {
      const safeGateway = escapeHtml(context.gateway)
      const safeStage = escapeHtml(context.stage)
      const safeReason = escapeHtml(context.reason)
      const safeEmail = escapeHtml(context.userEmail || 'Guest / Unknown')
      const safeRef = escapeHtml(context.referenceId || 'N/A')
      const amountLabel = context.amount ? `$${Number(context.amount).toFixed(2)} USD` : 'N/A'

      const sysRes = await this.dispatchMail({
        to: systemEmails.join(', '),
        subject: `[PAYMENT ALERT] ${context.gateway} ${context.stage} Failed (${amountLabel})`,
        text: `Payment Failure Alert\nGateway: ${context.gateway}\nStage: ${context.stage}\nCustomer: ${context.userEmail || 'Unknown'}\nAmount: ${amountLabel}\nReference: ${context.referenceId || 'N/A'}\nReason: ${context.reason}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #ef4444; border-radius: 12px; overflow: hidden;">
            <div style="background-color: #111318; color: #ffffff; padding: 18px 24px;">
              <span style="background-color: #ef4444; color: #ffffff; font-size: 10px; font-weight: 800; padding: 3px 8px; border-radius: 9999px; text-transform: uppercase;">Payment Failure Alert</span>
              <h2 style="margin: 8px 0 0; font-size: 18px; color: #fca5a5;">${safeGateway} • ${safeStage}</h2>
            </div>
            <div style="padding: 20px 24px; font-size: 13px; line-height: 1.6; color: #111827;">
              <p><strong>Customer Email:</strong> ${safeEmail}</p>
              <p><strong>Amount:</strong> ${escapeHtml(amountLabel)}</p>
              <p><strong>Gateway Ref:</strong> <code>${safeRef}</code></p>
              <p><strong>Failure Reason:</strong> ${safeReason}</p>
            </div>
          </div>
        `
      })
      sysSent = sysRes.success
    }

    this.recordActivity({
      type: 'PAYMENT_FAILED',
      title: `${context.gateway} Payment Failed • ${context.stage}`,
      message: `${context.reason}${context.referenceId ? ` (Ref: ${context.referenceId})` : ''}`,
      userEmail: context.userEmail,
      amount: context.amount,
      metadata: {
        gateway: context.gateway,
        stage: context.stage,
        referenceId: context.referenceId
      },
      emailDispatched: false,
      systemMailDispatched: sysSent
    })
  }

  /**
   * Sends a progressive unpaid-cart reminder email (1h, 6h, 12h, 24h, 48h, or 72h).
   */
  async sendUnpaidCartReminderEmail(reminder: CartReminderRecord, stageHours: number): Promise<boolean> {
    if (!isValidEmailAddress(reminder.email) || !Array.isArray(reminder.items) || reminder.items.length === 0) {
      return false
    }

    const { adminContactEmail } = this.getTransporter()
    const storeUrl = (process.env.PRODUCTION_URL || process.env.PRODUCTION_url || 'https://driveflyelectric.shop').replace(/\/+$/, '')
    const checkoutUrl = `${storeUrl}/checkout`

    const primaryItem = reminder.items[0]
    const extraCount = reminder.items.length - 1
    const itemHeadline =
      extraCount > 0 ? `${primaryItem.name} (+${extraCount} more)` : primaryItem.name

    const stageCopyMap: Record<number, { subjectPrefix: string; badge: string; headline: string; intro: string }> = {
      1: {
        subjectPrefix: 'Did you forget something?',
        badge: '1-Hour Cart Reminder',
        headline: 'Your Electric Mobility Setup Is Still Reserved',
        intro: 'We noticed you stepped away before completing checkout. Your selected vehicles are still sitting safely in your cart.'
      },
      6: {
        subjectPrefix: 'Still thinking it over?',
        badge: '6-Hour Cart Reminder',
        headline: 'Pick Up Right Where You Left Off',
        intro: 'Your selected DriveFlyElectric items are ready whenever you are—with Free Worldwide Express Crated Shipping included.'
      },
      12: {
        subjectPrefix: '12-Hour Checkout Reminder:',
        badge: '12-Hour Notice',
        headline: 'Your Unpaid Cart Items Are Waiting',
        intro: 'Complete your order anytime with PayPal, Hosted Card Checkout, or Stripe Direct Card—every order includes an official PDF receipt and tracking number.'
      },
      24: {
        subjectPrefix: '24-Hour Cart Hold Reminder:',
        badge: '24-Hour Hold',
        headline: 'Friendly 24-Hour Checkout Reminder',
        intro: 'High-demand builds move quickly from our Austin fulfillment hub. Complete checkout to lock in current inventory allocation.'
      },
      48: {
        subjectPrefix: '48-Hour Notice — Cart Expiring Soon:',
        badge: '48-Hour Final Hold',
        headline: 'Your Cart Allocation May Release Soon',
        intro: 'It has been 48 hours since you updated your cart. Return now to secure current stock and free crated freight.'
      },
      72: {
        subjectPrefix: 'Final 72-Hour Reminder:',
        badge: 'Final 72-Hour Notice',
        headline: 'Last Reminder for Your Unpaid Cart',
        intro: 'This is our final reminder after 72 hours. Click below whenever you are ready to finish checkout, or reach our concierge desk with any questions.'
      }
    }

    const copy = stageCopyMap[stageHours] || stageCopyMap[1]
    const greetingName = reminder.customerName || 'Valued Customer'
    const formattedSubtotal = `$${Number(reminder.subtotal || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`

    const itemsRowsHtml = reminder.items
      .map((item) => {
        const lineTotal = Number(item.price || 0) * Number(item.quantity || 1)
        return `
          <tr>
            <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #111827;">${escapeHtml(item.name)}</td>
            <td style="padding: 10px 8px; border-bottom: 1px solid #e5e7eb; text-align: center; color: #374151;">${escapeHtml(item.quantity)}</td>
            <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb; text-align: right; font-weight: 700; color: #111827;">$${escapeHtml(lineTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}</td>
          </tr>
        `
      })
      .join('')

    const itemsText = reminder.items
      .map((it) => `- ${it.name} (Qty: ${it.quantity}) — $${(Number(it.price || 0) * Number(it.quantity || 1)).toFixed(2)}`)
      .join('\n')

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #111827; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
        <div style="background-color: #111318; color: #ffffff; padding: 24px;">
          <span style="background-color: #58b970; color: #000000; font-size: 11px; font-weight: 800; padding: 4px 10px; border-radius: 9999px; text-transform: uppercase;">${escapeHtml(copy.badge)}</span>
          <h1 style="margin: 12px 0 4px; font-size: 21px; color: #ffffff;">${escapeHtml(copy.headline)}</h1>
        </div>
        <div style="padding: 24px; font-size: 14px; line-height: 1.6;">
          <p>Hello <strong>${escapeHtml(greetingName)}</strong>,</p>
          <p>${escapeHtml(copy.intro)}</p>
          <table style="width: 100%; border-collapse: collapse; margin: 18px 0; font-size: 13px;">
            <thead>
              <tr style="border-bottom: 2px solid #111318; text-align: left; color: #6b7280; font-size: 11px; text-transform: uppercase;">
                <th style="padding-bottom: 8px;">Vehicle / Item</th>
                <th style="padding-bottom: 8px; text-align: center;">Qty</th>
                <th style="padding-bottom: 8px; text-align: right;">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              ${itemsRowsHtml}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="2" style="padding-top: 12px; font-weight: 700;">Cart Total (before 5% tax, FREE Express Shipping)</td>
                <td style="padding-top: 12px; text-align: right; font-weight: 800; color: #429b58; font-size: 16px;">${escapeHtml(formattedSubtotal)} USD</td>
              </tr>
            </tfoot>
          </table>
          <div style="margin: 24px 0; text-align: center;">
            <a href="${escapeHtml(checkoutUrl)}" style="background-color: #58b970; color: #000000; font-weight: 800; text-decoration: none; padding: 13px 28px; border-radius: 8px; display: inline-block; text-transform: uppercase; font-size: 13px;">Complete Checkout Now</a>
          </div>
          <p style="font-size: 12px; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 16px;">Questions about shipping, specs, or payment options? Reply to our team at <a href="mailto:${escapeHtml(adminContactEmail)}" style="color: #429b58; font-weight: 600;">${escapeHtml(adminContactEmail)}</a>.</p>
        </div>
      </div>
    `

    const mailRes = await this.dispatchMail({
      to: reminder.email,
      subject: `${copy.subjectPrefix} ${itemHeadline} — DriveFlyElectric`,
      text: `Hello ${greetingName},\n\n${copy.intro}\n\nUnpaid Cart Items:\n${itemsText}\n\nSubtotal: ${formattedSubtotal} USD\nComplete checkout: ${checkoutUrl}\n\nQuestions? Contact ${adminContactEmail}`,
      html
    })

    if (mailRes.success) {
      this.recordActivity({
        type: 'CART_REMINDER_SENT',
        title: `${stageHours}h Cart Reminder Sent • ${itemHeadline}`,
        message: `Unpaid cart reminder (${stageHours}h milestone) dispatched to ${reminder.email} for ${formattedSubtotal} USD.`,
        userEmail: reminder.email,
        amount: reminder.subtotal,
        metadata: {
          stageHours,
          reminderKey: reminder.reminderKey,
          itemCount: reminder.itemCount
        },
        emailDispatched: true,
        systemMailDispatched: false
      })
    }

    return mailRes.success
  }

  /**
   * Evaluates active unpaid carts against the 1h, 6h, 12h, 24h, 48h, and 72h schedule.
   */
  public async processDueCartReminders(): Promise<number> {
    if (this.cartReminderSweepRunning) return 0
    const { isConfigured } = this.getTransporter()
    if (!isConfigured) return 0

    this.cartReminderSweepRunning = true
    let sentCount = 0
    try {
      const activeReminders = await databaseService.listActiveCartReminders(200)
      const nowMs = Date.now()

      for (const reminder of activeReminders) {
        if (!isValidEmailAddress(reminder.email) || reminder.items.length === 0) continue

        // Double-check authenticated users didn't complete an order after cart update
        if (reminder.userId) {
          const recentOrders = await databaseService.findOrders({ userId: reminder.userId, limit: 3 }).catch(() => [])
          const cartUpdatedMs = new Date(reminder.cartUpdatedAt).getTime()
          const paidOrder = recentOrders.find(
            (ord) => ord.paymentStatus === 'COMPLETED' && new Date(ord.createdAt).getTime() >= cartUpdatedMs
          )
          if (paidOrder) {
            await databaseService.markCartRemindersInactive({
              userId: reminder.userId,
              email: reminder.email,
              status: 'COMPLETED',
              orderNumber: paidOrder.orderNumber
            })
            continue
          }
        }

        const cartAgeHours = (nowMs - new Date(reminder.cartUpdatedAt).getTime()) / (1000 * 60 * 60)
        const sentSet = new Set(reminder.sentStages || [])
        const dueStages = UNPAID_CART_REMINDER_STAGES_HOURS.filter(
          (hours) => !sentSet.has(hours) && cartAgeHours >= hours
        )
        if (dueStages.length === 0) continue

        // Send only the highest due milestone so restarts never burst multiple reminders at once
        const latestDueStage = Math.max(...dueStages)
        const sentOk = await this.sendUnpaidCartReminderEmail(reminder, latestDueStage)
        if (sentOk) {
          sentCount += 1
          const nextSentStages = Array.from(
            new Set([
              ...reminder.sentStages,
              ...UNPAID_CART_REMINDER_STAGES_HOURS.filter((h) => h <= latestDueStage)
            ])
          ).sort((a, b) => a - b)

          await databaseService.updateCartReminderProgress(reminder.reminderKey, {
            sentStages: nextSentStages,
            lastSentStage: latestDueStage,
            lastRemindedAt: new Date(nowMs),
            status: latestDueStage >= 72 ? 'EXPIRED' : 'ACTIVE'
          })
        }
      }
    } catch (err) {
      console.error('Cart reminder scheduler sweep error:', err)
    } finally {
      this.cartReminderSweepRunning = false
    }

    return sentCount
  }

  public startCartReminderScheduler(): void {
    this.stopCartReminderScheduler()
    const FIVE_MINUTES_MS = 5 * 60 * 1000
    const STARTUP_DELAY_MS = 45 * 1000

    this.cartReminderStartupTimer = setTimeout(() => {
      this.processDueCartReminders().catch(() => {})
    }, STARTUP_DELAY_MS)
    if (typeof this.cartReminderStartupTimer.unref === 'function') {
      this.cartReminderStartupTimer.unref()
    }

    this.cartReminderTimer = setInterval(() => {
      this.processDueCartReminders().catch(() => {})
    }, FIVE_MINUTES_MS)
    if (typeof this.cartReminderTimer.unref === 'function') {
      this.cartReminderTimer.unref()
    }
  }

  public stopCartReminderScheduler(): void {
    if (this.cartReminderStartupTimer) {
      clearTimeout(this.cartReminderStartupTimer)
      this.cartReminderStartupTimer = null
    }
    if (this.cartReminderTimer) {
      clearInterval(this.cartReminderTimer)
      this.cartReminderTimer = null
    }
  }
}

export const emailService = new EmailService()
