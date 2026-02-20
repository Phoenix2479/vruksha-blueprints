/**
 * Sync Manager - Handles background synchronization for offline POS
 * 
 * Manages the sync queue, retries failed transactions, and coordinates
 * data synchronization between IndexedDB and the server.
 */

import {
  getPendingTransactionsByStatus,
  savePendingTransaction,
  deletePendingTransaction,
  getSyncQueue,
  removeSyncQueueItem,
  updateSyncQueueItem,
  saveProducts,
  saveCustomers,
  setSetting,
  getSetting,
  type PendingTransaction,
  type SyncQueueItem,
  type OfflineProduct,
  type OfflineCustomer,
} from './offline-db';

// API base URL
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8800';

// Sync configuration
const MAX_RETRY_ATTEMPTS = 5;
const SYNC_INTERVAL_MS = 30000; // 30 seconds

// Sync state
let syncInProgress = false;
let syncIntervalId: number | null = null;
// @ts-expect-error Used in onOnlineStatusChange
let onlineStatusCallback: ((online: boolean) => void) | null = null;
let syncStatusCallback: ((status: SyncStatus) => void) | null = null;

export interface SyncStatus {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  lastSyncAt: string | null;
  lastSyncError: string | null;
}

export interface SyncResult {
  success: boolean;
  synced: number;
  failed: number;
  errors: string[];
}

/**
 * Check if browser is online
 */
export function isOnline(): boolean {
  return navigator.onLine;
}

/**
 * Register callback for online status changes
 */
export function onOnlineStatusChange(callback: (online: boolean) => void): () => void {
  onlineStatusCallback = callback;

  const handleOnline = () => callback(true);
  const handleOffline = () => callback(false);

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  // Initial state
  callback(navigator.onLine);

  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
    onlineStatusCallback = null;
  };
}

/**
 * Register callback for sync status changes
 */
export function onSyncStatusChange(callback: (status: SyncStatus) => void): () => void {
  syncStatusCallback = callback;
  return () => {
    syncStatusCallback = null;
  };
}

/**
 * Notify sync status change
 */
async function notifySyncStatus(overrides: Partial<SyncStatus> = {}): Promise<void> {
  if (!syncStatusCallback) return;

  const pendingTxs = await getPendingTransactionsByStatus('pending');
  const lastSyncAt = await getSetting<string>('lastSyncAt');
  const lastSyncError = await getSetting<string>('lastSyncError');

  syncStatusCallback({
    isOnline: isOnline(),
    isSyncing: syncInProgress,
    pendingCount: pendingTxs.length,
    lastSyncAt: lastSyncAt || null,
    lastSyncError: lastSyncError || null,
    ...overrides,
  });
}

/**
 * Start automatic sync interval
 */
export function startAutoSync(): void {
  if (syncIntervalId !== null) return;

  syncIntervalId = window.setInterval(async () => {
    if (isOnline() && !syncInProgress) {
      await syncAll();
    }
  }, SYNC_INTERVAL_MS);

  // Also sync immediately if online
  if (isOnline()) {
    syncAll();
  }

  console.log('Auto-sync started');
}

/**
 * Stop automatic sync
 */
export function stopAutoSync(): void {
  if (syncIntervalId !== null) {
    clearInterval(syncIntervalId);
    syncIntervalId = null;
    console.log('Auto-sync stopped');
  }
}

/**
 * Sync all pending data
 */
