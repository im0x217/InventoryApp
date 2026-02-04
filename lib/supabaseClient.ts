import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type InventoryItem = {
  id: number;
  name: string;
  quantity: number;
  min_stock: number;
  category: string | null;
  created_at: string;
  updated_at: string;
};
