import { useEffect, useRef, useState, useCallback } from 'react';

interface Product { id: string; name: string }

export default function ProductAutocomplete({ sellerId, value, onChange }: { sellerId: string | null; value: string | null; onChange: (v: string | null) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Product[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState<number>(-1);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

  useEffect(() => {
    if (!sellerId) {
      setResults([]);
      setOpen(false);
      return;
    }
    if (!query) {
      setResults([]);
      setOpen(false);
      return;
    }

    const id = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/products?sellerId=${sellerId}&q=${encodeURIComponent(query)}&isActive=true`);
        if (res.ok) {
          const json = await res.json();
          setResults(json || []);
          setOpen(true);
          setHighlight(0);
        } else {
          setResults([]);
          setOpen(false);
        }
      } catch (e) {
        setResults([]);
        setOpen(false);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => clearTimeout(id);
  }, [query, sellerId]);

  const [selectedName, setSelectedName] = useState<string | null>(null);

  useEffect(() => {
    // When an external value is set, fetch the product name to display in the input
    let cancelled = false;
    async function loadSelected() {
      if (!value) {
        setSelectedName(null);
        return;
      }
      try {
        const res = await fetch(`/api/products/${value}`);
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) {
          setSelectedName(json?.name || null);
          setQuery(json?.name || '');
        }
      } catch {
        // ignore
      }
    }
    loadSelected();
    return () => { cancelled = true; };
  }, [value]);

  const pick = useCallback((p: Product | null) => {
    onChange(p ? p.id : null);
    setOpen(false);
    if (p) {
      setSelectedName(p.name);
      setQuery(p.name);
    }
  }, [onChange]);

  function clearSelection() {
    onChange(null);
    setSelectedName(null);
    setQuery('');
    setOpen(false);
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight(h => Math.min(h + 1, results.length - 1));
      scrollToHighlighted();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight(h => Math.max(h - 1, 0));
      scrollToHighlighted();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const sel = results[highlight];
      if (sel) pick(sel);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  function scrollToHighlighted() {
    setTimeout(() => {
      const list = listRef.current;
      const el = list?.children[highlight] as HTMLElement | undefined;
      if (el) el.scrollIntoView({ block: 'nearest' });
    }, 0);
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          className="w-full px-3 py-2 border rounded-md bg-background text-foreground placeholder-muted-foreground disabled:opacity-50"
          role="combobox"
          aria-label="Product search"
          aria-expanded={open}
          aria-controls="product-autocomplete-list"
          aria-autocomplete="list"
          placeholder={sellerId ? (selectedName ? selectedName : 'Type to search products...') : 'Select a seller first'}
          disabled={!sellerId}
          value={query}
          onChange={(e) => { setQuery(e.target.value); onChange(null); }}
          onKeyDown={onKeyDown}
        />

        {selectedName && (
          <button
            type="button"
            aria-label="Clear selected product"
            className="px-2 py-1 text-sm rounded bg-muted hover:bg-muted-foreground/10"
            onClick={clearSelection}
          >✕</button>
        )}
      </div>

      <input type="hidden" value={value || ''} />

      {open && (
        <ul
          id="product-autocomplete-list"
          ref={listRef}
          role="listbox"
          className="absolute z-30 mt-1 w-full max-h-48 overflow-auto rounded-md border bg-background text-foreground shadow-lg"
        >
          {loading ? (
            <li className="p-2 text-sm text-muted-foreground">Searching…</li>
          ) : results.length === 0 ? (
            <li className="p-2 text-sm text-muted-foreground">No results</li>
          ) : results.map((p, i) => (
            <li
              key={p.id}
              role="option"
              aria-selected={highlight === i}
              className={`px-3 py-2 cursor-pointer text-foreground hover:bg-muted transition-colors ${highlight === i ? 'bg-primary/10' : ''}`}
              onMouseEnter={() => setHighlight(i)}
              onMouseDown={(e) => { e.preventDefault(); pick(p); }}
            >
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-foreground">{p.name}</div>
                <div className="text-xs text-muted-foreground">{(p as any).price || ''}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
