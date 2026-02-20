/**
 * OfflineIndicator - Visual indicator for offline/online status
 * 
 * Shows current network status, pending transactions, and sync state.
 */

import { useState } from 'react';
import {
  Wifi,
  WifiOff,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Cloud,
  CloudOff,
  Loader2,
} from 'lucide-react';
import { useOfflineStatus } from '../hooks/useOfflineStatus';

interface OfflineIndicatorProps {
  compact?: boolean;
  showDetails?: boolean;
}

export function OfflineIndicator({ compact = false, showDetails = true }: OfflineIndicatorProps) {
  const { status, sync, isReady } = useOfflineStatus();
  const [showPopover, setShowPopover] = useState(false);

  if (!isReady) {
    return null;
  }

  const handleSync = async () => {
    if (status.isSyncing || !status.isOnline) return;
    await sync();
  };

  // Compact mode - just icon
  if (compact) {
    return (
      <div className="relative">
        <button
          onClick={() => setShowPopover(!showPopover)}
          className={`p-2 rounded-full transition-colors ${
            status.isOnline
              ? status.pendingCount > 0
                ? 'bg-yellow-100 text-yellow-600 hover:bg-yellow-200'
                : 'bg-green-100 text-green-600 hover:bg-green-200'
              : 'bg-red-100 text-red-600 hover:bg-red-200'
          }`}
          title={status.isOnline ? 'Online' : 'Offline'}
        >
          {status.isSyncing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : status.isOnline ? (
            status.pendingCount > 0 ? (
              <Cloud className="h-4 w-4" />
            ) : (
              <Wifi className="h-4 w-4" />
            )
          ) : (
            <WifiOff className="h-4 w-4" />
          )}
        </button>

        {/* Pending count badge */}
        {status.pendingCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-yellow-500 text-white text-xs rounded-full h-4 w-4 flex items-center justify-center">
            {status.pendingCount}
          </span>
        )}

        {/* Popover */}
        {showPopover && showDetails && (
          <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-lg shadow-lg border z-50 p-4">
            <StatusDetails status={status} onSync={handleSync} />
          </div>
        )}
      </div>
    );
  }

  // Full mode - status bar
  return (
    <div
      className={`flex items-center gap-3 px-4 py-2 rounded-lg ${
        status.isOnline
          ? status.pendingCount > 0
            ? 'bg-yellow-50 border border-yellow-200'
            : 'bg-green-50 border border-green-200'
          : 'bg-red-50 border border-red-200'
      }`}
    >
      {/* Status icon */}
      <div
        className={`p-2 rounded-full ${
          status.isOnline
            ? status.pendingCount > 0
              ? 'bg-yellow-100 text-yellow-600'
              : 'bg-green-100 text-green-600'
            : 'bg-red-100 text-red-600'
        }`}
      >
        {status.isSyncing ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : status.isOnline ? (
          <Wifi className="h-5 w-5" />
        ) : (
          <WifiOff className="h-5 w-5" />
        )}
      </div>

      {/* Status text */}
      <div className="flex-1">
        <div className="font-medium text-sm">
          {status.isOnline ? 'Online' : 'Offline Mode'}
        </div>
        <div className="text-xs text-gray-500">
          {status.isSyncing
            ? 'Syncing...'
            : status.pendingCount > 0
            ? `${status.pendingCount} pending transaction${status.pendingCount !== 1 ? 's' : ''}`
            : status.isOnline
            ? 'All synced'
            : 'Transactions will sync when online'}
        </div>
      </div>

      {/* Sync button */}
      {status.isOnline && status.pendingCount > 0 && !status.isSyncing && (
        <button
          onClick={handleSync}
          className="p-2 rounded-full bg-white shadow-sm hover:bg-gray-50 transition-colors"
          title="Sync now"
        >
          <RefreshCw className="h-4 w-4 text-gray-600" />
        </button>
      )}

      {/* Error indicator */}
      {status.lastSyncError && (
        <div className="relative group">
          <AlertCircle className="h-5 w-5 text-red-500" />
          <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-lg shadow-lg border z-50 p-2 text-xs text-red-600 hidden group-hover:block">
            {status.lastSyncError}
          </div>
        </div>
      )}
    </div>
  );
}

// Status details component
function StatusDetails({
  status,
  onSync,
}: {
  status: ReturnType<typeof useOfflineStatus>['status'];
  onSync: () => void;
}) {
  return (
    <div className="space-y-3">
      {/* Connection status */}
      <div className="flex items-center gap-2">
        {status.isOnline ? (
          <>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <span className="text-sm text-green-700">Connected</span>
          </>
        ) : (
          <>
            <CloudOff className="h-4 w-4 text-red-500" />
            <span className="text-sm text-red-700">Offline</span>
          </>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-gray-50 rounded p-2">
          <div className="text-gray-500">Products</div>
          <div className="font-semibold">{status.productCount.toLocaleString()}</div>
        </div>
        <div className="bg-gray-50 rounded p-2">
          <div className="text-gray-500">Customers</div>
          <div className="font-semibold">{status.customerCount.toLocaleString()}</div>
        </div>
      </div>

      {/* Pending transactions */}
      {status.pendingCount > 0 && (
        <div className="flex items-center justify-between p-2 bg-yellow-50 rounded">
          <span className="text-xs text-yellow-700">
            {status.pendingCount} pending transaction{status.pendingCount !== 1 ? 's' : ''}
          </span>
          {status.isOnline && !status.isSyncing && (
            <button
              onClick={onSync}
              className="text-xs text-yellow-700 hover:text-yellow-900 font-medium"
            >
              Sync now
            </button>
          )}
        </div>
      )}

      {/* Last sync time */}
      {status.lastSyncAt && (
        <div className="text-xs text-gray-500">
          Last sync: {new Date(status.lastSyncAt).toLocaleTimeString()}
        </div>
      )}

      {/* Error */}
      {status.lastSyncError && (
        <div className="text-xs text-red-600 bg-red-50 p-2 rounded">
          Error: {status.lastSyncError}
        </div>
      )}
    </div>
  );
}

export default OfflineIndicator;