export async function syncAll(): Promise<SyncResult> {
  if (syncInProgress) {
    return { success: false, synced: 0, failed: 0, errors: ['Sync already in progress'] };
  }

  if (!isOnline()) {
    return { success: false, synced: 0, failed: 0, errors: ['Offline'] };
  }

  syncInProgress = true;
  await notifySyncStatus({ isSyncing: true });

  const result: SyncResult = {
    success: true,
    synced: 0,
    failed: 0,
    errors: [],
  };

  try {
    // Sync pending transactions
    const txResult = await syncPendingTransactions();
    result.synced += txResult.synced;
    result.failed += txResult.failed;
    result.errors.push(...txResult.errors);

    // Process sync queue
    const queueResult = await processSyncQueue();
    result.synced += queueResult.synced;
    result.failed += queueResult.failed;
    result.errors.push(...queueResult.errors);

    // Update last sync time
    await setSetting('lastSyncAt', new Date().toISOString());
    if (result.errors.length > 0) {
      await setSetting('lastSyncError', result.errors[result.errors.length - 1]);
    } else {
      await setSetting('lastSyncError', null);
    }

    result.success = result.failed === 0;
  } catch (error) {
    result.success = false;
    result.errors.push(error instanceof Error ? error.message : 'Sync failed');
    await setSetting('lastSyncError', result.errors[result.errors.length - 1]);
  } finally {
    syncInProgress = false;
    await notifySyncStatus({ isSyncing: false });
  }

  return result;
}

/**
 * Sync pending transactions to server
 */
