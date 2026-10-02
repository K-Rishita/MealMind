import { useState, useEffect } from 'react';
import { db, auth } from './firebase';
import { parseCookTimeMinutes } from './lib/time';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { collection, query, where, getDocs, QuerySnapshot, updateDoc, doc, getDoc, setDoc } from 'firebase/firestore';

import { LandingPage } from './components/LandingPage';
import { Login } from './components/Login';
import { SignUp } from './components/SignUp';
import { ProfileSettings, UserProfile } from './components/ProfileSettings';
import { Home } from './components/Home';
import { RecipeDiscovery } from './components/RecipeDiscovery';
import { SmartPantry } from './components/SmartPantry';
import { RecipeGenerator } from './components/RecipeGenerator';
import { Switch } from './components/ui/switch';
import { Label } from './components/ui/label';
import { Button } from './components/ui/button';
import { ChefHat, User as UserIcon, LogOut } from 'lucide-react';

export type PantryItem = {
  id: string;
  name: string;
  quantity: string;
};

export type ShoppingListItem = {
  id: string;
  name: string;
  quantity: string;
};

export type Recipe = {
  id: string;
  name: string;
  cost: 'low' | 'medium' | 'high';
  time: number;
  skillLevel: 'beginner' | 'intermediate' | 'advanced';
  ingredients: string[];
  instructions: string;
};

export type MealPlan = {
  id: string;
  day: string;
  recipe: Recipe;
};

export type RecipeDocument = { // Type for the raw document data in Firestore 'Recipes' collection
  name: string;
  costOfIngredients: 'Low' | 'Medium' | 'High';
  skillLevel: 'Beginner' | 'Intermediate' | 'Advanced';
};

/**
 * Queries the Firestore database 'Recipes' collection based on user-selected filters
 * and returns a list of matching recipe names.
 */
export async function fetchRecipesByFilters(filters: { costOfIngredients: string; timeTakenToCook: string; skillLevel: string; }): Promise<string[]> {
  const { costOfIngredients, skillLevel } = filters;
  const recipesCollection = collection(db, 'Recipes');
  const recipeNames: string[] = [];
  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  // 1. Construct the Base Query
  let q = query(recipesCollection);

  // 2. Add Filters Conditionally (Firestore requires exact matches)
  if (costOfIngredients !== 'all') {
    q = query(q, where('costOfIngredients', '==', capitalize(costOfIngredients)));
  }

  if (skillLevel !== 'all') {
    q = query(q, where('skillLevel', '==', capitalize(skillLevel)));
  }

  // 3. Execute Query and Process Results
  try {
    const querySnapshot: QuerySnapshot<RecipeDocument> = await getDocs(q) as QuerySnapshot<RecipeDocument>;

    querySnapshot.forEach((doc) => {
      recipeNames.push(doc.data().name);
    });

    return recipeNames;
  } catch (error) {
    console.error("Error executing Firebase query:", error);
    return [];
  }
}

