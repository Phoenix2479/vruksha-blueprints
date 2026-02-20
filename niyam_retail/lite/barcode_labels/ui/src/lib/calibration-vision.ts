/**
 * Calibration Vision - OpenCV.js based crosshair detection for auto-calibration
 * Detects printed calibration pattern and calculates printer offsets
 */

// OpenCV types (loaded dynamically)
declare global {
  interface Window {
    cv: typeof import('opencv-js')
  }
}

export interface CalibrationResult {
  success: boolean
  offsetX: number // dots
  offsetY: number // dots
  confidence: number // 0-1
  message: string
  detectedCrosshairs?: { x: number; y: number }[]
  expectedCrosshairs?: { x: number; y: number }[]
}

export interface CrosshairPosition {
  x: number
  y: number
  confidence: number
}

let cvLoaded = false
let cvPromise: Promise<void> | null = null

/**
 * Load OpenCV.js dynamically
 */
export async function loadOpenCV(): Promise<void> {
  if (cvLoaded) return

  if (cvPromise) {
    return cvPromise
  }

  cvPromise = new Promise((resolve, reject) => {
    // Check if already loaded
    if (window.cv && window.cv.Mat) {
      cvLoaded = true
      resolve()
      return
    }

    const script = document.createElement('script')
    script.src = 'https://docs.opencv.org/4.5.5/opencv.js'
    script.async = true
    
    script.onload = () => {
      // OpenCV.js needs time to initialize
      const checkReady = () => {
        if (window.cv && window.cv.Mat) {
          cvLoaded = true
          resolve()
        } else {
          setTimeout(checkReady, 100)
        }
      }
      checkReady()
    }
    
    script.onerror = () => {
      reject(new Error('Failed to load OpenCV.js'))
    }
    
    document.head.appendChild(script)
  })

  return cvPromise
}

/**
 * Check if OpenCV is loaded and ready
 */
export function isOpenCVReady(): boolean {
  return cvLoaded && window.cv && !!window.cv.Mat
}

/**
 * Detect crosshairs in an image
 * Returns array of detected crosshair center positions
 */
export function detectCrosshairs(
  imageData: ImageData,
  expectedCount = 5
): CrosshairPosition[] {
  if (!isOpenCVReady()) {
    console.warn('OpenCV not loaded, using fallback detection')
    return fallbackDetectCrosshairs(imageData, expectedCount)
  }

  const cv = window.cv
  const crosshairs: CrosshairPosition[] = []

  try {
    // Convert ImageData to OpenCV Mat
    const src = cv.matFromImageData(imageData)
    const gray = new cv.Mat()
    const binary = new cv.Mat()
    const edges = new cv.Mat()
    const lines = new cv.Mat()

    // Convert to grayscale
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)

    // Threshold to get binary image
    cv.threshold(gray, binary, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU)

    // Edge detection
    cv.Canny(binary, edges, 50, 150)

    // Detect lines using Hough transform
    cv.HoughLinesP(edges, lines, 1, Math.PI / 180, 50, 20, 10)

    // Group lines into potential crosshairs (horizontal + vertical intersections)
    const horizontalLines: { x1: number; y1: number; x2: number; y2: number }[] = []
    const verticalLines: { x1: number; y1: number; x2: number; y2: number }[] = []

    for (let i = 0; i < lines.rows; i++) {
      const x1 = lines.data32S[i * 4]
      const y1 = lines.data32S[i * 4 + 1]
      const x2 = lines.data32S[i * 4 + 2]
      const y2 = lines.data32S[i * 4 + 3]

      const angle = Math.abs(Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI)

      if (angle < 20 || angle > 160) {
        horizontalLines.push({ x1, y1, x2, y2 })
      } else if (angle > 70 && angle < 110) {
        verticalLines.push({ x1, y1, x2, y2 })
      }
    }

    // Find intersections
    for (const hLine of horizontalLines) {
      for (const vLine of verticalLines) {
        const intersection = findIntersection(hLine, vLine)
        if (intersection) {
          // Check if we already have a nearby crosshair
          const nearby = crosshairs.find(c => 
            Math.abs(c.x - intersection.x) < 20 && Math.abs(c.y - intersection.y) < 20
          )
          
          if (!nearby) {
            crosshairs.push({
              x: intersection.x,
              y: intersection.y,
              confidence: 0.9
            })
          }
        }
      }
    }

    // Clean up
    src.delete()
    gray.delete()
    binary.delete()
    edges.delete()
    lines.delete()

    // Sort by position (top-left to bottom-right)
    crosshairs.sort((a, b) => {
      const rowDiff = Math.floor(a.y / 50) - Math.floor(b.y / 50)
      if (rowDiff !== 0) return rowDiff
      return a.x - b.x
    })

    return crosshairs.slice(0, expectedCount)

  } catch (err) {
    console.error('OpenCV detection failed:', err)
    return fallbackDetectCrosshairs(imageData, expectedCount)
  }
}

