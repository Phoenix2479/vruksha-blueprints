// Rate calculation business logic service

const { query } = require('@vruksha/platform/db/postgres');
const { DEFAULT_BASE_RATE, DEFAULT_PER_KG_RATE } = require('../config/constants');

async function calculateRate(tenantId, data) {
  const weight = parseFloat(data.weight) || 0;

  // If carrier_id is provided, use carrier-specific rates
  if (data.carrier_id) {
    const carrierResult = await query(
      'SELECT * FROM carriers WHERE id = $1 AND tenant_id = $2 AND is_active = true',
      [data.carrier_id, tenantId]
    );
    if (carrierResult.rows.length > 0) {
      const carrier = carrierResult.rows[0];
      const baseRate = parseFloat(carrier.base_rate) || DEFAULT_BASE_RATE;
      const perKgRate = parseFloat(carrier.per_kg_rate) || DEFAULT_PER_KG_RATE;
      const cost = baseRate + (weight * perKgRate);

      return {
        carrier_id: carrier.id,
        carrier_name: carrier.name,
        carrier_code: carrier.code,
        weight,
        base_rate: baseRate,
        per_kg_rate: perKgRate,
        total_cost: Math.round(cost * 100) / 100,
        currency: 'USD',
        estimated_days: 5
      };
    }
  }

  // Get all active carriers and calculate rates
  const carriersResult = await query(
    'SELECT * FROM carriers WHERE tenant_id = $1 AND is_active = true ORDER BY base_rate ASC',
    [tenantId]
  );

  if (carriersResult.rows.length === 0) {
    // Default rate calculation
    const cost = DEFAULT_BASE_RATE + (weight * DEFAULT_PER_KG_RATE);
    return {
      carrier_id: null,
      carrier_name: 'Standard Shipping',
      carrier_code: 'standard',
      weight,
      base_rate: DEFAULT_BASE_RATE,
      per_kg_rate: DEFAULT_PER_KG_RATE,
      total_cost: Math.round(cost * 100) / 100,
      currency: 'USD',
      estimated_days: 5
    };
  }

  // Return rates for all active carriers
  const rates = carriersResult.rows.map(carrier => {
    const baseRate = parseFloat(carrier.base_rate) || DEFAULT_BASE_RATE;
    const perKgRate = parseFloat(carrier.per_kg_rate) || DEFAULT_PER_KG_RATE;
    const cost = baseRate + (weight * perKgRate);

    return {
      carrier_id: carrier.id,
      carrier_name: carrier.name,
      carrier_code: carrier.code,
      weight,
      base_rate: baseRate,
      per_kg_rate: perKgRate,
      total_cost: Math.round(cost * 100) / 100,
      currency: 'USD',
      estimated_days: 5
    };
  });

  return rates;
}

module.exports = {
  calculateRate
};
