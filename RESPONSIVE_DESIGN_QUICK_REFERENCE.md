# Responsive Design Quick Reference

## Mobile-First Grid Patterns

### Common Grid Layouts

#### 2-Column Responsive
```tsx
<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
  {items.map(item => <Card key={item.id} />)}
</div>
```
- Mobile: 1 column
- Tablet+: 2 columns

#### 3-Column Responsive
```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  {items.map(item => <Card key={item.id} />)}
</div>
```
- Mobile: 1 column
- Tablet: 2 columns
- Desktop: 3 columns

#### 4-Column with Responsive Gaps
```tsx
<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3 lg:gap-4">
  {items.map(item => <div key={item.id} />)}
</div>
```
- Mobile: 2 columns, small gap
- Small: 3 columns
- Desktop: 4 columns, large gap

## Card Component Patterns

### Basic Responsive Card
```tsx
<Card className="p-4 hover:shadow-md transition-shadow cursor-pointer">
  <div className="space-y-3">
    {/* Content */}
  </div>
</Card>
```

### Card with Title and Content
```tsx
<Card key={item.id} className="hover:shadow-lg transition-shadow">
  <CardContent className="pt-6">
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="font-bold text-lg">{value}</p>
    </div>
  </CardContent>
</Card>
```

### Card with Flex Layout (Side-by-side on mobile)
```tsx
<Card className="p-4">
  <div className="flex flex-col sm:flex-row gap-4">
    <div className="flex-1">
      <p className="text-xs text-muted-foreground">Label</p>
      <p className="font-semibold">Content</p>
    </div>
    <div className="flex-1">
      <p className="text-xs text-muted-foreground">Label</p>
      <p className="font-semibold">Content</p>
    </div>
  </div>
</Card>
```

## Responsive Text Patterns

### Text Truncation
```tsx
{/* Truncate single line */}
<span className="truncate">{longText}</span>

{/* Limit width then truncate */}
<span className="truncate max-w-[150px]">{longText}</span>

{/* Multi-line truncation (3 lines) */}
<p className="line-clamp-3">{longText}</p>
```

### Responsive Font Sizes
```tsx
<h1 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold">
  Title
</h1>
```

### Responsive Padding
```tsx
<div className="p-3 sm:p-4 md:p-6 lg:p-8">
  Content with responsive padding
</div>
```

## Flex & Spacing Patterns

### Responsive Flex Direction
```tsx
<div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
  {/* Stack on mobile, side-by-side on larger screens */}
</div>
```

### Responsive Justify
```tsx
<div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
  {/* Single column on mobile, between items on larger */}
</div>
```

### Responsive Gap
```tsx
<div className="grid gap-2 sm:gap-3 md:gap-4 lg:gap-6">
  {/* Gap increases with screen size */}
</div>
```

## Badge & Status Patterns

### Status Badge Grid
```tsx
<div className="flex gap-2 pt-2">
  <div className="flex-1">
    <p className="text-xs text-muted-foreground mb-1">Status</p>
    <span className="inline-block px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
      Active
    </span>
  </div>
  <div className="flex-1">
    <p className="text-xs text-muted-foreground mb-1">Payment</p>
    <span className="inline-block px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
      Paid
    </span>
  </div>
</div>
```

## Hide/Show Patterns

### Hide on Mobile, Show on Desktop
```tsx
<div className="hidden md:block">
  {/* Only visible on medium+ screens */}
</div>
```

### Show on Mobile, Hide on Desktop
```tsx
<div className="md:hidden">
  {/* Only visible on tablet and smaller */}
</div>
```

### Different Content per Breakpoint
```tsx
<div className="flex flex-col md:flex-row gap-4">
  <div className="md:hidden">{/* Mobile content */}</div>
  <div className="hidden md:block">{/* Desktop content */}</div>
</div>
```

## Common Breakpoints

| Breakpoint | Width | Use Case |
|-----------|-------|----------|
| `sm` | 640px | Small phones |
| `md` | 768px | Tablets, large phones |
| `lg` | 1024px | Small laptops, iPads landscape |
| `xl` | 1280px | Desktop |
| `2xl` | 1536px | Large desktop |

## Utility Classes Reference

### Display
- `flex` - Flexbox container
- `grid` - Grid container
- `hidden` - Hide element
- `block` - Block display
- `inline-block` - Inline-block display

### Flex Properties
- `flex-col` - Column direction
- `flex-row` - Row direction (default)
- `gap-*` - Space between items (gap-2, gap-3, gap-4, etc.)
- `justify-between` - Space-between alignment
- `items-center` - Center items vertically
- `flex-1` - Grow to fill space

### Grid Properties
- `grid-cols-*` - Number of columns (grid-cols-1, grid-cols-2, etc.)
- `gap-*` - Space between items

### Sizing
- `w-full` - 100% width
- `h-*` - Height values
- `p-*` - Padding
- `m-*` - Margin
- `max-w-*` - Max width

### Text
- `truncate` - Single line ellipsis
- `line-clamp-*` - Multi-line ellipsis
- `text-*` - Font sizes (text-sm, text-base, text-lg, etc.)
- `font-*` - Font weights (font-light, font-normal, font-bold, etc.)

## Testing Checklist

- [ ] Mobile (< 640px)
  - [ ] Single column layouts
  - [ ] Touch-friendly spacing
  - [ ] No horizontal scroll
  
- [ ] Tablet (640px - 1023px)
  - [ ] 2-column layouts
  - [ ] Proper spacing
  - [ ] Content readable
  
- [ ] Desktop (1024px+)
  - [ ] 3+ column layouts
  - [ ] Full functionality
  - [ ] Optimal use of space

---
**Quick Fixes for Common Issues:**
- No horizontal scroll: Use responsive grid instead of table/overflow
- Text cutoff: Use truncate or line-clamp classes
- Wrong breakpoint: Check if using base class instead of responsive prefix
- Layout shift: Use fixed heights or aspect-ratio classes
