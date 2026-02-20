/**
 * Reorder Prediction Service - Lite Version
 * Calculates optimal reorder points based on sales velocity
 */

const { query, get } = require('./db');

// ============================================
// Constants
// ============================================

const DEFAULT_LEAD_TIME_DAYS = 7; // Days from order to delivery
const DEFAULT_SAFETY_STOCK_DAYS = 3; // Buffer days
const MIN_DATA_POINTS = 7; // Minimum days of data for prediction

// ============================================
// Sales Velocity Calculation
// ============================================

/**
 * Calculate average daily sales for a product
 * @param {string} productId - Product ID
 * @param {number} days - Number of days to analyze
 * @returns {Object} - { avgDaily, total, dataPoints }
 */
function calculateSalesVelocity(productId, days = 30) {
  try {
    // Get sales movements (negative quantity = sale)
    const movements = query(`
      SELECT 
        DATE(created_at) as sale_date,
        ABS(SUM(CASE WHEN quantity < 0 THEN quantity ELSE 0 END)) as daily_sales
      FROM inventory_movements
      WHERE product_id = ?
        AND datetime(created_at) > datetime('now', '-${days} days')
      GROUP BY DATE(created_at)
      ORDER BY sale_date DESC
    `, [productId]);

    if (movements.length < MIN_DATA_POINTS) {
      return {
        avgDaily: 0,
        total: 0,
        dataPoints: movements.length,
        reliable: false,
        message: `Insufficient data: ${movements.length} days (need ${MIN_DATA_POINTS})`
      };
    }

    const totalSales = movements.reduce((sum, m) => sum + (m.daily_sales || 0), 0);
    const avgDaily = totalSales / movements.length;

    return {
      avgDaily: Math.round(avgDaily * 100) / 100,
      total: totalSales,
      dataPoints: movements.length,
      reliable: true,
      dailySales: movements.map(m => ({ date: m.sale_date, qty: m.daily_sales }))
    };
  } catch (e) {
    console.error('[ReorderPrediction] Velocity calc error:', e.message);
    return { avgDaily: 0, total: 0, dataPoints: 0, reliable: false, error: e.message };
  }
}

/**
 * Calculate optimal reorder point for a product
 * @param {string} productId - Product ID
 * @param {Object} options - { leadTimeDays, safetyStockDays }
 * @returns {Object} - { reorderPoint, safetyStock, currentQty, daysUntilReorder }
 */
function calculateReorderPoint(productId, options = {}) {
  const leadTimeDays = options.leadTimeDays || DEFAULT_LEAD_TIME_DAYS;
  const safetyStockDays = options.safetyStockDays || DEFAULT_SAFETY_STOCK_DAYS;

  // Get current inventory
  const inventory = get(`
    SELECT i.quantity, i.min_quantity, p.name, p.sku
    FROM inventory i
    JOIN products p ON i.product_id = p.id
    WHERE i.product_id = ?
  `, [productId]);

  if (!inventory) {
    return { error: 'Product not found' };
  }

  // Calculate velocity
  const velocity = calculateSalesVelocity(productId, 30);

  if (!velocity.reliable) {
    // Fall back to manual min_quantity if insufficient data
    return {
      productId,
      productName: inventory.name,
      sku: inventory.sku,
      currentQty: inventory.quantity,
      reorderPoint: inventory.min_quantity || 10,
      safetyStock: 0,
      avgDailySales: 0,
      daysUntilReorder: null,
      reliable: false,
      message: velocity.message || 'Using manual reorder point'
    };
  }

  // Calculate reorder point: (Lead Time × Avg Daily) + Safety Stock
  const safetyStock = Math.ceil(velocity.avgDaily * safetyStockDays);
  const leadTimeDemand = Math.ceil(velocity.avgDaily * leadTimeDays);
  const reorderPoint = leadTimeDemand + safetyStock;

  // Calculate days until we hit reorder point
  const daysUntilReorder = velocity.avgDaily > 0
    ? Math.floor((inventory.quantity - reorderPoint) / velocity.avgDaily)
    : null;

  return {
    productId,
    productName: inventory.name,
    sku: inventory.sku,
    currentQty: inventory.quantity,
    reorderPoint,
    safetyStock,
    avgDailySales: velocity.avgDaily,
    daysUntilReorder,
    reliable: true,
    shouldReorder: inventory.quantity <= reorderPoint,
    urgency: calculateUrgency(daysUntilReorder)
  };
}

/**
 * Calculate urgency level
 */
function calculateUrgency(daysUntilReorder) {
  if (daysUntilReorder === null) return 'unknown';
  if (daysUntilReorder <= 0) return 'critical'; // Already below reorder point
  if (daysUntilReorder <= 3) return 'high';
  if (daysUntilReorder <= 7) return 'medium';
  return 'low';
}

