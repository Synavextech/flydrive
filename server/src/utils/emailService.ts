import nodemailer from 'nodemailer'
import dotenv from 'dotenv'
import { EventEmitter } from 'events'
import {
  buildReceiptDataFromOrder,
  generateReceiptPdfBuffer,
  generateReceiptText,
  ServerOrderReceiptData
} from './receiptPdf.js'

dotenv.config()

export interface SystemActivityEvent {
  id: string
  type:
    | 'ORDER_PURCHASED'
    | 'PAYMENT_AUTHORIZED'
    | 'PAYMENT_CAPTURED'
    | 'USER_REGISTERED'
    | 'USER_LOGIN'
    | 'ORDER_STATUS_UPDATED'
    | 'ORDER_CANCELLED'
    | 'PRODUCT_UPDATED'
    | 'SUPPORT_INQUIRY'
    | 'SUPPORT_REPLY'
  title: string
  message: string
  userEmail?: string
  orderNumber?: string
  amount?: number
  emailDispatched: boolean
  systemMailDispatched: boolean
  timestamp: string
}

class EmailService {
  public activityEmitter = new EventEmitter()
  private recentActivities: SystemActivityEvent[] = []

  constructor() {
    this.activityEmitter.setMaxListeners(100)
  }

  private getTransporter(): { transporter: nodemailer.Transporter | null; isConfigured: boolean; fromAddress: string; systemEmails: string[] } {
    const host = process.env.SMTP_HOST || 'smtp.gmail.com'
    const port = parseInt(process.env.SMTP_PORT || '587', 10)
    const secure =
      process.env.SMTP_SECURE === 'true' ||
      port === 465

    const smtpEmail = (process.env.SMTP_EMAIL || '').trim()
    const rawUser = (process.env.SMTP_USER || '').trim()
    const user = (rawUser.includes('@') ? rawUser : smtpEmail || rawUser).trim()
    const pass = (process.env.SMTP_PASS || process.env.SMTP_PASSWORD || '').trim()
    const senderEmail = (smtpEmail || (user.includes('@') ? user : 'info-eurotopmobility@driveflyelectric.shop')).trim()

    let fromAddress = (process.env.FROM_EMAIL || '').trim()
    if (!fromAddress || fromAddress.includes('<>')) {
      fromAddress = `DriveFlyElectric <${senderEmail}>`
    }

    const rawSystemEmails = [
      process.env.SYSTEM_NOTIFICATION_EMAIL,
      process.env.ADMIN_EMAIL,
      senderEmail,
      user,
      'info-eurotopmobility@driveflyelectric.shop'
    ]
      .filter(Boolean)
      .join(',')
      .split(',')
      .map((e) => e.trim())
      .filter((e) => e.includes('@'))

    const systemEmails = Array.from(new Set(rawSystemEmails))

    if (!user || !pass) {
      return {
        transporter: null,
        isConfigured: false,
        fromAddress,
        systemEmails
      }
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000
    })

