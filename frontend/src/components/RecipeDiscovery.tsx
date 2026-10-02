import { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent } from './ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Label } from './ui/label';
import { Search, Utensils } from 'lucide-react';
import type { Recipe } from '../lib/types';

type RecipeDiscoveryProps = {
  recipes: Recipe[];                 // Array of all available recipes to display
  onMakeRecipe: (recipe: Recipe) => void; // Callback function fired when the user decides to 'cook' a recipe
};

export function RecipeDiscovery({ recipes = [], onMakeRecipe }: RecipeDiscoveryProps) {
  // State for search input and filter controls
  const [searchQuery, setSearchQuery] = useState('');
  const [costFilter, setCostFilter] = useState<string>('all');
  const [timeFilter, setTimeFilter] = useState<string>('all');
  const [skillFilter, setSkillFilter] = useState<string>('all');

  // State for displaying the detailed recipe dialog
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [showRecipeDialog, setShowRecipeDialog] = useState(false);

  /**
   * Sets the selected recipe and opens the detail dialog.
   * @param recipe The recipe object to display.
   */
  const handleShowMore = (recipe: Recipe) => {
    setSelectedRecipe(recipe);
    setShowRecipeDialog(true);
  };

  /**
   * Fires the external callback function to initiate the cooking process for the selected recipe.
   */
  const handleCookClick = () => {
    if (selectedRecipe) {
        onMakeRecipe(selectedRecipe);
        setShowRecipeDialog(false); 
    }
  };

  /**
   * Core filtering logic that applies search query and drop-down filters.
   */
  const filteredRecipes = recipes.filter((recipe) => {
    if (!recipe) return false;
    
    // 1. Search Filter (by name)
    const name = recipe.name || '';
    const matchesSearch = name.toLowerCase().includes(searchQuery.toLowerCase());
    
    // 2. Cost Filter
    const matchesCost = costFilter === 'all' || recipe.cost === costFilter;
    
    // 3. Time Filter (logic based on predefined time buckets)
    const time = recipe.time || 0;
    const matchesTime = timeFilter === 'all' || 
      (timeFilter === 'quick' && time <= 30) ||
      (timeFilter === 'medium' && time > 30 && time <= 60) ||
      (timeFilter === 'long' && time > 60);
      
    // 4. Skill Filter
    const matchesSkill = skillFilter === 'all' || recipe.skillLevel === skillFilter;
    
    return matchesSearch && matchesCost && matchesTime && matchesSkill;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-gray-900 text-3xl font-bold mb-8">Recipe Discovery</h1>

      {/* Search and Filters Container */}
      <div className="mb-8 space-y-4">
        {/* Search Input with Icon */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
          <Input
            placeholder="Search recipes (e.g., 'Chicken', 'Rice')..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Filter Dropdowns */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Cost Filter */}
          <div>
            <Label>Cost</Label>
            <Select value={costFilter} onValueChange={setCostFilter}>
              <SelectTrigger><SelectValue placeholder="All costs" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All costs</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {/* Time Filter */}
          <div>
            <Label>Time</Label>
            <Select value={timeFilter} onValueChange={setTimeFilter}>
              <SelectTrigger><SelectValue placeholder="All times" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All times</SelectItem>
                <SelectItem value="quick">Quick (&lt; 30 min)</SelectItem>
                <SelectItem value="medium">Medium (30-60 min)</SelectItem>
                <SelectItem value="long">Long (&gt; 60 min)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {/* Skill Filter */}
          <div>
            <Label>Skill Level</Label>
            <Select value={skillFilter} onValueChange={setSkillFilter}>
              <SelectTrigger><SelectValue placeholder="All levels" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All levels</SelectItem>
                <SelectItem value="beginner">Beginner</SelectItem>
                <SelectItem value="intermediate">Intermediate</SelectItem>
                <SelectItem value="advanced">Advanced</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Recipe List Display */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredRecipes.length > 0 ? (
          filteredRecipes.map((recipe) => (
            <Card key={recipe.id || Math.random()} className="hover:shadow-lg transition-shadow">
              <CardContent className="p-6 flex flex-col h-full">
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-gray-900 mb-2">{recipe.name || 'Untitled Recipe'}</h3>
                  
                  {/* Recipe Metadata Tags */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full capitalize">{recipe.cost || 'N/A'}</span>
                    <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">{recipe.time || 0} min</span>
                    <span className="px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded-full capitalize">{recipe.skillLevel || 'N/A'}</span>
                  </div>

                  {/* Ingredients Preview */}
                  <p className="text-gray-600 text-sm line-clamp-3">
                    <span className="font-semibold">Ingredients:</span> {(recipe.ingredients || []).join(', ')}
                  </p>
                </div>
                
                {/* Detail Button */}
                <Button 
                  className="w-full mt-4" 
                  variant="outline"
                  onClick={() => handleShowMore(recipe)}
                >
                  View Details & Cook
                </Button>
              </CardContent>
            </Card>
          ))
        ) : (
          // Empty state message
          <div className="col-span-full text-center py-12">
            <p className="text-gray-500">No recipes found matching your criteria.</p>
          </div>
        )}
      </div>

      {/* Recipe Detail Dialog */}
      <Dialog open={showRecipeDialog} onOpenChange={setShowRecipeDialog}>
        {/* Set max height and use flex column to manage scrollable content */}
        <DialogContent className="max-h-[90vh] flex flex-col p-0 overflow-hidden">
          
          <DialogHeader className="p-6 pb-2">
            <DialogTitle className="text-2xl">{selectedRecipe?.name || 'Recipe Details'}</DialogTitle>
            <DialogDescription>
               {selectedRecipe?.time} min • {selectedRecipe?.skillLevel} • {selectedRecipe?.cost} cost
            </DialogDescription>
          </DialogHeader>

          {/* Scrollable Content Area */}
          <div className="p-6 pt-2 overflow-y-auto flex-1">
            {selectedRecipe && (
              <div className="space-y-6">
                {/* Ingredients List */}
                <div>
                  <h3 className="font-bold text-gray-900 mb-2 text-lg">Ingredients</h3>
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {(selectedRecipe.ingredients || []).map((ingredient, index) => (
                      <li key={index} className="text-gray-700 flex items-center bg-gray-50 p-2 rounded">
                        <span className="w-2 h-2 bg-orange-400 rounded-full mr-2"></span>
                        {ingredient}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Instructions Text */}
                <div>
                  <h3 className="font-bold text-gray-900 mb-2 text-lg">Instructions</h3>
                  {selectedRecipe.steps.length > 0 ? (
                    <ol className="list-decimal list-outside space-y-2 pl-9 pr-4 py-4 bg-gray-50 rounded-lg text-gray-700 leading-relaxed">
                      {selectedRecipe.steps.map((step, index) => (
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

          {/* Sticky Footer with Cook Button */}
          <div className="p-6 border-t bg-gray-50">
            <Button 
              onClick={handleCookClick} 
              className="w-full bg-orange-600 hover:bg-orange-700 text-white text-lg h-12"
            >
              <Utensils className="mr-2 h-5 w-5" />
              Cook This Meal (Update Pantry)
            </Button>
          </div>

        </DialogContent>
      </Dialog>
    </div>
  );
}