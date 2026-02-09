'use client';

import { useState } from 'react';
import { Minus, Plus, Edit2, AlertCircle } from 'lucide-react';
import { InventoryItem } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

interface ProductCardProps {
  item: InventoryItem;
  onAdjustStock: (id: number, delta: number) => void;
  onEdit: (item: InventoryItem) => void;
  isModUnlocked: boolean;
}

export function ProductCard({
  item,
  onAdjustStock,
  onEdit,
  isModUnlocked,
}: ProductCardProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [amount, setAmount] = useState('');

  const isLowStock = item.quantity <= item.min_stock;

  const handleAddStock = () => {
    const num = parseInt(amount);
    if (num > 0) {
      onAdjustStock(item.id, num);
      setAmount('');
      setIsDialogOpen(false);
    }
  };

  const handleRemoveStock = () => {
    const num = parseInt(amount);
    if (num > 0) {
      onAdjustStock(item.id, -num);
      setAmount('');
      setIsDialogOpen(false);
    }
  };

  return (
    <Card className={`${isLowStock ? 'border-red-300 bg-red-50' : ''} hover:shadow-md transition-shadow`}>
      <CardContent className="p-4">
        <div className="flex justify-between items-start mb-3">
          <div className="flex-1">
            <h3 className="font-semibold text-lg mb-1">{item.name}</h3>
            {item.category && (
              <p className="text-sm text-muted-foreground">{item.category}</p>
            )}
          </div>
          {isModUnlocked ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => onEdit(item)}
            >
              <Edit2 className="h-4 w-4" />
            </Button>
          ) : null}
        </div>

        {isLowStock && (
          <Badge variant="destructive" className="mb-3 flex items-center gap-1 w-fit">
            <AlertCircle className="h-3 w-3" />
            Low Stock
          </Badge>
        )}

        <div className="flex items-center justify-between">
          <div>
            {isModUnlocked ? (
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <button
                  type="button"
                  onClick={() => setIsDialogOpen(true)}
                  className="text-2xl font-bold hover:text-blue-600 transition-colors cursor-pointer"
                >
                  {item.quantity}
                </button>
                <DialogContent className="sm:max-w-[425px]">
                  <DialogHeader>
                    <DialogTitle>Adjust Stock for {item.name}</DialogTitle>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                      <label htmlFor="amount" className="text-right">
                        Amount
                      </label>
                      <Input
                        id="amount"
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className="col-span-3"
                        placeholder="Enter amount"
                        min="1"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button
                      onClick={handleRemoveStock}
                      className="bg-red-600 hover:bg-red-700 text-white h-12 px-6"
                      disabled={!amount || parseInt(amount) <= 0}
                    >
                      Remove from Stock
                    </Button>
                    <Button
                      onClick={handleAddStock}
                      className="bg-green-600 hover:bg-green-700 text-white h-12 px-6"
                      disabled={!amount || parseInt(amount) <= 0}
                    >
                      Add to Stock
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            ) : (
              <span className="text-2xl font-bold">{item.quantity}</span>
            )}
            <p className="text-xs text-muted-foreground">Min: {item.min_stock}</p>
          </div>

          {isModUnlocked ? (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="icon"
                className="h-11 w-11 bg-red-50 hover:bg-red-100 border-red-200"
                onClick={() => onAdjustStock(item.id, -1)}
                disabled={item.quantity <= 0}
              >
                <Minus className="h-5 w-5 text-red-600" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-11 w-11 bg-green-50 hover:bg-green-100 border-green-200"
                onClick={() => onAdjustStock(item.id, 1)}
              >
                <Plus className="h-5 w-5 text-green-600" />
              </Button>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
