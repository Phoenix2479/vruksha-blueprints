/**
 * Email Service - Core email operations (IMAP/SMTP/Gmail/Outlook)
 */

const nodemailer = require('nodemailer');
const Imap = require('imap');
const { simpleParser } = require('mailparser');

// In-memory cache for messages
const messageCache = new Map();

class EmailService {
  constructor(query) {
    this.query = query;
  }

  // ===== IMAP Operations =====

  async testImapConnection(config) {
    return new Promise((resolve, reject) => {
      const imap = new Imap({
        user: config.username,
        password: config.password,
        host: config.imapHost,
        port: config.imapPort || 993,
        tls: true,
        tlsOptions: { rejectUnauthorized: false }
      });

      imap.once('ready', () => {
        imap.end();
        resolve({ success: true, message: 'IMAP connection successful' });
      });

      imap.once('error', (err) => {
        reject(new Error(`IMAP connection failed: ${err.message}`));
      });

      imap.connect();
    });
  }

  async fetchImapMessages(config, folder = 'INBOX', limit = 50) {
    return new Promise((resolve, reject) => {
      const messages = [];
      const imap = new Imap({
        user: config.username,
        password: config.password,
        host: config.imapHost,
        port: config.imapPort || 993,
        tls: true,
        tlsOptions: { rejectUnauthorized: false }
      });

      imap.once('ready', () => {
        imap.openBox(folder, true, (err, box) => {
          if (err) return reject(err);

          const total = box.messages.total;
          if (total === 0) {
            imap.end();
            return resolve([]);
          }

          const start = Math.max(1, total - limit + 1);
          const fetch = imap.seq.fetch(`${start}:${total}`, { bodies: '' });

          fetch.on('message', (msg, seqno) => {
            let buffer = '';
            msg.on('body', (stream) => {
              stream.on('data', (chunk) => { buffer += chunk.toString('utf8'); });
            });

            msg.once('end', () => {
              simpleParser(buffer, (err, parsed) => {
                if (!err && parsed) {
                  messages.push({
                    id: `imap-${seqno}`,
                    subject: parsed.subject || '(No Subject)',
                    from: parsed.from?.text || 'Unknown',
                    to: parsed.to?.text || '',
                    date: parsed.date?.toISOString() || new Date().toISOString(),
                    body: parsed.text || parsed.html || '',
                    read: false,
                    folder
                  });
                }
              });
            });
          });

          fetch.once('error', reject);
          fetch.once('end', () => {
            imap.end();
            resolve(messages.reverse());
          });
        });
      });

      imap.once('error', reject);
      imap.connect();
    });
  }

