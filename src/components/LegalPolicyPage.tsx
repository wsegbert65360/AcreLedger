import type { ReactNode } from 'react';
import { Link, useNavigate } from "react-router-dom";

import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface LegalPolicyPageProps {
    title: string;
    policyTitle: string;
    children: ReactNode;
    withBottomNav?: boolean;
}

export default function LegalPolicyPage({ title, policyTitle, children, withBottomNav = false }: LegalPolicyPageProps) {
    const navigate = useNavigate();

    const goBack = () => {
        if ((window.history.state?.idx ?? 0) > 0) {
            navigate(-1);
            return;
        }
        navigate('/');
    };

    return (
        <div className={cn(
            "min-h-screen bg-background pb-12",
            withBottomNav && "pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] lg:pb-12",
        )}>
            <div className="max-w-2xl mx-auto p-4 space-y-6 lg:max-w-4xl lg:px-8">
                <header className="flex items-center gap-4 py-4">
                    <Button variant="ghost" size="icon" onClick={goBack} aria-label="Go back" className="h-11 w-11 text-muted-foreground">
                        <ArrowLeft size={20} />
                    </Button>
                    <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
                </header>

                <Card className="border-border/40 bg-card/50 shadow-xl">
                    <CardContent className="space-y-5 pt-6 text-sm text-muted-foreground leading-relaxed">
                        <CardTitle className="text-xl">{policyTitle}</CardTitle>
                        {children}
                    </CardContent>
                </Card>
                <footer className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                    <Link to="/privacy" className="inline-flex min-h-11 items-center underline">Privacy policy</Link>
                    <Link to="/terms" className="inline-flex min-h-11 items-center underline">Terms of service</Link>
                    <Link to="/refund" className="inline-flex min-h-11 items-center underline">Refund policy</Link>
                </footer>
            </div>
        </div>
    );
}