    return {
      transporter,
      isConfigured: true,
      fromAddress,
      systemEmails
    }
  }

  public recordActivity(event: Omit<SystemActivityEvent, 'id' | 'timestamp'>): SystemActivityEvent {
    const fullEvent: SystemActivityEvent = {
      ...event,
      id: `act_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString()
    }
    this.recentActivities.unshift(fullEvent)
    if (this.recentActivities.length > 100) {
      this.recentActivities = this.recentActivities.slice(0, 100)
    }
    this.activityEmitter.emit('activity', fullEvent)
    return fullEvent
  }

  public getRecentActivities(limit: number = 25): SystemActivityEvent[] {
    return this.recentActivities.slice(0, limit)
  }

  private async dispatchMail(mailOptions: nodemailer.SendMailOptions): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const { transporter, isConfigured, fromAddress } = this.getTransporter()
    const finalOptions: nodemailer.SendMailOptions = {
      from: fromAddress,
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

    // Collect recipient user emails (declared account creation email + checkout shipping email if different)
    const userRecipients = Array.from(
      new Set(
        [
          customerContext?.accountEmail,
          customerContext?.shippingEmail,
          order.user?.email
        ]
          .filter(Boolean)
          .map((e) => String(e).trim())
          .filter((e) => e.includes('@'))
      )
    )

    const itemsHtml =
      receiptData.items && receiptData.items.length > 0
        ? receiptData.items
            .map(
              (item) => `
              <tr>
                <td style="padding: 8px 10px; border-bottom: 1px solid #e5e7eb; font-size: 13px;"><strong>${item.name}</strong></td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #e5e7eb; font-size: 13px; text-align: center;">${item.quantity}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #e5e7eb; font-size: 13px; text-align: right;">${item.price}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #e5e7eb; font-size: 13px; text-align: right; font-weight: bold;">${item.total}</td>
              </tr>`
            )
            .join('')
        : ''

    // 1. Send Purchase Confirmation + PDF Receipt to User Email
    let userEmailSent = false
    const trackingNumber = receiptData.trackingNumber || `TRK-${receiptData.orderNumber}`
    if (userRecipients.length > 0) {
      const userHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #111827; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
          <div style="background-color: #111318; color: #ffffff; padding: 24px;">
            <span style="background-color: #58b970; color: #000000; font-size: 11px; font-weight: 800; padding: 4px 10px; border-radius: 9999px; text-transform: uppercase;">Payment Verified & Settled</span>
            <h1 style="margin: 12px 0 4px; font-size: 22px; color: #ffffff;">Order Confirmed • #${receiptData.orderNumber}</h1>
            <p style="margin: 0; font-size: 13px; color: #9de0ab; font-weight: bold;">Shipment Tracking Number: ${trackingNumber}</p>
            <p style="margin: 4px 0 0; font-size: 12px; color: #9ca3af;">DriveFlyElectric • Official Purchase Receipt (PDF Attached)</p>
          </div>
          <div style="padding: 24px;">
            <p style="font-size: 14px; line-height: 1.6;">Hello <strong>${receiptData.userName}</strong>,</p>
            <p style="font-size: 14px; line-height: 1.6;">Thank you for shopping with <strong>DriveFlyElectric</strong>. Your payment has been verified and your order is registered for express dispatch from our Nanshan, Shenzhen, Guangdong Province, China Warehouse. Your official generated <strong>PDF Receipt (Receipt-${receiptData.orderNumber}.pdf)</strong> is attached to this email.</p>

            <div style="margin: 16px 0; padding: 14px 16px; background-color: #f2fbf4; border: 1px solid #9de0ab; border-radius: 10px;">
              <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #357c47; font-weight: 800;">Official Shipment Tracking Number</div>
              <div style="font-size: 18px; font-family: monospace; font-weight: 900; color: #111827; margin-top: 4px;">${trackingNumber}</div>
              <div style="font-size: 12px; color: #4b5563; margin-top: 4px;">Use the <strong>Track Order</strong> button on the top navigation bar at <a href="https://driveflyelectric.shop" style="color: #429b58; font-weight: bold;">driveflyelectric.shop</a> to monitor live transit updates.</div>
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
            <pre style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; font-family: 'Courier New', Courier, monospace; font-size: 12px; line-height: 1.5; white-space: pre-wrap; overflow-x: auto;">${receiptText}</pre>

            <p style="font-size: 12px; color: #6b7280; margin-top: 20px;">Need assistance? Contact our 24/7 Customer Support team at <a href="mailto:info-eurotopmobility@driveflyelectric.shop" style="color: #429b58;">info-eurotopmobility@driveflyelectric.shop</a>.</p>
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
    const { systemEmails } = this.getTransporter()
    let systemEmailSent = false
    if (systemEmails.length > 0) {
      const adminHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #111827; border: 1px solid #58b970; border-radius: 12px; overflow: hidden;">
          <div style="background-color: #111318; color: #ffffff; padding: 20px 24px;">
            <span style="background-color: #58b970; color: #000000; font-size: 11px; font-weight: 800; padding: 4px 10px; border-radius: 9999px; text-transform: uppercase;">Real-Time System Alert • Settled Purchase</span>
            <h2 style="margin: 10px 0 2px; font-size: 20px; color: #76cf89;">New Purchase Order #${receiptData.orderNumber} (${receiptData.finalCost})</h2>
            <p style="margin: 0; font-size: 12px; color: #9ca3af;">Tracking #: ${trackingNumber} • Timestamp: ${new Date().toUTCString()}</p>
          </div>
          <div style="padding: 24px;">
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 13px;">
              <tr><td style="padding: 6px 0; color: #6b7280; width: 160px;">Customer Name:</td><td style="padding: 6px 0; font-weight: bold;">${receiptData.userName}</td></tr>
              <tr><td style="padding: 6px 0; color: #6b7280;">Account / User Email:</td><td style="padding: 6px 0; font-weight: bold;">${userRecipients.join(', ') || 'Guest Checkout'}</td></tr>
              <tr><td style="padding: 6px 0; color: #6b7280;">Tracking Number:</td><td style="padding: 6px 0; font-family: monospace; font-weight: bold; color: #357c47;">${trackingNumber}</td></tr>
              <tr><td style="padding: 6px 0; color: #6b7280;">Payment Source:</td><td style="padding: 6px 0; font-weight: bold;">${receiptData.paymentSource}</td></tr>
              <tr><td style="padding: 6px 0; color: #6b7280;">Transaction ID:</td><td style="padding: 6px 0; font-family: monospace;">${receiptData.transactionId}</td></tr>
              <tr><td style="padding: 6px 0; color: #6b7280;">Settled Total (USD):</td><td style="padding: 6px 0; font-weight: bold; color: #429b58;">${receiptData.finalCost}</td></tr>
              <tr><td style="padding: 6px 0; color: #6b7280;">Shipping Address:</td><td style="padding: 6px 0;">${receiptData.address}</td></tr>
            </table>

            <h3 style="font-size: 13px; text-transform: uppercase; color: #374151;">Generated Receipt (PDF Attached)</h3>
            <pre style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px; font-family: 'Courier New', Courier, monospace; font-size: 11.5px; line-height: 1.45; white-space: pre-wrap;">${receiptText}</pre>
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
    const storeUrl = process.env.PRODUCTION_url || 'https://driveflyelectric.shop'

    // 1. Welcome email to the newly registered user
    const userHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #111827; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
        <div style="background-color: #111318; color: #ffffff; padding: 24px;">
          <span style="background-color: #58b970; color: #000000; font-size: 11px; font-weight: 800; padding: 4px 10px; border-radius: 9999px; text-transform: uppercase;">Account Active</span>
          <h1 style="margin: 12px 0 4px; font-size: 22px; color: #ffffff;">Welcome to DriveFlyElectric!</h1>
        </div>
        <div style="padding: 24px; font-size: 14px; line-height: 1.6;">
          <p>Hello <strong>${fullName}</strong>,</p>
          <p>Your account (<strong style="color: #429b58;">${user.email}</strong>) has been successfully created on <strong>DriveFlyElectric</strong>.</p>
          <p>All future purchase confirmations, official PDF receipts, and real-time order dispatch updates will be sent directly to this email address.</p>
          <div style="margin: 24px 0;">
            <a href="${storeUrl}" style="background-color: #58b970; color: #000000; font-weight: bold; text-decoration: none; padding: 12px 24px; border-radius: 8px; display: inline-block;">Explore Fleet Catalog</a>
          </div>
          <p style="font-size: 12px; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 16px;">Questions? Reach our 24/7 support desk at <a href="mailto:info-eurotopmobility@driveflyelectric.shop" style="color: #429b58;">info-eurotopmobility@driveflyelectric.shop</a>.</p>
        </div>
      </div>
    `

    const userRes = await this.dispatchMail({
      to: user.email,
      subject: `Welcome to DriveFlyElectric - Account Confirmed`,
      text: `Hello ${fullName},\n\nYour account (${user.email}) has been registered at DriveFlyElectric. All order confirmations and official PDF purchase receipts will be sent to this email.\n\nVisit: ${storeUrl}`,
      html: userHtml
    })

    // 2. Real-time system notification email to Admin/System mail
    const { systemEmails } = this.getTransporter()
    let sysSent = false
    if (systemEmails.length > 0) {
      const sysHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
          <div style="background-color: #111318; color: #ffffff; padding: 18px 24px;">
            <h2 style="margin: 0; font-size: 18px; color: #76cf89;">[System Activity] New User Account Registered</h2>
          </div>
          <div style="padding: 20px 24px; font-size: 13px; line-height: 1.6;">
            <p><strong>Name:</strong> ${fullName}</p>
            <p><strong>Declared Email:</strong> ${user.email}</p>
            <p><strong>Phone:</strong> ${user.phone || 'N/A'}</p>
            <p><strong>Registration Channel:</strong> ${source}</p>
            <p><strong>Timestamp:</strong> ${new Date().toUTCString()}</p>
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

  // Send order status update email to customer + system notification
  async sendOrderStatusUpdate(order: any, userEmail?: string) {
    const targetEmail = userEmail || order.user?.email
    const receiptData = buildReceiptDataFromOrder(order, { email: targetEmail })
    const trackingNumber = receiptData.trackingNumber || `TRK-${receiptData.orderNumber}`
    const pdfBuffer = generateReceiptPdfBuffer(receiptData)

    const statusMessages: { [key: string]: string } = {
      PENDING: 'Your order has been logged and is awaiting processing.',
      PROCESSING: 'Your order payment is settled and our warehouse team is preparing your vehicle for dispatch.',
      SHIPPED: 'Your order has been dispatched from our Nanshan, Shenzhen, Guangdong Province, China Warehouse!',
      DELIVERED: 'Your order has been marked as delivered. Thank you for riding & flying with DriveFlyElectric!',
      CANCELLED: 'Your order has been cancelled. Contact support if you have any questions.'
    }

    let userSent = false
    if (targetEmail) {
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
          <div style="background-color: #111318; color: #ffffff; padding: 20px 24px;">
            <h2 style="margin: 0; font-size: 20px; color: #76cf89;">Order Status Update • #${receiptData.orderNumber}</h2>
            <p style="margin: 4px 0 0; font-size: 12px; color: #9de0ab;">Tracking Number: <strong>${trackingNumber}</strong></p>
          </div>
          <div style="padding: 24px; font-size: 14px; line-height: 1.6;">
            <p>Hello <strong>${receiptData.userName}</strong>,</p>
            <p>The status of your order <strong>#${receiptData.orderNumber}</strong> (Tracking: <strong>${trackingNumber}</strong>) has been updated to: <strong style="color: #429b58;">${order.status}</strong>.</p>
            <p>${statusMessages[order.status] || 'Your order status has been updated.'}</p>
            <p style="font-size: 12px; color: #6b7280; margin-top: 20px;">Your updated PDF purchase receipt is attached for your records.</p>
          </div>
        </div>
      `
      const res = await this.dispatchMail({
        to: targetEmail,
        subject: `Order #${receiptData.orderNumber} (${trackingNumber}) Status Update: ${order.status}`,
        text: `Hello ${receiptData.userName},\n\nYour order #${receiptData.orderNumber} (Tracking: ${trackingNumber}) status has been updated to ${order.status}.\n${statusMessages[order.status] || ''}`,
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

    const { systemEmails } = this.getTransporter()
    let sysSent = false
    if (systemEmails.length > 0) {
      const sysRes = await this.dispatchMail({
        to: systemEmails.join(', '),
        subject: `[SYSTEM NOTIFICATION] Order #${receiptData.orderNumber} (${trackingNumber}) Status -> ${order.status}`,
        text: `Order #${receiptData.orderNumber} (Tracking: ${trackingNumber}) for ${receiptData.userName} (${targetEmail || 'Guest'}) was updated to status: ${order.status}.`
      })
      sysSent = sysRes.success
    }

    this.recordActivity({
      type: 'ORDER_STATUS_UPDATED',
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

    // Dispatch SMTP alert on first client message or when visitor provides email
    const clientMsgCount = (session.messages || []).filter((m: any) => m.senderRole === 'CLIENT').length
    if (systemEmails.length > 0 && (clientMsgCount <= 2 || session.visitorEmail)) {
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #58b970; border-radius: 12px; overflow: hidden;">
          <div style="background-color: #111318; color: #ffffff; padding: 18px 24px;">
            <span style="background-color: #58b970; color: #000000; font-size: 10px; font-weight: 800; padding: 3px 8px; border-radius: 9999px; text-transform: uppercase;">LiveChat Support Inquiry</span>
            <h2 style="margin: 8px 0 0; font-size: 18px; color: #ffffff;">${visitorLabel} • ${topic}</h2>
          </div>
          <div style="padding: 20px 24px; font-size: 13px; line-height: 1.6; color: #111827;">
            <p><strong>Visitor Name:</strong> ${visitorLabel}</p>
            <p><strong>Visitor Contact:</strong> ${contactInfo}</p>
            <p><strong>Selected Topic:</strong> ${topic}</p>
            <p><strong>Selected Catalogue Rigs:</strong> ${selectedList}</p>
            <div style="margin-top: 14px; padding: 12px 16px; background-color: #f9fafb; border-left: 4px solid #58b970; border-radius: 6px;">
              <strong>Client Message:</strong><br/>${clientMessage}
            </div>
            <p style="font-size: 12px; color: #6b7280; margin-top: 16px;">Open the <strong>Admin Dashboard &rarr; Support Tab</strong> on DriveFlyElectric to reply live.</p>
          </div>
        </div>
      `
      const sysRes = await this.dispatchMail({
        to: systemEmails.join(', '),
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
    let userSent = false

    if (targetEmail && targetEmail.includes('@')) {
      const storeUrl = process.env.PRODUCTION_url || 'https://driveflyelectric.shop'
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
          <div style="background-color: #111318; color: #ffffff; padding: 20px 24px;">
            <span style="background-color: #58b970; color: #000000; font-size: 10px; font-weight: 800; padding: 3px 8px; border-radius: 9999px; text-transform: uppercase;">Live Support Reply</span>
            <h2 style="margin: 8px 0 0; font-size: 19px; color: #76cf89;">DriveFlyElectric Support Specialist Replied</h2>
          </div>
          <div style="padding: 24px; font-size: 14px; line-height: 1.6; color: #111827;">
            <p>Hello <strong>${visitorLabel}</strong>,</p>
            <p>Our support specialist (<strong>${adminName}</strong>) has replied to your <strong>${session.topic || 'General Inquiry'}</strong> on <strong>DriveFlyElectric</strong>:</p>
            <div style="margin: 16px 0; padding: 16px; background-color: #f9fafb; border-left: 4px solid #58b970; border-radius: 8px; font-size: 14px;">
              ${replyContent}
            </div>
            <p>You can continue chatting in real time using the LiveChat button at the bottom-right of <a href="${storeUrl}" style="color: #429b58; font-weight: bold;">${storeUrl}</a> or reply directly to this email.</p>
          </div>
        </div>
      `
      const mailRes = await this.dispatchMail({
        to: targetEmail,
        subject: `DriveFlyElectric Support Reply - ${session.topic || 'Your Inquiry'}`,
        text: `Hello ${visitorLabel},\n\n${adminName} replied to your inquiry on DriveFlyElectric:\n\n"${replyContent}"\n\nContinue chatting at: ${storeUrl}`,
        html
      })
      userSent = mailRes.success
    }

    this.recordActivity({
      type: 'SUPPORT_REPLY',
      title: `Support Reply Sent • To ${visitorLabel}`,
      message: `${adminName}: "${replyContent.slice(0, 120)}"`,
      userEmail: targetEmail || undefined,
      emailDispatched: userSent,
      systemMailDispatched: true
    })
  }
}

export const emailService = new EmailService()