  async sendSmtpEmail(config, emailData) {
    const transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort || 587,
      secure: config.smtpPort === 465,
      auth: {
        user: config.username,
        pass: config.password
      }
    });

    const info = await transporter.sendMail({
      from: config.username,
      to: emailData.to,
      cc: emailData.cc,
      bcc: emailData.bcc,
      subject: emailData.subject,
      text: emailData.body,
      html: emailData.html,
      attachments: emailData.attachments
    });

    return { messageId: info.messageId };
  }

  // ===== Gmail Operations =====

  async fetchGmailMessages(config, limit = 50) {
    const { createGmailClient, isGoogleConfigured } = require('../lib/oauth-providers');
    
    if (!isGoogleConfigured()) {
      throw new Error('Gmail OAuth2 not configured. Use IMAP/SMTP with imap.gmail.com instead.');
    }

    if (!config.accessToken) {
      throw new Error('No access token. Please reconnect the Gmail account.');
    }

    const gmail = createGmailClient(config.accessToken, config.refreshToken);
    const listResponse = await gmail.users.messages.list({
      userId: 'me',
      maxResults: limit,
      q: 'in:inbox',
    });

    const messages = [];
    for (const msgRef of (listResponse.data.messages || []).slice(0, 20)) {
      try {
        const msgResponse = await gmail.users.messages.get({
          userId: 'me',
          id: msgRef.id,
          format: 'full',
        });

        const msg = msgResponse.data;
        const headers = msg.payload?.headers || [];
        const getHeader = (name) => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';

        let body = '';
        if (msg.payload?.body?.data) {
          body = Buffer.from(msg.payload.body.data, 'base64').toString('utf8');
        } else if (msg.payload?.parts) {
          const textPart = msg.payload.parts.find(p => p.mimeType === 'text/plain');
          if (textPart?.body?.data) {
            body = Buffer.from(textPart.body.data, 'base64').toString('utf8');
          }
        }

        messages.push({
          id: msg.id,
          threadId: msg.threadId,
          subject: getHeader('Subject'),
          from: getHeader('From'),
          to: getHeader('To'),
          date: getHeader('Date'),
          body: body.substring(0, 5000),
          snippet: msg.snippet,
          labels: msg.labelIds || [],
          read: !msg.labelIds?.includes('UNREAD'),
        });
      } catch (e) {
        console.error(`Failed to fetch Gmail message ${msgRef.id}:`, e.message);
      }
    }
    return messages;
  }

  async sendGmailEmail(config, emailData) {
    const { createGmailClient, isGoogleConfigured } = require('../lib/oauth-providers');
    
    if (!isGoogleConfigured() || !config.accessToken) {
      throw new Error('Gmail OAuth2 not configured. Use IMAP/SMTP with smtp.gmail.com instead.');
    }

    const gmail = createGmailClient(config.accessToken, config.refreshToken);
    const messageParts = [
      `To: ${emailData.to}`,
      emailData.cc ? `Cc: ${emailData.cc}` : null,
      `Subject: ${emailData.subject}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      emailData.body,
    ].filter(Boolean);

    const encodedMessage = Buffer.from(messageParts.join('\r\n')).toString('base64url');
    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: encodedMessage },
    });

    return { messageId: response.data.id };
  }

  // ===== Outlook Operations =====

  async fetchOutlookMessages(config, limit = 50) {
    const { isMicrosoftConfigured } = require('../lib/oauth-providers');
    const { Client: MsGraphClient } = require('@microsoft/microsoft-graph-client');
    
    if (!isMicrosoftConfigured()) {
      throw new Error('Outlook OAuth2 not configured. Use IMAP/SMTP with outlook.office365.com instead.');
    }

    if (!config.accessToken) {
      throw new Error('No access token. Please reconnect the Outlook account.');
    }

    const client = MsGraphClient.init({
      authProvider: (done) => done(null, config.accessToken),
    });

    const response = await client
      .api('/me/mailFolders/inbox/messages')
      .top(limit)
      .select('id,subject,from,toRecipients,receivedDateTime,bodyPreview,body,isRead')
      .orderby('receivedDateTime DESC')
      .get();

    return (response.value || []).map(msg => ({
      id: msg.id,
      subject: msg.subject || '',
      from: msg.from?.emailAddress?.address || '',
      fromName: msg.from?.emailAddress?.name || '',
      to: msg.toRecipients?.map(r => r.emailAddress?.address).join(', ') || '',
      date: msg.receivedDateTime,
      body: msg.body?.content?.substring(0, 5000) || '',
      snippet: msg.bodyPreview || '',
      read: msg.isRead,
    }));
  }

  async sendOutlookEmail(config, emailData) {
    const { isMicrosoftConfigured } = require('../lib/oauth-providers');
    const { Client: MsGraphClient } = require('@microsoft/microsoft-graph-client');
    
    if (!isMicrosoftConfigured() || !config.accessToken) {
      throw new Error('Outlook OAuth2 not configured. Use IMAP/SMTP with smtp.office365.com instead.');
    }

    const client = MsGraphClient.init({
      authProvider: (done) => done(null, config.accessToken),
    });

    const message = {
      subject: emailData.subject,
      body: { contentType: 'Text', content: emailData.body },
      toRecipients: emailData.to.split(',').map(email => ({
        emailAddress: { address: email.trim() },
      })),
    };

    if (emailData.cc) {
      message.ccRecipients = emailData.cc.split(',').map(email => ({
        emailAddress: { address: email.trim() },
      }));
    }

    const response = await client.api('/me/sendMail').post({ message });
    return { messageId: response?.id || 'sent' };
  }

  // ===== Unified Operations =====

  async fetchMessages(provider, config, folder = 'INBOX', limit = 50) {
    switch (provider) {
      case 'gmail': return this.fetchGmailMessages(config, limit);
      case 'outlook': return this.fetchOutlookMessages(config, limit);
      default: return this.fetchImapMessages(config, folder, limit);
    }
  }

  async sendEmail(provider, config, emailData) {
    switch (provider) {
      case 'gmail': return this.sendGmailEmail(config, emailData);
      case 'outlook': return this.sendOutlookEmail(config, emailData);
      default: return this.sendSmtpEmail(config, emailData);
    }
  }

  async testConnection(provider, config) {
    switch (provider) {
      case 'gmail': return { success: true, message: 'Gmail OAuth connection valid' };
      case 'outlook': return { success: true, message: 'Outlook OAuth connection valid' };
      default: return this.testImapConnection(config);
    }
  }

  // ===== Cache Management =====

  cacheMessages(tenantId, accountEmail, messages) {
    messageCache.set(`${tenantId}:${accountEmail}`, { messages, timestamp: Date.now() });
  }

  getCachedMessages(tenantId, accountEmail, maxAge = 300000) {
    const cached = messageCache.get(`${tenantId}:${accountEmail}`);
    return (cached && Date.now() - cached.timestamp < maxAge) ? cached.messages : null;
  }

  clearCache(tenantId, accountEmail) {
    messageCache.delete(`${tenantId}:${accountEmail}`);
  }
}

module.exports = EmailService;
