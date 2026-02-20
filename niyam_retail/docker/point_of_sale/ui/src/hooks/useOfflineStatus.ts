/**
 * useOfflineStatus - React hook for offline/online status management
 * 
 * Provides real-time network status, sync state, and pending transaction count.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  isOnline,
  onOnlineStatusChange,
  onSyncStatusChange,
  syncAll,
  getSyncStatus,
  initialSync,
  type SyncStatus,
  type SyncResult,
} from '../lib/sync-manager';
import { getOfflineStats, openDatabase } from '../lib/offline-db';

export interface OfflineStatus extends SyncStatus {
  isInitialized: boolean;
  productCount: number;
  customerCount: number;
}

export interface UseOfflineStatusReturn {
  status: OfflineStatus;
  sync: () => Promise<SyncResult>;
  initialize: () => Promise<void>;
  isReady: boolean;
}

/**
 * Hook for managing offline status and sync operations
 */
export function useOfflineStatus(): UseOfflineStatusReturn {
  const [status, setStatus] = useState<OfflineStatus>({
    isOnline: true,
    isSyncing: false,
    pendingCount: 0,
    lastSyncAt: null,
    lastSyncError: null,
    isInitialized: false,
    productCount: 0,
    customerCount: 0,
  });

  const [isReady, setIsReady] = useState(false);

  // Update status from offline database
  const updateStats = useCallback(async () => {
    try {
      const stats = await getOfflineStats();
      setStatus((prev) => ({
        ...prev,
        productCount: stats.productCount,
        customerCount: stats.customerCount,
        pendingCount: stats.pendingTransactionCount,
      }));
    } catch (error) {
      console.error('Failed to get offline stats:', error);
    }
  }, []);

  // Initialize offline database and register listeners
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        // Open database
        await openDatabase();
        
        // Get initial sync status
        const syncStatus = await getSyncStatus();
        const stats = await getOfflineStats();

        if (mounted) {
          setStatus({
            ...syncStatus,
            isInitialized: true,
            productCount: stats.productCount,
            customerCount: stats.customerCount,
          });
          setIsReady(true);
        }
      } catch (error) {
        console.error('Failed to initialize offline support:', error);
        if (mounted) {
          setIsReady(true); // Still mark as ready to allow operation
        }
      }
    };

    init();

    // Register online/offline listener
    const unsubOnline = onOnlineStatusChange((online) => {
      if (mounted) {
        setStatus((prev) => ({ ...prev, isOnline: online }));
      }
    });

    // Register sync status listener
    const unsubSync = onSyncStatusChange((syncStatus) => {
      if (mounted) {
        setStatus((prev) => ({
          ...prev,
          ...syncStatus,
        }));
      }
    });

    return () => {
      mounted = false;
      unsubOnline();
      unsubSync();
    };
  }, []);

  // Refresh stats periodically
  useEffect(() => {
    const interval = setInterval(updateStats, 10000); // Every 10 seconds
    return () => clearInterval(interval);
  }, [updateStats]);

  // Manual sync function
  const sync = useCallback(async (): Promise<SyncResult> => {
    const result = await syncAll();
    await updateStats();
    return result;
  }, [updateStats]);

  // Initialize data (fetch products and customers)
  const initialize = useCallback(async (): Promise<void> => {
    if (!isOnline()) {
      throw new Error('Cannot initialize while offline');
    }

    setStatus((prev) => ({ ...prev, isSyncing: true }));

    try {
      const result = await initialSync();
      setStatus((prev) => ({
        ...prev,
        isSyncing: false,
        productCount: result.products,
        customerCount: result.customers,
        isInitialized: true,
        lastSyncAt: new Date().toISOString(),
      }));
    } catch (error) {
      setStatus((prev) => ({
        ...prev,
        isSyncing: false,
        lastSyncError: error instanceof Error ? error.message : 'Initialization failed',
      }));
      throw error;
    }
  }, []);

  return {
    status,
    sync,
    initialize,
    isReady,
  };
}

/**
 * Register service worker for offline support
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) {
    console.warn('Service workers not supported');
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });

    console.log('Service worker registered:', registration.scope);

    // Handle updates
    registration.onupdatefound = () => {
      const newWorker = registration.installing;
      if (newWorker) {
        newWorker.onstatechange = () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // New version available
            console.log('New service worker available');
            // Could show update prompt here
          }
        };
      }
    };

    // Register for background sync if supported
    if ('sync' in registration) {
      try {
        await (registration as ServiceWorkerRegistration & { sync: { register: (tag: string) => Promise<void> } }).sync.register('sync-transactions');
        console.log('Background sync registered');
      } catch (error) {
        console.warn('Background sync registration failed:', error);
      }
    }

    return registration;
  } catch (error) {
    console.error('Service worker registration failed:', error);
    return null;
  }
}

export default useOfflineStatus;
