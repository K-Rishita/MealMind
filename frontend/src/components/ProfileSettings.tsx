import { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { User } from 'lucide-react';
import type { UserProfile } from '../lib/types';


type ProfileSettingsProps = {
  profile: UserProfile;              // Current user profile data passed from the parent component
  onSave: (profile: UserProfile) => void; 
  onBack: () => void;                
};

export function ProfileSettings({ profile, onSave, onBack }: ProfileSettingsProps) {
  // Initialize local state for each profile field, defaulting to the current prop value or an empty string
  const [age, setAge] = useState(profile.age || '');
  const [gender, setGender] = useState(profile.gender || '');
  const [height, setHeight] = useState(profile.height || '');
  const [weight, setWeight] = useState(profile.weight || '');
  const [calorieGoal, setCalorieGoal] = useState(profile.calorieGoal || '');
  const [diet, setDiet] = useState(profile.diet || '');

  /**
   * Constructs the updated profile object and calls the onSave prop.
   * It ensures that empty strings are converted to `undefined` before saving,
   * keeping the data clean for optional fields.
   */
  const handleSave = () => {
    onSave({
      age: age || undefined,
      gender: gender || undefined,
      height: height || undefined,
      weight: weight || undefined,
      calorieGoal: calorieGoal || undefined,
      diet: diet || undefined,
    });
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Back button for easy navigation */}
      <div className="mb-8">
        <Button variant="ghost" onClick={onBack}>
          ← Back
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center space-x-3">
            {/* Icon for visual context */}
            <div className="inline-flex items-center justify-center size-12 bg-orange-100 rounded-full">
              <User className="size-6 text-orange-600" />
            </div>
            <CardTitle>Profile Settings</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-gray-600">
            All fields are optional. Add information to help us personalize your recipe recommendations.
          </p>

          {/* Grid layout for profile fields */}
          <div className="grid md:grid-cols-2 gap-6">
            {/* Age Input */}
            <div>
              <Label htmlFor="age">Age</Label>
              <Input
                id="age"
                type="number" // Restricts input to numeric values
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder="Enter your age"
                className="mt-2"
              />
            </div>

            {/* Gender Select */}
            <div>
              <Label htmlFor="gender">Gender</Label>
              <Select value={gender} onValueChange={setGender}>
                <SelectTrigger id="gender" className="mt-2">
                  <SelectValue placeholder="Select gender" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="non-binary">Non-binary</SelectItem>
                  <SelectItem value="prefer-not-to-say">Prefer not to say</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Height Input (allows flexible text input) */}
            <div>
              <Label htmlFor="height">Height</Label>
              <Input
                id="height"
                type="text"
                value={height}
                onChange={(e) => setHeight(e.target.value)}
                placeholder="e.g., 5'8&quot; or 173 cm"
                className="mt-2"
              />
            </div>

            {/* Weight Input (allows flexible text input) */}
            <div>
              <Label htmlFor="weight">Weight</Label>
              <Input
                id="weight"
                type="text"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder="e.g., 150 lbs or 68 kg"
                className="mt-2"
              />
            </div>

            {/* Calorie Goal Input */}
            <div>
              <Label htmlFor="calorie-goal">Daily Calorie Goal</Label>
              <Input
                id="calorie-goal"
                type="number" // Restricts input to numeric values
                value={calorieGoal}
                onChange={(e) => setCalorieGoal(e.target.value)}
                placeholder="e.g., 2000"
                className="mt-2"
              />
            </div>

            {/* Dietary Preference Select */}
            <div>
              <Label htmlFor="diet">Dietary Preference</Label>
              <Select value={diet} onValueChange={setDiet}>
                <SelectTrigger id="diet" className="mt-2">
                  <SelectValue placeholder="Select diet" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No restrictions</SelectItem>
                  <SelectItem value="vegetarian">Vegetarian</SelectItem>
                  <SelectItem value="vegan">Vegan</SelectItem>
                  <SelectItem value="pescatarian">Pescatarian</SelectItem>
                  <SelectItem value="keto">Keto</SelectItem>
                  <SelectItem value="paleo">Paleo</SelectItem>
                  <SelectItem value="gluten-free">Gluten-free</SelectItem>
                  <SelectItem value="dairy-free">Dairy-free</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex justify-end space-x-3 pt-6">
            <Button variant="outline" onClick={onBack}>
              Cancel
            </Button>
            <Button onClick={handleSave}>
              Save Changes
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}