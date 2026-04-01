import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { toast } from 'sonner';

type AuthMode = 'signin' | 'signup' | 'forgot';

export function Auth() {
    const [loading, setLoading] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [mode, setMode] = useState<AuthMode>('signin');

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            if (mode === 'forgot') {
                const { error } = await supabase.auth.resetPasswordForEmail(email, {
                    redirectTo: `${window.location.origin}/`,
                });
                if (error) throw error;
                toast.success('Password reset email sent! Check your inbox.');
                setMode('signin');
            } else if (mode === 'signup') {
                if (password.length < 8) {
                    toast.error('Password must be at least 8 characters long');
                    setLoading(false);
                    return;
                }
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

    const title = mode === 'forgot'
        ? 'Reset Password'
        : mode === 'signup'
            ? 'Create Account'
            : 'Welcome Back';

    const subtitle = mode === 'forgot'
        ? 'Enter your email to receive a reset link'
        : mode === 'signup'
            ? 'Join AcreLedger Precision Ag'
            : 'Sign in to your farm dashboard';

    const buttonLabel = mode === 'forgot'
        ? 'Send Reset Link'
        : mode === 'signup'
            ? 'Sign Up'
            : 'Sign In';

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
                        {title}
                    </CardTitle>
                    <CardDescription className="text-center font-mono text-xs uppercase tracking-wider">
                        {subtitle}
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
                        {mode !== 'forgot' && (
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
                        )}
                    </CardContent>
                    <CardFooter className="flex flex-col space-y-2">
                        <Button type="submit" className="w-full" disabled={loading}>
                            {loading ? 'Processing...' : buttonLabel}
                        </Button>
                        {mode === 'signin' && (
                            <>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    className="w-full"
                                    onClick={() => setMode('signup')}
                                >
                                    Need an account? Sign Up
                                </Button>
                                <Button
                                    type="button"
                                    variant="link"
                                    className="text-xs text-muted-foreground hover:text-primary"
                                    onClick={() => setMode('forgot')}
                                >
                                    Forgot your password?
                                </Button>
                            </>
                        )}
                        {mode === 'signup' && (
                            <Button
                                type="button"
                                variant="ghost"
                                className="w-full"
                                onClick={() => setMode('signin')}
                            >
                                Already have an account? Sign In
                            </Button>
                        )}
                        {mode === 'forgot' && (
                            <Button
                                type="button"
                                variant="ghost"
                                className="w-full"
                                onClick={() => setMode('signin')}
                            >
                                Back to Sign In
                            </Button>
                        )}
                    </CardFooter>
                </form>
            </Card>
        </div>
    );
}
