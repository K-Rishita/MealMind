import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Utensils } from 'lucide-react';
import type { Recipe } from '../lib/types';

type RecipeDialogProps = {
  recipe: Recipe | null; // null = closed
  onClose: () => void;
  onCook: (recipe: Recipe) => void;
};

/** Full recipe with ingredients, numbered steps and a "Cook" button. Shared by Home and Recipe Discovery. */
export function RecipeDialog({ recipe, onClose, onCook }: RecipeDialogProps) {
  return (
    <Dialog open={recipe !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle className="text-2xl">{recipe?.name}</DialogTitle>
          <DialogDescription>
            {recipe?.time} min • {recipe?.skillLevel} • {recipe?.cost} cost
          </DialogDescription>
        </DialogHeader>

        <div className="p-6 pt-2 overflow-y-auto flex-1">
          {recipe && (
            <div className="space-y-6">
              <div>
                <h3 className="font-bold text-gray-900 mb-2 text-lg">Ingredients</h3>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {recipe.ingredients.map((ingredient, index) => (
                    <li key={index} className="text-gray-700 flex items-center bg-gray-50 p-2 rounded">
                      <span className="w-2 h-2 bg-orange-400 rounded-full mr-2"></span>
                      {ingredient}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="font-bold text-gray-900 mb-2 text-lg">Instructions</h3>
                {recipe.steps.length > 0 ? (
                  <ol className="list-decimal list-outside space-y-2 pl-9 pr-4 py-4 bg-gray-50 rounded-lg text-gray-700 leading-relaxed">
                    {recipe.steps.map((step, index) => (
                      <li key={index}>{step}</li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-gray-500">No instructions provided.</p>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="p-6 border-t bg-gray-50">
          <Button
            onClick={() => {
              if (recipe) onCook(recipe);
              onClose();
            }}
            className="w-full bg-orange-600 hover:bg-orange-700 text-white text-lg h-12"
          >
            <Utensils className="mr-2 h-5 w-5" />
            Cook This Meal (Update Pantry)
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
