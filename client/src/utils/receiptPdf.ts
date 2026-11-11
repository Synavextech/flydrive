export interface OrderReceiptData {
  date: string
  orderDate: string
  orderNumber: string
  trackingNumber?: string
  transactionId: string
  userName: string
  address: string
  paymentSource: string
  initialCharge: string
  finalCost: string
  totalRefund: string
  refundTrans: string
  shippingCost?: string
  tax?: string
  customerEmail?: string
  items?: Array<{
    name: string
    quantity: number
    price: string
    total: string
  }>
}

/**
 * Generates the standardized receipt text block for an order.
 */
export const generateReceiptText = (r: OrderReceiptData): string => {
  const trackingNum = r.trackingNumber || `TRK-${r.orderNumber}`
  const lines = [
    `Receipt `,
    ` Order Summary `,
    `Date: ${r.date}`,
    `--------------------------------------------------------------------------------  `,
    `Hello, `,
    `Thank you for choosing to shop with us. Here's a summary of your order. `,
    `Order Details `,
    `********************************************************************************  `,
    `Order Date     : ${r.orderDate}`,
    `Order Number   : ${r.orderNumber}`,
    `Tracking Number: ${trackingNum}`,
    `Transaction ID : ${r.transactionId}`,
    `User Name      : ${r.userName}`,
    `Address        : ${r.address}`,
    `Payment source : ${r.paymentSource}`,
    `Initial Charge : ${r.initialCharge}`,
    `Final Cost     : ${r.finalCost}`,
    `Total Refund   : ${r.totalRefund || '$0.00'}`,
    `Refund Trans   : N/A`,
    `N/A`,
    ``
  ]

  if (r.items && r.items.length > 0) {
    lines.push(`Purchased Units:`)
    r.items.forEach((item) => {
      lines.push(` - ${item.name} x ${item.quantity} (${item.price} each) : ${item.total}`)
    })
    lines.push(``)
  }

  lines.push(
    `Full details for this order have been reviewed by user`,
    `Additional Transaction Details:`,
    `If you've purchased a this item, it means you know the item you purchased and have agreed with our terms and conditions that says payment is non-refundable.`,
    `Feel free to contact our Customer Service via email (info-eurotopmobility@driveflyelectric.shop) or WhatsApp (+1 978 523-6630) if you have any questions or concerns. They're available 24/7.`,
    `Regards,`,
    `DriveFlyElectric Team`,
    `https://driveflyelectric.shop/`
  )

  return lines.join('\n')
}

/**
 * Escapes text for PDF string literals and normalizes Unicode punctuation to WinAnsi/ASCII.
 */
const escapePdfText = (input: string): string => {
  return input
    .replace(/\u00d7/g, 'x')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2022/g, '*')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
}

/**
 * Wraps a single line into chunks of at most `maxCols` characters at word boundaries.
 */
const wrapLine = (line: string, maxCols: number = 82): string[] => {
  const trimmedRight = line.replace(/\s+$/, '')
  if (trimmedRight.length <= maxCols) return [trimmedRight]

  const words = trimmedRight.split(' ')
  const wrapped: string[] = []
  let current = ''

  for (const word of words) {
    if (!current) {
      if (word.length > maxCols) {
        for (let i = 0; i < word.length; i += maxCols) {
          wrapped.push(word.slice(i, i + maxCols))
        }
      } else {
        current = word
      }
    } else if (current.length + 1 + word.length <= maxCols) {
      current += ' ' + word
    } else {
      wrapped.push(current)
      current = word
    }
  }
  if (current) wrapped.push(current)
  return wrapped
}

/**
 * Generates a valid binary PDF-1.4 document (Uint8Array) for the given OrderReceiptData.
 */
