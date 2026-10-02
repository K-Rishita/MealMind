import { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { ChefHat } from 'lucide-react';

import { toast } from 'sonner';
import { supabase } from '../lib/supabase';

type SignUpProps = {
  onBackToLanding: () => void;
  onSwitchToLogin: () => void;  
};

export function SignUp({ onBackToLanding, onSwitchToLogin }: SignUpProps) {
  // State for form inputs
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  /**
   * Creates the account with Supabase. The display name is stored as user
   * metadata, and a database trigger copies it into the user's profile row.
   * On success the auth listener in App navigates to Home.
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: name } },
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
    } else if (!data.session) {
      // Email confirmation is enabled on this project.
      toast.success('Check your email to confirm your account, then log in.');
      onSwitchToLogin();
    } else {
      toast.success('Account created! Welcome 🎉');
    }
  };

  return (
    // Centered container with background gradient
    <div className="min-h-screen bg-gradient-to-b from-orange-50 to-white flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        
        {/* Header/Branding Area */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center space-x-2 mb-4">
            <ChefHat className="size-10 text-orange-600" />
            <span className="text-gray-900 text-2xl">MealMind</span>
          </div>
          <h1 className="text-gray-900 mb-2">Start your journey</h1>
          <p className="text-gray-600">Better meals are just a sign-up away</p>
        </div>

        {/* Sign Up Card */}
        <Card>
          <CardHeader>
            <CardTitle>Create your account</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Name Input Field */}
              <div>
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  required
                  className="mt-2"
                />
              </div>
              {/* Email Input Field */}
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                  className="mt-2"
                />
              </div>
              {/* Password Input Field */}
              <div>
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  className="mt-2"
                />
              </div>
              {/* Submit Button: Disabled while 'loading' */}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Creating account..." : "Sign Up"}
              </Button>
            </form>

            {/* Navigation Links (Log In and Back to Home) */}
            <div className="mt-6 text-center space-y-2">
              <p className="text-gray-600 text-sm">
                Already have an account?{' '}
                <button
                  onClick={onSwitchToLogin}
                  className="text-orange-600 hover:underline"
                >
                  Log in
                </button>
              </p>
              <button
                onClick={onBackToLanding}
                className="text-gray-600 text-sm hover:underline"
              >
                Back to home
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}