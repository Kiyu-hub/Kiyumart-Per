import React, { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { fetchSameOriginJson, queryClient } from "@/lib/queryClient";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ProductCard from "@/components/ProductCard";
import { Loader2, SearchX, Sparkles, ArrowLeft, X } from "lucide-react";

interface WishlistItem { id: string; userId: string; productId: string; }

interface Product {
  id: string;
  name: string;
  price: string;
  costPrice?: string;
  images: string[];
  discount: number;
  ratings: string;
  totalRatings: number;
  category?: string | null;
  stock?: number;
  storeId?: string;
  description?: string;
}

// ── Desktop product grid ──────────────────────────────────────────────────────
function ProductGrid({
  products, currencySymbol, wishlist = [], onToggleWishlist,
}: {
  products: Product[]; currencySymbol: string;
  wishlist?: WishlistItem[]; onToggleWishlist?: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
      {products.map((product) => {
        const sellingPrice  = parseFloat(product.price);
        const originalPrice = product.costPrice ? parseFloat(product.costPrice) : null;
        const calculatedDiscount =
          originalPrice && originalPrice > sellingPrice
            ? Math.round(((originalPrice - sellingPrice) / originalPrice) * 100) : 0;
        return (
          <ProductCard
            key={product.id}
            id={product.id}
            name={product.name}
            price={sellingPrice}
            costPrice={originalPrice || undefined}
            currency={currencySymbol}
            image={Array.isArray(product.images) && product.images.length > 0 ? product.images[0] : ""}
            discount={calculatedDiscount}
            rating={parseFloat(product.ratings) || 0}
            reviewCount={product.totalRatings}
            inStock={(product.stock || 0) > 0}
            isWishlisted={wishlist.some((w) => w.productId === product.id)}
            onToggleWishlist={onToggleWishlist}
          />
        );
      })}
    </div>
  );
}

function YouMayAlsoLike({ currencySymbol }: { currencySymbol: string }) {
  const { data: suggestions = [], isLoading } = useQuery<Product[]>({
    queryKey: ["/api/homepage/featured-products", "search-suggestions"],
    queryFn: async () => {
      const res = await fetch("/api/homepage/featured-products", { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data.slice(0, 10) : [];
    },
    staleTime: 5 * 60_000,
  });
  if (isLoading || suggestions.length === 0) return null;
  return (
    <section className="mt-16 border-t pt-10">
      <div className="flex items-center gap-2 mb-6">
        <Sparkles className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-bold">You May Also Like</h2>
      </div>
      <ProductGrid products={suggestions} currencySymbol={currencySymbol} />
    </section>
  );
}

// ── Mobile search result row ──────────────────────────────────────────────────
const TEAL = '#009688';
const MUTED_CLR = 'rgba(235,235,245,0.5)';
const AMBER = '#F59E0B';

function MobileResultRow({
  product, onClick,
}: { product: Product; onClick: () => void }) {
  const img   = Array.isArray(product.images) ? product.images[0] : product.images;
  const price = parseFloat(product.price);
  const rating = parseFloat(product.ratings) || 0;

  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 16px', background: 'transparent', border: 'none',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        cursor: 'pointer', width: '100%', textAlign: 'left',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {/* Product image */}
      <div style={{
        width: 76, height: 76, borderRadius: 12, overflow: 'hidden',
        background: '#FFFFFF', flexShrink: 0,
      }}>
        {img
          ? <img src={img} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center' }}>
              <SearchX size={22} color="#ccc" />
            </div>}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', lineHeight: 1.3, marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {product.name}
        </div>
        {product.description && (
          <div style={{ fontSize: 12, color: MUTED_CLR, marginBottom: 4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {product.description}
          </div>
        )}
        {/* Rating row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
          <svg width={11} height={11} viewBox="0 0 24 24" fill={AMBER} stroke="none">
            <path d="m12 3 3 6.5 7 .8-5 4.7 1.4 7L12 18.5 5.6 22 7 15l-5-4.7 7-.8z" />
          </svg>
          <span style={{ fontSize: 11, color: MUTED_CLR }}>{rating.toFixed(1)}</span>
          <span style={{ fontSize: 11, color: MUTED_CLR }}>|</span>
          <span style={{ fontSize: 11, color: MUTED_CLR }}>QTY: {product.stock ?? 0}</span>
        </div>
        {/* Price */}
        <div style={{ fontSize: 16, fontWeight: 700, color: TEAL }}>
          GH₵{price.toFixed(2)}
        </div>
      </div>
    </button>
  );
}

// ── Search history helpers ────────────────────────────────────────────────────
const HISTORY_KEY = 'kiyumart_search_history';
const MAX_HISTORY = 10;

function getStoredHistory(): string[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; }
}
function saveToHistory(q: string) {
  const h = getStoredHistory().filter((x) => x.toLowerCase() !== q.toLowerCase());
  localStorage.setItem(HISTORY_KEY, JSON.stringify([q, ...h].slice(0, MAX_HISTORY)));
}
function deleteFromHistory(q: string) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(getStoredHistory().filter((x) => x !== q)));
}
function wipeHistory() {
  localStorage.removeItem(HISTORY_KEY);
}

// ── Levenshtein distance ──────────────────────────────────────────────────────
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}

