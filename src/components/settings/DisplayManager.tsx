import { useTheme } from '@/components/ThemeProvider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Sun, Moon, Laptop } from 'lucide-react';

export default function DisplayManager() {
  const { theme, setTheme } = useTheme();

  return (
    <Card className="border-border/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-foreground text-lg flex items-center gap-2">
          <Sun size={18} className="text-primary" />
          Display Settings
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-2">
          <Button
            variant={theme === "light" ? "default" : "outline"}
            size="sm"
            className="flex flex-col h-20 gap-2"
            onClick={() => setTheme("light")}
          >
            <Sun size={20} />
            <span className="text-xs font-mono">Light</span>
          </Button>
          <Button
            variant={theme === "dark" ? "default" : "outline"}
            size="sm"
            className="flex flex-col h-20 gap-2"
            onClick={() => setTheme("dark")}
          >
            <Moon size={20} />
            <span className="text-xs font-mono">Dark</span>
          </Button>
          <Button
            variant={theme === "system" ? "default" : "outline"}
            size="sm"
            className="flex flex-col h-20 gap-2"
            onClick={() => setTheme("system")}
          >
            <Laptop size={20} />
            <span className="text-xs font-mono">System</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
