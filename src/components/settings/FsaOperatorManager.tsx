import { useEffect, useState } from 'react';
import { ClipboardList } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useFsaOperator } from '@/hooks/useFsaOperator';

/** Operator name and mailing address printed in box 5 of the FSA-578 worksheet. */
export default function FsaOperatorManager() {
  const { operator, loaded, save } = useFsaOperator();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(operator.name);
    setAddress(operator.address);
  }, [operator.name, operator.address]);

  const dirty = name.trim() !== operator.name || address.trim() !== operator.address;

  const submit = async () => {
    if (saving || !dirty) return;
    setSaving(true);
    try { await save({ name, address }); } finally { setSaving(false); }
  };

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardList size={18} className="text-plant" />
          FSA-578 operator
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Printed in box 5 of the FSA-578 worksheet. Leave blank to fill in by hand.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <Label htmlFor="fsaOperatorName" className="text-muted-foreground font-mono text-xs">OPERATOR NAME</Label>
          <Input
            id="fsaOperatorName"
            name="fsaOperatorName"
            value={name}
            maxLength={200}
            autoComplete="name"
            onChange={event => setName(event.target.value)}
            className="mt-1 bg-muted border-border text-foreground"
          />
        </div>
        <div>
          <Label htmlFor="fsaOperatorAddress" className="text-muted-foreground font-mono text-xs">MAILING ADDRESS</Label>
          <Textarea
            id="fsaOperatorAddress"
            name="fsaOperatorAddress"
            value={address}
            maxLength={500}
            rows={2}
            autoComplete="street-address"
            onChange={event => setAddress(event.target.value)}
            className="mt-1 bg-muted border-border text-foreground resize-none"
          />
        </div>
        <Button onClick={submit} disabled={!loaded || saving || !dirty} className="min-h-11 w-full">
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </CardContent>
    </Card>
  );
}
