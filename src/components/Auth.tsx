import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { toast } from 'sonner';

export function Auth() {
    const [loading, setLoading] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isSignUp, setIsSignUp] = useState(false);

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            if (isSignUp) {
                const { error } = await supabase.auth.signUp({
                    email,
                    password,
                });
                if (error) throw error;
                toast.success('Check your email for the confirmation link!');
            } else {
                const { error } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });
                if (error) throw error;
                toast.success('Logged in successfully!');
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Authentication error';
            toast.error(message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex items-center justify-center min-h-[80vh]">
            <Card className="w-full max-w-md border-border/30 shadow-xl overflow-hidden">
                <div className="bg-primary/5 p-8 flex justify-center border-b border-border/20">
                    <img
                        src="/icon-512.png"
                        alt="AcreLedger Logo"
                        className="w-24 h-24 rounded-2xl shadow-lg border-2 border-primary/20"
                    />
                </div>
                <CardHeader className="pt-6">
                    <CardTitle className="text-2xl font-bold font-mono tracking-tight text-center">
                        {isSignUp ? 'Create Account' : 'Welcome Back'}
                    </CardTitle>
                    <CardDescription className="text-center font-mono text-xs uppercase tracking-wider">
                        {isSignUp ? 'Join AcreLedger Precision Ag' : 'Sign in to your farm dashboard'}
                    </CardDescription>
                </CardHeader>
                <form onSubmit={handleAuth}>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <label htmlFor="authEmail" className="text-sm font-medium">Email</label>
                            <Input
                                id="authEmail"
                                name="email"
                                type="email"
                                placeholder="farm@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <label htmlFor="authPassword" className="text-sm font-medium">Password</label>
                            <Input
                                id="authPassword"
                                name="password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                        </div>
                    </CardContent>
                    <CardFooter className="flex flex-col space-y-2">
                        <Button type="submit" className="w-full" disabled={loading}>
                            {loading ? 'Processing...' : (isSignUp ? 'Sign Up' : 'Sign In')}
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            className="w-full"
                            onClick={() => setIsSignUp(!isSignUp)}
                        >
                            {isSignUp ? 'Already have an account? Sign In' : 'Need an account? Sign Up'}
                        </Button>
                    </CardFooter>
                </form>
            </Card>
        </div>
    );
}
