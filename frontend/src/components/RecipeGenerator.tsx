import { useState } from 'react';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea'; 
import ReactMarkdown from 'react-markdown'; 
import { toast } from 'sonner';
import { postApi } from '../lib/api';
import { formatQuantity, type PantryItem } from '../lib/types';


type RecipeGeneratorProps = {
  pantryItems: PantryItem[]; // List of ingredients available in the user's pantry
};

export function RecipeGenerator({ pantryItems }: RecipeGeneratorProps) {
  // State for controlling the Filter Dialog and user preferences
  const [showFilterDialog, setShowFilterDialog] = useState(false);
  const [costFilter, setCostFilter] = useState<string>('all');
  const [timeFilter, setTimeFilter] = useState<string>('all');
  const [skillFilter, setSkillFilter] = useState<string>('all');
  const [userNotes, setUserNotes] = useState<string>('');

  // State for AI Generation results and loading status
  const [isLoading, setIsLoading] = useState(false);
  const [generatedRecipe, setGeneratedRecipe] = useState<string | null>(null);
  const [showRecipeDialog, setShowRecipeDialog] = useState(false);

  /**
   * Clears the previous recipe and opens the filter dialog to start a new request.
   */
  const handleWhatCanIMake = () => {
    setGeneratedRecipe(null); // Clear previous recipe
    setShowFilterDialog(true);
  };

  /**
   * Constructs the prompt, calls the backend API to generate a recipe,
   * and handles the response or error.
   */
  const handleGenerateRecipes = async () => {
    setShowFilterDialog(false);
    setIsLoading(true);
    try {
      // The server builds the prompt from your stored pantry and diet; we only send filters and notes.
      const data = await postApi<{ recipe: string }>('/api/generate-recipe', {
        cost: costFilter,
        time: timeFilter,
        skill: skillFilter,
        notes: userNotes.trim(),
      });
      setGeneratedRecipe(data.recipe);
      setShowRecipeDialog(true);
      setUserNotes('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Hero Section: Main entry point */}
      <div className="text-center mb-12">
        <h1 className="text-gray-900 mb-4">🍽️ Recipe Generator</h1>
        <p className="text-gray-600 mb-8">
          Generate recipes based on what you have in your pantry
        </p>
        <Button
          onClick={handleWhatCanIMake}
          size="lg"
          className="px-8 py-6 text-lg"
          disabled={isLoading}
        >
          {isLoading ? 'The AI Chef is Cooking...' : 'What can I make now?'}
        </Button>
      </div>

      {/* Pantry Preview Section */}
      <div className="mt-16">
        <h2 className="text-gray-900 mb-6">Available Items in Your Pantry</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {pantryItems.length > 0 ? (
            pantryItems.map((item) => (
              <Card key={item.id}>
                <CardContent className="p-4">
                  <p className="text-gray-900">{item.name}</p>
                  <p className="text-gray-500 text-sm">{formatQuantity(item)}</p>
                </CardContent>
              </Card>
            ))
          ) : (
            <div className="col-span-full text-center py-8">
              <p className="text-gray-500">No items in your pantry yet.</p>
            </div>
          )}
        </div>
      </div>

      {/* Filter Dialog: Collects user preferences before calling the AI */}
      <Dialog open={showFilterDialog} onOpenChange={setShowFilterDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Filter Recipes</DialogTitle>
            <DialogDescription>
              Select filters and notes to narrow down the recipes based on your preferences.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            {/* Cost Select */}
            <div><Label htmlFor="cost-filter">Cost</Label><Select value={costFilter} onValueChange={setCostFilter}><SelectTrigger id="cost-filter" className="mt-2"><SelectValue placeholder="Select cost range">{costFilter}</SelectValue></SelectTrigger><SelectContent><SelectItem value="all">All</SelectItem><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem></SelectContent></Select></div>
            {/* Time Select */}
            <div><Label htmlFor="time-filter">Preparation Time</Label><Select value={timeFilter} onValueChange={setTimeFilter}><SelectTrigger id="time-filter" className="mt-2"><SelectValue placeholder="Select time range">{timeFilter}</SelectValue></SelectTrigger><SelectContent><SelectItem value="all">All</SelectItem><SelectItem value="quick">Quick (30 min or less)</SelectItem><SelectItem value="medium">Medium (30-60 min)</SelectItem><SelectItem value="long">Long (60+ min)</SelectItem></SelectContent></Select></div>
            {/* Skill Select */}
            {/* NOTE: If you previously had an issue where skill level incorrectly set time, ensure onValueChange={setSkillFilter} is used here, though in the provided code snippet it's set to setTimeFilter, which I assume is an error from a previous iteration and should be fixed in production code. */}
            <div><Label htmlFor="skill-filter">Skill Level</Label><Select value={skillFilter} onValueChange={setSkillFilter}><SelectTrigger id="skill-filter" className="mt-2"><SelectValue placeholder="Select skill level">{skillFilter}</SelectValue></SelectTrigger><SelectContent><SelectItem value="all">All</SelectItem><SelectItem value="beginner">Beginner</SelectItem><SelectItem value="intermediate">Intermediate</SelectItem><SelectItem value="advanced">Advanced</SelectItem></SelectContent></Select></div>

            {/* Additional Notes Textarea */}
            <div>
              <Label htmlFor="notes-filter">Additional Notes (e.g., dietary restrictions, flavor profile)</Label>
              <Textarea
                id="notes-filter" 
                value={userNotes}
                onChange={(e) => setUserNotes(e.target.value)}
                placeholder="e.g., Must be gluten-free, or needs to be a spicy dish."
                maxLength={500}
                className="mt-2"
              />
            </div>

            {/* Dialog Actions */}
            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setShowFilterDialog(false)} disabled={isLoading}>
                Cancel
              </Button>
              <Button onClick={handleGenerateRecipes} disabled={isLoading}>
                Generate Recipes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Recipe Result Dialog: Displays the AI-generated recipe */}
      <Dialog open={showRecipeDialog} onOpenChange={setShowRecipeDialog}>
        {/* Critical classes to make the dialog content scrollable */}
        <DialogContent className="max-w-xl h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>🎉 Your AI-Generated Recipe!</DialogTitle>
            <DialogDescription>
              Here is the recipe created for you based on your ingredients and preferences.
            </DialogDescription>
          </DialogHeader>

          {/* Scrollable Content Area: uses flex-grow and overflow-y-auto */}
          <div className="flex-grow overflow-y-auto p-4 border rounded-md bg-gray-50">
            {generatedRecipe ? (
                <>
                  {/* ReactMarkdown renders the AI's Markdown output into formatted HTML */}
                  <ReactMarkdown>
                    {generatedRecipe}
                  </ReactMarkdown>
                </>
            ) : (
                <p className="text-gray-500">No recipe generated yet. Try again!</p>
            )}
          </div>

          <div className="flex justify-end pt-4">
            <Button onClick={() => setShowRecipeDialog(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}