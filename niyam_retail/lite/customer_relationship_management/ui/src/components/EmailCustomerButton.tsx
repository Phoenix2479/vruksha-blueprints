/**
 * Example: Email integration in CRM
 * This shows how to use the EmailSendDialog in any retail app
 */

import { useState } from 'react';
import { Button } from '../../../../../shared/components/ui/button';
import { EmailSendDialog } from '../../../../../shared/components/email/EmailSendDialog';
import { Mail } from 'lucide-react';

interface EmailCustomerButtonProps {
  customerEmail: string;
  customerName: string;
  subject?: string;
  body?: string;
}

export function EmailCustomerButton({
  customerEmail,
  customerName,
  subject = '',
  body = '',
}: EmailCustomerButtonProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleEmailSent = (messageId: string) => {
    console.log('Email sent successfully:', messageId);
    // You can add custom logic here, like:
    // - Log the email activity to customer history
    // - Show a success toast
    // - Refresh customer data
  };

  return (
    <>
      <Button
        onClick={() => setDialogOpen(true)}
        variant="outline"
        size="sm"
        className="gap-2"
      >
        <Mail className="h-4 w-4" />
        Email {customerName}
      </Button>

      <EmailSendDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        defaultTo={customerEmail}
        defaultSubject={subject}
        defaultBody={body}
        appName="CRM"
        onEmailSent={handleEmailSent}
      />
    </>
  );
}

// Example usage in Customer360Page.tsx:
/*
import { EmailCustomerButton } from '../components/EmailCustomerButton';

// In your customer details view:
<EmailCustomerButton
  customerEmail={customer.email}
  customerName={customer.name}
  subject={`Hello ${customer.name}`}
  body={`Dear ${customer.name},\n\nThank you for being a valued customer.\n\nBest regards,\nYour Team`}
/>
*/
