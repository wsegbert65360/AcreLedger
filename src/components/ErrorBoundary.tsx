import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCcw } from 'lucide-react';

interface Props {
    children?: ReactNode;
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
}

class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false
    };

    public static getDerivedStateFromError(_: Error): State {
        return { hasError: true };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
    }

    private handleRetry = () => {
        this.setState({ hasError: false });
        window.location.reload();
    };

    public render() {
        if (this.state.hasError) {
            return (
                <div className="flex flex-col items-center justify-center p-8 space-y-6 text-center bg-card border border-destructive/20 rounded-xl m-4">
                    <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center text-destructive">
                        <AlertTriangle size={32} />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-foreground">Something went wrong</h2>
                        <p className="text-sm text-muted-foreground mt-2 max-w-[250px]">
                            The application encountered an unexpected error.
                        </p>
                    </div>
                    <Button
                        onClick={this.handleRetry}
                        className="h-[64px] w-full max-w-[200px] bg-primary text-primary-foreground text-lg font-bold uppercase tracking-wider glow-primary flex items-center gap-3"
                    >
                        <RefreshCcw size={20} />
                        Retry
                    </Button>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
