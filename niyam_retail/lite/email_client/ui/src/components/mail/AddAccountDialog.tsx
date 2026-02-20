import { useState, useEffect } from 'react'
import { emailClient } from '@shared/api/emailClient'
import { Button } from '@shared/components/ui/button'
import { Input } from '@shared/components/ui/input'
import { Label } from '@shared/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@shared/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/components/ui/select'
import { Alert, AlertDescription } from '@shared/components/ui/alert'
import { Plus, Loader2, AlertCircle, CheckCircle2, Globe, Mail } from 'lucide-react'
import axios from 'axios'

interface AddAccountDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

const presets: Record<string, { imap: string; imapPort: string; smtp: string; smtpPort: string }> = {
  'gmail.com': { imap: 'imap.gmail.com', imapPort: '993', smtp: 'smtp.gmail.com', smtpPort: '587' },
  'outlook.com': { imap: 'outlook.office365.com', imapPort: '993', smtp: 'smtp.office365.com', smtpPort: '587' },
  'hotmail.com': { imap: 'outlook.office365.com', imapPort: '993', smtp: 'smtp.office365.com', smtpPort: '587' },
  'yahoo.com': { imap: 'imap.mail.yahoo.com', imapPort: '993', smtp: 'smtp.mail.yahoo.com', smtpPort: '587' },
  'icloud.com': { imap: 'imap.mail.me.com', imapPort: '993', smtp: 'smtp.mail.me.com', smtpPort: '587' },
  'zoho.com': { imap: 'imap.zoho.com', imapPort: '993', smtp: 'smtp.zoho.com', smtpPort: '587' },
}

export function AddAccountDialog({ open, onOpenChange, onSuccess }: AddAccountDialogProps) {
  const [provider, setProvider] = useState<'imap' | 'gmail' | 'outlook'>('imap')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [imapHost, setImapHost] = useState('')
  const [imapPort, setImapPort] = useState('993')
  const [smtpHost, setSmtpHost] = useState('')
  const [smtpPort, setSmtpPort] = useState('587')
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [oauthStatus, setOauthStatus] = useState<{
    google: { configured: boolean }
    microsoft: { configured: boolean }
  } | null>(null)

  useEffect(() => {
    // Check OAuth configuration status
    axios.get('/auth/status')
      .then(res => setOauthStatus(res.data))
      .catch(() => setOauthStatus({ google: { configured: false }, microsoft: { configured: false } }))
  }, [])

  const handleEmailChange = (value: string) => {
    setEmail(value)
    const domain = value.split('@')[1]?.toLowerCase()
    if (domain && presets[domain]) {
      setImapHost(presets[domain].imap)
      setImapPort(presets[domain].imapPort)
      setSmtpHost(presets[domain].smtp)
      setSmtpPort(presets[domain].smtpPort)
    }
  }

  const handleConnect = async () => {
    if (!email || !password) {
      setError('Email and password are required')
      return
    }
    if (provider === 'imap' && (!imapHost || !smtpHost)) {
      setError('IMAP and SMTP server addresses are required')
      return
    }

    try {
      setConnecting(true)
      setError(null)

      await emailClient.connectAccount({
        email,
        provider,
        config: {
          username: email,
          password,
          imapHost,
          imapPort: parseInt(imapPort),
          smtpHost,
          smtpPort: parseInt(smtpPort),
        },
      })

      setSuccess(true)
      setTimeout(() => {
        onSuccess()
        resetForm()
      }, 1500)
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to connect account')
    } finally {
      setConnecting(false)
    }
  }

  const resetForm = () => {
    setEmail('')
    setPassword('')
    setImapHost('')
    setImapPort('993')
    setSmtpHost('')
    setSmtpPort('587')
    setProvider('imap')
    setError(null)
    setSuccess(false)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) resetForm() }}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Add Email Account
          </DialogTitle>
          <DialogDescription>
            Connect your email account to send and receive emails
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Provider</Label>
            <Select value={provider} onValueChange={(v: any) => setProvider(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="imap">
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    IMAP/SMTP (Any Provider)
                  </div>
                </SelectItem>
                <SelectItem value="gmail" disabled={!oauthStatus?.google?.configured}>
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    Gmail (OAuth2){!oauthStatus?.google?.configured && ' - Not Configured'}
                  </div>
                </SelectItem>
                <SelectItem value="outlook" disabled={!oauthStatus?.microsoft?.configured}>
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    Outlook (OAuth2){!oauthStatus?.microsoft?.configured && ' - Not Configured'}
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* OAuth Connect Buttons */}
          {provider === 'gmail' && oauthStatus?.google?.configured && (
            <div className="space-y-2">
              <Button
                className="w-full"
                onClick={() => {
                  window.location.href = '/auth/google?return_url=' + encodeURIComponent(window.location.pathname)
                }}
              >
                <Mail className="mr-2 h-4 w-4" />
                Connect with Google
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                You'll be redirected to Google to authorize access
              </p>
            </div>
          )}

          {provider === 'outlook' && oauthStatus?.microsoft?.configured && (
            <div className="space-y-2">
              <Button
                className="w-full"
                onClick={() => {
                  window.location.href = '/auth/microsoft?return_url=' + encodeURIComponent(window.location.pathname)
                }}
              >
                <Mail className="mr-2 h-4 w-4" />
                Connect with Microsoft
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                You'll be redirected to Microsoft to authorize access
              </p>
            </div>
          )}

          {provider === 'imap' && (
            <>
              <div className="space-y-2">
                <Label htmlFor="email">Email Address *</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => handleEmailChange(e.target.value)}
                  disabled={connecting}
                />
                <p className="text-xs text-muted-foreground">
                  Server settings will auto-fill for common providers
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password / App Password *</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Your email password or app-specific password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={connecting}
                />
                <p className="text-xs text-muted-foreground">
                  For Gmail/Yahoo, use an App Password from your account settings
                </p>
              </div>
            </>
          )}

          {provider === 'imap' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="imapHost">IMAP Server *</Label>
                  <Input
                    id="imapHost"
                    placeholder="imap.example.com"
                    value={imapHost}
                    onChange={(e) => setImapHost(e.target.value)}
                    disabled={connecting}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="imapPort">IMAP Port</Label>
                  <Input
                    id="imapPort"
                    placeholder="993"
                    value={imapPort}
                    onChange={(e) => setImapPort(e.target.value)}
                    disabled={connecting}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="smtpHost">SMTP Server *</Label>
                  <Input
                    id="smtpHost"
                    placeholder="smtp.example.com"
                    value={smtpHost}
                    onChange={(e) => setSmtpHost(e.target.value)}
                    disabled={connecting}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtpPort">SMTP Port</Label>
                  <Input
                    id="smtpPort"
                    placeholder="587"
                    value={smtpPort}
                    onChange={(e) => setSmtpPort(e.target.value)}
                    disabled={connecting}
                  />
                </div>
              </div>
            </>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert className="border-green-500 bg-green-50">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-600">
                Account connected successfully!
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={connecting}>
            Cancel
          </Button>
          {provider === 'imap' && (
            <Button onClick={handleConnect} disabled={connecting || !email || !password}>
              {connecting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  Connect Account
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