// Phonetic normalization: strip vowels + common letter substitutions
// "ifon" → "fn",  "iphone" → "fn"  ✓
function phoneticNorm(s: string): string {
  return s.toLowerCase()
    .replace(/ph/g, 'f').replace(/ck/g, 'k').replace(/qu/g, 'k')
    .replace(/[aeiou]/g, '').replace(/(.)\1+/g, '$1');
}

// Focused typo/phonetic variants — avoids generating unrelated noise
function fuzzyVariants(word: string): string[] {
  if (word.length < 3) return [];
  const variants: string[] = [];
  // Collapse duplicates: jollof → jolof
  const collapsed = word.replace(/(.)\1+/g, '$1');
  if (collapsed !== word) variants.push(collapsed);
  // Phonetic: f ↔ ph  (ifon → iphone, foto → photo)
  if (word.includes('f')) variants.push(word.replace(/f/g, 'ph'));
  if (word.includes('ph')) variants.push(word.replace(/ph/g, 'f'));
  // Adjacent transpositions (first 3 positions only — limits noise)
  for (let i = 0; i < Math.min(word.length - 1, 3); i++) {
    const s = word.slice(0, i) + word[i + 1] + word[i] + word.slice(i + 2);
    if (s !== word) variants.push(s);
  }
  return Array.from(new Set(variants)).slice(0, 5);
}

// ── Fuzzy relevance scoring ───────────────────────────────────────────────────
function scoreProduct(p: Product, words: string[]): number {
  const n = p.name.toLowerCase();
  const d = (p.description || '').toLowerCase();
  const nameWords = n.split(/\s+/);
  let score = 0;
  for (const qw of words) {
    if (n.includes(qw)) { score += 4; continue; }
    if (d.includes(qw)) { score += 1; continue; }
    let best = 0;
    for (const nw of nameWords) {
      // Prefix match: "sams" matches "samsung", "ifon" could prefix match
      if (qw.length >= 3 && nw.startsWith(qw)) { best = Math.max(best, 3); break; }
      // Phonetic match: "ifon" → "fn", "iphone" → "fn"
      if (qw.length >= 3 && phoneticNorm(qw) === phoneticNorm(nw)) { best = Math.max(best, 3); break; }
      // Levenshtein — strict: max 1 edit for ≤5 chars, 2 for 6+
      const maxDist = qw.length <= 5 ? 1 : 2;
      if (levenshtein(qw, nw) <= maxDist) best = Math.max(best, 2);
    }
    score += best;
  }
  return score;
}

// ── Category type for search ──────────────────────────────────────────────────
interface SearchCategory {
  id: string; name: string; slug: string; image?: string | null;
}

