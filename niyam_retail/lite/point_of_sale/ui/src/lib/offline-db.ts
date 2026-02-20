/**
 * Offline Database - IndexedDB wrapper for POS offline support
 * 
 * Stores products, customers, and pending transactions locally
 * for offline operation with background sync when online.
 */

const DB_NAME = 'niyam-pos-offline';
const DB_VERSION = 1;

// Store names
export const STORES = {
  PRODUCTS: 'products',
  CUSTOMERS: 'customers',
  PENDING_TRANSACTIONS: 'pending_transactions',
  SYNC_QUEUE: 'sync_queue',
  SETTINGS: 'settings',
} as const;

// Types
export interface OfflineProduct {
  id: string;
  sku: string;
  name: string;
  price: number;
  taxRate: number;
  category?: string;
  barcode?: string;
  stock?: number;
  imageUrl?: string;
  updatedAt: string;
}

export interface OfflineCustomer {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  loyaltyPoints?: number;
  updatedAt: string;
}

export interface PendingTransaction {
  id: string;
  sessionId: string;
  items: Array<{
    productId: string;
    sku: string;
    name: string;
    quantity: number;
    price: number;
    taxRate: number;
    discount?: number;
  }>;
  subtotal: number;
  taxTotal: number;
  discountTotal: number;
  total: number;
  payments: Array<{
    method: string;
    amount: number;
    reference?: string;
  }>;
  customerId?: string;
  customerName?: string;
  status: 'pending' | 'synced' | 'failed';
  createdAt: string;
  syncAttempts: number;
  lastSyncError?: string;
}

export interface SyncQueueItem {
  id: string;
  type: 'transaction' | 'customer' | 'product';
  action: 'create' | 'update' | 'delete';
  data: unknown;
  createdAt: string;
  attempts: number;
  lastError?: string;
}

// Database instance
let db: IDBDatabase | null = null;

/**
 * Open the IndexedDB database
 */
export async function openDatabase(): Promise<IDBDatabase> {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('Failed to open IndexedDB:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      db = request.result;
      console.log('IndexedDB opened successfully');
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;

      // Products store
      if (!database.objectStoreNames.contains(STORES.PRODUCTS)) {
        const productStore = database.createObjectStore(STORES.PRODUCTS, { keyPath: 'id' });
        productStore.createIndex('sku', 'sku', { unique: true });
        productStore.createIndex('barcode', 'barcode', { unique: false });
        productStore.createIndex('category', 'category', { unique: false });
        productStore.createIndex('name', 'name', { unique: false });
      }

      // Customers store
      if (!database.objectStoreNames.contains(STORES.CUSTOMERS)) {
        const customerStore = database.createObjectStore(STORES.CUSTOMERS, { keyPath: 'id' });
        customerStore.createIndex('phone', 'phone', { unique: false });
        customerStore.createIndex('email', 'email', { unique: false });
        customerStore.createIndex('name', 'name', { unique: false });
      }

      // Pending transactions store
      if (!database.objectStoreNames.contains(STORES.PENDING_TRANSACTIONS)) {
        const txStore = database.createObjectStore(STORES.PENDING_TRANSACTIONS, { keyPath: 'id' });
        txStore.createIndex('status', 'status', { unique: false });
        txStore.createIndex('createdAt', 'createdAt', { unique: false });
        txStore.createIndex('sessionId', 'sessionId', { unique: false });
      }

      // Sync queue store
      if (!database.objectStoreNames.contains(STORES.SYNC_QUEUE)) {
        const syncStore = database.createObjectStore(STORES.SYNC_QUEUE, { keyPath: 'id' });
        syncStore.createIndex('type', 'type', { unique: false });
        syncStore.createIndex('createdAt', 'createdAt', { unique: false });
      }

      // Settings store
      if (!database.objectStoreNames.contains(STORES.SETTINGS)) {
        database.createObjectStore(STORES.SETTINGS, { keyPath: 'key' });
      }

      console.log('IndexedDB schema created/upgraded');
    };
  });
}

/**
 * Generic get all items from a store
 */
export async function getAll<T>(storeName: string): Promise<T[]> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Generic get item by key
 */
export async function getByKey<T>(storeName: string, key: string): Promise<T | undefined> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.get(key);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Generic get items by index
 */
export async function getByIndex<T>(
  storeName: string,
  indexName: string,
  value: IDBValidKey
): Promise<T[]> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const index = store.index(indexName);
    const request = index.getAll(value);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Generic put (insert or update) item
 */
export async function put<T>(storeName: string, item: T): Promise<void> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.put(item);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Generic put many items
 */
export async function putMany<T>(storeName: string, items: T[]): Promise<void> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);

    items.forEach((item) => store.put(item));

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Generic delete item
 */
export async function deleteByKey(storeName: string, key: string): Promise<void> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.delete(key);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Clear all items in a store
 */
export async function clearStore(storeName: string): Promise<void> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Count items in a store
 */
export async function countItems(storeName: string): Promise<number> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.count();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ============================================================================
// Product-specific functions
// ============================================================================

