import type { WorkRequestProduct } from '@/types/farm';
import type { WorkRequestDraft } from './useWorkRequestForm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Info } from 'lucide-react';

interface ProductsStepProps {
  draft: WorkRequestDraft;
  addProduct: () => void;
  updateProduct: (index: number, patch: Partial<WorkRequestProduct>) => void;
  removeProduct: (index: number) => void;
}

const RATE_UNITS = ['/ac', '/1000 ft²', 'pt/ac', 'qt/ac', 'gal/ac', 'lb/ac', 'oz/ac'];
const CARRIER_UNITS = ['gal/ac', 'gal/1000 ft²', 'L/ha'];
const METHODS = ['Aerial', 'Ground boom', 'Broadcast', 'Band', 'Foliar', 'Soil', 'Other'];
const SUPPLIERS = [
  { value: 'farmer', label: 'Farmer provides' },
  { value: 'applicator', label: 'Applicator provides' },
];

export default function ProductsStep({ draft, addProduct, updateProduct, removeProduct }: ProductsStepProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-bold text-foreground">Products</h3>
          <p className="text-xs text-muted-foreground">Products apply to all selected fields by default. You can override per field next.</p>
        </div>
        <Button type="button" size="sm" onClick={addProduct}>
          <Plus size={16} className="mr-1" /> Add product
        </Button>
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2">
        <Info size={14} className="text-muted-foreground shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground">Leave blank and skip ahead if no products apply yet.</p>
      </div>

      {draft.products.length === 0 && (
        <div className="py-6 text-center text-sm text-muted-foreground">No products yet. Tap “Add product” to begin.</div>
      )}

      <div className="space-y-4">
        {draft.products.map((product, index) => (
          <div key={index} className="rounded-2xl border border-border bg-card p-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Product {index + 1}</span>
              <Button type="button" variant="ghost" size="sm" onClick={() => removeProduct(index)} aria-label={`Remove product ${index + 1}`}>
                <Trash2 size={16} className="text-destructive" />
              </Button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`p-${index}-name`} className="text-xs">Product name</Label>
                <Input id={`p-${index}-name`} className="h-11" value={product.productName} onChange={e => updateProduct(index, { productName: e.target.value })} placeholder="e.g. Roundup PowerMAX" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`p-${index}-rate`} className="text-xs">Application rate</Label>
                <Input id={`p-${index}-rate`} className="h-11" value={product.applicationRate ?? ''} onChange={e => updateProduct(index, { applicationRate: e.target.value })} placeholder="e.g. 32" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`p-${index}-rate-unit`} className="text-xs">Rate unit</Label>
                <Select value={product.rateUnit ?? ''} onValueChange={v => updateProduct(index, { rateUnit: v })}>
                  <SelectTrigger id={`p-${index}-rate-unit`} className="h-11"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{RATE_UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`p-${index}-carrier`} className="text-xs">Carrier volume</Label>
                <Input id={`p-${index}-carrier`} className="h-11" value={product.carrierVolume ?? ''} onChange={e => updateProduct(index, { carrierVolume: e.target.value })} placeholder="e.g. 10" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`p-${index}-carrier-unit`} className="text-xs">Carrier unit</Label>
                <Select value={product.carrierVolumeUnit ?? ''} onValueChange={v => updateProduct(index, { carrierVolumeUnit: v })}>
                  <SelectTrigger id={`p-${index}-carrier-unit`} className="h-11"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{CARRIER_UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`p-${index}-method`} className="text-xs">Application method</Label>
                <Select value={product.applicationMethod ?? ''} onValueChange={v => updateProduct(index, { applicationMethod: v })}>
                  <SelectTrigger id={`p-${index}-method`} className="h-11"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor={`p-${index}-supplier`} className="text-xs">Product provided by</Label>
                <Select value={product.supplier ?? ''} onValueChange={v => updateProduct(index, { supplier: v as 'farmer' | 'applicator' })}>
                  <SelectTrigger id={`p-${index}-supplier`} className="h-11"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{SUPPLIERS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
