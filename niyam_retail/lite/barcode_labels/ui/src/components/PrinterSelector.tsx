/**
 * PrinterSelector - Dropdown component to select and manage printer profiles
 * Shows connection status, quick calibration access
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { getLabelPrinter, type DetectedPrinter } from '@/lib/printer-connection'
import type { PrinterProfile } from '@/lib/label-compiler'
import PrinterCalibrationWizard from './modals/PrinterCalibrationWizard'
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Badge,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui'
import { 
  Printer, 
  ChevronDown, 
  Check, 
  Plus, 
  Settings2, 
  Trash2,
  Wifi,
  WifiOff,
  Usb
} from 'lucide-react'

interface PrinterSelectorProps {
  selectedProfileId: string | null
  onSelectProfile: (profileId: string | null) => void
  compact?: boolean
}

interface PrinterProfileData {
  id: string
  name: string
  model?: string
  vendor?: string
  language: string
  dpi: number
  label_width_mm: number
  label_height_mm: number
  offset_x: number
  offset_y: number
  darkness: number
  speed: number
  is_default: number
  last_calibrated?: string
  connection_type?: string
}

export default function PrinterSelector({ 
  selectedProfileId, 
  onSelectProfile,
  compact = false
}: PrinterSelectorProps) {
  const queryClient = useQueryClient()
  const [showCalibration, setShowCalibration] = useState(false)
  const [editingProfile, setEditingProfile] = useState<PrinterProfile | undefined>()
  const [isConnected, setIsConnected] = useState(false)

  // Fetch printer profiles
  const { data: profilesData } = useQuery({
    queryKey: ['printer-profiles'],
    queryFn: () => api.get('/api/printer-profiles').then(r => r.data),
  })

  const profiles: PrinterProfileData[] = profilesData?.data || []
  const selectedProfile = profiles.find(p => p.id === selectedProfileId)
  const defaultProfile = profiles.find(p => p.is_default)

  // Set default profile
  const setDefaultMutation = useMutation({
    mutationFn: (id: string) => api.post(`/api/printer-profiles/${id}/set-default`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['printer-profiles'] })
  })

  // Delete profile
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/printer-profiles/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['printer-profiles'] })
      if (selectedProfileId === editingProfile?.id) {
        onSelectProfile(null)
      }
    }
  })

  // Quick connect
  const handleQuickConnect = async () => {
    try {
      const printer = getLabelPrinter()
      const detected = await printer.connect()
      
      if (detected) {
        setIsConnected(true)
        
        // Auto-select matching profile
        const matchingProfile = profiles.find(p => 
          p.model?.toLowerCase() === detected.model.toLowerCase() ||
          p.vendor?.toLowerCase() === detected.vendorName.toLowerCase()
        )
        
        if (matchingProfile) {
          onSelectProfile(matchingProfile.id)
        } else {
          // Open calibration for new printer
          setShowCalibration(true)
        }
      }
    } catch (err) {
      console.error('Failed to connect:', err)
      setIsConnected(false)
    }
  }

  // Convert DB format to PrinterProfile
  const toProfile = (p: PrinterProfileData): PrinterProfile => ({
    id: p.id,
    name: p.name,
    model: p.model,
    vendor: (p.vendor || 'generic') as PrinterProfile['vendor'],
    language: p.language as PrinterProfile['language'],
    dpi: p.dpi as 203 | 300 | 600,
    labelWidthMm: p.label_width_mm,
    labelHeightMm: p.label_height_mm,
    offsetX: p.offset_x,
    offsetY: p.offset_y,
    darkness: p.darkness,
    speed: p.speed
  })

  const handleEditProfile = (profile: PrinterProfileData) => {
    setEditingProfile(toProfile(profile))
    setShowCalibration(true)
  }

  const handleCalibrationComplete = (profile: PrinterProfile) => {
    onSelectProfile(profile.id)
    setShowCalibration(false)
    setEditingProfile(undefined)
  }

  if (compact) {
    return (
      <TooltipProvider>
        <div className="flex items-center gap-1">
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="h-8 w-8">
                    <Printer className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>
                {selectedProfile ? selectedProfile.name : 'Select Printer'}
              </TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Printer Profiles</DropdownMenuLabel>
              <DropdownMenuSeparator />
              
              {profiles.length === 0 ? (
                <DropdownMenuItem disabled className="text-muted-foreground">
                  No printers configured
                </DropdownMenuItem>
              ) : (
                profiles.map(profile => (
                  <DropdownMenuItem
                    key={profile.id}
                    onClick={() => onSelectProfile(profile.id)}
                    className="flex items-center justify-between"
                  >
                    <span className="flex items-center gap-2">
                      {profile.is_default ? <Check className="h-4 w-4 text-primary" /> : <span className="w-4" />}
                      {profile.name}
                    </span>
                    {profile.dpi}dpi
                  </DropdownMenuItem>
                ))
              )}
              
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setShowCalibration(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Printer
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          
          {/* Connection indicator */}
          <Badge variant={isConnected ? 'default' : 'outline'} className="h-8 px-2">
            {isConnected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3 text-muted-foreground" />}
          </Badge>
          
          <PrinterCalibrationWizard
            open={showCalibration}
            onClose={() => { setShowCalibration(false); setEditingProfile(undefined); }}
            existingProfile={editingProfile}
            onCalibrationComplete={handleCalibrationComplete}
          />
        </div>
      </TooltipProvider>
    )
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="justify-between min-w-[200px]">
            <span className="flex items-center gap-2">
              <Printer className="h-4 w-4" />
              {selectedProfile ? selectedProfile.name : 'Select Printer'}
            </span>
            <ChevronDown className="h-4 w-4 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          <DropdownMenuLabel className="flex items-center justify-between">
            <span>Printer Profiles</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2"
              onClick={handleQuickConnect}
            >
              <Usb className="h-3 w-3 mr-1" />
              Quick Connect
            </Button>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          
          {profiles.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              <Printer className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p>No printers configured</p>
              <p className="text-xs mt-1">Click "Add Printer" to set up</p>
            </div>
          ) : (
            profiles.map(profile => (
              <DropdownMenuItem
                key={profile.id}
                className="flex items-center justify-between py-2 cursor-pointer"
                onClick={() => onSelectProfile(profile.id)}
              >
                <div className="flex items-center gap-2">
                  {selectedProfileId === profile.id ? (
                    <Check className="h-4 w-4 text-primary" />
                  ) : (
                    <span className="w-4" />
                  )}
                  <div>
                    <div className="font-medium flex items-center gap-1">
                      {profile.name}
                      {profile.is_default && (
                        <Badge variant="secondary" className="h-4 text-[10px]">Default</Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {profile.label_width_mm}×{profile.label_height_mm}mm • {profile.dpi}dpi
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-1">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={(e) => { e.stopPropagation(); handleEditProfile(profile); }}
                        >
                          <Settings2 className="h-3 w-3" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Calibrate</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  
                  {!profile.is_default && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-destructive hover:text-destructive"
                            onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(profile.id); }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Delete</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
              </DropdownMenuItem>
            ))
          )}
          
          <DropdownMenuSeparator />
          
          <DropdownMenuItem onClick={() => setShowCalibration(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Printer Profile
          </DropdownMenuItem>
          
          {selectedProfile && !selectedProfile.is_default && (
            <DropdownMenuItem onClick={() => setDefaultMutation.mutate(selectedProfile.id)}>
              <Check className="mr-2 h-4 w-4" />
              Set as Default
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      
      <PrinterCalibrationWizard
        open={showCalibration}
        onClose={() => { setShowCalibration(false); setEditingProfile(undefined); }}
        existingProfile={editingProfile}
        onCalibrationComplete={handleCalibrationComplete}
      />
    </>
  )
}
