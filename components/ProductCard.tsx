'use client';

import { Minus, Plus, Edit2, AlertCircle } from 'lucide-react';
import { InventoryItem } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface ProductCardProps {
  item: InventoryItem;
  onAdjustStock: (id: number, delta: number) => void;
  onEdit: (item: InventoryItem) => void;
}

export function ProductCard({ item, onAdjustStock, onEdit }: ProductCardProps) {
  const isLowStock = item.quantity <= item.min_stock;

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
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onEdit(item)}
          >
            <Edit2 className="h-4 w-4" />
          </Button>
        </div>

        {isLowStock && (
          <Badge variant="destructive" className="mb-3 flex items-center gap-1 w-fit">
            <AlertCircle className="h-3 w-3" />
            Low Stock
          </Badge>
        )}

        <div className="flex items-center justify-between">
          <div>
            <p className="text-2xl font-bold">{item.quantity}</p>
            <p className="text-xs text-muted-foreground">Min: {item.min_stock}</p>
          </div>

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
        </div>
      </CardContent>
    </Card>
  );
}