export async function getAllProducts(): Promise<OfflineProduct[]> {
  return getAll<OfflineProduct>(STORES.PRODUCTS);
}

export async function getProductById(id: string): Promise<OfflineProduct | undefined> {
  return getByKey<OfflineProduct>(STORES.PRODUCTS, id);
}

export async function getProductBySku(sku: string): Promise<OfflineProduct | undefined> {
  const products = await getByIndex<OfflineProduct>(STORES.PRODUCTS, 'sku', sku);
  return products[0];
}

export async function getProductByBarcode(barcode: string): Promise<OfflineProduct | undefined> {
  const products = await getByIndex<OfflineProduct>(STORES.PRODUCTS, 'barcode', barcode);
  return products[0];
}

export async function searchProducts(query: string): Promise<OfflineProduct[]> {
  const products = await getAllProducts();
  const lowerQuery = query.toLowerCase();
  return products.filter(
    (p) =>
      p.name.toLowerCase().includes(lowerQuery) ||
      p.sku.toLowerCase().includes(lowerQuery) ||
      p.barcode?.toLowerCase().includes(lowerQuery)
  );
}

export async function saveProducts(products: OfflineProduct[]): Promise<void> {
  return putMany(STORES.PRODUCTS, products);
}

// ============================================================================
// Customer-specific functions
// ============================================================================

export async function getAllCustomers(): Promise<OfflineCustomer[]> {
  return getAll<OfflineCustomer>(STORES.CUSTOMERS);
}

export async function getCustomerById(id: string): Promise<OfflineCustomer | undefined> {
  return getByKey<OfflineCustomer>(STORES.CUSTOMERS, id);
}

export async function getCustomerByPhone(phone: string): Promise<OfflineCustomer | undefined> {
  const customers = await getByIndex<OfflineCustomer>(STORES.CUSTOMERS, 'phone', phone);
  return customers[0];
}

export async function saveCustomers(customers: OfflineCustomer[]): Promise<void> {
  return putMany(STORES.CUSTOMERS, customers);
}

// ============================================================================
// Transaction-specific functions
// ============================================================================

export async function getAllPendingTransactions(): Promise<PendingTransaction[]> {
  return getAll<PendingTransaction>(STORES.PENDING_TRANSACTIONS);
}

export async function getPendingTransactionsByStatus(
  status: PendingTransaction['status']
): Promise<PendingTransaction[]> {
  return getByIndex<PendingTransaction>(STORES.PENDING_TRANSACTIONS, 'status', status);
}

export async function savePendingTransaction(tx: PendingTransaction): Promise<void> {
  return put(STORES.PENDING_TRANSACTIONS, tx);
}

export async function deletePendingTransaction(id: string): Promise<void> {
  return deleteByKey(STORES.PENDING_TRANSACTIONS, id);
}

export async function getPendingTransactionCount(): Promise<number> {
  const pending = await getPendingTransactionsByStatus('pending');
  return pending.length;
}

// ============================================================================
// Sync queue functions
// ============================================================================

export async function addToSyncQueue(item: Omit<SyncQueueItem, 'id' | 'createdAt' | 'attempts'>): Promise<void> {
  const queueItem: SyncQueueItem = {
    ...item,
    id: `sync-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    createdAt: new Date().toISOString(),
    attempts: 0,
  };
  return put(STORES.SYNC_QUEUE, queueItem);
}

export async function getSyncQueue(): Promise<SyncQueueItem[]> {
  return getAll<SyncQueueItem>(STORES.SYNC_QUEUE);
}

export async function removeSyncQueueItem(id: string): Promise<void> {
  return deleteByKey(STORES.SYNC_QUEUE, id);
}

export async function updateSyncQueueItem(item: SyncQueueItem): Promise<void> {
  return put(STORES.SYNC_QUEUE, item);
}

// ============================================================================
// Settings functions
// ============================================================================

export async function getSetting<T>(key: string): Promise<T | undefined> {
  const result = await getByKey<{ key: string; value: T }>(STORES.SETTINGS, key);
  return result?.value;
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  return put(STORES.SETTINGS, { key, value });
}

// ============================================================================
// Database utilities
// ============================================================================

export async function getOfflineStats(): Promise<{
  productCount: number;
  customerCount: number;
  pendingTransactionCount: number;
  syncQueueCount: number;
}> {
  const [productCount, customerCount, pendingTransactionCount, syncQueueCount] = await Promise.all([
    countItems(STORES.PRODUCTS),
    countItems(STORES.CUSTOMERS),
    countItems(STORES.PENDING_TRANSACTIONS),
    countItems(STORES.SYNC_QUEUE),
  ]);

  return { productCount, customerCount, pendingTransactionCount, syncQueueCount };
}

export async function clearAllData(): Promise<void> {
  await Promise.all([
    clearStore(STORES.PRODUCTS),
    clearStore(STORES.CUSTOMERS),
    clearStore(STORES.PENDING_TRANSACTIONS),
    clearStore(STORES.SYNC_QUEUE),
    clearStore(STORES.SETTINGS),
  ]);
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
