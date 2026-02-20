// Configuration constants

const DEFAULT_STORE_ID = '00000000-0000-0000-0000-000000000001';
const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001';
const DEFAULT_TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:3001',
  'http://localhost:3003',
  'http://localhost:3004',
  'http://localhost:3005'
];

const ALLOW_ALL_CORS = (process.env.ALLOW_ALL_CORS || 'true').toLowerCase() === 'true';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
const ORIGIN_ALLOWLIST = ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : DEFAULT_ALLOWED_ORIGINS;

const SKIP_AUTH = (process.env.SKIP_AUTH || 'true').toLowerCase() === 'true';
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
const PORT = process.env.PORT || 9106;

module.exports = {
  DEFAULT_STORE_ID,
  DEFAULT_USER_ID,
  DEFAULT_TENANT_ID,
  DEFAULT_ALLOWED_ORIGINS,
  ALLOW_ALL_CORS,
  ORIGIN_ALLOWLIST,
  SKIP_AUTH,
  JWT_SECRET,
  PORT
};
