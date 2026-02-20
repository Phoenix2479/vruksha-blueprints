import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'
import type { LabelTemplate, LabelElement, Product, LabelSize } from '@/types/barcode'
import { generateBarcodeDataURL } from './barcode-generator'
import { mmToPx } from './fabric-helpers'

export interface PrintOptions {
  copies: number
  labelsPerRow: number
  labelsPerColumn: number
  pageSize: 'A4' | 'Letter' | 'Custom'
  orientation: 'portrait' | 'landscape'
  marginTop: number // mm
  marginLeft: number // mm
  gapHorizontal: number // mm
  gapVertical: number // mm
}

export const DEFAULT_PRINT_OPTIONS: PrintOptions = {
  copies: 1,
  labelsPerRow: 3,
  labelsPerColumn: 8,
  pageSize: 'A4',
  orientation: 'portrait',
  marginTop: 10,
  marginLeft: 10,
  gapHorizontal: 2,
  gapVertical: 2,
}

export interface PageSize {
  width: number // mm
  height: number // mm
}

export const PAGE_SIZES: Record<string, PageSize> = {
  A4: { width: 210, height: 297 },
  Letter: { width: 216, height: 279 },
  A5: { width: 148, height: 210 },
  A6: { width: 105, height: 148 },
}

// Calculate how many labels fit on a page
export function calculateLabelsPerPage(
  labelSize: LabelSize,
  options: PrintOptions
): { rows: number; cols: number; total: number } {
  const page = PAGE_SIZES[options.pageSize] || PAGE_SIZES.A4
  const pageWidth = options.orientation === 'portrait' ? page.width : page.height
  const pageHeight = options.orientation === 'portrait' ? page.height : page.width

  const availableWidth = pageWidth - (options.marginLeft * 2)
  const availableHeight = pageHeight - (options.marginTop * 2)

  const cols = Math.floor((availableWidth + options.gapHorizontal) / (labelSize.width + options.gapHorizontal))
  const rows = Math.floor((availableHeight + options.gapVertical) / (labelSize.height + options.gapVertical))

  return { rows, cols, total: rows * cols }
}

// Render a single label to canvas
export async function renderLabelToCanvas(
  template: LabelTemplate,
  product: Product,
  scale: number = 1
): Promise<HTMLCanvasElement> {
  const width = mmToPx(template.size.width) * scale
  const height = mmToPx(template.size.height) * scale

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!

  // White background
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)

  // Border
  ctx.strokeStyle = '#000000'
  ctx.lineWidth = 0.5
  ctx.strokeRect(0, 0, width, height)

  // Render each element
  for (const element of template.elements.filter(e => e.enabled)) {
    await renderElement(ctx, element, product, scale)
  }

  return canvas
}

