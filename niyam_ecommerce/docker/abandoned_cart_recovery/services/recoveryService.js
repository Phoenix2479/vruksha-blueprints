// Recovery business logic service

const { query } = require('@vruksha/platform/db/postgres');
const { publishEnvelope } = require('@vruksha/platform/sdk/node');

/**
 * Render template placeholders
 */
function renderTemplate(template, variables) {
  let rendered = template || '';
  for (const [key, value] of Object.entries(variables)) {
    rendered = rendered.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value || '');
  }
  return rendered;
}

async function listTemplates(tenantId, { active_only } = {}) {
  let sql = 'SELECT * FROM recovery_templates WHERE tenant_id = $1';
  const params = [tenantId];

  if (active_only === 'true' || active_only === true) {
    sql += ' AND is_active = true';
  }

  sql += ' ORDER BY delay_hours ASC, created_at DESC';

  const result = await query(sql, params);
  return result.rows;
}

async function getTemplate(id, tenantId) {
  const result = await query(
    'SELECT * FROM recovery_templates WHERE id = $1 AND tenant_id = $2',
    [id, tenantId]
  );
  return result.rows[0] || null;
}

async function createTemplate(tenantId, data) {
  const { name, channel, subject, body, delay_hours, is_active } = data;

  const result = await query(
    `INSERT INTO recovery_templates (tenant_id, name, channel, subject, body, delay_hours, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      tenantId,
      name,
      channel || 'email',
      subject || '',
      body || '',
      delay_hours || 1,
      is_active !== false
    ]
  );

  return result.rows[0];
}

async function updateTemplate(id, tenantId, data) {
  const existing = await getTemplate(id, tenantId);
  if (!existing) return null;

  const fields = [];
  const params = [];
  let idx = 1;

  if (data.name !== undefined) {
    fields.push(`name = $${idx++}`);
    params.push(data.name);
  }
  if (data.channel !== undefined) {
    fields.push(`channel = $${idx++}`);
    params.push(data.channel);
  }
  if (data.subject !== undefined) {
    fields.push(`subject = $${idx++}`);
    params.push(data.subject);
  }
  if (data.body !== undefined) {
    fields.push(`body = $${idx++}`);
    params.push(data.body);
  }
  if (data.delay_hours !== undefined) {
    fields.push(`delay_hours = $${idx++}`);
    params.push(data.delay_hours);
  }
  if (data.is_active !== undefined) {
    fields.push(`is_active = $${idx++}`);
    params.push(data.is_active);
  }

  if (fields.length === 0) return existing;

  fields.push(`updated_at = NOW()`);
  params.push(id, tenantId);

  const result = await query(
    `UPDATE recovery_templates SET ${fields.join(', ')} WHERE id = $${idx++} AND tenant_id = $${idx} RETURNING *`,
    params
  );

  return result.rows[0] || null;
}

async function deleteTemplate(id, tenantId) {
  const result = await query(
    'DELETE FROM recovery_templates WHERE id = $1 AND tenant_id = $2 RETURNING id',
    [id, tenantId]
  );
  return result.rows.length > 0;
}

/**
 * Trigger recovery for an abandoned cart
 */
async function triggerRecovery(tenantId, { abandoned_cart_id, template_id }) {
  // Get the abandoned cart
  const cartResult = await query(
    'SELECT * FROM abandoned_carts WHERE id = $1 AND tenant_id = $2',
    [abandoned_cart_id, tenantId]
  );
  const cart = cartResult.rows[0];
  if (!cart) {
    return { error: 'Abandoned cart not found', status: 404 };
  }

  if (cart.recovery_status === 'recovered') {
    return { error: 'Cart has already been recovered', status: 400 };
  }

  // Get the template
  let template = null;
  if (template_id) {
    template = await getTemplate(template_id, tenantId);
    if (!template) {
      return { error: 'Recovery template not found', status: 404 };
    }
  } else {
    // Pick the first active template
    const templates = await listTemplates(tenantId, { active_only: true });
    template = templates[0];
    if (!template) {
      return { error: 'No active recovery templates available', status: 400 };
    }
  }

  // Render the template
  const cartUrl = `${process.env.STORE_URL || 'https://store.example.com'}/cart/recover/${cart.cart_id}`;
  const renderedSubject = renderTemplate(template.subject, {
    customer_name: cart.customer_email || 'Valued Customer',
    cart_url: cartUrl
  });
  const renderedBody = renderTemplate(template.body, {
    customer_name: cart.customer_email || 'Valued Customer',
    cart_url: cartUrl,
    cart_total: String(cart.cart_total),
    items_count: String(cart.items_count)
  });

  // Create recovery attempt
  const attemptResult = await query(
    `INSERT INTO recovery_attempts (tenant_id, abandoned_cart_id, channel, template_id, status, sent_at)
     VALUES ($1, $2, $3, $4, 'sent', NOW())
     RETURNING *`,
    [tenantId, abandoned_cart_id, template.channel, template.id]
  );

  // Update abandoned cart status
  await query(
    `UPDATE abandoned_carts SET recovery_status = 'attempted', recovery_attempts = recovery_attempts + 1, last_attempt_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2`,
    [abandoned_cart_id, tenantId]
  );

  const attempt = attemptResult.rows[0];

  try {
    await publishEnvelope('ecommerce.recovery.triggered.v1', 1, {
      abandoned_cart_id,
      attempt_id: attempt.id,
      channel: template.channel,
      template_id: template.id,
      customer_email: cart.customer_email,
      cart_total: cart.cart_total
    });
  } catch (_) { /* non-blocking */ }

  return {
    attempt,
    rendered: {
      subject: renderedSubject,
      body: renderedBody,
      channel: template.channel
    }
  };
}

/**
 * Track recovery attempt status changes
 */
async function trackAttempt(attemptId, tenantId, action) {
  const validActions = ['opened', 'clicked', 'converted'];
  if (!validActions.includes(action)) {
    return { error: `Invalid action '${action}'. Must be one of: ${validActions.join(', ')}`, status: 400 };
  }

  const column = `${action}_at`;
  const result = await query(
    `UPDATE recovery_attempts SET ${column} = NOW(), status = $1
     WHERE id = $2 AND tenant_id = $3 RETURNING *`,
    [action === 'converted' ? 'converted' : 'sent', attemptId, tenantId]
  );

  const attempt = result.rows[0];
  if (!attempt) {
    return { error: 'Recovery attempt not found', status: 404 };
  }

  // If converted, also mark the abandoned cart as recovered
  if (action === 'converted') {
    await query(
      `UPDATE abandoned_carts SET recovery_status = 'recovered', recovered_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2`,
      [attempt.abandoned_cart_id, tenantId]
    );

    try {
      await publishEnvelope('ecommerce.recovery.converted.v1', 1, {
        abandoned_cart_id: attempt.abandoned_cart_id,
        attempt_id: attempt.id,
        channel: attempt.channel
      });
    } catch (_) { /* non-blocking */ }
  }

  return { attempt };
}

/**
 * List recovery attempts for a specific abandoned cart
 */
async function listAttempts(abandonedCartId, tenantId) {
  const result = await query(
    `SELECT ra.*, rt.name as template_name
     FROM recovery_attempts ra
     LEFT JOIN recovery_templates rt ON rt.id = ra.template_id
     WHERE ra.abandoned_cart_id = $1 AND ra.tenant_id = $2
     ORDER BY ra.sent_at DESC`,
    [abandonedCartId, tenantId]
  );
  return result.rows;
}

module.exports = {
  listTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  triggerRecovery,
  trackAttempt,
  listAttempts
};
