import {
  STORE_TYPES,
  STORE_TYPE_CONFIG,
  getStoreTypeFields,
  type StoreType,
  type DynamicField,
  type StoreKind,
  isFoodStoreType,
} from "@shared/storeTypes";
import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

// ─── Visual store-type card grid ─────────────────────────────────────────────

interface StoreTypeSelectorProps {
  value?: string | null;
  onChange: (value: string) => void;
  error?: string;
  exclude?: string[];
  /**
   * Restrict the picker to one business kind:
   *   - "general" → hides food_beverages and restaurant
   *   - "food"    → shows ONLY food_beverages and restaurant
   * Leave undefined to show every storeType.
   */
  kind?: StoreKind;
}

export function StoreTypeSelector({ value, onChange, error, exclude = [], kind }: StoreTypeSelectorProps) {
  const visibleTypes = STORE_TYPES.filter((t) => {
    if (exclude.includes(t)) return false;
    if (kind === "general" && isFoodStoreType(t)) return false;
    if (kind === "food" && !isFoodStoreType(t)) return false;
    return true;
  });
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {visibleTypes.map((type) => {
          const cfg = STORE_TYPE_CONFIG[type];
          const selected = value === type;
          return (
            <button
              key={type}
              type="button"
              onClick={() => onChange(type)}
              className={cn(
                "relative flex flex-col gap-2 rounded-xl border-2 p-4 text-left transition-all",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1",
                selected
                  ? "border-primary bg-primary/10 shadow-sm ring-1 ring-primary/30"
                  : "border-border bg-card hover:border-primary/40 hover:bg-muted/50",
              )}
              data-testid={`store-type-card-${type}`}
            >
              {selected && (
                <CheckCircle2 className="absolute right-2.5 top-2.5 h-4 w-4 text-primary" />
              )}
              <span className="text-2xl leading-none">{cfg.icon}</span>
              <div>
                <p className="text-sm font-semibold leading-tight text-foreground">{cfg.label}</p>
                <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-muted-foreground">
                  {cfg.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

// ─── Dynamic fields for the selected store type ───────────────────────────────

interface StoreTypeDynamicFieldsProps {
  storeType: StoreType;
  metadata: Record<string, any>;
  onChange: (updated: Record<string, any>) => void;
  errors?: Record<string, string>;
}

export function StoreTypeDynamicFields({
  storeType,
  metadata,
  onChange,
  errors,
}: StoreTypeDynamicFieldsProps) {
  const fields = getStoreTypeFields(storeType);
  if (!fields.length) return null;

  const set = (name: string, val: any) => onChange({ ...metadata, [name]: val });

  return (
    <div className="space-y-4 rounded-xl border border-primary/20 bg-primary/5 p-4">
      <div>
        <p className="text-sm font-semibold text-primary">
          {STORE_TYPE_CONFIG[storeType].icon} {STORE_TYPE_CONFIG[storeType].label} — Store Details
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Tell us about the products you'll be selling. This helps KiyuMart set up the right experience for your store.
        </p>
      </div>
      {fields.map((f) => (
        <DynamicFieldInput
          key={f.name}
          field={f}
          value={metadata[f.name]}
          onChange={(v) => set(f.name, v)}
          error={errors?.[f.name]}
        />
      ))}
    </div>
  );
}

// ─── Single field renderer ────────────────────────────────────────────────────

function DynamicFieldInput({
  field,
  value,
  onChange,
  error,
}: {
  field: DynamicField;
  value: any;
  onChange: (v: any) => void;
  error?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">
        {field.label}
        {field.required && <span className="ml-1 text-destructive">*</span>}
      </label>

      {field.type === "multiselect" && (
        <div className="grid grid-cols-2 gap-y-1.5 gap-x-4">
          {field.options?.map((opt) => {
            const checked = Array.isArray(value) ? value.includes(opt) : false;
            return (
              <div key={opt} className="flex items-center gap-2">
                <Checkbox
                  id={`${field.name}-${opt}`}
                  checked={checked}
                  onCheckedChange={(c) => {
                    const arr: string[] = Array.isArray(value) ? [...value] : [];
                    onChange(c ? [...arr, opt] : arr.filter((v) => v !== opt));
                  }}
                  data-testid={`checkbox-${field.name}-${opt}`}
                />
                <label htmlFor={`${field.name}-${opt}`} className="text-sm leading-none">
                  {opt}
                </label>
              </div>
            );
          })}
        </div>
      )}

      {field.type === "select" && (
        <Select value={String(value || "")} onValueChange={onChange}>
          <SelectTrigger data-testid={`select-${field.name}`}>
            <SelectValue placeholder={field.placeholder || `Select ${field.label}`} />
          </SelectTrigger>
          <SelectContent>
            {field.options?.map((opt) => (
              <SelectItem key={opt} value={opt}>
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {field.type === "textarea" && (
        <Textarea
          placeholder={field.placeholder}
          value={String(value || "")}
          onChange={(e) => onChange(e.target.value)}
          data-testid={`textarea-${field.name}`}
          rows={3}
        />
      )}

      {(field.type === "text" || field.type === "number" || field.type === "date") && (
        <Input
          type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
          placeholder={field.placeholder}
          value={String(value || "")}
          onChange={(e) =>
            onChange(field.type === "number" ? Number(e.target.value) : e.target.value)
          }
          data-testid={`input-${field.name}`}
        />
      )}

      {field.description && (
        <p className="text-xs text-muted-foreground">{field.description}</p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
