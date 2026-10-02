import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { toast } from 'sonner';
import { ChefHat, User as UserIcon, LogOut } from 'lucide-react';

import { supabase } from './lib/supabase';
import * as data from './lib/data';
import { planCook } from './lib/cook';
import type { MealPlan, NewItem, PantryItem, Recipe, ShoppingListItem, UserProfile } from './lib/types';

import { LandingPage } from './components/LandingPage';
import { Login } from './components/Login';
import { SignUp } from './components/SignUp';
import { ProfileSettings } from './components/ProfileSettings';
import { Home } from './components/Home';
import { RecipeDiscovery } from './components/RecipeDiscovery';
import { SmartPantry } from './components/SmartPantry';
import { RecipeGenerator } from './components/RecipeGenerator';
import { Switch } from './components/ui/switch';
import { Label } from './components/ui/label';
import { Button } from './components/ui/button';
import { Toaster } from './components/ui/sonner';

type Page = 'landing' | 'login' | 'signup' | 'profile' | 'home' | 'discovery' | 'pantry' | 'generator';

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>('landing');
  const [isStructuredMode, setIsStructuredMode] = useState(false);

  // Auth
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const user = session?.user ?? null;

  // App data
  const [userProfile, setUserProfile] = useState<UserProfile>({});
  const [pantryItems, setPantryItems] = useState<PantryItem[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [mealPlan] = useState<MealPlan[]>([]);
  const [shoppingListItems, setShoppingListItems] = useState<ShoppingListItem[]>([]);

  // ---------------------------------------------------------
  // 1. AUTH LISTENER
  // ---------------------------------------------------------
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthLoading(false);
      if (session) setCurrentPage('home');
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      if (event === 'SIGNED_IN') setCurrentPage((p) => (p === 'landing' || p === 'login' || p === 'signup' ? 'home' : p));
      if (event === 'SIGNED_OUT') {
        setPantryItems([]);
        setShoppingListItems([]);
        setUserProfile({});
        setCurrentPage('landing');
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // ---------------------------------------------------------
  // 2. DATA FETCHING (whenever the signed-in user changes)
  // ---------------------------------------------------------
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    Promise.all([data.fetchRecipes(), data.listPantry(), data.listShoppingList(), data.getProfile()])
      .then(([recipes, pantry, shopping, profile]) => {
        if (cancelled) return;
        setRecipes(recipes);
        setPantryItems(pantry);
        setShoppingListItems(shopping);
        setUserProfile(profile);
      })
      .catch((e) => toast.error(`Couldn't load your data: ${errorMessage(e)}`));
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // ---------------------------------------------------------
  // 3. DATA MUTATIONS
  // ---------------------------------------------------------
  const addPantryItem = async (item: NewItem) => {
    try {
      const saved = await data.addPantryItem(item);
      setPantryItems((items) => [...items, saved]);
      toast.success(`Added ${saved.name} to your pantry`);
    } catch (e) {
      toast.error(`Couldn't add item: ${errorMessage(e)}`);
    }
  };

  const deletePantryItem = async (item: PantryItem) => {
    try {
      await data.deletePantryItem(item.id);
      setPantryItems((items) => items.filter((i) => i.id !== item.id));
    } catch (e) {
      toast.error(`Couldn't remove item: ${errorMessage(e)}`);
    }
  };

  const addShoppingListItem = async (item: NewItem) => {
    try {
      const saved = await data.addShoppingItem(item);
      setShoppingListItems((items) => [...items, saved]);
      toast.success(`Added ${saved.name} to your shopping list`);
    } catch (e) {
      toast.error(`Couldn't add item: ${errorMessage(e)}`);
    }
  };

  const deleteShoppingListItem = async (item: ShoppingListItem) => {
    try {
      await data.deleteShoppingItem(item.id);
      setShoppingListItems((items) => items.filter((i) => i.id !== item.id));
    } catch (e) {
      toast.error(`Couldn't remove item: ${errorMessage(e)}`);
    }
  };

  /** Bought it: move a shopping list item into the pantry. */
  const moveShoppingItemToPantry = async (item: ShoppingListItem) => {
    try {
      const saved = await data.addPantryItem({ name: item.name, quantity: item.quantity, unit: item.unit });
      await data.deleteShoppingItem(item.id);
      setPantryItems((items) => [...items, saved]);
      setShoppingListItems((items) => items.filter((i) => i.id !== item.id));
      toast.success(`Moved ${item.name} to your pantry`);
    } catch (e) {
      toast.error(`Couldn't move item: ${errorMessage(e)}`);
    }
  };

  /** Deducts the recipe's ingredients from the pantry, with an undo. */
  const handleMakeRecipe = async (recipe: Recipe) => {
    const { updates, skipped } = planCook(recipe.ingredientItems, pantryItems);
    if (updates.length === 0) {
      toast(`Enjoy your ${recipe.name}!`, {
        description: skipped.length
          ? `Couldn't update ${skipped.map((s) => s.item.name).join(', ')}: the units don't match the recipe.`
          : 'None of your pantry items are used in this recipe.',
      });
      return;
    }

    const apply = async (changes: { id: string; quantity: number | null }[]) => {
      await Promise.all(changes.map((c) => data.updatePantryQuantity(c.id, c.quantity)));
      const byId = new Map(changes.map((c) => [c.id, c.quantity]));
      setPantryItems((items) => items.map((i) => (byId.has(i.id) ? { ...i, quantity: byId.get(i.id)! } : i)));
    };

    try {
      await apply(updates.map((u) => ({ id: u.item.id, quantity: u.newQuantity })));
      toast.success(`Cooked ${recipe.name}`, {
        description:
          `Updated ${updates.map((u) => u.item.name).join(', ')}.` +
          (skipped.length ? ` Skipped ${skipped.map((s) => s.item.name).join(', ')} (units don't match).` : ''),
        duration: 10000, // long enough to notice and press Undo
        action: {
          label: 'Undo',
          onClick: () =>
            apply(updates.map((u) => ({ id: u.item.id, quantity: u.item.quantity }))).catch((e) =>
              toast.error(`Couldn't undo: ${errorMessage(e)}`),
            ),
        },
      });
    } catch (e) {
      toast.error(`Couldn't update your pantry: ${errorMessage(e)}`);
    }
  };

  const handleSaveProfile = async (profile: UserProfile) => {
    if (!user) return;
    try {
      await data.updateProfile(user.id, profile);
      setUserProfile((p) => ({ ...p, ...profile }));
      toast.success('Profile saved');
      setCurrentPage('home');
    } catch (e) {
      toast.error(`Couldn't save profile: ${errorMessage(e)}`);
    }
  };

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) toast.error(`Couldn't sign out: ${error.message}`);
  };

  // ---------------------------------------------------------
  // 4. RENDERING
  // ---------------------------------------------------------
  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (!user) {
    return (
      <>
        <Toaster richColors />
        {currentPage === 'login' ? (
          <Login onBackToLanding={() => setCurrentPage('landing')} onSwitchToSignUp={() => setCurrentPage('signup')} />
        ) : currentPage === 'signup' ? (
          <SignUp onBackToLanding={() => setCurrentPage('landing')} onSwitchToLogin={() => setCurrentPage('login')} />
        ) : (
          <LandingPage onGetStarted={() => setCurrentPage('signup')} onLogin={() => setCurrentPage('login')} />
        )}
      </>
    );
  }

  const navLink = (page: Page, label: string) => (
    <button
      onClick={() => setCurrentPage(page)}
      className={`h-16 border-b-2 px-1 text-sm font-medium transition-colors ${
        currentPage === page ? 'border-orange-500 text-gray-900' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <Toaster richColors />

      <nav className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-8">
              <div className="flex items-center space-x-2 mr-4">
                <ChefHat className="size-6 text-orange-600" />
                <span className="text-gray-900">MealMind</span>
              </div>
              {navLink('home', 'Home')}
              {navLink('discovery', 'Recipe Discovery')}
              {navLink('pantry', 'Smart Pantry')}
              {navLink('generator', 'Recipe Generator')}
            </div>

            <div className="flex items-center space-x-4">
              {currentPage === 'home' && (
                <div className="flex items-center space-x-3">
                  <Label htmlFor="mode-toggle" className="text-sm text-gray-700">{isStructuredMode ? 'Structured' : 'Flexible'}</Label>
                  <Switch id="mode-toggle" checked={isStructuredMode} onCheckedChange={setIsStructuredMode} />
                </div>
              )}
              <Button variant="ghost" size="sm" onClick={() => setCurrentPage('profile')} title="Profile Settings"><UserIcon className="size-4" /></Button>
              <Button variant="ghost" size="sm" onClick={handleSignOut} title="Sign Out"><LogOut className="size-4" /></Button>
            </div>
          </div>
        </div>
      </nav>

      <main>
        {currentPage === 'profile' && (
          <ProfileSettings key={JSON.stringify(userProfile)} profile={userProfile} onSave={handleSaveProfile} onBack={() => setCurrentPage('home')} />
        )}
        {currentPage === 'home' && (
          <Home
            pantryItems={pantryItems}
            isStructuredMode={isStructuredMode}
            mealPlan={mealPlan}
            onNavigateToPantry={() => setCurrentPage('pantry')}
            onWhatCanIMake={() => setCurrentPage('generator')}
            fetchRecipeNames={data.fetchRecipeNames}
          />
        )}
        {currentPage === 'discovery' && <RecipeDiscovery recipes={recipes} onMakeRecipe={handleMakeRecipe} />}
        {currentPage === 'pantry' && (
          <SmartPantry
            pantryItems={pantryItems}
            onAddItem={addPantryItem}
            onDeleteItem={deletePantryItem}
            shoppingListItems={shoppingListItems}
            onAddShoppingItem={addShoppingListItem}
            onDeleteShoppingItem={deleteShoppingListItem}
            onMoveToPantry={moveShoppingItemToPantry}
          />
        )}
        {currentPage === 'generator' && <RecipeGenerator pantryItems={pantryItems} />}
      </main>
    </div>
  );
}
