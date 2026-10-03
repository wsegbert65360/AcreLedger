import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { REGEXP_ONLY_DIGITS } from 'input-otp';
import { toast } from 'sonner';
import { Sprout, Mail, ArrowLeft } from 'lucide-react';
import { getAuthErrorMessage, getPasswordResetErrorMessage } from '@/lib/authErrors';
import { getPasswordRecoveryRedirectUrl } from '@/lib/authDeepLinks';

type AuthMode = 'signin' | 'signup' | 'forgot' | 'verify_code' | 'recovery' | 'verification_sent';

type AuthProps = {
    passwordRecoveryPending?: boolean;
    onPasswordRecoveryPendingChange?: (pending: boolean) => void;
};

export function Auth({
    passwordRecoveryPending = false,
    onPasswordRecoveryPendingChange,
}: AuthProps) {
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [email, setEmail] = useState('');
    const [code, setCode] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [resendCooldown, setResendCooldown] = useState(0);
    const [mode, setMode] = useState<AuthMode>(() => {
        const requestedMode = searchParams.get('mode');
        if (passwordRecoveryPending || requestedMode === 'recovery') return 'recovery';
        return requestedMode === 'signup' ? 'signup' : 'signin';
    });

    useEffect(() => {
        if (passwordRecoveryPending || searchParams.get('mode') === 'recovery') setMode('recovery');
    }, [passwordRecoveryPending, searchParams]);

    useEffect(() => {
        if (mode !== 'verify_code' || resendCooldown <= 0) return;
        const timeout = window.setTimeout(() => setResendCooldown(seconds => seconds - 1), 1000);
        return () => window.clearTimeout(timeout);
    }, [mode, resendCooldown]);

    const handleModeChange = (newMode: AuthMode) => {
        setMode(newMode);
        setCode('');
        setPassword('');
        setConfirmPassword('');
        setSearchParams(
            newMode === 'signup' || newMode === 'signin' ? { mode: newMode } : {},
            { replace: true }
        );
    };

    const sendResetCode = async () => {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: getPasswordRecoveryRedirectUrl(),
        });
        if (error) throw error;
        toast.success('If an account exists for that email, we sent a code.');
        setCode('');
        setResendCooldown(60);
        setMode('verify_code');
    };

    const verifyResetCode = async (token: string) => {
        if (token.length !== 6 || loading) return;

        setLoading(true);
        try {
            const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'recovery' });
            if (error || !data?.session) throw error || new Error('That code is incorrect or has expired.');
            onPasswordRecoveryPendingChange?.(true);
            setCode('');
            setMode('recovery');
        } catch (error) {
            setCode('');
            toast.error(getPasswordResetErrorMessage(error, 'verify'));
        } finally {
            setLoading(false);
        }
    };

    const cancelPasswordRecovery = async () => {
        setLoading(true);
        try {
            const { error } = await supabase.auth.signOut();
            if (error) throw error;
            onPasswordRecoveryPendingChange?.(false);
            handleModeChange('signin');
        } catch (error) {
            toast.error(getAuthErrorMessage(error));
        } finally {
            setLoading(false);
        }
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
                await sendResetCode();
            } else if (mode === 'signup' || mode === 'recovery') {
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
                if (mode === 'recovery') {
                    const { data, error: sessionError } = await supabase.auth.getSession();
                    if (sessionError || !data?.session) {
                        throw new Error('Your reset session expired. Request a new code.');
                    }
                    const { error } = await supabase.auth.updateUser({ password });
                    if (error) throw error;
                    onPasswordRecoveryPendingChange?.(false);
                    toast.success('Password updated.');
                    navigate('/', { replace: true });
                } else {
                    const { error } = await supabase.auth.signUp({
                        email,
                        password,
                    });
                    if (error) throw error;
                    handleModeChange('verification_sent');
                }
            } else {
                const { error } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });
                if (error) throw error;
                toast.success('Logged in successfully!');
            }
        } catch (error) {
            toast.error(mode === 'forgot'
                ? getPasswordResetErrorMessage(error, 'request')
                : getAuthErrorMessage(error));
        } finally {
            setLoading(false);
        }
    };

    const title = mode === 'forgot'
        ? 'Reset Password'
        : mode === 'verify_code'
            ? 'Enter Reset Code'
        : mode === 'recovery'
            ? 'Choose New Password'
        : mode === 'signup'
            ? 'Create Account'
            : mode === 'verification_sent'
                ? 'Check Your Email'
                : 'Welcome Back';

    const subtitle = mode === 'forgot'
        ? 'Enter your email to receive a password reset code'
        : mode === 'verify_code'
            ? `Enter the 6-digit code we sent to ${email}`
        : mode === 'recovery'
            ? 'Enter a new password for your AcreLedger account'
        : mode === 'signup'
            ? 'Set up your farm records'
            : mode === 'verification_sent'
                ? 'We sent a verification link to your inbox'
                : 'Sign in to your farm';

    const buttonLabel = mode === 'forgot'
        ? 'Send code'
        : mode === 'recovery'
            ? 'Update Password'
        : mode === 'signup'
            ? 'Sign Up'
            : 'Sign In';

    return (
        <div className="flex items-center justify-center min-h-[80vh] bg-background">
            <div className="w-full max-w-md mx-4">
                <div className="mb-4 flex justify-start">
                    <Link
                        to="/"
                        className="inline-flex items-center gap-1 rounded-lg text-xs text-muted-foreground transition-colors hover:text-primary"
                    >
                        <ArrowLeft size={14} />
                        Back to home
                    </Link>
                </div>
                {/* Logo area */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4">
                        <Sprout size={32} className="text-primary" />
                    </div>
                    <h1 className="text-2xl font-bold font-mono tracking-tight text-foreground">
                        AcreLedger
                    </h1>
                    <p className="text-xs text-muted-foreground mt-1">
                        Farm records &amp; compliance
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
                                <p className="text-xs text-muted-foreground pt-2">
                                    Next: name your farm, add a field (by hand is fine), and log a planting. You can import FSA tracts later.
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
                    ) : mode === 'verify_code' ? (
                        <form onSubmit={(event) => {
                            event.preventDefault();
                            void verifyResetCode(code);
                        }}>
                            <div className="px-6 py-4 space-y-4">
                                <div className="space-y-2">
                                    <label htmlFor="passwordResetCode" className="text-sm font-medium">6-digit reset code</label>
                                    <InputOTP
                                        id="passwordResetCode"
                                        maxLength={6}
                                        pattern={REGEXP_ONLY_DIGITS}
                                        value={code}
                                        onChange={(value) => {
                                            setCode(value);
                                            if (value.length === 6) void verifyResetCode(value);
                                        }}
                                        inputMode="numeric"
                                        autoComplete="one-time-code"
                                        aria-label="6-digit reset code"
                                        disabled={loading}
                                        containerClassName="justify-center"
                                    >
                                        <InputOTPGroup>
                                            {Array.from({ length: 6 }, (_, index) => (
                                                <InputOTPSlot key={index} index={index} />
                                            ))}
                                        </InputOTPGroup>
                                    </InputOTP>
                                </div>
                            </div>
                            <div className="px-6 pb-6 flex flex-col space-y-2">
                                <Button type="submit" className="w-full" disabled={loading || code.length !== 6}>
                                    {loading ? 'Verifying...' : 'Verify'}
                                </Button>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    className="w-full"
                                    disabled={loading || resendCooldown > 0}
                                    onClick={() => {
                                        setLoading(true);
                                        void sendResetCode()
                                            .catch(error => toast.error(getPasswordResetErrorMessage(error, 'request')))
                                            .finally(() => setLoading(false));
                                    }}
                                >
                                    {resendCooldown > 0 ? `Resend code (${resendCooldown}s)` : 'Resend code'}
                                </Button>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    className="w-full"
                                    disabled={loading}
                                    onClick={() => handleModeChange('forgot')}
                                >
                                    Use a different email
                                </Button>
                            </div>
                        </form>
                    ) : (
                        <form onSubmit={handleAuth}>
                            <div className="px-6 py-4 space-y-4">
                                {mode !== 'recovery' && (
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
                                )}
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
                                        {(mode === 'signup' || mode === 'recovery') && (
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
                                {mode === 'recovery' && (
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        className="w-full"
                                        disabled={loading}
                                        onClick={() => void cancelPasswordRecovery()}
                                    >
                                        Cancel and Sign In
                                    </Button>
                                )}
                            </div>
                        </form>
                    )}
                    <div className="flex items-center justify-center gap-4 pb-5 text-center">
                        <Link
                            to="/privacy"
                            className="text-xs text-muted-foreground transition-colors hover:text-primary"
                        >
                            Privacy policy
                        </Link>
                        <Link
                            to="/support"
                            className="text-xs text-muted-foreground transition-colors hover:text-primary"
                        >
                            Support
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
