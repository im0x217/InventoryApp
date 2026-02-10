'use client';

import { useState, useEffect, useMemo } from 'react';
import { Plus, Search, Package, Lock, Unlock, Printer } from 'lucide-react';
import { supabase, InventoryItem } from '@/lib/supabaseClient';
import { ProductCard } from '@/components/ProductCard';
import { AddEditModal } from '@/components/AddEditModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const MOD_UNLOCK_KEY = 'inventory_mod_unlocked';
const MOD_PASSCODE = process.env.NEXT_PUBLIC_MOD_PASSCODE || '';

export default function InventoryDashboard() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [filteredItems, setFilteredItems] = useState<InventoryItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<InventoryItem | null>(null);
  const [isModUnlocked, setIsModUnlocked] = useState(false);
  const [isUnlockOpen, setIsUnlockOpen] = useState(false);
  const [passcode, setPasscode] = useState('');
  const [unlockError, setUnlockError] = useState('');
  const [printCategory, setPrintCategory] = useState('all');

  const categoryOptions = useMemo(() => {
    const categoryMap = new Map<string, string>();
    items.forEach((item) => {
      const raw = item.category?.trim();
      if (!raw) return;
      const key = raw.toLowerCase();
      if (!categoryMap.has(key)) categoryMap.set(key, raw);
    });
    return Array.from(categoryMap.values()).sort((a, b) =>
      a.localeCompare(b)
    );
  }, [items]);

  const hasUncategorized = useMemo(
    () => items.some((item) => !item.category || item.category.trim() === ''),
    [items]
  );

  const printItems = useMemo(() => {
    if (printCategory === 'all') return items;
    if (printCategory === 'uncategorized') {
      return items.filter(
        (item) => !item.category || item.category.trim() === ''
      );
    }
    return items.filter(
      (item) =>
        item.category &&
        item.category.trim().toLowerCase() === printCategory
    );
  }, [items, printCategory]);

  const printCategoryLabel = useMemo(() => {
    if (printCategory === 'all') return 'All categories';
    if (printCategory === 'uncategorized') return 'Uncategorized';
    const match = categoryOptions.find(
      (category) => category.toLowerCase() === printCategory
    );
    return match || 'Selected category';
  }, [printCategory, categoryOptions]);

  useEffect(() => {
    fetchInventory();
  }, []);

  useEffect(() => {
    const saved = window.localStorage.getItem(MOD_UNLOCK_KEY);
    setIsModUnlocked(saved === 'true');
  }, []);

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredItems(items);
    } else {
      const query = searchQuery.toLowerCase();
      setFilteredItems(
        items.filter(
          (item) =>
            item.name.toLowerCase().includes(query) ||
            (item.category && item.category.toLowerCase().includes(query))
        )
      );
    }
  }, [searchQuery, items]);

  const fetchInventory = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('inventory')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;
      setItems(data || []);
    } catch (error) {
      console.error('Error fetching inventory:', error);
      toast.error('Failed to load inventory');
    } finally {
      setLoading(false);
    }
  };

  const requireUnlock = () => {
    setIsUnlockOpen(true);
  };

  const guardMod = () => {
    if (!isModUnlocked) {
      toast.error('Login required to modify inventory');
      requireUnlock();
      return false;
    }
    return true;
  };

  const handleUnlock = () => {
    if (!MOD_PASSCODE) {
      setUnlockError('Passcode not configured');
      toast.error('Set NEXT_PUBLIC_MOD_PASSCODE to enable login');
      return;
    }

    if (passcode.trim() === MOD_PASSCODE) {
      window.localStorage.setItem(MOD_UNLOCK_KEY, 'true');
      setIsModUnlocked(true);
      setIsUnlockOpen(false);
      setPasscode('');
      setUnlockError('');
      toast.success('Mod unlocked');
      return;
    }

    setUnlockError('Invalid passcode');
  };

  const handleLock = () => {
    window.localStorage.removeItem(MOD_UNLOCK_KEY);
    setIsModUnlocked(false);
    toast.success('Mod locked');
  };

  const handleAdjustStock = async (id: number, delta: number) => {
    if (!guardMod()) return;
    const item = items.find((i) => i.id === id);
    if (!item) return;

    const newQuantity = Math.max(0, item.quantity + delta);

    setItems((prevItems) =>
      prevItems.map((i) =>
        i.id === id ? { ...i, quantity: newQuantity } : i
      )
    );

    try {
      const { error } = await supabase
        .from('inventory')
        .update({ quantity: newQuantity })
        .eq('id', id);

      if (error) throw error;

      toast.success(
        delta > 0
          ? `Added ${delta} to ${item.name}`
          : `Removed ${Math.abs(delta)} from ${item.name}`
      );
    } catch (error) {
      console.error('Error updating stock:', error);
      toast.error('Failed to update stock');
      setItems((prevItems) =>
        prevItems.map((i) =>
          i.id === id ? { ...i, quantity: item.quantity } : i
        )
      );
    }
  };

  const handleSaveItem = async (itemData: Partial<InventoryItem>) => {
    if (!guardMod()) return;
    try {
      if (editItem) {
        const { error } = await supabase
          .from('inventory')
          .update(itemData)
          .eq('id', editItem.id);

        if (error) throw error;
        toast.success('Product updated successfully');
      } else {
        const { data, error } = await supabase
          .from('inventory')
          .insert([itemData])
          .select()
          .single();

        if (error) throw error;
        toast.success('Product added successfully');
      }

      await fetchInventory();
      setIsModalOpen(false);
      setEditItem(null);
    } catch (error) {
      console.error('Error saving item:', error);
      toast.error('Failed to save product');
    }
  };

  const handleEdit = (item: InventoryItem) => {
    if (!guardMod()) return;
    setEditItem(item);
    setIsModalOpen(true);
  };

  const handleAddNew = () => {
    if (!guardMod()) return;
    setEditItem(null);
    setIsModalOpen(true);
  };

  const handlePrint = () => {
    if (typeof window === 'undefined') return;
    window.print();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <Toaster position="top-center" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="bg-green-100 p-2 rounded-lg">
                <Package className="h-6 w-6 text-green-700" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">
                Inventory Manager
              </h1>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-end gap-2">
              <div className="flex flex-col gap-1 sm:min-w-[200px]">
                <span className="text-xs text-slate-500">Print category</span>
                <Select value={printCategory} onValueChange={setPrintCategory}>
                  <SelectTrigger className="h-12">
                    <SelectValue placeholder="All categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All categories</SelectItem>
                    {categoryOptions.map((category) => (
                      <SelectItem
                        key={category}
                        value={category.toLowerCase()}
                      >
                        {category}
                      </SelectItem>
                    ))}
                    {hasUncategorized ? (
                      <SelectItem value="uncategorized">
                        Uncategorized
                      </SelectItem>
                    ) : null}
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={handlePrint}
                variant="outline"
                className="h-12 px-5"
              >
                <Printer className="h-5 w-5 mr-2" />
                Print A4
              </Button>
              {isModUnlocked ? (
                <>
                  <Button
                    onClick={handleAddNew}
                    className="h-12 px-6 bg-green-600 hover:bg-green-700 text-white font-medium"
                  >
                    <Plus className="h-5 w-5 mr-2" />
                    Add Product
                  </Button>
                  <Button
                    onClick={handleLock}
                    variant="outline"
                    className="h-12 px-5"
                  >
                    <Lock className="h-5 w-5 mr-2" />
                    Lock Mod
                  </Button>
                </>
              ) : (
                <Button
                  onClick={requireUnlock}
                  className="h-12 px-6 bg-slate-900 hover:bg-slate-800 text-white font-medium"
                >
                  <Unlock className="h-5 w-5 mr-2" />
                  Admin Login
                </Button>
              )}
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-slate-400" />
            <Input
              type="text"
              placeholder="Search by name or category..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-12 text-base"
            />
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-white rounded-lg p-4 border border-slate-200">
                <Skeleton className="h-6 w-3/4 mb-2" />
                <Skeleton className="h-4 w-1/2 mb-4" />
                <Skeleton className="h-8 w-1/4 mb-2" />
                <Skeleton className="h-4 w-1/3" />
              </div>
            ))}
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="bg-white rounded-lg border border-slate-200 p-12 text-center">
            <Package className="h-16 w-16 text-slate-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-slate-900 mb-2">
              {searchQuery ? 'No products found' : 'No products yet'}
            </h3>
            <p className="text-slate-500 mb-6">
              {searchQuery
                ? 'Try adjusting your search query'
                : 'Get started by adding your first product'}
            </p>
            {!searchQuery &&
              (isModUnlocked ? (
                <Button onClick={handleAddNew} className="h-11 bg-green-600 hover:bg-green-700">
                  <Plus className="h-5 w-5 mr-2" />
                  Add Your First Product
                </Button>
              ) : null)}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredItems.map((item) => (
              <ProductCard
                key={item.id}
                item={item}
                onAdjustStock={handleAdjustStock}
                onEdit={handleEdit}
                isModUnlocked={isModUnlocked}
              />
            ))}
          </div>
        )}
      </div>

      <AddEditModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditItem(null);
        }}
        onSave={handleSaveItem}
        editItem={editItem}
      />

      <Dialog open={isUnlockOpen} onOpenChange={setIsUnlockOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Unlock Mod Features</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="mod-passcode">Passcode</Label>
              <Input
                id="mod-passcode"
                type="password"
                value={passcode}
                onChange={(e) => {
                  setPasscode(e.target.value);
                  setUnlockError('');
                }}
                placeholder="Enter passcode"
                className="h-11"
              />
              {unlockError && (
                <p className="text-sm text-red-600">{unlockError}</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsUnlockOpen(false)}
              className="h-11"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleUnlock}
              className="h-11 bg-slate-900 hover:bg-slate-800"
            >
              Unlock
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div id="print-area" className="print-area">
        <div className="print-page">
          <div className="print-header">
            <div>
              <h1>Inventory Storage</h1>
              <p>Snapshot date: {new Date().toLocaleDateString()}</p>
            </div>
            <div className="print-summary">
              <span>Category: {printCategoryLabel}</span>
              <span>Total products: {printItems.length}</span>
            </div>
          </div>
          <table className="print-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Category</th>
                <th>In Storage</th>
              </tr>
            </thead>
            <tbody>
              {printItems.map((item) => (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  <td>{item.category || '-'}</td>
                  <td>{item.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <style jsx global>{`
        @media screen {
          .print-area {
            display: none;
          }
        }

        @media print {
          @page {
            size: A4;
            margin: 16mm;
          }

          body {
            background: #ffffff !important;
            color: #111827;
          }

          body * {
            visibility: hidden;
          }

          #print-area,
          #print-area * {
            visibility: visible;
          }

          #print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            display: block !important;
          }

          .print-page {
            font-family: "Times New Roman", serif;
            color: #0f172a;
          }

          .print-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            border-bottom: 1px solid #e2e8f0;
            padding-bottom: 8px;
            margin-bottom: 12px;
          }

          .print-header h1 {
            font-size: 20px;
            margin: 0 0 4px 0;
          }

          .print-header p {
            margin: 0;
            font-size: 12px;
            color: #475569;
          }

          .print-summary {
            font-size: 12px;
            color: #475569;
          }

          .print-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 12px;
          }

          .print-table th,
          .print-table td {
            border: 1px solid #e2e8f0;
            padding: 6px 8px;
            text-align: left;
          }

          .print-table th {
            background: #f8fafc;
            font-weight: 600;
          }
        }
      `}</style>
    </div>
  );
}