// Render a single element
async function renderElement(
  ctx: CanvasRenderingContext2D,
  element: LabelElement,
  product: Product,
  scale: number
): Promise<void> {
  const x = mmToPx(element.x) * scale
  const y = mmToPx(element.y) * scale

  // Get value
  const getValue = (): string => {
    switch (element.type) {
      case 'productName': return product.name
      case 'price': return `${element.currencySymbol || '₹'}${product.price.toFixed(2)}`
      case 'mrp': return `${element.currencySymbol || '₹'}${product.mrp.toFixed(2)}`
      case 'sku': return product.sku
      case 'batchNo': return product.batchNo || ''
      case 'expiryDate': return product.expiryDate ? new Date(product.expiryDate).toLocaleDateString() : ''
      case 'weight': return product.weight || ''
      case 'barcode': return product.barcode || product.sku
      case 'customText': return element.value || ''
      default: return ''
    }
  }

  const value = getValue()
  const prefix = element.prefix || ''
  const suffix = element.suffix || ''
  const displayText = `${prefix}${value}${suffix}`

  if (element.type === 'barcode') {
    // Render barcode
    const result = await generateBarcodeDataURL({
      type: element.barcodeType || 'code128',
      value: value,
      width: 2,
      height: mmToPx(element.height || 15) * scale,
    })

    if (result.success && result.dataUrl) {
      const img = new Image()
      await new Promise<void>((resolve) => {
        img.onload = () => {
          const targetWidth = mmToPx(element.width || 40) * scale
          const targetHeight = mmToPx(element.height || 15) * scale
          ctx.drawImage(img, x, y, targetWidth, targetHeight)
          resolve()
        }
        img.onerror = () => resolve()
        img.src = result.dataUrl!
      })
    }
    return
  }

  // Text elements
  const fontSize = (element.font?.size || 12) * scale
  const fontWeight = element.font?.bold ? 'bold' : 'normal'
  const fontStyle = element.font?.italic ? 'italic' : 'normal'
  const fontFamily = element.font?.family || 'Arial'

  ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`
  ctx.fillStyle = element.type === 'mrp' ? '#666666' : '#000000'
  ctx.textBaseline = 'top'

  // Draw text
  ctx.fillText(displayText, x, y)

  // Strike-through for MRP
  if (element.type === 'mrp') {
    const textWidth = ctx.measureText(displayText).width
    const lineY = y + fontSize / 2
    ctx.strokeStyle = '#666666'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(x, lineY)
    ctx.lineTo(x + textWidth, lineY)
    ctx.stroke()
  }
}

// Generate PDF with multiple labels
export async function generatePDF(
  template: LabelTemplate,
  products: Product[],
  options: PrintOptions
): Promise<Blob> {
  const page = PAGE_SIZES[options.pageSize] || PAGE_SIZES.A4
  const pageWidth = options.orientation === 'portrait' ? page.width : page.height
  const pageHeight = options.orientation === 'portrait' ? page.height : page.width

  const pdf = new jsPDF({
    orientation: options.orientation,
    unit: 'mm',
    format: [pageWidth, pageHeight],
  })

  const labelsPerPage = calculateLabelsPerPage(template.size, options)
  const scale = 2 // Higher resolution for print

  let currentPage = 0
  let labelIndex = 0
  let row = 0
  let col = 0

  // Generate all labels (products × copies)
  const allLabels: { product: Product; copy: number }[] = []
  for (const product of products) {
    for (let copy = 0; copy < options.copies; copy++) {
      allLabels.push({ product, copy })
    }
  }

  for (const { product } of allLabels) {
    // Calculate position
    const x = options.marginLeft + col * (template.size.width + options.gapHorizontal)
    const y = options.marginTop + row * (template.size.height + options.gapVertical)

    // Render label to canvas
    const canvas = await renderLabelToCanvas(template, product, scale)

    // Add to PDF
    const imgData = canvas.toDataURL('image/png')
    pdf.addImage(
      imgData,
      'PNG',
      x,
      y,
      template.size.width,
      template.size.height
    )

    // Move to next position
    col++
    if (col >= labelsPerPage.cols) {
      col = 0
      row++
      if (row >= labelsPerPage.rows) {
        row = 0
        labelIndex++
        if (labelIndex < allLabels.length) {
          pdf.addPage()
          currentPage++
        }
      }
    }
  }

  return pdf.output('blob')
}

// Generate print-ready HTML
export function generatePrintHTML(
  template: LabelTemplate,
  products: Product[],
  options: PrintOptions
): string {
  const labelsPerPage = calculateLabelsPerPage(template.size, options)
  
  let html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        @page {
          size: ${options.pageSize} ${options.orientation};
          margin: ${options.marginTop}mm ${options.marginLeft}mm;
        }
        body {
          margin: 0;
          padding: 0;
          font-family: Arial, sans-serif;
        }
        .page {
          page-break-after: always;
          display: grid;
          grid-template-columns: repeat(${labelsPerPage.cols}, ${template.size.width}mm);
          gap: ${options.gapVertical}mm ${options.gapHorizontal}mm;
        }
        .page:last-child {
          page-break-after: auto;
        }
        .label {
          width: ${template.size.width}mm;
          height: ${template.size.height}mm;
          border: 0.5px solid #ccc;
          position: relative;
          overflow: hidden;
          box-sizing: border-box;
        }
        .element {
          position: absolute;
        }
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      </style>
    </head>
    <body>
  `

  // Generate labels
  const allLabels: Product[] = []
  for (const product of products) {
    for (let i = 0; i < options.copies; i++) {
      allLabels.push(product)
    }
  }

  // Split into pages
  const totalPerPage = labelsPerPage.rows * labelsPerPage.cols
  for (let pageStart = 0; pageStart < allLabels.length; pageStart += totalPerPage) {
    const pageLabels = allLabels.slice(pageStart, pageStart + totalPerPage)
    
    html += '<div class="page">'
    for (const product of pageLabels) {
      html += generateLabelHTML(template, product)
    }
    html += '</div>'
  }

  html += '</body></html>'
  return html
}