async function syncPendingTransactions(): Promise<SyncResult> {
  const result: SyncResult = { success: true, synced: 0, failed: 0, errors: [] };
  const pendingTxs = await getPendingTransactionsByStatus('pending');

  for (const tx of pendingTxs) {
    try {
      const response = await fetch(`${API_BASE}/transactions/offline-sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offlineId: tx.id,
          sessionId: tx.sessionId,
          items: tx.items,
          subtotal: tx.subtotal,
          taxTotal: tx.taxTotal,
          discountTotal: tx.discountTotal,
          total: tx.total,
          payments: tx.payments,
          customerId: tx.customerId,
          createdAt: tx.createdAt,
        }),
      });

      if (response.ok) {
        // Mark as synced and remove
        await deletePendingTransaction(tx.id);
        result.synced++;
        console.log(`Transaction ${tx.id} synced successfully`);
      } else {
        throw new Error(`Server returned ${response.status}`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      result.failed++;
      result.errors.push(`Transaction ${tx.id}: ${errorMsg}`);

      // Update retry count
      const updatedTx: PendingTransaction = {
        ...tx,
        syncAttempts: tx.syncAttempts + 1,
        lastSyncError: errorMsg,
        status: tx.syncAttempts + 1 >= MAX_RETRY_ATTEMPTS ? 'failed' : 'pending',
      };
      await savePendingTransaction(updatedTx);

      console.error(`Failed to sync transaction ${tx.id}:`, errorMsg);
    }
  }

  return result;
}

/**
 * Process items in sync queue
 */
async function processSyncQueue(): Promise<SyncResult> {
  const result: SyncResult = { success: true, synced: 0, failed: 0, errors: [] };
  const queue = await getSyncQueue();

  for (const item of queue) {
    try {
      let endpoint = '';
      let method = 'POST';

      switch (item.type) {
        case 'customer':
          endpoint = item.action === 'create' ? '/customers' : `/customers/${(item.data as { id: string }).id}`;
          method = item.action === 'delete' ? 'DELETE' : item.action === 'update' ? 'PUT' : 'POST';
          break;
        default:
          continue; // Skip unknown types
      }

      const response = await fetch(`${API_BASE}${endpoint}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: method !== 'DELETE' ? JSON.stringify(item.data) : undefined,
      });

      if (response.ok) {
        await removeSyncQueueItem(item.id);
        result.synced++;
      } else {
        throw new Error(`Server returned ${response.status}`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      result.failed++;
      result.errors.push(`Sync queue item ${item.id}: ${errorMsg}`);

      // Update retry count
      const updatedItem: SyncQueueItem = {
        ...item,
        attempts: item.attempts + 1,
        lastError: errorMsg,
      };

      if (updatedItem.attempts >= MAX_RETRY_ATTEMPTS) {
        await removeSyncQueueItem(item.id);
        console.error(`Sync queue item ${item.id} exceeded max retries, removing`);
      } else {
        await updateSyncQueueItem(updatedItem);
      }
    }
  }

  return result;
}

/**
 * Fetch and cache products from server
 */
export async function fetchAndCacheProducts(): Promise<number> {
  if (!isOnline()) {
    throw new Error('Cannot fetch products while offline');
  }

  try {
    const response = await fetch(`${API_BASE}/products?limit=1000`);
    if (!response.ok) {
      throw new Error(`Server returned ${response.status}`);
    }

    const data = await response.json();
    const products: OfflineProduct[] = (data.products || []).map((p: Record<string, unknown>) => ({
      id: p.id as string,
      sku: p.sku as string,
      name: p.name as string,
      price: Number(p.price) || 0,
      taxRate: Number(p.tax_rate || p.taxRate) || 0,
      category: p.category as string | undefined,
      barcode: p.barcode as string | undefined,
      stock: Number(p.stock) || 0,
      imageUrl: p.image_url as string | undefined,
      updatedAt: new Date().toISOString(),
    }));

    await saveProducts(products);
    await setSetting('productsLastSync', new Date().toISOString());

    console.log(`Cached ${products.length} products`);
    return products.length;
  } catch (error) {
    console.error('Failed to fetch products:', error);
    throw error;
  }
}

/**
 * Fetch and cache customers from server
 */
export async function fetchAndCacheCustomers(): Promise<number> {
  if (!isOnline()) {
    throw new Error('Cannot fetch customers while offline');
  }

  try {
    const response = await fetch(`${API_BASE}/customers?limit=1000`);
    if (!response.ok) {
      throw new Error(`Server returned ${response.status}`);
    }

    const data = await response.json();
    const customers: OfflineCustomer[] = (data.customers || []).map((c: Record<string, unknown>) => ({
      id: c.id as string,
      name: c.name as string,
      phone: c.phone as string | undefined,
      email: c.email as string | undefined,
      loyaltyPoints: Number(c.loyalty_points || c.loyaltyPoints) || 0,
      updatedAt: new Date().toISOString(),
    }));

    await saveCustomers(customers);
    await setSetting('customersLastSync', new Date().toISOString());

    console.log(`Cached ${customers.length} customers`);
    return customers.length;
  } catch (error) {
    console.error('Failed to fetch customers:', error);
    throw error;
  }
}

/**
 * Initial data sync - fetch all required data
 */
export async function initialSync(): Promise<{ products: number; customers: number }> {
  if (!isOnline()) {
    throw new Error('Cannot perform initial sync while offline');
  }

  const [products, customers] = await Promise.all([
    fetchAndCacheProducts(),
    fetchAndCacheCustomers(),
  ]);

  return { products, customers };
}

/**
 * Create a pending transaction for offline checkout
 */
export async function createOfflineTransaction(
  data: Omit<PendingTransaction, 'id' | 'status' | 'createdAt' | 'syncAttempts'>
): Promise<PendingTransaction> {
  const transaction: PendingTransaction = {
    ...data,
    id: `offline-tx-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    status: 'pending',
    createdAt: new Date().toISOString(),
    syncAttempts: 0,
  };

  await savePendingTransaction(transaction);
  await notifySyncStatus();

  // Try to sync immediately if online
  if (isOnline()) {
    syncAll();
  }

  return transaction;
}

/**
 * Get current sync status
 */
export async function getSyncStatus(): Promise<SyncStatus> {
  const pendingTxs = await getPendingTransactionsByStatus('pending');
  const lastSyncAt = await getSetting<string>('lastSyncAt');
  const lastSyncError = await getSetting<string>('lastSyncError');

  return {
    isOnline: isOnline(),
    isSyncing: syncInProgress,
    pendingCount: pendingTxs.length,
    lastSyncAt: lastSyncAt || null,
    lastSyncError: lastSyncError || null,
  };
}

/**
 * Force retry failed transactions
 */
export async function retryFailedTransactions(): Promise<SyncResult> {
  const failedTxs = await getPendingTransactionsByStatus('failed');

  // Reset status to pending
  for (const tx of failedTxs) {
    await savePendingTransaction({
      ...tx,
      status: 'pending',
      syncAttempts: 0,
      lastSyncError: undefined,
    });
  }

  // Trigger sync
  return syncAll();
}