export const generateReceiptPdfBytes = (r: OrderReceiptData): Uint8Array => {
  const rawText = generateReceiptText(r)
  const rawLines = rawText.split('\n')

  const formattedLines: Array<{ text: string; bold: boolean }> = []
  for (const rawLine of rawLines) {
    const trimmed = rawLine.trim()
    const isBold =
      trimmed === 'Receipt' ||
      trimmed === 'Order Summary' ||
      trimmed === 'Order Details' ||
      trimmed === 'Purchased Units:' ||
      trimmed === 'Additional Transaction Details:' ||
      trimmed.startsWith('Order Number') ||
      trimmed.startsWith('Tracking Number') ||
      trimmed.startsWith('Final Cost')

    const segments = wrapLine(rawLine, 80)
    for (const seg of segments) {
      formattedLines.push({ text: seg, bold: isBold })
    }
  }

  // Build PDF content stream commands
  const trackingNum = r.trackingNumber || `TRK-${r.orderNumber}`
  const commands: string[] = []

  // Outer card border & top header bar (Creamy Green accent stroke)
  commands.push('0.35 0.73 0.44 RG')
  commands.push('1.5 w')
  commands.push('36 36 540 720 re S')

  // Header banner fill
  commands.push('0.09 0.10 0.13 rg')
  commands.push('36 700 540 56 re f')

  // Header title text (White)
  commands.push('1 1 1 rg')
  commands.push('BT /F2 13 Tf 50 731 Td (DRIVEFLYELECTRIC - OFFICIAL PURCHASE RECEIPT) Tj ET')
  commands.push('0.46 0.81 0.54 rg')
  commands.push(
    `BT /F2 8.2 Tf 50 713 Td (${escapePdfText(
      `ORDER #${r.orderNumber}  |  TRACKING: ${trackingNum}  |  DATE: ${r.date}`
    )}) Tj ET`
  )

  // Body text (Dark charcoal)
  commands.push('0.1 0.1 0.12 rg')
  let y = 676
  const lineHeight = 12.5

  for (const lineObj of formattedLines) {
    if (y < 52) break
    const fontKey = lineObj.bold ? '/F2' : '/F1'
    const safeText = escapePdfText(lineObj.text)
    commands.push(`BT ${fontKey} 9.5 Tf 50 ${y.toFixed(1)} Td (${safeText}) Tj ET`)
    y -= lineHeight
  }

  // Footer verification stamp
  commands.push('0.85 0.85 0.85 RG 0.75 w 50 54 m 562 54 l S')
  commands.push('0.45 0.45 0.48 rg')
  commands.push(
    'BT /F1 8 Tf 50 42 Td (Verified Electronic Receipt  |  DriveFlyElectric  |  info-eurotopmobility@driveflyelectric.shop) Tj ET'
  )

  const streamContent = commands.join('\n')
  const encoder = new TextEncoder()
  const streamBytes = encoder.encode(streamContent)

  const objects: string[] = [
    `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`,
    `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n`,
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>\nendobj\n`,
    `4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>\nendobj\n`,
    `5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold /Encoding /WinAnsiEncoding >>\nendobj\n`,
    `6 0 obj\n<< /Length ${streamBytes.byteLength} >>\nstream\n${streamContent}\nendstream\nendobj\n`
  ]

  const header = `%PDF-1.4\n`
  let body = ''
  const offsets: number[] = []
  let currentOffset = encoder.encode(header).byteLength

  for (const objStr of objects) {
    offsets.push(currentOffset)
    body += objStr
    currentOffset += encoder.encode(objStr).byteLength
  }

  const xrefOffset = currentOffset
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) {
    xref += `${String(offset).padStart(10, '0')} 00000 n \n`
  }

  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  const fullPdfString = header + body + xref + trailer
  return encoder.encode(fullPdfString)
}

/**
 * Triggers a browser download of the generated PDF receipt (`Receipt-<orderNumber>.pdf`).
 */
export const downloadReceiptPdf = (r: OrderReceiptData): void => {
  const pdfBytes = generateReceiptPdfBytes(r)
  const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `Receipt-${r.orderNumber}.pdf`
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

