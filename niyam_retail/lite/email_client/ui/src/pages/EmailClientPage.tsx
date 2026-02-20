/**
 * Universal Email Client - Modern UI
 * shadcn-inspired 3-panel resizable layout
 */

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { emailClient } from '@shared/api/emailClient'
import { Mail } from '@/components/mail/Mail'
import { EmailSendDialog } from '@shared/components/email/EmailSendDialog'
import { AddAccountDialog } from '@/components/mail/AddAccountDialog'

export default function EmailClientPage() {
  const [showCompose, setShowCompose] = useState(false)
  const [showAddAccount, setShowAddAccount] = useState(false)
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null)
  const queryClient = useQueryClient()

  // Fetch accounts
  const { data: accountsData, refetch: refetchAccounts } = useQuery({
    queryKey: ['email-accounts'],
    queryFn: () => emailClient.getAccounts(),
  })

  // Fetch messages
  const { data: messagesData, isLoading: loadingMessages, refetch: refetchMessages } = useQuery({
    queryKey: ['email-messages', selectedAccount],
    queryFn: () => emailClient.getMessages({
      account: selectedAccount || undefined,
      limit: 100,
    }),
  })

  // Fetch stats
  const { data: stats } = useQuery({
    queryKey: ['email-stats'],
    queryFn: () => emailClient.getStats(),
  })

  const accounts = accountsData?.accounts || []
  const messages = (messagesData?.messages || []).map(m => ({
    ...m,
    from: m.from_address || m.from,
    body: m.body_text || m.body,
  }))

  // Set first account as default if none selected
  if (!selectedAccount && accounts.length > 0) {
    setSelectedAccount(accounts[0].email)
  }

  const handleSync = async () => {
    if (accounts.length === 0) {
      setShowAddAccount(true)
      return
    }
    for (const account of accounts) {
      await emailClient.fetchMessages(account.email)
    }
    refetchMessages()
  }

  const handleAccountAdded = () => {
    refetchAccounts()
    setShowAddAccount(false)
  }

  const handleReply = (mail: any) => {
    setShowCompose(true)
  }

  const handleDelete = async (mail: any) => {
    if (confirm('Delete this message?')) {
      await emailClient.deleteMessage(mail.id, selectedAccount || '')
      refetchMessages()
    }
  }

  return (
    <div className="h-screen bg-background">
      <Mail
        accounts={accounts}
        messages={messages}
        selectedAccount={selectedAccount}
        onAccountChange={setSelectedAccount}
        onSync={handleSync}
        onCompose={() => setShowCompose(true)}
        onAddAccount={() => setShowAddAccount(true)}
        onReply={handleReply}
        onDelete={handleDelete}
        isLoading={loadingMessages}
        stats={{
          unreadMessages: stats?.unreadMessages || 0,
          totalMessages: stats?.totalMessages || 0,
        }}
      />

      <EmailSendDialog
        open={showCompose}
        onOpenChange={setShowCompose}
        appName="Email Client"
      />

      <AddAccountDialog
        open={showAddAccount}
        onOpenChange={setShowAddAccount}
        onSuccess={handleAccountAdded}
      />
    </div>
  )
}