/**
 * Generate reorder list grouped by supplier
 * @returns {Array} - Grouped reorder suggestions
 */
function generateReorderList() {
  try {
    // Get all products with low stock
    const lowStock = query(`
      SELECT 
        p.id, p.sku, p.name, p.category,
        i.quantity, i.min_quantity,
        st.id as supplier_id, st.supplier_name
      FROM products p
      JOIN inventory i ON p.id = i.product_id
      LEFT JOIN supplier_templates st ON p.category = st.supplier_name OR 1=1
      WHERE p.active = 1
        AND i.quantity <= i.min_quantity
      ORDER BY i.quantity ASC
    `);

    // Calculate predictions for each
    const predictions = lowStock.map(product => ({
      ...calculateReorderPoint(product.id),
      suggestedQty: calculateSuggestedOrderQty(product.id)
    }));

    // Group by supplier (or category if no supplier)
    const grouped = {};
    for (const pred of predictions) {
      const key = pred.supplierName || pred.category || 'Unknown Supplier';
      if (!grouped[key]) {
        grouped[key] = {
          supplierName: key,
          products: [],
          totalValue: 0,
          criticalCount: 0
        };
      }
      grouped[key].products.push(pred);
      if (pred.urgency === 'critical') grouped[key].criticalCount++;
    }

    // Sort by critical count
    return Object.values(grouped)
      .sort((a, b) => b.criticalCount - a.criticalCount);

  } catch (e) {
    console.error('[ReorderPrediction] Generate list error:', e.message);
    return [];
  }
}

/**
 * Calculate suggested order quantity
 * Based on lead time demand + safety stock + some buffer
 * @param {string} productId - Product ID
 * @returns {number} - Suggested quantity to order
 */
function calculateSuggestedOrderQty(productId) {
  const prediction = calculateReorderPoint(productId);
  
  if (!prediction.reliable || prediction.avgDailySales === 0) {
    return prediction.min_quantity || 10; // Default order qty
  }

  // Order enough for 30 days + safety stock
  const thirtyDayDemand = Math.ceil(prediction.avgDailySales * 30);
  return thirtyDayDemand + prediction.safetyStock;
}

/**
 * Get products that will need reorder within N days
 * @param {number} days - Days to look ahead
 * @returns {Array} - Products needing reorder
 */
function getUpcomingReorders(days = 7) {
  try {
    const allProducts = query(`
      SELECT p.id, p.sku, p.name, i.quantity
      FROM products p
      JOIN inventory i ON p.id = i.product_id
      WHERE p.active = 1
    `);

    const upcoming = [];

    for (const product of allProducts) {
      const prediction = calculateReorderPoint(product.id);
      
      if (prediction.reliable && 
          prediction.daysUntilReorder !== null && 
          prediction.daysUntilReorder <= days) {
        upcoming.push(prediction);
      }
    }

    // Sort by urgency
    const urgencyOrder = { critical: 0, high: 1, medium: 2, low: 3, unknown: 4 };
    return upcoming.sort((a, b) => 
      urgencyOrder[a.urgency] - urgencyOrder[b.urgency]
    );

  } catch (e) {
    console.error('[ReorderPrediction] Upcoming reorders error:', e.message);
    return [];
  }
}

/**
 * Analyze sales trends (increasing, decreasing, seasonal)
 * @param {string} productId - Product ID
 * @returns {Object} - Trend analysis
 */
function analyzeTrends(productId) {
  try {
    const velocity30 = calculateSalesVelocity(productId, 30);
    const velocity7 = calculateSalesVelocity(productId, 7);

    if (!velocity30.reliable) {
      return { trend: 'unknown', message: 'Insufficient data' };
    }

    const ratio = velocity7.avgDaily / velocity30.avgDaily;

    let trend;
    if (ratio > 1.2) trend = 'increasing';
    else if (ratio < 0.8) trend = 'decreasing';
    else trend = 'stable';

    return {
      trend,
      recentVelocity: velocity7.avgDaily,
      monthlyVelocity: velocity30.avgDaily,
      changePercent: Math.round((ratio - 1) * 100),
      message: trend === 'increasing' 
        ? 'Sales are trending up - consider ordering more'
        : trend === 'decreasing'
        ? 'Sales are slowing down'
        : 'Sales are stable'
    };

  } catch (e) {
    console.error('[ReorderPrediction] Trend analysis error:', e.message);
    return { trend: 'unknown', error: e.message };
  }
}

// ============================================
// Exports
// ============================================

module.exports = {
  calculateSalesVelocity,
  calculateReorderPoint,
  generateReorderList,
  calculateSuggestedOrderQty,
  getUpcomingReorders,
  analyzeTrends,
  // Constants
  DEFAULT_LEAD_TIME_DAYS,
  DEFAULT_SAFETY_STOCK_DAYS,
  MIN_DATA_POINTS,
};
