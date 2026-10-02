import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Label } from './ui/label';
import { Card, CardContent } from './ui/card';
import { RecipeDialog } from './RecipeDialog';
import { postApi } from '../lib/api';
import { fetchLatestPlan } from '../lib/data';
import { formatQuantity, type MealPlan, type PantryItem, type PlanSlot, type PlanSuggestion, type Recipe } from '../lib/types';

type Filters = { cost: string; time: string; skill: string };

type PlanResponse =
  | ({ status: 'ok'; diet: string; limitedSlots: PlanSlot[]; suggestions: PlanSuggestion[] } & MealPlan)
  | { status: 'insufficient'; missingSlots: PlanSlot[]; suggestions: PlanSuggestion[]; diet: string };

type HomeProps = {
  pantryItems: PantryItem[];
  recipes: Recipe[];
  userDiet?: string;
  isStructuredMode: boolean; // Structured = weekly meal plan, Flexible = "What can I make now?"
  onNavigateToPantry: () => void;
  onNavigateToProfile: () => void;
  onWhatCanIMake: () => void; // Opens the Recipe Generator
  onMakeRecipe: (recipe: Recipe) => void;
};

const SLOTS: PlanSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];

/** ["a"] -> "a", ["a","b"] -> "a and b", ["a","b","c"] -> "a, b and c" */
const joinWords = (words: string[]) => (words.length <= 1 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`);
const ALL: Filters = { cost: 'all', time: 'all', skill: 'all' };

export function Home({
  pantryItems,
  recipes,
  userDiet,
  isStructuredMode,
  onNavigateToPantry,
  onNavigateToProfile,
  onWhatCanIMake,
  onMakeRecipe,
}: HomeProps) {
  const [showMealPlanDialog, setShowMealPlanDialog] = useState(false);
  const [filters, setFilters] = useState<Filters>(ALL);
  const [isGenerating, setIsGenerating] = useState(false);
  const [plan, setPlan] = useState<MealPlan | null>(null);
  const [insufficient, setInsufficient] = useState<Extract<PlanResponse, { status: 'insufficient' }> | null>(null);
  const [variety, setVariety] = useState<{ limitedSlots: PlanSlot[]; suggestions: PlanSuggestion[] } | null>(null);
  const [openRecipe, setOpenRecipe] = useState<Recipe | null>(null);

  const recipeById = new Map(recipes.map((r) => [r.id, r]));
  const dietLabel = userDiet && userDiet !== 'none' ? userDiet : null;

  // Show the most recent saved plan when entering Structured mode.
  useEffect(() => {
    if (!isStructuredMode || plan) return;
    fetchLatestPlan()
      .then((saved) => saved && setPlan(saved))
      .catch(() => {}); // no saved plan is fine
  }, [isStructuredMode]);

  const generate = async (f: Filters) => {
    setShowMealPlanDialog(false);
    setIsGenerating(true);
    setInsufficient(null);
    try {
      const res = await postApi<PlanResponse>('/api/meal-plan', f);
      if (res.status === 'insufficient') {
        setInsufficient(res);
      } else {
        setPlan(res);
        setVariety(res.limitedSlots.length ? { limitedSlots: res.limitedSlots, suggestions: res.suggestions } : null);
        if (res.source === 'fallback') toast('The AI planner was unavailable, so this plan was built from your filters by rules.');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setIsGenerating(false);
    }
  };

  const relax = (field: PlanSuggestion['field']) => {
    const next = { ...filters, [field]: 'all' };
    setFilters(next);
    generate(next);
  };

  const suggestionButtons = (suggestions: PlanSuggestion[]) => (
    <div className="flex flex-wrap gap-2 mt-3">
      {suggestions
        .filter((s) => s.field !== 'diet')
        .map((s) => (
          <Button key={s.field} size="sm" variant="outline" onClick={() => relax(s.field)}>
            {s.label}
          </Button>
        ))}
      {suggestions.some((s) => s.field === 'diet') && (
        <Button size="sm" variant="outline" onClick={onNavigateToProfile}>
          Change your diet in Profile
        </Button>
      )}
      {suggestions.length === 0 && <span className="text-sm">Try loosening more than one filter.</span>}
    </div>
  );

  const filterSelect = (id: keyof Filters, label: string, options: [string, string][]) => (
    <div>
      <Label htmlFor={`plan-${id}`}>{label}</Label>
      <Select value={filters[id]} onValueChange={(v) => setFilters((f) => ({ ...f, [id]: v }))}>
        <SelectTrigger id={`plan-${id}`} className="mt-2">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(([value, text]) => (
            <SelectItem key={value} value={value}>
              {text}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="text-center mb-12">
        <h1 className="text-gray-900 mb-6 text-3xl font-bold">Welcome to Your Recipe Assistant</h1>

        {!isStructuredMode ? (
          <Button onClick={onWhatCanIMake} size="lg" className="px-8 py-6 text-lg bg-gray-900 hover:bg-gray-800 text-white">
            What can I make now?
          </Button>
        ) : (
          <div className="max-w-3xl mx-auto text-left">
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-gray-900 text-xl font-semibold">Your Meal Plan</h2>
              <Button onClick={() => setShowMealPlanDialog(true)} disabled={isGenerating}>
                {isGenerating ? 'Planning…' : plan ? 'Plan a New Week' : 'Generate Meal Plan'}
              </Button>
            </div>
            <p className="text-sm text-gray-500 mb-6">
              {dietLabel ? `Planning for your ${dietLabel} diet. ` : 'No diet restriction set. '}
              <button className="text-orange-600 hover:underline" onClick={onNavigateToProfile}>
                Change in Profile
              </button>
            </p>

            {insufficient && (
              <div className="mb-6 p-4 rounded-lg border border-amber-300 bg-amber-50 text-amber-900">
                <p className="font-medium">
                  No recipes fit your filters for {joinWords(insufficient.missingSlots)}.
                </p>
                <p className="text-sm mt-1">MealMind only plans with real recipes, so it won't make one up. Try:</p>
                {suggestionButtons(insufficient.suggestions)}
              </div>
            )}

            {variety && !insufficient && (
              <div className="mb-6 p-4 rounded-lg border border-sky-200 bg-sky-50 text-sky-900">
                <p className="font-medium">Only a few {joinWords(variety.limitedSlots)} recipes match, so this week repeats a lot.</p>
                <p className="text-sm mt-1">For more variety, try:</p>
                {suggestionButtons(variety.suggestions)}
              </div>
            )}

            {insufficient && plan && <p className="text-sm text-gray-500 mb-2">Your current plan is unchanged:</p>}
            <div className={`space-y-3 ${insufficient ? 'opacity-60' : ''}`}>
              {plan?.days.map((day) => (
                <Card key={day.day}>
                  <CardContent className="p-4">
                    <p className="text-gray-900 font-bold border-b pb-1 mb-2">{day.day}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                      {SLOTS.map((slot) => {
                        const meal = day[slot];
                        const recipe = meal ? recipeById.get(meal.id) : undefined;
                        return (
                          <p key={slot}>
                            <span className="font-semibold text-orange-600 capitalize">{slot}:</span>{' '}
                            {meal && recipe ? (
                              <button className="text-gray-800 hover:underline text-left" onClick={() => setOpenRecipe(recipe)}>
                                {meal.name} <span className="text-gray-400">· {meal.minutes} min</span>
                              </button>
                            ) : (
                              <span className="text-gray-400">{slot === 'snack' ? 'No snack fits your filters' : '—'}</span>
                            )}
                          </p>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              ))}
              {!plan && !insufficient && !isGenerating && (
                <div className="text-center py-8 bg-white border border-dashed rounded-lg text-gray-500">
                  Generate a plan for Monday to Friday from the recipes that fit your filters and diet.
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Pantry Preview Section */}
      <div className="mt-16">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-gray-900 text-xl font-semibold">Current Pantry</h2>
          <Button variant="outline" onClick={onNavigateToPantry}>
            Show More
          </Button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {pantryItems.slice(0, 8).map((item) => (
            <Card key={item.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <p className="text-gray-900 font-medium">{item.name}</p>
                {formatQuantity(item) && (
                  <p className="text-gray-500 text-sm bg-gray-100 inline-block px-2 py-0.5 rounded mt-1">{formatQuantity(item)}</p>
                )}
              </CardContent>
            </Card>
          ))}
          {pantryItems.length === 0 && (
            <div className="col-span-full text-center py-8 bg-gray-50 border border-dashed rounded-lg">
              <p className="text-gray-500">Your pantry is empty.</p>
            </div>
          )}
        </div>
      </div>

      <RecipeDialog recipe={openRecipe} onClose={() => setOpenRecipe(null)} onCook={onMakeRecipe} />

      <Dialog open={showMealPlanDialog} onOpenChange={setShowMealPlanDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Plan Your Week</DialogTitle>
            <DialogDescription>
              Every meal comes from MealMind's recipes and fits these filters{dietLabel ? ` and your ${dietLabel} diet` : ''}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            {filterSelect('cost', 'Budget', [['all', 'Any'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High']])}
            {filterSelect('time', 'Time to Cook', [['all', 'Any'], ['quick', 'Quick (30 min or less)'], ['medium', 'Medium (31–60 min)'], ['long', 'Long (over 60 min)']])}
            {filterSelect('skill', 'Skill Level', [['all', 'Any'], ['beginner', 'Beginner'], ['intermediate', 'Intermediate'], ['advanced', 'Advanced']])}
            <div className="flex justify-end space-x-2 pt-4">
              <Button variant="outline" onClick={() => setShowMealPlanDialog(false)}>
                Cancel
              </Button>
              <Button onClick={() => generate(filters)} className="bg-orange-600 hover:bg-orange-700 text-white">
                Generate Plan
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