export default function App() {
  // UI and Navigation State
  const [currentPage, setCurrentPage] = useState<'landing' | 'login' | 'signup' | 'profile' | 'home' | 'discovery' | 'pantry' | 'generator'>('landing');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isStructuredMode, setIsStructuredMode] = useState(false);
  
  // User & Auth State
  const [user, setUser] = useState<User | null>(null); // Firebase User object
  const [authLoading, setAuthLoading] = useState(true); // Flag to prevent UI render before auth check
  const [userProfile, setUserProfile] = useState<UserProfile>({});

  // Application Data State
  const [pantryItems, setPantryItems] = useState<PantryItem[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [mealPlan] = useState<MealPlan[]>([]); // Current implementation only uses this in the Home component
  const [shoppingListItems, setShoppingListItems] = useState<ShoppingListItem[]>([]);

  // ---------------------------------------------------------
  // 1. AUTH LISTENER (Manages user session)
  // ---------------------------------------------------------
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false); // Auth check complete

      if (currentUser) {
        setIsAuthenticated(true);
        // Automatically redirect to home if a user is found, unless on a login/signup page
        if (currentPage === 'landing' || currentPage === 'login' || currentPage === 'signup') {
            setCurrentPage('home');
        }
      } else {
        setIsAuthenticated(false);
        setPantryItems([]);
        setShoppingListItems([]);
        setCurrentPage('landing');
      }
    });

    return () => unsubscribe(); // Cleanup listener on unmount
  }, []); // Run once on component mount

  // ---------------------------------------------------------
  // 2. DATA FETCHING (Runs after auth check completes and user state is set)
  // ---------------------------------------------------------
  useEffect(() => {
    const fetchData = async () => {
      try {
        // A. Fetch & Clean Recipes (Static application data)
        const recipeSnapshot = await getDocs(collection(db, "Recipes"));
        const recipesList = recipeSnapshot.docs.map(doc => {
          const data = doc.data();
          
          // Data cleaning logic for inconsistent DB fields
          let cleanIngredients: string[] = [];
          if (Array.isArray(data.ingredients)) {
            cleanIngredients = data.ingredients.map((ing: any) => {
              if (typeof ing === 'string') return ing; 
              const parts = [ing.quantity, ing.unit, ing.name].filter(Boolean);
              return parts.join(' '); 
            });
          }

          let cleanInstructions = "No instructions provided.";
          if (data.instructions) {
            cleanInstructions = data.instructions;
          } else if (Array.isArray(data.steps)) {
            cleanInstructions = data.steps.join(' ');
          }

          // Smart Defaults for missing metadata
          const derivedTime = Number(data.time) || parseCookTimeMinutes(data.timeTakenToCook ?? '') || 0;
          const costs = ['low', 'medium', 'high'];
          const derivedCost = (data.cost || data.costOfIngredients || costs[Math.floor(Math.random() * costs.length)]).toLowerCase();

          return {
            id: doc.id,
            name: data.recipeName || data.name || "Untitled Recipe",
            cost: derivedCost as 'low' | 'medium' | 'high',
            time: derivedTime,
            skillLevel: (data.skillLevel || "beginner").toLowerCase() as 'beginner' | 'intermediate' | 'advanced',
            ingredients: cleanIngredients,
            instructions: cleanInstructions
          };
        }) as Recipe[];
        setRecipes(recipesList);

        // B. Fetch User-Specific Data (Pantry and Shopping List)
        if (user) {
            const userDocRef = doc(db, "users", user.uid);
            const userDocSnap = await getDoc(userDocRef);

            if (userDocSnap.exists()) {
                const userData = userDocSnap.data();
                setPantryItems(userData.pantryItems || []);
                setShoppingListItems(userData.shoppingListItems || [])
                // NOTE: UserProfile data could also be loaded here
            } else {
                setPantryItems([]);
                setShoppingListItems([])
            }
        }

      } catch (error) {
        console.error("Error fetching data:", error);
      }
    };

    if (user && !authLoading) { // Only fetch user data if authenticated and not loading
        fetchData();
    }
  }, [user, authLoading]); // Reruns when user changes or auth state stabilizes


  // ---------------------------------------------------------
  // 3. HANDLERS FOR DATA MUTATION (CRUD)
  // ---------------------------------------------------------
  
  /**
   * Adds an item to the shopping list and saves to Firestore.
   */
  const addShoppingListItem = async (item: Omit<ShoppingListItem, 'id'>) => {
    if (!user) return;
    try {
      const newItem = { ...item, id: Date.now().toString() };
      const updatedList = [...shoppingListItems, newItem];
      const userDocRef = doc(db, "users", user.uid);

      await updateDoc(userDocRef, { shoppingListItems: updatedList });

      setShoppingListItems(updatedList);
    } catch (error) {
      console.error("Error adding shopping item:", error);
      // Fallback for document creation if it didn't exist
      try {
        const userDocRef = doc(db, "users", user!.uid);
        await setDoc(userDocRef, { shoppingListItems: [...shoppingListItems, { ...item, id: Date.now().toString() }] }, { merge: true });
      } catch (e) {
        alert("Failed to save item. Please try again.");
      }
    }
  };

  /**
   * Adds an item to the pantry and saves to Firestore.
   */
  const addPantryItem = async (item: Omit<PantryItem, 'id'>) => {
    if (!user) return;

    try {
      const newItem = { ...item, id: Date.now().toString() };
      const updatedList = [...pantryItems, newItem];
      const userDocRef = doc(db, "users", user.uid);
      
      await updateDoc(userDocRef, { pantryItems: updatedList });

      setPantryItems(updatedList);
    } catch (error) {
      console.error("Error adding pantry item:", error);
      // Fallback for document creation if it didn't exist
      try {
          const userDocRef = doc(db, "users", user!.uid);
          await setDoc(userDocRef, { pantryItems: [...pantryItems, { ...item, id: Date.now().toString() }] }, { merge: true });
      } catch (e) {
          alert("Failed to save item. Please try again.");
      }
    }
  };

  /**
   * Simulates cooking a recipe by deducting the required quantity of matching ingredients from the pantry.
   */
  const handleMakeRecipe = async (recipe: Recipe) => {
    if (!user) return;
    console.log("Cooking:", recipe.name);
    let deductionCount = 0;

    // Map over current pantry items to create the new state
    const updatedPantry = pantryItems.map((pantryItem) => {
      // Simple string matching to find if the pantry item is an ingredient
      const matchedIngredientString = recipe.ingredients.find(ingStr => 
        ingStr.toLowerCase().includes(pantryItem.name.toLowerCase())
      );

      if (matchedIngredientString) {
        // Attempt to extract numerical quantities from both strings
        const recipeQtyMatch = matchedIngredientString.match(/(\d+(\.\d+)?)/);
        const pantryQtyMatch = pantryItem.quantity.match(/(\d+(\.\d+)?)/);

        if (recipeQtyMatch && pantryQtyMatch) {
          const recipeQty = parseFloat(recipeQtyMatch[0]);
          const pantryQty = parseFloat(pantryQtyMatch[0]);

          let newQty = pantryQty - recipeQty;
          if (newQty < 0) newQty = 0;

          // Replace the old number in the quantity string with the new number
          const newQuantityString = pantryItem.quantity.replace(pantryQtyMatch[0], newQty.toString());
          
          if (newQuantityString !== pantryItem.quantity) {
             deductionCount++;
          }
          
          return { ...pantryItem, quantity: newQuantityString };
        }
      }
      return pantryItem;
    });

    if (deductionCount > 0) {
        try {
            const userDocRef = doc(db, "users", user.uid);
            await updateDoc(userDocRef, {
                pantryItems: updatedPantry
            });
            setPantryItems(updatedPantry);
            alert(`Success! Cooked ${recipe.name}. Updated quantities for ${deductionCount} ingredients.`);
        } catch (e) {
            console.error("Failed to update pantry DB:", e);
            alert("Error updating database.");
        }
    } else {
        alert(`Cooked ${recipe.name}! (No matching pantry items found to deduct).`);
    }
  };


  // ---------------------------------------------------------
  // 4. AUTH & NAVIGATION HANDLERS
  // ---------------------------------------------------------
  const handleSaveProfile = (profile: UserProfile) => { setUserProfile(profile); setCurrentPage('home'); };
  
  // Set auth state and redirect to home on successful login/signup
  const handleLogin = () => { setIsAuthenticated(true); setCurrentPage('home'); };
  const handleSignUp = () => { setIsAuthenticated(true); setCurrentPage('home'); };
  
  // Clear auth state and redirect to landing page on sign out
  const handleSignOut = async () => {
    try {
        await signOut(auth);
        setIsAuthenticated(false);
        setUser(null);
        setCurrentPage('landing');
        setPantryItems([]);
        setShoppingListItems([]);
    } catch (error) {
        console.error("Error signing out:", error);
    }
  };

  // ---------------------------------------------------------
  // 5. RENDERING LOGIC
  // ---------------------------------------------------------

  // Show loading screen until Firebase auth check is complete
  if (authLoading) {
      return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  // Render authentication screens if not authenticated
  if (!isAuthenticated) {
    if (currentPage === 'landing') return <LandingPage onGetStarted={() => setCurrentPage('signup')} onLogin={() => setCurrentPage('login')} />;
    if (currentPage === 'login') return <Login onLogin={handleLogin} onBackToLanding={() => setCurrentPage('landing')} onSwitchToSignUp={() => setCurrentPage('signup')} />;
    if (currentPage === 'signup') return <SignUp onSignUp={handleSignUp} onBackToLanding={() => setCurrentPage('landing')} onSwitchToLogin={() => setCurrentPage('login')} />;
  }

  // Render authenticated application
  return (
    <div className="min-h-screen bg-gray-50">
      
      {/* Navigation Bar */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-8">
              {/* Branding/Logo */}
              <div className="flex items-center space-x-2 mr-4">
                <ChefHat className="size-6 text-orange-600" />
                <span className="text-gray-900">MealMind</span>
              </div>
              {/* Main Navigation Links */}
              <button onClick={() => setCurrentPage('home')} className={`nav-link ${currentPage === 'home' ? 'border-orange-500 text-gray-900' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}`}>Home</button>
              <button onClick={() => setCurrentPage('discovery')} className={`nav-link ${currentPage === 'discovery' ? 'border-orange-500 text-gray-900' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}`}>Recipe Discovery</button>
              <button onClick={() => setCurrentPage('pantry')} className={`nav-link ${currentPage === 'pantry' ? 'border-orange-500 text-gray-900' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}`}>Smart Pantry</button>
              <button onClick={() => setCurrentPage('generator')} className={`nav-link ${currentPage === 'generator' ? 'border-orange-500 text-gray-900' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}`}>Recipe Generator</button>
            </div>
            
            <div className="flex items-center space-x-4">
              {/* Structured/Flexible Mode Toggle */}
              {currentPage === 'home' && (
                <div className="flex items-center space-x-3">
                  <Label htmlFor="mode-toggle" className="text-sm text-gray-700">{isStructuredMode ? 'Structured' : 'Flexible'}</Label>
                  <Switch id="mode-toggle" checked={isStructuredMode} onCheckedChange={setIsStructuredMode} />
                </div>
              )}

              {/* Profile and Logout Buttons */}
              <Button variant="ghost" size="sm" onClick={() => setCurrentPage('profile')} title="Profile Settings"><UserIcon className="size-4" /></Button>
              <Button variant="ghost" size="sm" onClick={handleSignOut} title="Sign Out"><LogOut className="size-4" /></Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content Area: Conditional rendering based on currentPage state */}
      <main>
        {currentPage === 'profile' && <ProfileSettings profile={userProfile} onSave={handleSaveProfile} onBack={() => setCurrentPage('home')} />}
        
        {currentPage === 'home' && <Home pantryItems={pantryItems} isStructuredMode={isStructuredMode} mealPlan={mealPlan} onNavigateToPantry={() => setCurrentPage('pantry')} fetchRecipesByFilters={fetchRecipesByFilters}/>}
        
        {/* Pass all recipes and the cook handler */}
        {currentPage === 'discovery' && <RecipeDiscovery recipes={recipes} onMakeRecipe={handleMakeRecipe} />}
        
        {/* Pass pantry/shopping lists and their respective add handlers */}
        {currentPage === 'pantry' && < SmartPantry pantryItems={pantryItems} onAddItem={addPantryItem} shoppingListItems={shoppingListItems} onAddShoppingItem={addShoppingListItem}/>}
        
        {/* Pass only pantry items for the AI to use */}
        {currentPage === 'generator' && <RecipeGenerator pantryItems={pantryItems} />}
      </main>
    </div>
  );
}