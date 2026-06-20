import { useState } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Sprout, Mail, ArrowLeft } from 'lucide-react';

type AuthMode = 'signin' | 'signup' | 'forgot' | 'verification_sent';

export function Auth() {
    const [loading, setLoading] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [mode, setMode] = useState<AuthMode>('signin');

    const handleModeChange = (newMode: AuthMode) => {
        setMode(newMode);
        setPassword('');
        setConfirmPassword('');
    };

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!isSupabaseConfigured) {
            toast.error('Supabase is not configured for this build. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Codemagic.');
            return;
        }

        setLoading(true);

        try {
            if (mode === 'forgot') {
                const { error } = await supabase.auth.resetPasswordForEmail(email, {
                    redirectTo: `${window.location.origin}/`,
                });
                if (error) throw error;
                toast.success('Password reset email sent! Check your inbox.');
                handleModeChange('signin');
            } else if (mode === 'signup') {
                if (password.length < 8) {
                    toast.error('Password must be at least 8 characters long');
                    setLoading(false);
                    return;
                }
                if (password !== confirmPassword) {
                    toast.error('Passwords do not match');
                    setLoading(false);
                    return;
                }
                const { error } = await supabase.auth.signUp({
                    email,
                    password,
                });
                if (error) throw error;
                handleModeChange('verification_sent');
            } else {
                const { error } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });
                if (error) throw error;
                toast.success('Logged in successfully!');
            }
        } catch (error) {
            const rawMessage = error instanceof Error ? error.message : 'Authentication error';
            const message = rawMessage === 'Load failed'
                ? 'Could not reach Supabase. Check VITE_SUPABASE_URL and network access.'
                : rawMessage;
            toast.error(message);
        } finally {
            setLoading(false);
        }
    };

    const title = mode === 'forgot'
        ? 'Reset Password'
        : mode === 'signup'
            ? 'Create Account'
            : mode === 'verification_sent'
                ? 'Check Your Email'
                : 'Welcome Back';

    const subtitle = mode === 'forgot'
        ? 'Enter your email to receive a reset link'
        : mode === 'signup'
            ? 'Join AcreLedger Precision Ag'
            : mode === 'verification_sent'
                ? 'We sent a verification link to your inbox'
                : 'Sign in to your farm dashboard';

    const buttonLabel = mode === 'forgot'
        ? 'Send Reset Link'
        : mode === 'signup'
            ? 'Sign Up'
            : 'Sign In';

    return (
        <div className="flex items-center justify-center min-h-[80vh] bg-background">
            <div className="w-full max-w-md mx-4">
                {/* Logo area */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4">
                        <Sprout size={32} className="text-primary" />
                    </div>
                    <h1 className="text-2xl font-bold font-mono tracking-tight text-foreground">
                        AcreLedger
                    </h1>
                    <p className="text-xs text-muted-foreground mt-1">
                        Farm Record Keeping & Compliance
                    </p>
                </div>

                {/* Auth card */}
                <div className="bg-card border border-border rounded-2xl shadow-xl overflow-hidden">
                    <div className="px-6 pt-6 pb-2">
                        <h2 className="text-xl font-bold text-foreground text-center">
                            {title}
                        </h2>
                        <p className="text-sm text-muted-foreground text-center mt-1">
                            {subtitle}
                        </p>
                    </div>

                    {mode === 'verification_sent' ? (
                        <div className="px-6 py-6 space-y-6 text-center">
                            <div className="flex justify-center">
                                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                                    <Mail size={24} className="text-primary animate-bounce" />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <p className="text-sm text-foreground">
                                    We sent an email activation link to:
                                </p>
                                <p className="text-sm font-mono font-bold text-primary break-all bg-muted p-2 rounded-lg">
                                    {email}
                                </p>
                                <p className="text-xs text-muted-foreground pt-2">
                                    Please click the link in the email to activate your account. If you do not receive it in a few minutes, check your spam folder.
                                </p>
                            </div>
                            <Button
                                type="button"
                                variant="outline"
                                className="w-full h-10 gap-2"
                                onClick={() => handleModeChange('signin')}
                            >
                                <ArrowLeft size={16} />
                                Back to Sign In
                            </Button>
                        </div>
                    ) : (
                        <form onSubmit={handleAuth}>
                            <div className="px-6 py-4 space-y-4">
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
                                        className="bg-background"
                                    />
                                </div>
                                {mode !== 'forgot' && (
                                    <>
                                        <div className="space-y-2">
                                            <label htmlFor="authPassword" className="text-sm font-medium">Password</label>
                                            <Input
                                                id="authPassword"
                                                name="password"
                                                type="password"
                                                value={password}
                                                onChange={(e) => setPassword(e.target.value)}
                                                required
                                                className="bg-background"
                                            />
                                        </div>
                                        {mode === 'signup' && (
                                            <div className="space-y-2">
                                                <label htmlFor="authConfirmPassword" className="text-sm font-medium">Confirm Password</label>
                                                <Input
                                                    id="authConfirmPassword"
                                                    name="confirmPassword"
                                                    type="password"
                                                    value={confirmPassword}
                                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                                    required
                                                    className="bg-background"
                                                />
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                            <div className="px-6 pb-6 flex flex-col space-y-2">
                                <Button type="submit" className="w-full" disabled={loading}>
                                    {loading ? 'Processing...' : buttonLabel}
                                </Button>
                                {mode === 'signin' && (
                                    <>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            className="w-full"
                                            onClick={() => handleModeChange('signup')}
                                        >
                                            Need an account? Sign Up
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="link"
                                            className="text-xs text-muted-foreground hover:text-primary"
                                            onClick={() => handleModeChange('forgot')}
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
                                        onClick={() => handleModeChange('signin')}
                                    >
                                        Already have an account? Sign In
                                    </Button>
                                )}
                                {mode === 'forgot' && (
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        className="w-full"
                                        onClick={() => handleModeChange('signin')}
                                    >
                                        Back to Sign In
                                    </Button>
                                )}
                            </div>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}