/**
 * Find intersection of two lines
 */
function findIntersection(
  line1: { x1: number; y1: number; x2: number; y2: number },
  line2: { x1: number; y1: number; x2: number; y2: number }
): { x: number; y: number } | null {
  const x1 = line1.x1, y1 = line1.y1, x2 = line1.x2, y2 = line1.y2
  const x3 = line2.x1, y3 = line2.y1, x4 = line2.x2, y4 = line2.y2

  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
  if (Math.abs(denom) < 0.001) return null

  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom

  const x = x1 + t * (x2 - x1)
  const y = y1 + t * (y2 - y1)

  // Check if intersection is within both line segments (with some tolerance)
  const tolerance = 30
  const withinLine1 = x >= Math.min(x1, x2) - tolerance && x <= Math.max(x1, x2) + tolerance
  const withinLine2 = x >= Math.min(x3, x4) - tolerance && x <= Math.max(x3, x4) + tolerance

  if (!withinLine1 || !withinLine2) return null

  return { x, y }
}

/**
 * Fallback detection without OpenCV (simple edge detection)
 */
function fallbackDetectCrosshairs(
  imageData: ImageData,
  expectedCount: number
): CrosshairPosition[] {
  const { width, height, data } = imageData
  const crosshairs: CrosshairPosition[] = []
  const threshold = 100

  // Simple grid-based search for dark pixel clusters
  const gridSize = Math.floor(Math.min(width, height) / 10)
  const darkClusters: { x: number; y: number; count: number }[] = []

  for (let gy = 0; gy < height; gy += gridSize) {
    for (let gx = 0; gx < width; gx += gridSize) {
      let darkCount = 0
      let sumX = 0, sumY = 0

      for (let y = gy; y < Math.min(gy + gridSize, height); y++) {
        for (let x = gx; x < Math.min(gx + gridSize, width); x++) {
          const i = (y * width + x) * 4
          const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3

          if (brightness < threshold) {
            darkCount++
            sumX += x
            sumY += y
          }
        }
      }

      if (darkCount > gridSize * 2) {
        darkClusters.push({
          x: sumX / darkCount,
          y: sumY / darkCount,
          count: darkCount
        })
      }
    }
  }

  // Find clusters with cross-like patterns
  for (const cluster of darkClusters) {
    // Check for vertical line through center
    let hasVertical = false
    let hasHorizontal = false

    for (let dy = -20; dy <= 20; dy++) {
      const y = Math.floor(cluster.y) + dy
      if (y < 0 || y >= height) continue
      const i = (y * width + Math.floor(cluster.x)) * 4
      if ((data[i] + data[i + 1] + data[i + 2]) / 3 < threshold) {
        hasVertical = true
        break
      }
    }

    for (let dx = -20; dx <= 20; dx++) {
      const x = Math.floor(cluster.x) + dx
      if (x < 0 || x >= width) continue
      const i = (Math.floor(cluster.y) * width + x) * 4
      if ((data[i] + data[i + 1] + data[i + 2]) / 3 < threshold) {
        hasHorizontal = true
        break
      }
    }

    if (hasVertical && hasHorizontal) {
      crosshairs.push({
        x: cluster.x,
        y: cluster.y,
        confidence: 0.6
      })
    }
  }

  // Sort and limit
  crosshairs.sort((a, b) => b.confidence - a.confidence)
  return crosshairs.slice(0, expectedCount)
}

/**
 * Calculate calibration offset from detected vs expected crosshairs
 */
