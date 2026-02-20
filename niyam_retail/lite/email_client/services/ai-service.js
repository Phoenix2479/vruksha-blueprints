/**
 * AI Service - Email categorization, smart replies, summarization
 */

class AIService {
  categorizeMessage(msg) {
    const subject = (msg.subject || '').toLowerCase();
    const from = (msg.from || '').toLowerCase();
    
    if (subject.includes('invoice') || subject.includes('payment') || subject.includes('receipt')) {
      return 'financial';
    }
    if (subject.includes('meeting') || subject.includes('calendar') || subject.includes('schedule')) {
      return 'calendar';
    }
    if (subject.includes('urgent') || subject.includes('important') || subject.includes('asap')) {
      return 'urgent';
    }
    if (subject.includes('order') || subject.includes('shipping') || subject.includes('delivery')) {
      return 'orders';
    }
    if (from.includes('noreply') || from.includes('newsletter') || subject.includes('unsubscribe')) {
      return 'newsletter';
    }
    return 'general';
  }

  calculatePriority(msg) {
    const subject = (msg.subject || '').toLowerCase();
    
    if (subject.includes('urgent') || subject.includes('asap') || subject.includes('immediately')) {
      return 'high';
    }
    if (subject.includes('fyi') || subject.includes('newsletter') || subject.includes('weekly')) {
      return 'low';
    }
    return 'medium';
  }

  generateSmartReplies(msg) {
    const category = this.categorizeMessage(msg);
    
    const replies = {
      financial: [
        { text: 'Thank you for the invoice. I will process this shortly.', type: 'formal' },
        { text: 'Received, thanks!', type: 'casual' },
        { text: 'I have a question about this invoice. Can we schedule a call?', type: 'question' }
      ],
      calendar: [
        { text: 'I confirm my attendance for this meeting.', type: 'confirm' },
        { text: 'Unfortunately, I won\'t be able to attend. Can we reschedule?', type: 'decline' },
        { text: 'Let me check my calendar and get back to you.', type: 'tentative' }
      ],
      urgent: [
        { text: 'I\'m on it. Will update you shortly.', type: 'acknowledge' },
        { text: 'Thank you for flagging this. I\'ll prioritize it.', type: 'formal' },
        { text: 'Got it, working on this now.', type: 'casual' }
      ],
      default: [
        { text: 'Thank you for your email. I will review and get back to you soon.', type: 'formal' },
        { text: 'Thanks! Will look into this.', type: 'casual' },
        { text: 'Acknowledged. I\'ll follow up shortly.', type: 'professional' }
      ]
    };

    return replies[category] || replies.default;
  }

  summarizeMessage(msg) {
    const body = msg.body || '';
    const sentences = body
      .replace(/<[^>]*>/g, ' ')
      .split(/[.!?]/)
      .map(s => s.trim())
      .filter(s => s.length > 10);
    
    if (sentences.length === 0) {
      return msg.snippet || 'No content to summarize.';
    }
    
    return sentences.slice(0, 3).join('. ') + '.';
  }

  categorizeMessages(messages) {
    return messages.map(msg => ({
      ...msg,
      category: this.categorizeMessage(msg),
      priority: this.calculatePriority(msg)
    }));
  }
}

module.exports = AIService;