// Broad keyword → category-name fragments mapping for smart expansion
const CATEGORY_KEYWORD_MAP: Record<string, string[]> = {
  food: ['food', 'eat', 'snack', 'beverage', 'drink', 'fruit', 'vegetable', 'meat', 'fish', 'grocery', 'jollof', 'rice', 'bread', 'cake', 'baked', 'dairy', 'spice', 'sauce', 'soup', 'noodle', 'pasta'],
  cloth: ['cloth', 'fashion', 'wear', 'dress', 'shirt', 'trouser', 'shoe', 'bag', 'accessory', 'jean', 'jacket', 'suit', 'skirt', 'top', 'underwear', 'lingerie', 'sportswear', 'outfit'],
  health: ['health', 'medical', 'pharmacy', 'drug', 'vitamin', 'supplement', 'wellness', 'beauty', 'skincare', 'cosmetic', 'hygiene', 'baby care', 'personal care'],
  electronics: ['electronic', 'phone', 'laptop', 'computer', 'tablet', 'tv', 'audio', 'camera', 'gadget', 'appliance', 'cable', 'charger', 'battery', 'smart'],
  home: ['home', 'furniture', 'decor', 'kitchen', 'bedding', 'living', 'storage', 'garden', 'office', 'cleaning', 'tool'],
};

// Only these broad/generic terms trigger category-wide product fetching.
// Specific product terms ("phone", "pants", "shirt") use text search only.
const BROAD_CATEGORY_TERMS = new Set([
  'food', 'foods', 'eat', 'eating', 'eats', 'meal', 'meals', 'grocery', 'groceries',
  'clothing', 'clothes', 'cloth', 'fashion', 'wear', 'apparel', 'outfit', 'outfits',
  'health', 'wellness', 'medical', 'pharmacy', 'beauty', 'cosmetic', 'cosmetics',
  'electronics', 'electronic', 'gadget', 'gadgets', 'tech',
  'home', 'furniture', 'decor', 'household',
  'drink', 'drinks', 'beverage', 'beverages', 'snack', 'snacks',
]);

function matchesCategories(query: string, categories: SearchCategory[]): SearchCategory[] {
  if (!query.trim()) return [];
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);

  // Only expand a group if the query word is an exact alias, or a 4+ char prefix match
  const expandedTerms = new Set<string>(words);
  for (const [, aliases] of Object.entries(CATEGORY_KEYWORD_MAP)) {
    const groupMatch = aliases.some((a) =>
      words.some((w) =>
        a === w ||
        (w.length >= 4 && a.startsWith(w)) ||
        (a.length >= 4 && w.startsWith(a))
      )
    );
    if (groupMatch) aliases.forEach((a) => expandedTerms.add(a));
  }

  return categories.filter((cat) => {
    const catWords = cat.name.toLowerCase().split(/[\s&,\/\-]+/).filter(Boolean);
    // Match if any category word equals or starts with an expanded term (or vice versa)
    return Array.from(expandedTerms as Set<string>).some((term) =>
      catWords.some((cw) =>
        cw === term ||
        (cw.length >= 3 && cw.startsWith(term)) ||
        (term.length >= 4 && term.startsWith(cw))
      )
    );
  });
}

