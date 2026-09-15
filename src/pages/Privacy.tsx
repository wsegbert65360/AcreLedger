import { Link, useNavigate } from "react-router-dom";

import { ArrowLeft, ShieldCheck, Lock, Globe, FileText, Trash2, Mail } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface PrivacyProps {
    withBottomNav?: boolean;
}

export default function Privacy({ withBottomNav = false }: PrivacyProps) {
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
                    <h1 className="text-2xl font-bold tracking-tight text-foreground">Privacy Policy</h1>
                </header>

                <Card className="border-border/40 bg-card/50 backdrop-blur-sm shadow-xl">
                    <CardHeader className="border-b border-border/10 pb-6">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 bg-primary/10 rounded-lg">
                                <ShieldCheck className="text-primary" size={24} />
                            </div>
                            <div>
                                <CardTitle className="text-xl">AcreLedger Privacy Policy</CardTitle>
                                <p className="text-xs text-muted-foreground mt-1">Last updated: September 11, 2026</p>
                            </div>
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed mt-4 italic">
                            At AcreLedger, we understand that your farm data is your most valuable asset.
                            This policy outlines how we collect, protect, and isolate your agricultural information.
                        </p>
                    </CardHeader>
                    <CardContent className="space-y-8 pt-8">
                        {/* Section 1 */}
                        <section className="space-y-4">
                            <div className="flex items-center gap-2 text-primary">
                                <FileText size={18} />
                                <h2 className="font-bold text-lg">1. Data Collection & Usage</h2>
                            </div>
                            <p className="text-sm text-muted-foreground leading-relaxed">
                                We collect only the data necessary to manage your field operations and compliance reporting:
                            </p>
                            <ul className="list-none space-y-3">
                                <li className="flex flex-col gap-1 border-l-2 border-primary/30 pl-3 text-sm sm:flex-row sm:gap-2">
                                    <span className="shrink-0 font-bold text-foreground">Field Data:</span>
                                    GPS coordinates, field boundaries, and acreage for the fields you manage.
                                </li>
                                <li className="flex flex-col gap-1 border-l-2 border-primary/30 pl-3 text-sm sm:flex-row sm:gap-2">
                                    <span className="shrink-0 font-bold text-foreground">Account Data:</span>
                                    Your email address, user ID, farm name, and sign-in information needed to operate and secure your account.
                                </li>
                                <li className="flex flex-col gap-1 border-l-2 border-primary/30 pl-3 text-sm sm:flex-row sm:gap-2">
                                    <span className="shrink-0 font-bold text-foreground">Activity Logs:</span>
                                    Records of Planting, Spraying, Harvesting, and Fertilizer applications, including product formulas and dates.
                                </li>
                                <li className="flex flex-col gap-1 border-l-2 border-primary/30 pl-3 text-sm sm:flex-row sm:gap-2">
                                    <span className="shrink-0 font-bold text-foreground">Location Services:</span>
                                    We use GPS data to provide hyper-local weather from Visual Crossing and to "Pin" activity locations in the field.
                                </li>
                            </ul>
                        </section>

                        {/* Section 2 */}
                        <section className="space-y-4">
                            <div className="flex items-center gap-2 text-primary">
                                <Lock size={18} />
                                <h2 className="font-bold text-lg">2. Data Isolation & Security</h2>
                            </div>
                            <div className="p-4 bg-muted/30 rounded-lg border border-border/30 space-y-3">
                                <p className="text-sm text-foreground/90 font-bold">Multi-Tenancy Architecture</p>
                                <p className="text-sm text-muted-foreground leading-relaxed">
                                    Your data is stored using Supabase with industry-standard encryption.
                                </p>
                                <div className="grid gap-4 mt-2">
                                    <div className="space-y-1">
                                        <p className="text-xs text-foreground font-bold uppercase tracking-tighter">Row Level Security (RLS)</p>
                                        <p className="text-xs text-muted-foreground">We employ strict RLS policies to ensure that your farm data is "invisible" to any other user. No other farmer can see your logs, and you cannot see theirs.</p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-xs text-foreground font-bold uppercase tracking-tighter">Tenant Isolation</p>
                                        <p className="text-xs text-muted-foreground">All data is tagged with a unique farm_id or tenant_id at the database level, preventing accidental data leaks.</p>
                                    </div>
                                </div>
                            </div>
                        </section>

                        {/* Section 3 */}
                        <section className="space-y-4">
                            <div className="flex items-center gap-2 text-primary">
                                <Globe size={18} />
                                <h2 className="font-bold text-lg">3. Third-Party Integrations</h2>
                            </div>
                            <p className="text-sm text-muted-foreground leading-relaxed">
                                AcreLedger connects to the following services to provide essential functionality:
                            </p>
                            <div className="space-y-4">
                                <div className="flex flex-col gap-3 rounded-lg border border-border/20 bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="min-w-0">
                                        <p className="text-sm font-bold text-foreground">Supabase</p>
                                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                                            Provides account authentication and encrypted cloud storage for farm records.
                                        </p>
                                    </div>
                                    <span className="self-start rounded-lg bg-primary/20 px-2 py-0.5 text-[11px] font-bold uppercase text-primary sm:shrink-0">Account and farm data</span>
                                </div>
                                <div className="flex flex-col gap-3 rounded-lg border border-border/20 bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="min-w-0">
                                        <p className="text-sm font-bold text-foreground">Visual Crossing Weather</p>
                                    </div>
                                    <span className="self-start rounded-lg bg-primary/20 px-2 py-0.5 text-[11px] font-bold uppercase text-primary sm:shrink-0">GPS Data only</span>
                                </div>
                                <div className="flex flex-col gap-3 rounded-lg border border-border/20 bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="min-w-0">
                                        <p className="text-sm font-bold text-foreground">Vercel</p>
                                    </div>
                                    <span className="self-start rounded-lg bg-primary/20 px-2 py-0.5 text-[11px] font-bold uppercase text-primary sm:shrink-0">Hosting/SSL</span>
                                </div>
                                <div className="flex justify-between items-center p-3 bg-muted/20 border border-border/20 rounded-lg">
                                    <div>
                                        <p className="text-sm font-bold text-foreground">OpenRouter (Ask the book)</p>
                                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                                            Questions you ask about your records are sent through OpenRouter to an eligible model provider to draft an answer from this farm’s data only. AcreLedger requests only providers marked as not collecting user data, and OpenRouter prompt logging must remain disabled. AcreLedger keeps a 30-day operational log of questions and answers.
                                        </p>
                                    </div>
                                </div>
                                <div className="flex justify-between items-center p-3 bg-muted/20 border border-border/20 rounded-lg">
                                    <div>
                                        <p className="text-sm font-bold text-foreground">Voice questions (Ask the book)</p>
                                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                                            Voice questions use this device’s microphone. The phone or browser turns your speech into words — Apple (iPhone) or the browser vendor (often Google in Chrome) may process that audio as part of OS/browser speech. AcreLedger servers receive only the text question, the same payload as a typed question. Audio is not stored in the farm book.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </section>

                        {/* Section 4 */}
                        <section className="space-y-4">
                            <div className="flex items-center gap-2 text-primary">
                                <Trash2 size={18} />
                                <h2 className="font-bold text-lg">4. Your Control Over Data</h2>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="p-3 border border-border/40 rounded-lg">
                                    <p className="text-sm font-bold mb-1">Soft Deletes</p>
                                    <p className="text-xs text-muted-foreground leading-relaxed">
                                        When you delete a record (like a fertilizer log), it is marked as deleted and excluded from active records. It remains recoverable until the account deletion process removes data that we are not legally required to retain.
                                    </p>
                                </div>
                                <div className="p-3 border border-border/40 rounded-lg">
                                    <p className="text-sm font-bold mb-1">Account Deletion</p>
                                    <p className="text-xs text-muted-foreground leading-relaxed">
                                        You can initiate permanent account deletion in Settings under Account &amp; Display. We complete requests within 30 days and delete associated personal data unless retention is legally required.
                                    </p>
                                </div>
                            </div>
                        </section>

                        {/* Section 5 */}
                        <section className="space-y-4 border-t border-border/10 pt-6">
                            <div className="flex items-center gap-2 text-primary">
                                <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                                <h2 className="font-bold text-lg uppercase tracking-tight">5. Compliance & Reporting</h2>
                            </div>
                            <p className="text-sm text-muted-foreground leading-relaxed border-l-2 border-primary pl-4">
                                AcreLedger is designed to help you meet Missouri 1% and federal compliance standards by generating "Audit-Ready" PDF reports based on your saved logs.
                                <span className="block mt-2 font-bold text-foreground/90">
                                    We do not share these reports with any government agency (like the FSA) unless you explicitly choose to export and send them yourself.
                                </span>
                            </p>
                        </section>

                        {/* Section 6 */}
                        <section className="space-y-4 border-t border-border/10 pt-6">
                            <div className="flex items-center gap-2 text-primary">
                                <Mail size={18} />
                                <h2 className="font-bold text-lg">6. Contact</h2>
                            </div>
                            <p className="text-sm text-muted-foreground leading-relaxed">
                                Privacy questions and support requests go to{' '}
                                <a
                                    href="mailto:support@acreledger.com"
                                    className="break-all font-bold text-foreground underline-offset-4 hover:text-primary hover:underline sm:break-normal"
                                >
                                    support@acreledger.com
                                </a>
                                . The public{' '}
                                <Link
                                    to="/support"
                                    className="font-bold text-foreground underline-offset-4 hover:text-primary hover:underline"
                                >
                                    support page
                                </Link>
                                {' '}is also available without signing in.
                            </p>
                        </section>
                    </CardContent>
                </Card>

                <footer className="text-center py-8">
                    <p className="text-[11px] font-mono text-muted-foreground/60 uppercase tracking-[0.2em]">
                        &copy; 2026 AcreLedger Precision Agriculture. All Rights Isolated.
                    </p>
                </footer>
            </div>
        </div>
    );
}
