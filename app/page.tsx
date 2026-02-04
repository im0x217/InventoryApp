'use client';

import { useState, useEffect } from 'react';
import { Plus, Search, Package } from 'lucide-react';
import { supabase, InventoryItem } from '@/lib/supabaseClient';
import { ProductCard } from '@/components/ProductCard';
import { AddEditModal } from '@/components/AddEditModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';

export default function InventoryDashboard() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [filteredItems, setFilteredItems] = useState<InventoryItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<InventoryItem | null>(null);

  useEffect(() => {
    fetchInventory();
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

  const handleAdjustStock = async (id: number, delta: number) => {
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
    setEditItem(item);
    setIsModalOpen(true);
  };

  const handleAddNew = () => {
    setEditItem(null);
    setIsModalOpen(true);
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
            <Button
              onClick={handleAddNew}
              className="h-12 px-6 bg-green-600 hover:bg-green-700 text-white font-medium"
            >
              <Plus className="h-5 w-5 mr-2" />
              Add Product
            </Button>
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
            {!searchQuery && (
              <Button onClick={handleAddNew} className="h-11 bg-green-600 hover:bg-green-700">
                <Plus className="h-5 w-5 mr-2" />
                Add Your First Product
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredItems.map((item) => (
              <ProductCard
                key={item.id}
                item={item}
                onAdjustStock={handleAdjustStock}
                onEdit={handleEdit}
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
    </div>
  );
}
