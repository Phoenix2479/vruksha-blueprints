/**
 * PrinterCalibrationWizard - Full-auto calibration with camera detection
 * Steps: 1) Connect printer 2) Print test pattern 3) Scan with camera 4) Auto-adjust offsets
 */
import { useState, useRef, useCallback, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { getLabelPrinter, createProfileFromDetected, type DetectedPrinter } from '@/lib/printer-connection'
import { generateCalibrationPatternZPL, type PrinterProfile } from '@/lib/label-compiler'
import {
  Button,
  Input,
  Label,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Slider,
  Badge,
  Alert,
  AlertDescription,
} from '@/components/ui'
import { 
  Printer, 
  Camera, 
  CheckCircle2, 
  AlertCircle, 
  Loader2,
  ChevronRight,
  ChevronLeft,
  Settings2,
  Move,
  Target,
  Usb,
  Cable
} from 'lucide-react'

interface PrinterCalibrationWizardProps {
  open: boolean
  onClose: () => void
  existingProfile?: PrinterProfile
  onCalibrationComplete: (profile: PrinterProfile) => void
}

type WizardStep = 'connect' | 'setup' | 'test-print' | 'scan' | 'adjust' | 'complete'

const LABEL_SIZES = [
  { id: '50x30', label: '50 x 30 mm (Standard)', width: 50, height: 30 },
  { id: '50x25', label: '50 x 25 mm', width: 50, height: 25 },
  { id: '40x30', label: '40 x 30 mm', width: 40, height: 30 },
  { id: '100x50', label: '100 x 50 mm (Shipping)', width: 100, height: 50 },
  { id: '30x20', label: '30 x 20 mm (Small)', width: 30, height: 20 },
  { id: '25x10', label: '25 x 10 mm (Jewelry)', width: 25, height: 10 },
  { id: 'custom', label: 'Custom Size...', width: 0, height: 0 },
]

export default function PrinterCalibrationWizard({ 
  open, 
  onClose, 
  existingProfile,
  onCalibrationComplete 
}: PrinterCalibrationWizardProps) {
  const queryClient = useQueryClient()
  const [step, setStep] = useState<WizardStep>('connect')
  const [detectedPrinter, setDetectedPrinter] = useState<DetectedPrinter | null>(null)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  
  // Profile settings
  const [profileName, setProfileName] = useState(existingProfile?.name || '')
  const [labelSize, setLabelSize] = useState('50x30')
  const [customWidth, setCustomWidth] = useState(50)
  const [customHeight, setCustomHeight] = useState(30)
  const [dpi, setDpi] = useState<203 | 300 | 600>(existingProfile?.dpi || 203)
  
  // Calibration adjustments
  const [offsetX, setOffsetX] = useState(existingProfile?.offsetX || 0)
  const [offsetY, setOffsetY] = useState(existingProfile?.offsetY || 0)
  const [darkness, setDarkness] = useState(existingProfile?.darkness || 15)
  const [speed, setSpeed] = useState(existingProfile?.speed || 4)
  
  // Camera state
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [cameraActive, setCameraActive] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<{ offsetX: number; offsetY: number } | null>(null)

  // Reset on open
  useEffect(() => {
    if (open && !existingProfile) {
      setStep('connect')
      setDetectedPrinter(null)
      setConnectionError(null)
      setOffsetX(0)
      setOffsetY(0)
      setScanResult(null)
    }
  }, [open, existingProfile])

  // Connect to printer via USB
  const handleConnectUSB = async () => {
    setConnecting(true)
    setConnectionError(null)
    
    try {
      const printer = getLabelPrinter()
      const detected = await printer.connectUSB()
      
      if (detected) {
        setDetectedPrinter(detected)
        setProfileName(detected.model || 'My Printer')
        setDpi(detected.dpi)
        setStep('setup')
      }
    } catch (err) {
      setConnectionError(err instanceof Error ? err.message : 'Failed to connect')
    } finally {
      setConnecting(false)
    }
  }

  // Connect via Serial
  const handleConnectSerial = async () => {
    setConnecting(true)
    setConnectionError(null)
    
    try {
      const printer = getLabelPrinter()
      const detected = await printer.connectSerial()
      
      if (detected) {
        setDetectedPrinter(detected)
        setProfileName('Serial Printer')
        setStep('setup')
      }
    } catch (err) {
      setConnectionError(err instanceof Error ? err.message : 'Failed to connect')
    } finally {
      setConnecting(false)
    }
  }

  // Print calibration test pattern
  const handlePrintTestPattern = async () => {
    if (!detectedPrinter) return
    
    const printer = getLabelPrinter()
    const size = LABEL_SIZES.find(s => s.id === labelSize) || { width: customWidth, height: customHeight }
    
    const profile: PrinterProfile = {
      id: 'calibration-temp',
      name: profileName,
      model: detectedPrinter.model,
      vendor: detectedPrinter.vendorName.toLowerCase() as PrinterProfile['vendor'],
      language: detectedPrinter.language,
      dpi,
      labelWidthMm: size.width,
      labelHeightMm: size.height,
      offsetX,
      offsetY,
      darkness,
      speed
    }
    
    const zpl = generateCalibrationPatternZPL(profile)
    
    try {
      await printer.printZPL(zpl)
      setStep('scan')
    } catch (err) {
      setConnectionError(err instanceof Error ? err.message : 'Failed to print')
    }
  }

  // Start camera for label scanning
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      })
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        setCameraActive(true)
        setCameraError(null)
      }
    } catch (err) {
      setCameraError('Camera access denied. Please allow camera or adjust manually.')
      setCameraActive(false)
    }
  }

  // Stop camera
  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream
      stream.getTracks().forEach(track => track.stop())
      videoRef.current.srcObject = null
    }
    setCameraActive(false)
  }

  // Analyze captured image for crosshair positions
  const analyzeCalibrationPattern = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return
    
    setScanning(true)
    
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    
    // Draw current video frame
    canvas.width = videoRef.current.videoWidth
    canvas.height = videoRef.current.videoHeight
    ctx.drawImage(videoRef.current, 0, 0)
    
    // Simple analysis: find dark pixels that form crosshair pattern
    // In a real implementation, you'd use OpenCV.js for proper detection
    // This is a simplified version that detects offset based on label position
    
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const data = imageData.data
    
    // Find bounding box of dark pixels (the label)
    let minX = canvas.width, maxX = 0, minY = canvas.height, maxY = 0
    const threshold = 100
    
    for (let y = 0; y < canvas.height; y += 2) {
      for (let x = 0; x < canvas.width; x += 2) {
        const i = (y * canvas.width + x) * 4
        const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3
        
        if (brightness < threshold) {
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
      }
    }
    
    // Estimate offset based on center deviation
    const labelCenterX = (minX + maxX) / 2
    const labelCenterY = (minY + maxY) / 2
    const imageCenterX = canvas.width / 2
    const imageCenterY = canvas.height / 2
    
    // Convert pixel offset to dots (rough estimation)
    const pixelsPerMm = canvas.width / 80 // Assume 80mm view width
    const dotsPerMm = dpi / 25.4
    
    const estimatedOffsetX = Math.round((imageCenterX - labelCenterX) / pixelsPerMm * dotsPerMm)
    const estimatedOffsetY = Math.round((imageCenterY - labelCenterY) / pixelsPerMm * dotsPerMm)
    
    setScanResult({
      offsetX: Math.max(-50, Math.min(50, estimatedOffsetX)),
      offsetY: Math.max(-50, Math.min(50, estimatedOffsetY))
    })
    
    setScanning(false)
  }, [dpi])

  // Apply scan results
  const applyScanResults = () => {
    if (scanResult) {
      setOffsetX(offsetX + scanResult.offsetX)
      setOffsetY(offsetY + scanResult.offsetY)
      setScanResult(null)
    }
    stopCamera()
    setStep('adjust')
  }

  // Skip camera, go to manual adjustment
  const skipToManual = () => {
    stopCamera()
    setStep('adjust')
  }

  // Save profile
  const saveMutation = useMutation({
    mutationFn: async (profile: Omit<PrinterProfile, 'id'> & { id?: string }) => {
      if (existingProfile?.id) {
        return api.put(`/api/printer-profiles/${existingProfile.id}`, profile)
      }
      return api.post('/api/printer-profiles', profile)
    },
    onSuccess: (_, profile) => {
      queryClient.invalidateQueries({ queryKey: ['printer-profiles'] })
      const size = LABEL_SIZES.find(s => s.id === labelSize) || { width: customWidth, height: customHeight }
      onCalibrationComplete({
        ...(existingProfile || {}),
        ...profile,
        id: existingProfile?.id || 'new',
        labelWidthMm: size.width,
        labelHeightMm: size.height,
      } as PrinterProfile)
      setStep('complete')
    }
  })

  const handleSave = () => {
    if (!detectedPrinter && !existingProfile) return
    
    const size = LABEL_SIZES.find(s => s.id === labelSize) || { width: customWidth, height: customHeight }
    
    saveMutation.mutate({
      id: existingProfile?.id,
      name: profileName,
      model: detectedPrinter?.model || existingProfile?.model || 'Unknown',
      vendor: (detectedPrinter?.vendorName.toLowerCase() || existingProfile?.vendor || 'generic') as PrinterProfile['vendor'],
      language: detectedPrinter?.language || existingProfile?.language || 'zpl',
      dpi,
      labelWidthMm: size.width,
      labelHeightMm: size.height,
      offsetX,
      offsetY,
      darkness,
      speed
    })
  }

  // Cleanup camera on unmount
  useEffect(() => {
    return () => stopCamera()
  }, [])

  const renderStepContent = () => {
    switch (step) {
      case 'connect':
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Connect your thermal label printer via USB or Serial port.
            </p>
            
            {connectionError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{connectionError}</AlertDescription>
              </Alert>
            )}
            
            <div className="grid grid-cols-2 gap-4">
              <Button
                variant="outline"
                className="h-24 flex flex-col gap-2"
                onClick={handleConnectUSB}
                disabled={connecting}
              >
                {connecting ? <Loader2 className="h-8 w-8 animate-spin" /> : <Usb className="h-8 w-8" />}
                <span>USB Connection</span>
              </Button>
              
              <Button
                variant="outline"
                className="h-24 flex flex-col gap-2"
                onClick={handleConnectSerial}
                disabled={connecting}
              >
                {connecting ? <Loader2 className="h-8 w-8 animate-spin" /> : <Cable className="h-8 w-8" />}
                <span>Serial Port</span>
              </Button>
            </div>
            
            <p className="text-xs text-muted-foreground text-center">
              Make sure your printer is powered on and connected to your computer.
            </p>
          </div>
        )

      case 'setup':
        return (
          <div className="space-y-4">
            {detectedPrinter && (
              <Card>
                <CardContent className="p-3">
                  <div className="flex items-center gap-3">
                    <Printer className="h-8 w-8 text-green-500" />
                    <div>
                      <p className="font-medium">{detectedPrinter.model}</p>
                      <p className="text-xs text-muted-foreground">
                        {detectedPrinter.vendorName} • {detectedPrinter.dpi} DPI • {detectedPrinter.language.toUpperCase()}
                      </p>
                    </div>
                    <Badge variant="outline" className="ml-auto text-green-600">Connected</Badge>
                  </div>
                </CardContent>
              </Card>
            )}
            
            <div className="space-y-3">
              <div>
                <Label>Profile Name</Label>
                <Input
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  placeholder="My Zebra Printer"
                />
              </div>
              
              <div>
                <Label>Label Size</Label>
                <Select value={labelSize} onValueChange={setLabelSize}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LABEL_SIZES.map(size => (
                      <SelectItem key={size.id} value={size.id}>{size.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {labelSize === 'custom' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Width (mm)</Label>
                    <Input
                      type="number"
                      value={customWidth}
                      onChange={(e) => setCustomWidth(Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <Label>Height (mm)</Label>
                    <Input
                      type="number"
                      value={customHeight}
                      onChange={(e) => setCustomHeight(Number(e.target.value))}
                    />
                  </div>
                </div>
              )}
              
              <div>
                <Label>Resolution (DPI)</Label>
                <Select value={String(dpi)} onValueChange={(v) => setDpi(Number(v) as 203 | 300 | 600)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="203">203 DPI (Standard)</SelectItem>
                    <SelectItem value="300">300 DPI (High)</SelectItem>
                    <SelectItem value="600">600 DPI (Very High)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )

      case 'test-print':
        return (
          <div className="space-y-4 text-center">
            <Target className="h-16 w-16 mx-auto text-blue-500" />
            <h3 className="font-medium">Print Calibration Pattern</h3>
            <p className="text-sm text-muted-foreground">
              We'll print a test pattern with crosshairs. You can then scan it with your camera
              for auto-calibration, or adjust manually.
            </p>
            
            <Button onClick={handlePrintTestPattern} className="w-full">
              <Printer className="mr-2 h-4 w-4" />
              Print Test Pattern
            </Button>
          </div>
        )

      case 'scan':
        return (
          <div className="space-y-4">
            <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
              {cameraActive ? (
                <>
                  <video
                    ref={videoRef}
                    className="w-full h-full object-cover"
                    playsInline
                    muted
                  />
                  <canvas ref={canvasRef} className="hidden" />
                  {/* Overlay guide */}
                  <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute inset-8 border-2 border-dashed border-white/50 rounded-lg" />
                    <div className="absolute top-1/2 left-8 right-8 border-t border-white/30" />
                    <div className="absolute left-1/2 top-8 bottom-8 border-l border-white/30" />
                  </div>
                </>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
                  <Camera className="h-12 w-12 mb-2 opacity-50" />
                  <p className="text-sm opacity-70">Camera not active</p>
                </div>
              )}
            </div>
            
            {cameraError && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{cameraError}</AlertDescription>
              </Alert>
            )}
            
            {scanResult && (
              <Alert>
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <AlertDescription>
                  Detected offset: X={scanResult.offsetX}, Y={scanResult.offsetY} dots
                </AlertDescription>
              </Alert>
            )}
            
            <div className="flex gap-2">
              {!cameraActive ? (
                <Button onClick={startCamera} className="flex-1">
                  <Camera className="mr-2 h-4 w-4" />
                  Start Camera
                </Button>
              ) : (
                <>
                  <Button
                    onClick={analyzeCalibrationPattern}
                    disabled={scanning}
                    className="flex-1"
                  >
                    {scanning ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Target className="mr-2 h-4 w-4" />
                    )}
                    Scan & Detect
                  </Button>
                  {scanResult && (
                    <Button onClick={applyScanResults} variant="default">
                      Apply
                    </Button>
                  )}
                </>
              )}
              <Button variant="outline" onClick={skipToManual}>
                Skip
              </Button>
            </div>
            
            <p className="text-xs text-muted-foreground text-center">
              Place the printed label under the camera. The crosshairs should be visible.
            </p>
          </div>
        )

      case 'adjust':
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>X Offset (dots): {offsetX}</Label>
                <Slider
                  min={-100}
                  max={100}
                  step={1}
                  value={[offsetX]}
                  onValueChange={([v]) => setOffsetX(v)}
                />
              </div>
              <div className="space-y-2">
                <Label>Y Offset (dots): {offsetY}</Label>
                <Slider
                  min={-100}
                  max={100}
                  step={1}
                  value={[offsetY]}
                  onValueChange={([v]) => setOffsetY(v)}
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Darkness: {darkness}</Label>
                <Slider
                  min={0}
                  max={30}
                  step={1}
                  value={[darkness]}
                  onValueChange={([v]) => setDarkness(v)}
                />
              </div>
              <div className="space-y-2">
                <Label>Speed: {speed} ips</Label>
                <Slider
                  min={1}
                  max={8}
                  step={1}
                  value={[speed]}
                  onValueChange={([v]) => setSpeed(v)}
                />
              </div>
            </div>
            
            <Button variant="outline" className="w-full" onClick={handlePrintTestPattern}>
              <Printer className="mr-2 h-4 w-4" />
              Print Another Test
            </Button>
          </div>
        )

      case 'complete':
        return (
          <div className="flex flex-col items-center justify-center py-8">
            <CheckCircle2 className="h-16 w-16 text-green-500 mb-4" />
            <h3 className="text-lg font-semibold">Calibration Complete!</h3>
            <p className="text-sm text-muted-foreground mt-2 text-center">
              Your printer profile has been saved. You can now print labels with accurate positioning.
            </p>
          </div>
        )
    }
  }

  const canProceed = () => {
    switch (step) {
      case 'connect': return false // Must use buttons
      case 'setup': return profileName.trim().length > 0
      case 'test-print': return true
      case 'scan': return true
      case 'adjust': return true
      case 'complete': return true
      default: return false
    }
  }

  const handleNext = () => {
    switch (step) {
      case 'setup': setStep('test-print'); break
      case 'test-print': setStep('scan'); break
      case 'scan': setStep('adjust'); break
      case 'adjust': handleSave(); break
      case 'complete': onClose(); break
    }
  }

  const handleBack = () => {
    switch (step) {
      case 'setup': setStep('connect'); break
      case 'test-print': setStep('setup'); break
      case 'scan': setStep('test-print'); break
      case 'adjust': setStep('scan'); break
    }
  }

  const stepIndex = ['connect', 'setup', 'test-print', 'scan', 'adjust', 'complete'].indexOf(step)

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            Printer Calibration
          </DialogTitle>
        </DialogHeader>

        {/* Progress indicator */}
        <div className="flex gap-1 mb-4">
          {['Connect', 'Setup', 'Test', 'Scan', 'Adjust', 'Done'].map((label, i) => (
            <div
              key={label}
              className={`flex-1 h-1 rounded ${i <= stepIndex ? 'bg-primary' : 'bg-muted'}`}
            />
          ))}
        </div>

        {renderStepContent()}

        <DialogFooter className="gap-2">
          {step !== 'connect' && step !== 'complete' && (
            <Button variant="outline" onClick={handleBack}>
              <ChevronLeft className="mr-1 h-4 w-4" />
              Back
            </Button>
          )}
          {step !== 'connect' && (
            <Button onClick={handleNext} disabled={!canProceed() || saveMutation.isPending}>
              {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {step === 'complete' ? 'Close' : step === 'adjust' ? 'Save Profile' : 'Next'}
              {step !== 'complete' && step !== 'adjust' && <ChevronRight className="ml-1 h-4 w-4" />}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
