import { useState } from 'react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Label } from './ui/label';
import { Card, CardContent } from './ui/card';
import { describeItem, formatQuantity, type MealPlan, type PantryItem } from '../lib/types';

// Define the expected structured response for a single day in the AI-generated plan
type RawMealPlanDay = {
  day: string;
  breakfast: string;
  lunch: string;
  dinner: string;
  snack: string;
};

// Define the full plan structure expected from the AI
type RawMealPlanResponse = {
  plan: RawMealPlanDay[];
};

type HomeProps = {
  pantryItems: PantryItem[];
  isStructuredMode: boolean; // Controls whether to show single recipe finder or meal plan interface
  mealPlan: MealPlan[]; // Default/Existing meal plan structure
  onNavigateToPantry: () => void;
  onWhatCanIMake: () => void; // Opens the Recipe Generator
  // Fetches names of recipes matching the meal-plan filters
  fetchRecipeNames: (filters: { cost: string; time: string; skill: string }) => Promise<string[]>;
};

export function Home({ pantryItems, isStructuredMode, mealPlan, onNavigateToPantry, onWhatCanIMake, fetchRecipeNames }: HomeProps) {
  const [showRecipeDialog, setShowRecipeDialog] = useState(false);
  const [selectedMeal, setSelectedMeal] = useState<MealPlan | null>(null);

  // State for meal plan generation filters
  const [showMealPlanDialog, setShowMealPlanDialog] = useState(false);
  const [mealPlanBudget, setMealPlanBudget] = useState<string>('all');
  const [mealPlanTime, setMealPlanTime] = useState<string>('all');
  const [mealPlanSkill, setMealPlanSkill] = useState<string>('all');

  // State for AI Generation
  const [isGeneratingMealPlan, setIsGeneratingMealPlan] = useState(false);
  const [rawMealPlanResponse, setRawMealPlanResponse] = useState<string | null>(null); // For debugging failed parsing
  const [generatedMealPlan, setGeneratedMealPlan] = useState<RawMealPlanDay[] | null>(null); // The final, structured plan

  const handleShowRecipe = (meal: MealPlan) => {
    setSelectedMeal(meal);
    setShowRecipeDialog(true);
  };

  /**
   * Step 1 of meal plan generation: Fetch relevant recipe names from Firebase/Database
   * based on the budget, time, and skill filters selected in the dialog.
   */
  const handleFilterAndGenerateMealPlan = async () => {
    setIsGeneratingMealPlan(true);
    setGeneratedMealPlan(null);
    setRawMealPlanResponse(null);
    setShowMealPlanDialog(false);

    const filters = { cost: mealPlanBudget, time: mealPlanTime, skill: mealPlanSkill };

    let availableRecipeNames: string[] = [];
    try {
      availableRecipeNames = await fetchRecipeNames(filters);
    } catch (error) {
      console.error("Error retrieving recipes from Firebase:", error);
      alert("Error fetching recipes. Generating plan without recipe constraints.");
      availableRecipeNames = []; // Ensure it's an array for the next step
    }

    // Proceed to Step 2: Generate the plan using the retrieved recipe names
    await handleGenerateMealPlan(availableRecipeNames);
  };

  /**
   * Step 2 of meal plan generation: Construct the prompt and call the AI backend.
   * @param availableRecipeNames - Names fetched from the database in Step 1.
   */
  const handleGenerateMealPlan = async (availableRecipeNames: string[]) => {
    setIsGeneratingMealPlan(true);
    setGeneratedMealPlan(null);
    setRawMealPlanResponse(null);

    // 1. Collect Ingredients for context
    const ingredientsList = pantryItems.map(describeItem).join(', ');

    // 2. Construct the Dynamic Prompt, including the filtered recipe names
    const recipeNamesList = availableRecipeNames.join(', ');

    const prompt = `
      You are an expert chef and meal planner. Generate a 5-day meal plan (Monday to Friday) based on the following:

      Available Ingredients (for reference): ${ingredientsList || 'None listed.'}
      Available Recipes in Database: [${recipeNamesList}]
      
      Instructions:
      1. For the meal plan, you **MUST ONLY** use recipe names found in the [${recipeNamesList}] list.
      2. If a recipe from the list is not suitable for a specific meal (e.g., a "Dinner" recipe for "Breakfast"), suggest a generic snack or simple item like "Toast and Jam" or "Quick Salad" if no appropriate recipe name is available for that slot.
      
      Budget Preference: ${mealPlanBudget}
      Time Preference: ${mealPlanTime}
      Skill Level: ${mealPlanSkill}
      
      The output MUST be a JSON object with the following structure:
            {
              "plan": [
                { "day": "Monday", "breakfast": "Recipe Name for Breakfast", "lunch": "Recipe Name for Lunch", "dinner": "Recipe Name for Dinner", "snack": "Snack Idea" },
                // ... Tuesday to Friday ...
              ]
            }
            Do not include any introductory or concluding text outside of the JSON block.
        `;

    try {
      const backendUrl = 'http://localhost:5000/api/generate-recipe';

      const response = await fetch(backendUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt: prompt }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const rawTextResponse = data.recipe;

      // 3. PARSE AND STRUCTURE THE JSON RESPONSE
      try {
        // Use regex to robustly find and isolate the JSON block, ignoring surrounding text
        const jsonMatch = rawTextResponse.match(/\{[\s\S]*\}/);

        if (!jsonMatch || jsonMatch.length === 0) {
          throw new Error("Could not find a valid JSON object within the AI's response.");
        }

        const jsonString = jsonMatch[0];
        const parsedData: RawMealPlanResponse = JSON.parse(jsonString);

        if (parsedData.plan && Array.isArray(parsedData.plan)) {
          setGeneratedMealPlan(parsedData.plan); // Success: Set the structured plan
        } else {
          throw new Error("Invalid 'plan' array structure returned by the AI.");
        }
      } catch (jsonError) {
        // Failure: Display the raw response for debugging the JSON format
        console.error("Failed to parse AI response as JSON:", rawTextResponse, jsonError);
        setRawMealPlanResponse(`AI output was received but failed to parse as JSON. Raw output starts: ${rawTextResponse.substring(0, 300)}...`);
      }

    } catch (error) {
      console.error('Error fetching meal plan from backend:', error);
      setRawMealPlanResponse(`Failed to fetch meal plan. Error: ${error instanceof Error ? error.message : String(error)}`);
      setGeneratedMealPlan(null);
    }

    setIsGeneratingMealPlan(false);

    // Reset filters
    setMealPlanBudget('all');
    setMealPlanTime('all');
    setMealPlanSkill('all');
  };

  // Function to render the new, detailed AI-generated meal plan structure
  const renderNewMealCard = (meal: RawMealPlanDay) => (
      <Card key={meal.day}>
        <CardContent className="flex flex-col p-4 space-y-2">
          <span className="text-gray-900 font-bold border-b pb-1 mb-2">{meal.day}</span>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <p><span className="font-semibold text-orange-600">Breakfast:</span> {meal.breakfast}</p>
            <p><span className="font-semibold text-orange-600">Lunch:</span> {meal.lunch}</p>
            <p><span className="font-semibold text-orange-600">Dinner:</span> {meal.dinner}</p>
            <p><span className="font-semibold text-orange-600">Snack:</span> {meal.snack}</p>
          </div>
        </CardContent>
      </Card>
  );

  // Function to render the existing meal plan structure (before AI generation)
  const renderOldMealCard = (meal: MealPlan) => (
      <Card key={meal.id}>
        <CardContent className="flex justify-between items-center p-4">
          <div className="flex items-center space-x-4">
            <span className="text-gray-900 min-w-[100px] font-medium">{meal.day}</span>
            <span className="text-gray-700">{meal.recipe.name}</span>
          </div>
          <Button
              variant="outline"
              size="sm"
              onClick={() => handleShowRecipe(meal)}
          >
            Show Recipe
          </Button>
        </CardContent>
      </Card>
  );

  return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Hero Section: Conditional Rendering based on isStructuredMode */}
        <div className="text-center mb-12">
          <h1 className="text-gray-900 mb-6 text-3xl font-bold">Welcome to Your Recipe Assistant</h1>

          {!isStructuredMode ? (
              // Mode 1: Single Recipe Finder
              <Button
                  onClick={onWhatCanIMake}
                  size="lg"
                  className="px-8 py-6 text-lg bg-gray-900 hover:bg-gray-800 text-white"
              >
                What can I make now?
              </Button>
          ) : (
              // Mode 2: Meal Plan Viewer/Generator
              <div className="max-w-3xl mx-auto">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-gray-900 text-xl font-semibold">
                    {generatedMealPlan ? 'AI-Generated Meal Plan' : 'Your Default Meal Plan'}
                  </h2>
                  <Button onClick={() => setShowMealPlanDialog(true)} disabled={isGeneratingMealPlan}>
                    {isGeneratingMealPlan ? 'Generating...' : 'Generate New Meal Plan'}
                  </Button>
                </div>
                <div className="space-y-3">
                  {/* Display the generated plan if available, otherwise display the default plan */}
                  {generatedMealPlan ? (
                      generatedMealPlan.map(renderNewMealCard)
                  ) : (
                      mealPlan.map(renderOldMealCard)
                  )}
                </div>

                {/* DEBUG OUTPUT: Visible only if parsing failed, showing the raw AI response */}
                {rawMealPlanResponse && !generatedMealPlan && (
                    <div className="mt-8 p-4 bg-red-100 border border-red-300 rounded-md whitespace-pre-wrap text-xs text-red-700">
                      <h3 className="font-semibold mb-2">Error: Failed to Parse Structured Plan</h3>
                      <p>{rawMealPlanResponse}</p>
                    </div>
                )}
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
          {pantryItems
            .slice(0, 8) // Show up to 8 items for a quick preview
            .map((item) => (
              <Card key={item.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <p className="text-gray-900 font-medium">{item.name}</p>
                  {formatQuantity(item) && <p className="text-gray-500 text-sm bg-gray-100 inline-block px-2 py-0.5 rounded mt-1">{formatQuantity(item)}</p>}
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

      {/* Recipe Detail Dialog: Shows full recipe for an item in the *old* meal plan */}
      <Dialog open={showRecipeDialog} onOpenChange={setShowRecipeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedMeal?.recipe.name}</DialogTitle>
            <DialogDescription>
              {selectedMeal?.day}'s meal
            </DialogDescription>
          </DialogHeader>
          {selectedMeal && (
            <div className="space-y-4 mt-4">
              <div>
                <h3 className="text-gray-900 mb-2 font-semibold">Ingredients</h3>
                <ul className="list-disc list-inside space-y-1">
                  {selectedMeal.recipe.ingredients.map((ingredient, index) => (
                    <li key={index} className="text-gray-700">{ingredient}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="text-gray-900 mb-2 font-semibold">Instructions</h3>
                <p className="text-gray-700 whitespace-pre-wrap">{selectedMeal.recipe.instructions}</p>
              </div>
              <div className="flex space-x-4 text-sm border-t pt-4">
                <span className="text-gray-600">Time: {selectedMeal.recipe.time} min</span>
                <span className="text-gray-600">Skill: {selectedMeal.recipe.skillLevel}</span>
                <span className="text-gray-600">Cost: {selectedMeal.recipe.cost}</span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

        {/* Generate Meal Plan Dialog: For setting filters for weekly plan generation */}
        <Dialog open={showMealPlanDialog} onOpenChange={setShowMealPlanDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Generate New Meal Plan</DialogTitle>
              <DialogDescription>
                Set your preferences for the weekly meal plan.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              {/* Budget Filter */}
              <div>
                <Label htmlFor="budget-filter">Budget</Label>
                <Select
                    value={mealPlanBudget}
                    onValueChange={setMealPlanBudget}
                >
                  <SelectTrigger id="budget-filter" className="mt-2">
                    <SelectValue placeholder="Any budget" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {/* Time to Cook Filter */}
              <div>
                <Label htmlFor="time-to-cook-filter">Time to Cook</Label>
                <Select
                    value={mealPlanTime}
                    onValueChange={setMealPlanTime}
                >
                  <SelectTrigger id="time-to-cook-filter" className="mt-2">
                    <SelectValue placeholder="Any time" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any</SelectItem>
                    <SelectItem value="quick">Quick (30 min or less)</SelectItem>
                    <SelectItem value="medium">Medium (30-60 min)</SelectItem>
                    <SelectItem value="long">Long (60+ min)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {/* Skill Level Filter */}
              <div>
                <Label htmlFor="skill-level-filter">Skill Level</Label>
                <Select
                    value={mealPlanSkill}
                    onValueChange={setMealPlanSkill}
                >
                  <SelectTrigger id="skill-level-filter" className="mt-2">
                    <SelectValue placeholder="Any level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any</SelectItem>
                    <SelectItem value="beginner">Beginner</SelectItem>
                    <SelectItem value="intermediate">Intermediate</SelectItem>
                    <SelectItem value="advanced">Advanced</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end space-x-2 pt-4">
                <Button variant="outline" onClick={() => setShowMealPlanDialog(false)} disabled={isGeneratingMealPlan}>
                  Cancel
                </Button>
                <Button
                    onClick={handleFilterAndGenerateMealPlan} // Triggers the two-step process
                    disabled={isGeneratingMealPlan}
                    className="bg-orange-600 hover:bg-orange-700 text-white"
                >
                  {isGeneratingMealPlan ? 'Filtering & Generating...' : 'Generate Plan'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
  );
}