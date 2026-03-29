import { useEffect, useRef, useState, useCallback } from "react";

interface Product {
  id: string;
  name: string;
}

export default function ProductAutocomplete({
  sellerId,
  value,
  onChange,
}: {
  sellerId: string | null;
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState<number>(-1);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

  useEffect(() => {
    if (!sellerId || !query) {
      setResults([]);
      setOpen(false);
      return;
    }

    const id = window.setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/products?sellerId=${sellerId}&q=${encodeURIComponent(query)}&isActive=true`);
        if (!res.ok) {
          setResults([]);
          setOpen(false);
          return;
        }

        const json = await res.json();
        setResults(Array.isArray(json) ? json : []);
        setOpen(true);
        setHighlight(0);
      } catch {
        setResults([]);
        setOpen(false);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => window.clearTimeout(id);
  }, [query, sellerId]);

  useEffect(() => {
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
          setQuery(json?.name || "");
        }
      } catch {
        // ignore
      }
    }

    loadSelected();
    return () => {
      cancelled = true;
    };
  }, [value]);

  const pick = useCallback(
    (product: Product | null) => {
      onChange(product ? product.id : null);
      setOpen(false);
      if (product) {
        setSelectedName(product.name);
        setQuery(product.name);
      }
    },
    [onChange],
  );

  function clearSelection() {
    onChange(null);
    setSelectedName(null);
    setQuery("");
    setOpen(false);
  }

  const scrollToHighlighted = useCallback(() => {
    window.setTimeout(() => {
      const list = listRef.current;
      const element = list?.children[highlight] as HTMLElement | undefined;
      if (element) element.scrollIntoView({ block: "nearest" });
    }, 0);
  }, [highlight]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || results.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((current) => Math.min(current + 1, results.length - 1));
      scrollToHighlighted();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((current) => Math.max(current - 1, 0));
      scrollToHighlighted();
    } else if (e.key === "Enter") {
      e.preventDefault();
      const selected = results[highlight];
      if (selected) pick(selected);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-foreground placeholder-muted-foreground hover:border-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
          role="combobox"
          aria-label="Product search"
          aria-expanded={open}
          aria-controls="product-autocomplete-list"
          aria-autocomplete="list"
          placeholder={sellerId ? selectedName || "Type to search products..." : "Select a seller first"}
          disabled={!sellerId}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            onChange(null);
          }}
          onKeyDown={onKeyDown}
        />

        {selectedName ? (
          <button
            type="button"
            aria-label="Clear selected product"
            className="rounded border border-border bg-muted px-2 py-1 text-sm text-foreground hover:bg-muted-foreground/10"
            onClick={clearSelection}
          >
            x
          </button>
        ) : null}
      </div>

      <input type="hidden" value={value || ""} />

      {open ? (
        <ul
          id="product-autocomplete-list"
          ref={listRef}
          role="listbox"
          className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-md border border-input bg-background text-foreground shadow-xl"
        >
          {loading ? (
            <li className="p-2 text-sm text-muted-foreground">Searching...</li>
          ) : results.length === 0 ? (
            <li className="p-2 text-sm text-muted-foreground">No results</li>
          ) : (
            results.map((product, index) => (
              <li
                key={product.id}
                role="option"
                aria-selected={highlight === index}
                className={`cursor-pointer px-3 py-2 transition-colors ${
                  highlight === index
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground hover:bg-muted/60"
                }`}
                onMouseEnter={() => setHighlight(index)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(product);
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">{product.name}</div>
                  <div className={`text-xs ${highlight === index ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                    {(product as any).price || ""}
                  </div>
                </div>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
