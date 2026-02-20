// Address business logic service

const { query } = require('@vruksha/platform/db/postgres');

/**
 * List addresses for a customer
 */
async function listAddresses(customerId, tenantId) {
  const result = await query(
    `SELECT * FROM addresses WHERE customer_id = $1 AND tenant_id = $2 ORDER BY is_default DESC, created_at DESC`,
    [customerId, tenantId]
  );
  return result.rows;
}

/**
 * Add address for a customer
 */
async function addAddress(customerId, tenantId, data) {
  const { type = 'shipping', is_default = false, first_name, last_name, line1, line2, city, state, postal_code, country = 'US', phone } = data;

  // If setting as default, unset previous default of the same type
  if (is_default) {
    await query(
      `UPDATE addresses SET is_default = false, updated_at = NOW()
       WHERE customer_id = $1 AND tenant_id = $2 AND type = $3 AND is_default = true`,
      [customerId, tenantId, type]
    );
  }

  const result = await query(
    `INSERT INTO addresses (tenant_id, customer_id, type, is_default, first_name, last_name, line1, line2, city, state, postal_code, country, phone)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING *`,
    [tenantId, customerId, type, is_default, first_name || null, last_name || null, line1, line2 || null, city, state || null, postal_code, country, phone || null]
  );

  return { success: true, data: result.rows[0] };
}

/**
 * Update address
 */
async function updateAddress(addressId, customerId, tenantId, data) {
  const fields = [];
  const values = [];
  let idx = 1;

  const allowedFields = ['type', 'first_name', 'last_name', 'line1', 'line2', 'city', 'state', 'postal_code', 'country', 'phone'];

  for (const key of allowedFields) {
    if (data[key] !== undefined) {
      fields.push(`${key} = $${idx}`);
      values.push(data[key]);
      idx += 1;
    }
  }

  if (fields.length === 0 && data.is_default === undefined) {
    return { success: false, error: { code: 'ERR_NO_FIELDS', message: 'No fields to update' } };
  }

  // Handle default flag separately
  if (data.is_default === true) {
    const addrType = data.type || 'shipping';
    // Unset previous default of same type for this customer
    await query(
      `UPDATE addresses SET is_default = false, updated_at = NOW()
       WHERE customer_id = $1 AND tenant_id = $2 AND type = $3 AND is_default = true AND id != $4`,
      [customerId, tenantId, addrType, addressId]
    );
    fields.push(`is_default = $${idx}`);
    values.push(true);
    idx += 1;
  } else if (data.is_default === false) {
    fields.push(`is_default = $${idx}`);
    values.push(false);
    idx += 1;
  }

  fields.push('updated_at = NOW()');
  values.push(addressId, customerId, tenantId);

  const result = await query(
    `UPDATE addresses SET ${fields.join(', ')} WHERE id = $${idx} AND customer_id = $${idx + 1} AND tenant_id = $${idx + 2} RETURNING *`,
    values
  );

  if (result.rowCount === 0) {
    return { success: false, error: { code: 'ERR_ADDRESS_NOT_FOUND', message: 'Address not found' } };
  }

  return { success: true, data: result.rows[0] };
}

/**
 * Delete address
 */
async function deleteAddress(addressId, customerId, tenantId) {
  const result = await query(
    `DELETE FROM addresses WHERE id = $1 AND customer_id = $2 AND tenant_id = $3 RETURNING id`,
    [addressId, customerId, tenantId]
  );

  if (result.rowCount === 0) {
    return { success: false, error: { code: 'ERR_ADDRESS_NOT_FOUND', message: 'Address not found' } };
  }

  return { success: true, data: { id: result.rows[0].id } };
}

/**
 * Set address as default
 */
async function setDefault(addressId, customerId, tenantId) {
  // Get the address to determine its type
  const addrResult = await query(
    'SELECT type FROM addresses WHERE id = $1 AND customer_id = $2 AND tenant_id = $3',
    [addressId, customerId, tenantId]
  );

  if (addrResult.rows.length === 0) {
    return { success: false, error: { code: 'ERR_ADDRESS_NOT_FOUND', message: 'Address not found' } };
  }

  const addrType = addrResult.rows[0].type;

  // Unset previous default of same type
  await query(
    `UPDATE addresses SET is_default = false, updated_at = NOW()
     WHERE customer_id = $1 AND tenant_id = $2 AND type = $3 AND is_default = true`,
    [customerId, tenantId, addrType]
  );

  // Set new default
  const result = await query(
    `UPDATE addresses SET is_default = true, updated_at = NOW()
     WHERE id = $1 AND customer_id = $2 AND tenant_id = $3 RETURNING *`,
    [addressId, customerId, tenantId]
  );

  return { success: true, data: result.rows[0] };
}

module.exports = {
  listAddresses,
  addAddress,
  updateAddress,
  deleteAddress,
  setDefault
};
