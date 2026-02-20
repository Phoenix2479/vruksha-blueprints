/**
 * EventBus Service - Lite Version (Electron IPC + EventEmitter)
 * Provides cross-app event communication for Niyam Lite
 * In Docker mode, use NATS instead
 */

const EventEmitter = require('events');
const { query, run } = require('./db');
const { v4: uuidv4 } = require('uuid');

// Environment detection
const NIYAM_MODE = process.env.NIYAM_MODE || 'lite';
const IS_DOCKER = NIYAM_MODE === 'docker';

// Event channels
const CHANNELS = {
  INVENTORY_INGESTED: 'inventory.ingested',
  INVENTORY_UPDATED: 'inventory.updated',
  LABELS_PRINTED: 'labels.printed',
  PRODUCTS_UPDATED: 'products.updated',
  LOW_STOCK_ALERT: 'alerts.low_stock',
  REORDER_SUGGESTION: 'alerts.reorder',
  SYNC_COMPLETE: 'sync.complete',
  AI_TASK_COMPLETE: 'ai.task_complete',
};

// ============================================
// Lite Mode: EventEmitter + SQLite Event Log
// ============================================

class LiteEventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(100); // Allow many subscribers
    this.electronIPC = null;
    this.isMainProcess = typeof process !== 'undefined' && process.type === 'browser';
  }

  /**
   * Initialize Electron IPC if available
   */
  initElectronIPC(ipcMain, BrowserWindow) {
    if (!ipcMain || !BrowserWindow) {
      console.log('[EventBus] Running without Electron IPC');
      return;
    }

    this.electronIPC = { ipcMain, BrowserWindow };

    // Handle publish from renderer
    ipcMain.handle('event:publish', async (event, channel, data) => {
      await this.publish(channel, data, event.sender);
      return { success: true };
    });

    // Handle subscribe from renderer
    ipcMain.handle('event:subscribe', async (event, channel) => {
      // Store subscriber window ID for targeted messages
      return { success: true };
    });

    console.log('[EventBus] Electron IPC initialized');
  }

  /**
   * Publish an event
   */
  async publish(channel, message, senderWebContents = null) {
    const eventData = {
      id: uuidv4(),
      channel,
      message,
      timestamp: new Date().toISOString(),
    };

    // Log to SQLite for persistence/replay
    this._logEvent(eventData);

    // Emit locally
    this.emit(channel, eventData);
    this.emit('*', eventData); // Wildcard for all events

    // Broadcast to other Electron windows if available
    if (this.electronIPC) {
      const { BrowserWindow } = this.electronIPC;
      BrowserWindow.getAllWindows().forEach(win => {
        if (!win.isDestroyed() && win.webContents !== senderWebContents) {
          win.webContents.send('event:broadcast', channel, eventData);
        }
      });
    }

    console.log(`[EventBus] Published: ${channel}`);
    return eventData;
  }

  /**
   * Subscribe to a channel
   */
  async subscribe(channel, handler) {
    this.on(channel, handler);
    console.log(`[EventBus] Subscribed to: ${channel}`);
    return () => this.off(channel, handler);
  }

  /**
   * Unsubscribe from a channel
   */
  async unsubscribe(channel, handler) {
    if (handler) {
      this.off(channel, handler);
    } else {
      this.removeAllListeners(channel);
    }
    console.log(`[EventBus] Unsubscribed from: ${channel}`);
  }

  /**
   * Log event to SQLite for persistence
   */
  _logEvent(eventData) {
    try {
      // Ensure event_log table exists
      run(`
        CREATE TABLE IF NOT EXISTS event_log (
          id TEXT PRIMARY KEY,
          channel TEXT NOT NULL,
          data TEXT,
          timestamp TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);

      run(
        'INSERT INTO event_log (id, channel, data, timestamp) VALUES (?, ?, ?, ?)',
        [eventData.id, eventData.channel, JSON.stringify(eventData.message), eventData.timestamp]
      );
    } catch (e) {
      console.error('[EventBus] Failed to log event:', e.message);
    }
  }

  /**
   * Replay recent events (useful for late subscribers)
   */
  async replayEvents(channel, since, limit = 100) {
    try {
      const events = query(
        `SELECT * FROM event_log WHERE channel = ? AND timestamp > ? ORDER BY timestamp ASC LIMIT ?`,
        [channel, since, limit]
      );

      return events.map(e => ({
        id: e.id,
        channel: e.channel,
        message: JSON.parse(e.data || '{}'),
        timestamp: e.timestamp,
      }));
    } catch (e) {
      console.error('[EventBus] Failed to replay events:', e.message);
      return [];
    }
  }

  /**
   * Clean old events (maintenance)
   */
  async cleanOldEvents(days = 7) {
    try {
      const result = run(
        `DELETE FROM event_log WHERE datetime(timestamp) < datetime('now', '-${days} days')`
      );
      console.log(`[EventBus] Cleaned old events (older than ${days} days)`);
    } catch (e) {
      console.error('[EventBus] Failed to clean events:', e.message);
    }
  }
}

// ============================================
// Docker Mode: NATS JetStream
// ============================================

class NATSEventBus {
  constructor() {
    this.nc = null;
    this.js = null;
    this.subscriptions = new Map();
    this.connected = false;
  }

  /**
   * Connect to NATS
   */
  async connect(url = process.env.NATS_URL || 'nats://localhost:4222') {
    try {
      // Dynamic import for NATS (only in Docker mode)
      const { connect, StringCodec } = await import('nats');
      this.codec = StringCodec();

      this.nc = await connect({ servers: url });
      this.js = this.nc.jetstream();
      this.connected = true;

      console.log(`[EventBus] Connected to NATS at ${url}`);

      // Handle disconnection
      this.nc.closed().then(() => {
        console.log('[EventBus] NATS connection closed');
        this.connected = false;
      });

      return true;
    } catch (e) {
      console.error('[EventBus] NATS connection failed:', e.message);
      this.connected = false;
      return false;
    }
  }

  /**
   * Publish an event
   */
  async publish(channel, message) {
    if (!this.connected || !this.nc) {
      console.warn('[EventBus] NATS not connected, event not published');
      return null;
    }

    const eventData = {
      id: uuidv4(),
      channel,
      message,
      timestamp: new Date().toISOString(),
    };

    try {
      const data = this.codec.encode(JSON.stringify(eventData));
      await this.nc.publish(channel, data);
      console.log(`[EventBus] Published to NATS: ${channel}`);
      return eventData;
    } catch (e) {
      console.error('[EventBus] NATS publish failed:', e.message);
      return null;
    }
  }

  /**
   * Subscribe to a channel
   */
  async subscribe(channel, handler) {
    if (!this.connected || !this.nc) {
      console.warn('[EventBus] NATS not connected, subscription deferred');
      return () => {};
    }

    try {
      const sub = this.nc.subscribe(channel);
      this.subscriptions.set(channel, sub);

      // Async iterator for messages
      (async () => {
        for await (const msg of sub) {
          try {
            const data = JSON.parse(this.codec.decode(msg.data));
            handler(data);
          } catch (e) {
            console.error('[EventBus] Message parse error:', e.message);
          }
        }
      })();

      console.log(`[EventBus] Subscribed to NATS: ${channel}`);
      return () => this.unsubscribe(channel);
    } catch (e) {
      console.error('[EventBus] NATS subscribe failed:', e.message);
      return () => {};
    }
  }

  /**
   * Unsubscribe from a channel
   */
  async unsubscribe(channel) {
    const sub = this.subscriptions.get(channel);
    if (sub) {
      sub.unsubscribe();
      this.subscriptions.delete(channel);
      console.log(`[EventBus] Unsubscribed from NATS: ${channel}`);
    }
  }

  /**
   * Close connection
   */
  async close() {
    if (this.nc) {
      await this.nc.close();
      this.connected = false;
      console.log('[EventBus] NATS connection closed');
    }
  }
}

// ============================================
// Unified EventBus Factory
// ============================================

let eventBusInstance = null;

/**
 * Get the appropriate EventBus for current mode
 */
function getEventBus() {
  if (eventBusInstance) {
    return eventBusInstance;
  }

  if (IS_DOCKER) {
    eventBusInstance = new NATSEventBus();
    // Auto-connect in Docker mode
    eventBusInstance.connect().catch(e => {
      console.error('[EventBus] Auto-connect failed, falling back to Lite mode');
      eventBusInstance = new LiteEventBus();
    });
  } else {
    eventBusInstance = new LiteEventBus();
  }

  return eventBusInstance;
}

// ============================================
// Convenience Event Publishers
// ============================================

/**
 * Publish inventory ingestion completed event
 */
async function publishIngestionCompleted(sessionId, stats) {
  return getEventBus().publish(CHANNELS.INVENTORY_INGESTED, {
    event: 'bulk_import_completed',
    sessionId,
    stats: {
      productsAdded: stats.created || 0,
      productsUpdated: stats.updated || 0,
      totalValue: stats.totalValue || 0,
      lowStockItems: stats.lowStockItems || [],
    },
    timestamp: new Date().toISOString(),
  });
}

/**
 * Publish print job completed event
 */
async function publishPrintCompleted(jobId, printerId, count, templateId) {
  return getEventBus().publish(CHANNELS.LABELS_PRINTED, {
    event: 'print_completed',
    jobId,
    printerId,
    labelCount: count,
    templateId,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Publish low stock alert
 */
async function publishLowStockAlert(productId, productName, currentQty, minQty) {
  return getEventBus().publish(CHANNELS.LOW_STOCK_ALERT, {
    event: 'low_stock',
    productId,
    productName,
    currentQuantity: currentQty,
    minimumQuantity: minQty,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Publish reorder suggestion
 */
async function publishReorderSuggestion(supplierId, supplierName, products) {
  return getEventBus().publish(CHANNELS.REORDER_SUGGESTION, {
    event: 'reorder_suggested',
    supplierId,
    supplierName,
    products,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Publish product update event
 */
async function publishProductsUpdated(productIds, updateType) {
  return getEventBus().publish(CHANNELS.PRODUCTS_UPDATED, {
    event: 'products_updated',
    productIds,
    updateType, // 'created' | 'updated' | 'deleted'
    timestamp: new Date().toISOString(),
  });
}

/**
 * Publish AI task completion
 */
async function publishAITaskComplete(taskId, taskType, result) {
  return getEventBus().publish(CHANNELS.AI_TASK_COMPLETE, {
    event: 'ai_task_complete',
    taskId,
    taskType,
    success: !result.error,
    result,
    timestamp: new Date().toISOString(),
  });
}

// ============================================
// Convenience Event Subscribers
// ============================================

function subscribeToIngestion(handler) {
  return getEventBus().subscribe(CHANNELS.INVENTORY_INGESTED, handler);
}

function subscribeToPrintEvents(handler) {
  return getEventBus().subscribe(CHANNELS.LABELS_PRINTED, handler);
}

function subscribeToLowStockAlerts(handler) {
  return getEventBus().subscribe(CHANNELS.LOW_STOCK_ALERT, handler);
}

function subscribeToProductUpdates(handler) {
  return getEventBus().subscribe(CHANNELS.PRODUCTS_UPDATED, handler);
}

function subscribeToAllEvents(handler) {
  return getEventBus().subscribe('*', handler);
}

// ============================================
// Exports
// ============================================

module.exports = {
  // Core
  getEventBus,
  CHANNELS,
  IS_DOCKER,
  // Classes (for testing)
  LiteEventBus,
  NATSEventBus,
  // Publishers
  publishIngestionCompleted,
  publishPrintCompleted,
  publishLowStockAlert,
  publishReorderSuggestion,
  publishProductsUpdated,
  publishAITaskComplete,
  // Subscribers
  subscribeToIngestion,
  subscribeToPrintEvents,
  subscribeToLowStockAlerts,
  subscribeToProductUpdates,
  subscribeToAllEvents,
};
