import { useState, useCallback } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { TemplateExport } from '@/types/barcode'
import {
  Button,
  Input,
  Label,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Card,
  CardContent,
  Badge,
  Separator,
} from '@shared/components/ui'
import { Upload, FileJson, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'

interface ImportTemplateModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function ImportTemplateModal({ open, onOpenChange }: ImportTemplateModalProps) {
  const queryClient = useQueryClient()
  const [file, setFile] = useState<File | null>(null)
  const [templateData, setTemplateData] = useState<TemplateExport | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [customName, setCustomName] = useState('')

  const importMutation = useMutation({
    mutationFn: (data: { template: TemplateExport['template']; overwrite_name?: string }) =>
      api.post('/api/templates/import', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      handleClose()
    },
  })

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return

    setFile(selectedFile)
    setParseError(null)
    setTemplateData(null)

    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string)
        
        // Validate structure
        if (!json.template || !json.template.name || !json.template.size || !json.template.elements) {
          throw new Error('Invalid template format: missing required fields')
        }

        setTemplateData(json as TemplateExport)
        setCustomName(json.template.name)
      } catch (err) {
        setParseError((err as Error).message)
      }
    }
    reader.onerror = () => setParseError('Failed to read file')
    reader.readAsText(selectedFile)
  }, [])

  const handleImport = () => {
    if (!templateData) return
    
    importMutation.mutate({
      template: templateData.template,
      overwrite_name: customName !== templateData.template.name ? customName : undefined,
    })
  }

  const handleClose = () => {
    setFile(null)
    setTemplateData(null)
    setParseError(null)
    setCustomName('')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Import Template
          </DialogTitle>
          <DialogDescription>
            Import a label template from a JSON file
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* File Upload */}
          <div className="space-y-2">
            <Label>Template File</Label>
            <div className="flex items-center gap-2">
              <Input
                type="file"
                accept=".json,application/json"
                onChange={handleFileChange}
                className="flex-1"
              />
            </div>
          </div>

          {/* Parse Error */}
          {parseError && (
            <Card className="border-destructive bg-destructive/10">
              <CardContent className="p-3 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
                <div className="text-sm text-destructive">
                  <p className="font-medium">Invalid file</p>
                  <p>{parseError}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Template Preview */}
          {templateData && (
            <Card className="border-green-200 bg-green-50">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-medium text-green-800">Valid template file</span>
                </div>

                <Separator />

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Original Name:</span>
                    <span className="font-medium">{templateData.template.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Size:</span>
                    <span>{templateData.template.size.width}×{templateData.template.size.height}mm</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Elements:</span>
                    <Badge variant="secondary">{templateData.template.elements.length}</Badge>
                  </div>
                  {templateData.template.category && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Category:</span>
                      <Badge variant="outline">{templateData.template.category}</Badge>
                    </div>
                  )}
                  {templateData.exportedAt && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Exported:</span>
                      <span className="text-xs">{new Date(templateData.exportedAt).toLocaleString()}</span>
                    </div>
                  )}
                </div>

                <Separator />

                {/* Custom Name */}
                <div className="space-y-2">
                  <Label className="text-xs">Import as (name):</Label>
                  <Input
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder="Template name"
                  />
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={!templateData || !customName.trim() || importMutation.isPending}
          >
            {importMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <FileJson className="h-4 w-4 mr-2" />
            )}
            Import
          </Button>
        </DialogFooter>

        {importMutation.isError && (
          <p className="text-sm text-destructive text-center">
            {(importMutation.error as Error)?.message || 'Import failed'}
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