// ── Mobile full-page search ───────────────────────────────────────────────────
function MobileSearchPage({ initialQuery, onNavigate }: { initialQuery: string; onNavigate: (path: string) => void }) {
  const [inputValue, setInputValue] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);
  const [isFocused, setIsFocused] = useState(!initialQuery);
  const [history, setHistory] = useState<string[]>(getStoredHistory());
  const [results, setResults] = useState<Product[]>([]);
  const [allCategories, setAllCategories] = useState<SearchCategory[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch all categories once
  useEffect(() => {
    fetch('/api/categories', { credentials: 'include' })
      .then((r) => r.ok ? r.json() : [])
      .then((data) => setAllCategories(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(inputValue), 350);
    return () => clearTimeout(t);
  }, [inputValue]);

  useEffect(() => {
    const q = debouncedQuery.trim();
    if (!q) { setResults([]); setIsLoading(false); return; }

    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const apiQueries = Array.from(new Set([
      q,
      ...words.filter((w) => w !== q),
      ...words.flatMap((w) => fuzzyVariants(w)),
    ])).slice(0, 10);

    // Category-wide product fetching ONLY for broad generic terms ("food", "clothing", etc.)
    // Specific product queries ("pants", "phone") skip this — text search is sufficient.
    const isBroadQuery = words.every((w) => BROAD_CATEGORY_TERMS.has(w));
    const matchedCats = isBroadQuery ? matchesCategories(q, allCategories) : [];
    const catFetches = matchedCats.slice(0, 5).map((cat) =>
      fetch(`/api/products?categoryId=${encodeURIComponent(cat.id)}&limit=30`, { credentials: 'include' })
        .then((r) => r.ok ? r.json() : [])
        .then((data) => (Array.isArray(data) ? data : Array.isArray(data?.products) ? data.products : []) as Product[])
        .catch(() => [] as Product[])
    );

    const apiQueryCount = apiQueries.length;
    setIsLoading(true);
    let cancelled = false;

    Promise.all([
      ...apiQueries.map((sq) =>
        fetch(`/api/products?search=${encodeURIComponent(sq)}&limit=40`, { credentials: 'include' })
          .then((r) => r.ok ? r.json() : [])
          .then((data) => (Array.isArray(data) ? data : Array.isArray(data?.products) ? data.products : []) as Product[])
          .catch(() => [] as Product[])
      ),
      ...catFetches,
    ]).then((allLists) => {
      if (cancelled) return;

      // Keep API results and category results separate so we can score them differently
      const apiLists = allLists.slice(0, apiQueryCount);
      const catLists  = allLists.slice(apiQueryCount);

      const seen = new Set<string>();
      const catProductIds = new Set<string>();
      const merged: Product[] = [];

      for (const list of apiLists) {
        for (const p of list) {
          if (!seen.has(p.id)) { seen.add(p.id); merged.push(p); }
        }
      }
      for (const list of catLists) {
        for (const p of list) {
          catProductIds.add(p.id);
          if (!seen.has(p.id)) { seen.add(p.id); merged.push(p); }
        }
      }

      // Category products get +2 bonus so they appear even when the product name
      // doesn't contain the keyword (e.g. "Jollof Rice" for "food" search).
      // Filter threshold is >= 2, which means:
      //   - description-only matches (score 1, no category) → excluded ✓
      //   - category products with no text match (0 + 2 = 2) → included ✓
      //   - name/phonetic matches (score 3-4) → always included ✓
      const scored = merged
        .map((p) => ({ p, s: scoreProduct(p, words) + (catProductIds.has(p.id) ? 2 : 0) }))
        .filter(({ s }) => s >= 2)
        .sort((a, b) => b.s - a.s)
        .map(({ p }) => p);

      setResults(scored);
      setIsLoading(false);
    });

    return () => { cancelled = true; };
  }, [debouncedQuery, allCategories]);

  const handleResultClick = (productId: string) => {
    if (debouncedQuery.trim()) {
      saveToHistory(debouncedQuery.trim());
      setHistory(getStoredHistory());
    }
    onNavigate(`/product/${productId}`);
  };

  const handleHistoryTap = (q: string) => {
    setInputValue(q);
    setIsFocused(false);
    inputRef.current?.blur();
  };

  const handleRemoveHistory = (q: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteFromHistory(q);
    setHistory(getStoredHistory());
  };

  const handleClearAll = () => {
    wipeHistory();
    setHistory([]);
  };

  const showHistory = isFocused && !inputValue.trim() && history.length > 0;
  const showEmptyPrompt = !inputValue.trim() && !showHistory;

  return (
    <div style={{
      position: 'fixed', inset: 0,
      display: 'flex', flexDirection: 'column',
      background: '#000', color: '#fff',
      fontFamily: '-apple-system,"SF Pro Text",system-ui,sans-serif',
      zIndex: 50,
    }}>
      {/* ── Sticky header ─────────────────────────────────────────── */}
      <div style={{ flexShrink: 0, background: '#000' }}>
        {/* Status bar spacer */}
        <div style={{ height: 12 }} />

        {/* Back button row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px 10px' }}>
          <button
            onClick={() => onNavigate('/')}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#fff', display: 'grid', placeItems: 'center', padding: 4, WebkitTapHighlightColor: 'transparent' }}
          >
            <ArrowLeft size={22} color="#fff" />
          </button>
          <span style={{ fontSize: 17, fontWeight: 600, color: '#fff' }}>Search</span>
        </div>

        {/* Search input */}
        <div style={{ padding: '0 16px 14px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            background: '#1A1A1C', borderRadius: 14, padding: '0 14px',
            border: '1px solid rgba(255,255,255,0.09)', height: 48,
          }}>
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={MUTED_CLR} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
            </svg>
            <input
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setTimeout(() => setIsFocused(false), 150)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && inputValue.trim()) {
                  saveToHistory(inputValue.trim());
                  setHistory(getStoredHistory());
                  setIsFocused(false);
                  inputRef.current?.blur();
                }
              }}
              placeholder="Search for products…"
              style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: 15, fontFamily: 'inherit' }}
            />
            {inputValue && (
              <button
                onClick={() => { setInputValue(''); inputRef.current?.focus(); }}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: MUTED_CLR, display: 'grid', placeItems: 'center', padding: 4, WebkitTapHighlightColor: 'transparent' }}
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Scrollable results area ────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>

        {/* Search history */}
        {showHistory && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 16px 8px' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: MUTED_CLR, letterSpacing: 0.2 }}>Recent Searches</span>
              <button
                onClick={handleClearAll}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 13, color: TEAL, fontWeight: 600, padding: '4px 0', WebkitTapHighlightColor: 'transparent' }}
              >
                Clear all
              </button>
            </div>
            {history.map((q) => (
              <button
                key={q}
                onClick={() => handleHistoryTap(q)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '13px 16px', background: 'transparent', border: 'none',
                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                  cursor: 'pointer', width: '100%', textAlign: 'left',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={MUTED_CLR} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" />
                </svg>
                <span style={{ flex: 1, fontSize: 14, color: '#fff' }}>{q}</span>
                <span
                  role="button"
                  onClick={(e) => handleRemoveHistory(q, e)}
                  style={{ display: 'grid', placeItems: 'center', padding: 6, WebkitTapHighlightColor: 'transparent' }}
                >
                  <X size={14} color={MUTED_CLR} />
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Empty prompt */}
        {showEmptyPrompt && !showHistory && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 32px', textAlign: 'center' }}>
            <svg width={48} height={48} viewBox="0 0 24 24" fill="none" stroke={MUTED_CLR} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 16 }}>
              <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
            </svg>
            <div style={{ fontSize: 17, fontWeight: 600, color: '#fff', marginBottom: 8 }}>Search products</div>
            <div style={{ fontSize: 14, color: MUTED_CLR }}>Type to find products across all categories</div>
          </div>
        )}

        {/* Loading */}
        {!showHistory && isLoading && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: 60, gap: 10 }}>
            <Loader2 size={20} className="animate-spin" style={{ color: TEAL }} />
            <span style={{ fontSize: 14, color: MUTED_CLR }}>Searching…</span>
          </div>
        )}

        {/* Result count */}
        {!showHistory && !isLoading && debouncedQuery.trim() && results.length > 0 && (
          <div style={{ padding: '0 16px 8px' }}>
            <span style={{ fontSize: 12, color: MUTED_CLR }}>{results.length} product{results.length !== 1 ? 's' : ''}</span>
          </div>
        )}

        {/* No results */}
        {!showHistory && !isLoading && debouncedQuery.trim() && results.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '60px 32px' }}>
            <SearchX size={48} color={MUTED_CLR} style={{ marginBottom: 16 }} />
            <div style={{ fontSize: 17, fontWeight: 600, color: '#fff', marginBottom: 8 }}>No results found</div>
            <div style={{ fontSize: 14, color: MUTED_CLR }}>
              Nothing matched "{debouncedQuery}". Try different keywords.
            </div>
          </div>
        )}

        {/* Product results */}
        {!showHistory && !isLoading && results.length > 0 && (
          <div>
            {results.map((p) => (
              <MobileResultRow key={p.id} product={p} onClick={() => handleResultClick(p.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Main export
// ═════════════════════════════════════════════════════════════════════════════
export default function SearchPage() {
  const [location, navigate] = useLocation();
  const { currencySymbol } = useLanguage();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();

  const params = new URLSearchParams(location.split("?")[1] || "");
  const searchQuery = params.get("q") || "";
  const isMobileView = params.get("mobile") === "1" || (typeof window !== "undefined" && window.innerWidth < 768);

  // On mobile, show the dedicated mobile search page
  if (isMobileView) {
    return <MobileSearchPage initialQuery={searchQuery} onNavigate={navigate} />;
  }

  // Desktop: redirect to home if no query
  useEffect(() => {
    if (!searchQuery.trim()) {
      navigate("/", { replace: true });
    }
  }, [searchQuery, navigate]);

  const { data: wishlist = [] } = useQuery<WishlistItem[]>({
    queryKey: ["/api/wishlist"],
    enabled: isAuthenticated && !authLoading,
    queryFn: () => fetchSameOriginJson<WishlistItem[]>("/api/wishlist", { cache: "no-store" }),
    refetchOnMount: "always",
    staleTime: 0,
  });

  const addToWishlistMutation = useMutation({
    mutationFn: (productId: string) =>
      fetchSameOriginJson("/api/wishlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/wishlist"] }),
    onError: (err: any) => toast({ title: "Error", description: err.message || "Could not add to wishlist", variant: "destructive" }),
  });

  const removeFromWishlistMutation = useMutation({
    mutationFn: (productId: string) =>
      fetchSameOriginJson(`/api/wishlist/${productId}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/wishlist"] }),
    onError: (err: any) => toast({ title: "Error", description: err.message || "Could not remove from wishlist", variant: "destructive" }),
  });

  const handleToggleWishlist = (productId: string) => {
    if (!isAuthenticated) {
      toast({ title: "Sign in required", description: "Please sign in to save items to your wishlist." });
      return;
    }
    if (wishlist.some((w: WishlistItem) => w.productId === productId)) {
      removeFromWishlistMutation.mutate(productId);
    } else {
      addToWishlistMutation.mutate(productId);
    }
  };

  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ["/api/products", "search", searchQuery],
    queryFn: async () => {
      if (!searchQuery.trim()) return [];
      const res = await fetch(`/api/products?search=${encodeURIComponent(searchQuery.trim())}&limit=60`, { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : Array.isArray(data?.products) ? data.products : [];
    },
    enabled: !!searchQuery.trim(),
  });

  if (!searchQuery.trim()) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 max-w-7xl mx-auto px-4 py-10 w-full">
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <SearchX className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" />
            <p className="text-lg text-muted-foreground">Enter something to search for products.</p>
          </div>
          <YouMayAlsoLike currencySymbol={currencySymbol} />
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-7xl mx-auto px-4 py-10 w-full">
        <h1 className="text-2xl font-bold mb-1">
          Search results for <span className="text-primary">"{searchQuery}"</span>
        </h1>
        {isLoading ? (
          <div className="flex items-center justify-center py-24 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin text-primary mr-2" />
            <span>Searching…</span>
          </div>
        ) : products.length === 0 ? (
          <>
            <p className="text-sm text-muted-foreground mb-8">No results found.</p>
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <SearchX className="h-14 w-14 text-muted-foreground/30 mb-4" />
              <p className="text-xl font-medium text-foreground mb-2">No products found</p>
              <p className="text-muted-foreground text-sm">
                We couldn't find anything matching "{searchQuery}". Try different keywords.
              </p>
            </div>
            <YouMayAlsoLike currencySymbol={currencySymbol} />
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground mb-8">
              {products.length} product{products.length !== 1 ? "s" : ""} found
            </p>
            <ProductGrid products={products} currencySymbol={currencySymbol} wishlist={wishlist} onToggleWishlist={handleToggleWishlist} />
            <YouMayAlsoLike currencySymbol={currencySymbol} />
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}