export function calculateCalibrationOffset(
  detected: CrosshairPosition[],
  imageWidth: number,
  imageHeight: number,
  labelWidthMm: number,
  labelHeightMm: number,
  dpi: number
): CalibrationResult {
  if (detected.length < 3) {
    return {
      success: false,
      offsetX: 0,
      offsetY: 0,
      confidence: 0,
      message: `Only ${detected.length} crosshairs detected, need at least 3 for calibration`
    }
  }

  // Expected positions (normalized 0-1) for our calibration pattern:
  // 4 corners + center
  const expectedNormalized = [
    { x: 0.1, y: 0.1 },   // top-left
    { x: 0.9, y: 0.1 },   // top-right
    { x: 0.1, y: 0.9 },   // bottom-left
    { x: 0.9, y: 0.9 },   // bottom-right
    { x: 0.5, y: 0.5 },   // center
  ]

  // Convert to pixel positions
  const expected = expectedNormalized.map(p => ({
    x: p.x * imageWidth,
    y: p.y * imageHeight
  }))

  // Match detected to expected (nearest neighbor)
  const matches: { detected: CrosshairPosition; expected: { x: number; y: number } }[] = []
  const usedExpected = new Set<number>()

  for (const det of detected) {
    let bestDist = Infinity
    let bestIdx = -1

    for (let i = 0; i < expected.length; i++) {
      if (usedExpected.has(i)) continue
      const dist = Math.hypot(det.x - expected[i].x, det.y - expected[i].y)
      if (dist < bestDist && dist < imageWidth * 0.2) {
        bestDist = dist
        bestIdx = i
      }
    }

    if (bestIdx >= 0) {
      matches.push({ detected: det, expected: expected[bestIdx] })
      usedExpected.add(bestIdx)
    }
  }

  if (matches.length < 3) {
    return {
      success: false,
      offsetX: 0,
      offsetY: 0,
      confidence: 0,
      message: `Only ${matches.length} crosshairs matched to expected positions`
    }
  }

  // Calculate average offset
  let totalOffsetX = 0
  let totalOffsetY = 0
  let totalConfidence = 0

  for (const match of matches) {
    totalOffsetX += match.expected.x - match.detected.x
    totalOffsetY += match.expected.y - match.detected.y
    totalConfidence += match.detected.confidence
  }

  const avgOffsetXPixels = totalOffsetX / matches.length
  const avgOffsetYPixels = totalOffsetY / matches.length
  const avgConfidence = totalConfidence / matches.length

  // Convert pixel offset to printer dots
  const pixelsPerMmX = imageWidth / labelWidthMm
  const pixelsPerMmY = imageHeight / labelHeightMm
  const dotsPerMm = dpi / 25.4

  const offsetXDots = Math.round((avgOffsetXPixels / pixelsPerMmX) * dotsPerMm)
  const offsetYDots = Math.round((avgOffsetYPixels / pixelsPerMmY) * dotsPerMm)

  return {
    success: true,
    offsetX: offsetXDots,
    offsetY: offsetYDots,
    confidence: avgConfidence,
    message: `Detected ${matches.length} crosshairs. Recommended offset: X=${offsetXDots}, Y=${offsetYDots} dots`,
    detectedCrosshairs: matches.map(m => ({ x: m.detected.x, y: m.detected.y })),
    expectedCrosshairs: matches.map(m => ({ x: m.expected.x, y: m.expected.y }))
  }
}

/**
 * Capture frame from video element and analyze
 */
export async function analyzeVideoFrame(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  labelWidthMm: number,
  labelHeightMm: number,
  dpi: number
): Promise<CalibrationResult> {
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    return {
      success: false,
      offsetX: 0,
      offsetY: 0,
      confidence: 0,
      message: 'Canvas context not available'
    }
  }

  // Capture frame
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  ctx.drawImage(video, 0, 0)

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)

  // Try to load OpenCV first
  try {
    await loadOpenCV()
  } catch (e) {
    console.log('OpenCV not available, using fallback')
  }

  // Detect crosshairs
  const crosshairs = detectCrosshairs(imageData, 5)

  // Calculate offset
  return calculateCalibrationOffset(
    crosshairs,
    canvas.width,
    canvas.height,
    labelWidthMm,
    labelHeightMm,
    dpi
  )
}

export default {
  loadOpenCV,
  isOpenCVReady,
  detectCrosshairs,
  calculateCalibrationOffset,
  analyzeVideoFrame
}
