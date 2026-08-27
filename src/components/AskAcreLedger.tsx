import { FormEvent, useState } from 'react';
import { Send } from 'lucide-react';

import { useAskAcreLedger } from '@/context/AskAcreLedgerContext';
import { native } from '@/lib/native';
import { supabase } from '@/lib/supabase';
import { askAcreLedger, type AiHistoryTurn } from '@/services/aiAssistantService';
import { useFarm } from '@/store/farmStore';
import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const EXAMPLE_QUESTION = 'What date was my earliest corn planted this season?';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  lookups?: string[];
}

export default function AskAcreLedger() {
  const { isAskOpen, closeAsk } = useAskAcreLedger();
  const { isOnline, viewingSeason } = useFarm();
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lookupsOpen, setLookupsOpen] = useState<Record<number, boolean>>({});

  const resetConversation = () => {
    setQuestion('');
    setMessages([]);
    setLoading(false);
    setError(null);
    setLookupsOpen({});
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      closeAsk();
      resetConversation();
    }
  };

  const sendQuestion = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading || !isOnline) return;

    setError(null);
    setQuestion('');
    const history: AiHistoryTurn[] = messages.slice(-6).map(({ role, content }) => ({ role, content }));
    const userMessage: ChatMessage = { role: 'user', content: trimmed };
    setMessages(prev => [...prev, userMessage]);
    setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        throw new Error('The assistant is unavailable right now.');
      }
      const result = await askAcreLedger(trimmed, token, viewingSeason, history);
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: result.answer, lookups: result.lookups },
      ]);
      native.haptic.success();
    } catch (err: unknown) {
      native.haptic.error();
      const message = err instanceof Error ? err.message : 'The assistant is unavailable right now.';
      setMessages(prev => {
        const last = prev[prev.length - 1];
        return last === userMessage ? prev.slice(0, -1) : prev;
      });
      setQuestion(trimmed);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    void sendQuestion(question);
  };

  return (
    <Drawer open={isAskOpen} onOpenChange={handleOpenChange}>
      <DrawerContent className="h-[85vh] max-h-[85vh]">
        <DrawerHeader className="text-left">
          <DrawerTitle>Ask the book</DrawerTitle>
          <DrawerDescription className="sr-only">
            Ask questions about this farm’s records.
          </DrawerDescription>
        </DrawerHeader>

        <div className="flex min-h-0 flex-1 flex-col px-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
            {messages.length === 0 && !loading && (
              <div className="rounded-2xl border border-border/70 bg-card p-4">
                <p className="text-sm text-muted-foreground">Try a question from this farm’s book:</p>
                <button
                  type="button"
                  className="mt-3 min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2 text-left text-sm text-foreground"
                  onClick={() => setQuestion(EXAMPLE_QUESTION)}
                >
                  {EXAMPLE_QUESTION}
                </button>
              </div>
            )}

            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={`rounded-2xl px-3 py-2 text-sm ${
                  message.role === 'user'
                    ? 'ml-8 bg-primary/10 text-foreground'
                    : 'mr-8 bg-card border border-border/70 text-foreground'
                }`}
              >
                <p className="whitespace-pre-wrap">{message.content}</p>
                {message.role === 'assistant' && message.lookups && message.lookups.length > 0 && (
                  <div className="mt-2">
                    <button
                      type="button"
                      className="text-xs font-medium text-muted-foreground underline-offset-2 hover:underline"
                      onClick={() => setLookupsOpen(prev => ({ ...prev, [index]: !prev[index] }))}
                    >
                      How I looked it up
                    </button>
                    {lookupsOpen[index] && (
                      <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                        {message.lookups.map(lookup => (
                          <li key={lookup}>{lookup}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <p className="text-sm text-muted-foreground">Checking your records…</p>
            )}
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>

          {!isOnline && (
            <p className="mt-3 text-sm text-muted-foreground">Ask the book needs a connection.</p>
          )}

          <form onSubmit={handleSubmit} className="mt-3 flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <Label htmlFor="ask-the-book-question" className="sr-only">Question</Label>
              <Input
                id="ask-the-book-question"
                name="question"
                value={question}
                onChange={event => setQuestion(event.target.value)}
                maxLength={500}
                disabled={!isOnline || loading}
                placeholder="Ask about this farm’s records"
                autoComplete="off"
              />
            </div>
            <Button
              type="submit"
              className="h-11 shrink-0"
              disabled={!isOnline || loading || !question.trim()}
              aria-label="Send question"
            >
              <Send />
              <span className="hidden sm:inline">Send</span>
            </Button>
          </form>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
