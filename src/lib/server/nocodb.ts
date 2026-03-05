import { env } from '$env/dynamic/private';

type PaymentStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'UNKNOWN';

type NocoRecord = Record<string, unknown>;

const NOCODB_BASE_URL = (env.NOCODB_BASE_URL || '').trim().replace(/\/+$/, '');
const NOCODB_API_TOKEN = (env.NOCODB_API_TOKEN || '').trim();
const NOCODB_TABLE_ID = (env.NOCODB_TABLE_ID || '').trim();

function getRecordsFromResponse(payload: unknown): NocoRecord[] {
  if (!payload || typeof payload !== 'object') return [];
  const body = payload as Record<string, unknown>;

  if (Array.isArray(body.list)) return body.list as NocoRecord[];
  if (Array.isArray(body.records)) return body.records as NocoRecord[];
  if (Array.isArray(body.data)) return body.data as NocoRecord[];
  if (body.data && typeof body.data === 'object' && Array.isArray((body.data as any).list)) {
    return (body.data as any).list as NocoRecord[];
  }

  return [];
}

function normalizeStatus(value: unknown): PaymentStatus {
  if (typeof value !== 'string') return 'UNKNOWN';
  const status = value.toUpperCase();

  if (status === 'PENDING') return 'PENDING';
  if (status === 'SUCCEEDED' || status === 'SUCCESS' || status === 'SUCCEED') return 'SUCCEEDED';
  if (status === 'FAILED') return 'FAILED';
  if (status === 'CANCELLED' || status === 'CANCELED') return 'CANCELLED';

  return 'UNKNOWN';
}

export function isNocoDbConfigured(): boolean {
  return Boolean(NOCODB_BASE_URL && NOCODB_API_TOKEN && NOCODB_TABLE_ID);
}

export async function getPaymentStatusFromNocoDb(chargeId: string): Promise<PaymentStatus> {
  if (!isNocoDbConfigured()) {
    throw new Error('NocoDB is not configured. Set NOCODB_BASE_URL, NOCODB_API_TOKEN, and NOCODB_TABLE_ID.');
  }

  const where = `(charge_id,eq,${chargeId})`;
  const url = `${NOCODB_BASE_URL}/api/v2/tables/${encodeURIComponent(NOCODB_TABLE_ID)}/records?where=${encodeURIComponent(where)}&limit=1`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'xc-token': NOCODB_API_TOKEN
    }
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`NocoDB request failed (${response.status}): ${body || response.statusText}`);
  }

  const payload = await response.json().catch(() => ({}));
  const records = getRecordsFromResponse(payload);
  if (records.length === 0) return 'PENDING';

  return normalizeStatus(records[0]?.status);
}
