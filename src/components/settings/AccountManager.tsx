import { useFarm } from '@/store/farmStore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function AccountManager() {
  const { session, signOut } = useFarm();

  return (
    <Card className="border-border/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-foreground text-lg flex items-center gap-2">
          Account
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-sm font-mono text-muted-foreground p-3 bg-muted rounded-md break-all">
          {session?.user.email}
        </div>
        <Button
          variant="destructive"
          className="w-full"
          onClick={signOut}
        >
          Sign Out
        </Button>
      </CardContent>
    </Card>
  );
}
