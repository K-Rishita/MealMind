import { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { ChefHat } from 'lucide-react';

import { toast } from 'sonner';
import { supabase } from '../lib/supabase';

type LoginProps = {
  onBackToLanding: () => void;   // Callback to navigate back to the landing page
  onSwitchToSignUp: () => void;  // Callback to switch the view to the Sign Up form
};

export function Login({ onBackToLanding, onSwitchToSignUp }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  /**
   * Signs in with Supabase. On success the auth listener in App navigates to Home.
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) toast.error(error.message);
  };

  return (
    // Centered container with background gradient for the whole screen
    <div className="min-h-screen bg-gradient-to-b from-orange-50 to-white flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        
        {/* Header/Branding Area */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center space-x-2 mb-4">
            <ChefHat className="size-10 text-orange-600" />
            <span className="text-gray-900 text-2xl">MealMind</span>
          </div>
          <h1 className="text-gray-900 mb-2">Welcome back</h1>
          <p className="text-gray-600">Your kitchen missed you</p>
        </div>

        {/* Login Card */}
        <Card>
          <CardHeader>
            <CardTitle>Log in to your account</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
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
                  className="mt-2"
                />
              </div>
              {/* Submit Button: Disabled while 'loading' */}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Logging in..." : "Log In"}
              </Button>
            </form>

            {/* Navigation Links (Sign Up and Back to Home) */}
            <div className="mt-6 text-center space-y-2">
              <p className="text-gray-600 text-sm">
                Don't have an account?{' '}
                <button
                  onClick={onSwitchToSignUp}
                  className="text-orange-600 hover:underline"
                >
                  Sign up
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