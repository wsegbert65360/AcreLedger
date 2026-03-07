import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, ShieldCheck, Lock, Globe, FileText, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function Privacy() {
    const navigate = useNavigate();

    return (
        <div className="min-h-screen bg-background pb-12">
            <div className="max-w-2xl mx-auto p-4 space-y-6">
                <header className="flex items-center gap-4 py-4">
                    <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-muted-foreground">
                        <ArrowLeft size={20} />
                    </Button>
                    <h1 className="text-2xl font-bold font-mono tracking-tight text-foreground">Privacy Policy</h1>
                </header>

                <Card className="border-border/40 bg-card/50 backdrop-blur-sm shadow-xl">
                    <CardHeader className="border-b border-border/10 pb-6">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 bg-primary/10 rounded-lg">
                                <ShieldCheck className="text-primary" size={24} />
                            </div>
                            <div>
                                <CardTitle className="text-xl font-mono">AcreLedger Privacy Policy</CardTitle>
                                <p className="text-xs text-muted-foreground font-mono mt-1 uppercase tracking-widest">Last Updated: March 4, 2026</p>
                            </div>
                        </div>
                        <p className="text-sm text-muted-foreground font-mono leading-relaxed mt-4 italic">
                            At AcreLedger, we understand that your farm data is your most valuable asset.
                            This policy outlines how we collect, protect, and isolate your agricultural information.
                        </p>
                    </CardHeader>
                    <CardContent className="space-y-8 pt-8 font-mono">
                        {/* Section 1 */}
                        <section className="space-y-4">
                            <div className="flex items-center gap-2 text-primary">
                                <FileText size={18} />
                                <h2 className="font-bold text-lg">1. Data Collection & Usage</h2>
                            </div>
                            <p className="text-sm text-muted-foreground leading-relaxed">
                                We collect only the data necessary to manage your field operations and compliance reporting:
                            </p>
                            <ul className="list-none space-y-3 pl-4">
                                <li className="text-sm flex border-l-2 border-primary/30 pl-3">
                                    <span className="text-foreground font-bold mr-2">Field Data:</span>
                                    GPS coordinates, field boundaries, and acreage for the 17+ fields you manage.
                                </li>
                                <li className="text-sm flex border-l-2 border-primary/30 pl-3">
                                    <span className="text-foreground font-bold mr-2">Activity Logs:</span>
                                    Records of Planting, Spraying, Harvesting, and Fertilizer applications, including product formulas and dates.
                                </li>
                                <li className="text-sm flex border-l-2 border-primary/30 pl-3">
                                    <span className="text-foreground font-bold mr-2">Location Services:</span>
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
                                <div className="flex justify-between items-center p-3 bg-muted/20 border border-border/20 rounded-md">
                                    <div>
                                        <p className="text-sm font-bold text-foreground">Visual Crossing Weather</p>
                                    </div>
                                    <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded uppercase font-bold">GPS Data only</span>
                                </div>
                                <div className="flex justify-between items-center p-3 bg-muted/20 border border-border/20 rounded-md">
                                    <div>
                                        <p className="text-sm font-bold text-foreground">Vercel</p>
                                    </div>
                                    <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded uppercase font-bold">Hosting/SSL</span>
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
                                        When you delete a record (like a Fertilizer log), it is marked as deleted but retained for historical recovery until you permanently purge it.
                                    </p>
                                </div>
                                <div className="p-3 border border-border/40 rounded-lg">
                                    <p className="text-sm font-bold mb-1">Account Deletion</p>
                                    <p className="text-xs text-muted-foreground leading-relaxed">
                                        You may request the full deletion of your farm account and all associated field data through the "Setup" tab.
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
                    </CardContent>
                </Card>

                <footer className="text-center py-8">
                    <p className="text-[10px] font-mono text-muted-foreground/60 uppercase tracking-[0.2em]">
                        &copy; 2026 AcreLedger Precision Agriculture. All Rights Isolated.
                    </p>
                </footer>
            </div>
        </div>
    );
}
