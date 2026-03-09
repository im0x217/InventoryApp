import PocketBase from 'pocketbase';

const pocketBaseUrl =
  process.env.NEXT_PUBLIC_POCKETBASE_URL ||
  (process.env.NODE_ENV === 'development' ? 'http://127.0.0.1:8090' : '');

export const pocketbase = new PocketBase(pocketBaseUrl);

type InventoryRecord = {
  id: string;
  legacy_id?: string | null;
  name?: string | null;
  quantity?: number | null;
  min_stock?: number | null;
  category?: string | null;
  last_updated_legacy?: string | null;
  created?: string;
  updated?: string;
};

export type InventoryItem = {
  id: number;
  recordId: string;
  legacy_id: string;
  name: string;
  quantity: number;
  min_stock: number;
  category: string | null;
  last_updated_legacy: string | null;
  created_at: string;
  updated_at: string;
};

export function mapInventoryRecordToItem(record: InventoryRecord): InventoryItem {
  const parsedLegacy = Number.parseInt(record.legacy_id || '', 10);

  return {
    id: Number.isNaN(parsedLegacy) ? 0 : parsedLegacy,
    recordId: record.id,
    legacy_id: record.legacy_id || '',
    name: record.name || '',
    quantity: typeof record.quantity === 'number' ? record.quantity : 0,
    min_stock: typeof record.min_stock === 'number' ? record.min_stock : 5,
    category: record.category || null,
    last_updated_legacy: record.last_updated_legacy || null,
    created_at: record.created || '',
    updated_at: record.updated || '',
  };
}