// Generate HTML for a single label
function generateLabelHTML(template: LabelTemplate, product: Product): string {
  let html = '<div class="label">'

  for (const element of template.elements.filter(e => e.enabled)) {
    const value = getElementValue(element, product)
    const style = getElementStyle(element)

    if (element.type === 'barcode') {
      html += `<div class="element" style="${style}">
        <svg id="barcode-${product.id}-${element.id}"></svg>
      </div>`
    } else {
      html += `<div class="element" style="${style}">${value}</div>`
    }
  }

  html += '</div>'
  return html
}

function getElementValue(element: LabelElement, product: Product): string {
  const prefix = element.prefix || ''
  const suffix = element.suffix || ''
  
  let value = ''
  switch (element.type) {
    case 'productName': value = product.name; break
    case 'price': value = `${element.currencySymbol || '₹'}${product.price.toFixed(2)}`; break
    case 'mrp': value = `${element.currencySymbol || '₹'}${product.mrp.toFixed(2)}`; break
    case 'sku': value = product.sku; break
    case 'batchNo': value = product.batchNo || ''; break
    case 'expiryDate': value = product.expiryDate ? new Date(product.expiryDate).toLocaleDateString() : ''; break
    case 'weight': value = product.weight || ''; break
    case 'customText': value = element.value || ''; break
    default: value = ''
  }

  return `${prefix}${value}${suffix}`
}

function getElementStyle(element: LabelElement): string {
  const styles: string[] = [
    `left: ${element.x}mm`,
    `top: ${element.y}mm`,
  ]

  if (element.font) {
    styles.push(`font-family: ${element.font.family}`)
    styles.push(`font-size: ${element.font.size}pt`)
    if (element.font.bold) styles.push('font-weight: bold')
    if (element.font.italic) styles.push('font-style: italic')
  }

  if (element.type === 'mrp') {
    styles.push('text-decoration: line-through')
    styles.push('color: #666')
  }

  if (element.width) styles.push(`width: ${element.width}mm`)
  if (element.height) styles.push(`height: ${element.height}mm`)

  return styles.join('; ')
}

// Open browser print dialog
export function browserPrint(html: string): void {
  const printWindow = window.open('', '_blank')
  if (printWindow) {
    printWindow.document.write(html)
    printWindow.document.close()
    printWindow.focus()
    setTimeout(() => {
      printWindow.print()
      printWindow.close()
    }, 500)
  }
}

// Download PDF
export async function downloadPDF(
  template: LabelTemplate,
  products: Product[],
  options: PrintOptions,
  filename: string = 'labels.pdf'
): Promise<void> {
  const blob = await generatePDF(template, products, options)
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

// Export single label as image
export async function exportLabelAsImage(
  template: LabelTemplate,
  product: Product,
  format: 'png' | 'jpeg' = 'png',
  scale: number = 2
): Promise<Blob> {
  const canvas = await renderLabelToCanvas(template, product, scale)
  
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve(blob!)
    }, `image/${format}`, format === 'jpeg' ? 0.95 : undefined)
  })
}
