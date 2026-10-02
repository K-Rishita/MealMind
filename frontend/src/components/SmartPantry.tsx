import { useState } from 'react';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Plus, Check, X } from 'lucide-react';
import { formatQuantity, type NewItem, type PantryItem, type ShoppingListItem } from '../lib/types';

type SmartPantryProps = {
  pantryItems: PantryItem[];
  onAddItem: (item: NewItem) => void;
  onDeleteItem: (item: PantryItem) => void;
  shoppingListItems: ShoppingListItem[];
  onAddShoppingItem: (item: NewItem) => void;
  onDeleteShoppingItem: (item: ShoppingListItem) => void;
  onMoveToPantry: (item: ShoppingListItem) => void;
};

export function SmartPantry({
  pantryItems,
  onAddItem,
  onDeleteItem,
  shoppingListItems,
  onAddShoppingItem,
  onDeleteShoppingItem,
  onMoveToPantry,
}: SmartPantryProps) {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemQuantity, setNewItemQuantity] = useState('');
  const [newItemUnit, setNewItemUnit] = useState('');

  // True if the open dialog adds to the Shopping List, false for the Pantry
  const [isShoppingListTarget, setIsShoppingListTarget] = useState(false);

  const openAddDialog = (isShoppingList: boolean) => {
    setIsShoppingListTarget(isShoppingList);
    setNewItemName('');
    setNewItemQuantity('');
    setNewItemUnit('');
    setShowAddDialog(true);
  };

  const quantity = newItemQuantity.trim() === '' ? null : Number(newItemQuantity);
  const isValid = newItemName.trim() !== '' && (quantity === null || (Number.isFinite(quantity) && quantity >= 0));

  const handleAddItem = () => {
    if (!isValid) return;
    const item: NewItem = { name: newItemName.trim(), quantity, unit: newItemUnit.trim() || null };
    if (isShoppingListTarget) onAddShoppingItem(item);
    else onAddItem(item);
    setShowAddDialog(false);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* --- Smart Pantry Section --- */}
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-gray-900 text-3xl font-bold">Smart Pantry Inventory</h1>
        <Button onClick={() => openAddDialog(false)} className="bg-orange-600 hover:bg-orange-700 text-white">
          <Plus className="h-4 w-4 mr-2" />
          Add to Pantry
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {pantryItems.map((item) => (
          <Card key={item.id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-4 flex justify-between items-start gap-2">
              <div>
                <h3 className="text-gray-900 font-medium mb-1">{item.name}</h3>
                {formatQuantity(item) && (
                  <p className={`text-sm inline-block px-2 py-1 rounded ${item.quantity === 0 ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
                    {item.quantity === 0 ? `Out of ${item.name}` : formatQuantity(item)}
                  </p>
                )}
              </div>
              <Button variant="ghost" size="sm" onClick={() => onDeleteItem(item)} title={`Remove ${item.name}`} aria-label={`Remove ${item.name}`}>
                <X className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {pantryItems.length === 0 && (
        <div className="text-center py-12 bg-white rounded-lg border border-dashed border-gray-300 mt-4">
          <p className="text-gray-500 mb-4">Your pantry is empty. Start adding ingredients!</p>
          <Button variant="outline" onClick={() => openAddDialog(false)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Your First Item
          </Button>
        </div>
      )}

      {/* --- Shopping List Section --- */}
      <div className="mt-12 mb-12">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-gray-900 text-3xl font-bold">Shopping List</h1>
          <Button onClick={() => openAddDialog(true)} className="bg-orange-600 hover:bg-orange-700 text-white">
            <Plus className="h-4 w-4 mr-2" />
            Add to List
          </Button>
        </div>

        {shoppingListItems.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {shoppingListItems.map((item) => (
              <Card key={item.id} className="bg-orange-50 border-orange-200 hover:shadow-md transition-shadow">
                <CardContent className="p-4 flex justify-between items-start gap-2">
                  <div>
                    <h3 className="text-gray-900 font-medium">{item.name}</h3>
                    <p className="text-gray-600 text-sm">{formatQuantity(item)}</p>
                  </div>
                  <div className="flex">
                    <Button variant="ghost" size="sm" onClick={() => onMoveToPantry(item)} title="Bought it: move to pantry" aria-label={`Move ${item.name} to pantry`}>
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => onDeleteShoppingItem(item)} title={`Remove ${item.name}`} aria-label={`Remove ${item.name}`}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 bg-white rounded-lg border border-dashed border-gray-300">
            <p className="text-gray-500">Your shopping list is empty!</p>
          </div>
        )}
      </div>

      {/* Add Item Dialog (shared by pantry and shopping list) */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isShoppingListTarget ? 'Add to Shopping List' : 'Add to Smart Pantry'}</DialogTitle>
            <DialogDescription>
              {isShoppingListTarget
                ? 'Enter the item you need to buy.'
                : 'Add an ingredient. A quantity and unit let MealMind update it when you cook.'}
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4 mt-4"
            onSubmit={(e) => {
              e.preventDefault();
              handleAddItem();
            }}
          >
            <div>
              <Label htmlFor="item-name">Ingredient Name</Label>
              <Input
                id="item-name"
                placeholder={isShoppingListTarget ? 'e.g., Milk' : 'e.g., Chicken Breast'}
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                className="mt-2"
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="item-quantity">Quantity (optional)</Label>
                <Input
                  id="item-quantity"
                  type="number"
                  min="0"
                  step="any"
                  placeholder="e.g., 2"
                  value={newItemQuantity}
                  onChange={(e) => setNewItemQuantity(e.target.value)}
                  className="mt-2"
                />
              </div>
              <div>
                <Label htmlFor="item-unit">Unit (optional)</Label>
                <Input
                  id="item-unit"
                  placeholder="e.g., cups, lb, g"
                  value={newItemUnit}
                  onChange={(e) => setNewItemUnit(e.target.value)}
                  className="mt-2"
                  list="unit-suggestions"
                />
                <datalist id="unit-suggestions">
                  {['cups', 'tbsp', 'tsp', 'g', 'kg', 'oz', 'lb', 'ml', 'l', 'cans', 'cloves'].map((u) => (
                    <option key={u} value={u} />
                  ))}
                </datalist>
              </div>
            </div>

            <div className="flex justify-end space-x-2 mt-6">
              <Button type="button" variant="outline" onClick={() => setShowAddDialog(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!isValid} className="bg-orange-600 hover:bg-orange-700 text-white">
                {isShoppingListTarget ? 'Add to List' : 'Add to Pantry'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
