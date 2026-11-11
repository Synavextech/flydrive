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
    | 'USER_REGISTERED'
    | 'USER_LOGIN'
    | 'ORDER_STATUS_UPDATED'
    | 'ORDER_CANCELLED'
    | 'PRODUCT_UPDATED'
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
    if (userRecipients.length > 0) {
      const userHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #111827; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
          <div style="background-color: #111318; color: #ffffff; padding: 24px;">
            <span style="background-color: #f59e0b; color: #000000; font-size: 11px; font-weight: 800; padding: 4px 10px; border-radius: 9999px; text-transform: uppercase;">Payment Verified & Settled</span>
            <h1 style="margin: 12px 0 4px; font-size: 22px; color: #ffffff;">Order Confirmed • #${receiptData.orderNumber}</h1>
            <p style="margin: 0; font-size: 13px; color: #9ca3af;">DriveFlyElectric • Official Purchase Receipt (PDF Attached)</p>
          </div>
          <div style="padding: 24px;">
            <p style="font-size: 14px; line-height: 1.6;">Hello <strong>${receiptData.userName}</strong>,</p>
            <p style="font-size: 14px; line-height: 1.6;">Thank you for shopping with <strong>DriveFlyElectric</strong>. Your payment has been verified and your order is registered for express dispatch from our Nanshan, Shenzhen, Guangdong Province, China Warehouse. Your official generated <strong>PDF Receipt (Receipt-${receiptData.orderNumber}.pdf)</strong> is attached to this email.</p>

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

            <p style="font-size: 12px; color: #6b7280; margin-top: 20px;">Need assistance? Contact our 24/7 Customer Support team at <a href="mailto:info-eurotopmobility@driveflyelectric.shop" style="color: #d97706;">info-eurotopmobility@driveflyelectric.shop</a>.</p>
          </div>
        </div>
      `

      const userMailRes = await this.dispatchMail({
        to: userRecipients.join(', '),
        subject: `Official Purchase Receipt & Order Confirmation - #${receiptData.orderNumber}`,
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
        <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #111827; border: 1px solid #f59e0b; border-radius: 12px; overflow: hidden;">
          <div style="background-color: #111318; color: #ffffff; padding: 20px 24px;">
            <span style="background-color: #10b981; color: #000000; font-size: 11px; font-weight: 800; padding: 4px 10px; border-radius: 9999px; text-transform: uppercase;">Real-Time System Alert • Settled Purchase</span>
            <h2 style="margin: 10px 0 2px; font-size: 20px; color: #f59e0b;">New Purchase Order #${receiptData.orderNumber} (${receiptData.finalCost})</h2>
            <p style="margin: 0; font-size: 12px; color: #9ca3af;">Timestamp: ${new Date().toUTCString()}</p>
          </div>
          <div style="padding: 24px;">
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 13px;">
              <tr><td style="padding: 6px 0; color: #6b7280; width: 160px;">Customer Name:</td><td style="padding: 6px 0; font-weight: bold;">${receiptData.userName}</td></tr>
              <tr><td style="padding: 6px 0; color: #6b7280;">Account / User Email:</td><td style="padding: 6px 0; font-weight: bold;">${userRecipients.join(', ') || 'Guest Checkout'}</td></tr>
              <tr><td style="padding: 6px 0; color: #6b7280;">Payment Source:</td><td style="padding: 6px 0; font-weight: bold;">${receiptData.paymentSource}</td></tr>
              <tr><td style="padding: 6px 0; color: #6b7280;">Transaction ID:</td><td style="padding: 6px 0; font-family: monospace;">${receiptData.transactionId}</td></tr>
              <tr><td style="padding: 6px 0; color: #6b7280;">Settled Total (USD):</td><td style="padding: 6px 0; font-weight: bold; color: #059669;">${receiptData.finalCost}</td></tr>
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
          <span style="background-color: #f59e0b; color: #000000; font-size: 11px; font-weight: 800; padding: 4px 10px; border-radius: 9999px; text-transform: uppercase;">Account Active</span>
          <h1 style="margin: 12px 0 4px; font-size: 22px; color: #ffffff;">Welcome to DriveFlyElectric!</h1>
        </div>
        <div style="padding: 24px; font-size: 14px; line-height: 1.6;">
          <p>Hello <strong>${fullName}</strong>,</p>
          <p>Your account (<strong style="color: #d97706;">${user.email}</strong>) has been successfully created on <strong>DriveFlyElectric</strong>.</p>
          <p>All future purchase confirmations, official PDF receipts, and real-time order dispatch updates will be sent directly to this email address.</p>
          <div style="margin: 24px 0;">
            <a href="${storeUrl}" style="background-color: #f59e0b; color: #000000; font-weight: bold; text-decoration: none; padding: 12px 24px; border-radius: 8px; display: inline-block;">Explore Fleet Catalog</a>
          </div>
          <p style="font-size: 12px; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 16px;">Questions? Reach our 24/7 support desk at <a href="mailto:info-eurotopmobility@driveflyelectric.shop" style="color: #d97706;">info-eurotopmobility@driveflyelectric.shop</a>.</p>
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
            <h2 style="margin: 0; font-size: 18px; color: #f59e0b;">[System Activity] New User Account Registered</h2>
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
            <h2 style="margin: 0; font-size: 20px; color: #f59e0b;">Order Status Update • #${receiptData.orderNumber}</h2>
          </div>
          <div style="padding: 24px; font-size: 14px; line-height: 1.6;">
            <p>Hello <strong>${receiptData.userName}</strong>,</p>
            <p>The status of your order <strong>#${receiptData.orderNumber}</strong> has been updated to: <strong style="color: #d97706;">${order.status}</strong>.</p>
            <p>${statusMessages[order.status] || 'Your order status has been updated.'}</p>
            <p style="font-size: 12px; color: #6b7280; margin-top: 20px;">Your updated PDF purchase receipt is attached for your records.</p>
          </div>
        </div>
      `
      const res = await this.dispatchMail({
        to: targetEmail,
        subject: `Order #${receiptData.orderNumber} Status Update: ${order.status}`,
        text: `Hello ${receiptData.userName},\n\nYour order #${receiptData.orderNumber} status has been updated to ${order.status}.\n${statusMessages[order.status] || ''}`,
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
        subject: `[SYSTEM NOTIFICATION] Order #${receiptData.orderNumber} Status -> ${order.status}`,
        text: `Order #${receiptData.orderNumber} for ${receiptData.userName} (${targetEmail || 'Guest'}) was updated to status: ${order.status}.`
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
}

export const emailService = new EmailService()
