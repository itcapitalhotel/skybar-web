'use client';

import React, {
  useMemo, useState, useEffect, useRef, useLayoutEffect, useCallback,
} from 'react';
import {
  X, Plus, Minus, ShoppingCart, Star, Search, Trash2, ChevronRight,
} from 'lucide-react';
import { TableData, OrderItem } from './floorData';
import { menuApi } from '@/lib/api/client';
import type { MenuItem, MenuCategory } from '@/lib/api/types';
import { toast } from 'sonner';

interface MenuOverlayProps {
  table: TableData;
  onClose: () => void;
  onAddItems: (tableId: string, items: OrderItem[]) => void;
  showAll?: boolean;
  tableNote?: string;
}

interface CartEntry {
  menuItem: MenuItem;
  sizeIndex: number;
  qty: number;
  note: string;
}

function cartLineKey(menuItemId: string, sizeIndex: number): string {
  return `${menuItemId}:${sizeIndex}`;
}

function linePrice(item: MenuItem, sizeIndex: number): number {
  return item.sizes?.[sizeIndex]?.price ?? item.price;
}

function lineSizeLabel(item: MenuItem, sizeIndex: number): string | undefined {
  return item.sizes?.[sizeIndex]?.label;
}

const CART_VISIBLE_MAX = 4;
/** Matches Tailwind `space-y-2` between cart lines */
const CART_LINE_GAP_PX = 8;

function menuItemPriceLabel(item: MenuItem): string {
  const sizes = item.sizes?.filter((s) => s.price != null && s.label);
  if (sizes?.length) {
    const prices = sizes.map((s) => s.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    if (min === max) return `$${min.toFixed(2)}`;
    return `$${min.toFixed(2)} – $${max.toFixed(2)}`;
  }
  return `$${item.price.toFixed(2)}`;
}

const cartLineCardClass = 'rounded-xl border border-border bg-background/80 p-2.5 space-y-2';

/** Hidden row — same layout as a real line so we always reserve 4-row height. */
function CartLineHeightProbe({ measureRef }: { measureRef: React.RefObject<HTMLDivElement | null> }) {
  return (
    <div
      ref={measureRef}
      className={`${cartLineCardClass} absolute left-3 right-3 top-2 opacity-0 pointer-events-none`}
      aria-hidden
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-foreground leading-snug">Sample menu item</p>
          <p className="text-[10px] font-medium text-primary mt-0.5">Regular</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">$0.00 each</p>
        </div>
        <div className="w-7 h-7" />
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/30 p-0.5">
          <div className="w-7 h-7" />
          <span className="w-8 text-center text-sm font-semibold">1</span>
          <div className="w-7 h-7" />
        </div>
        <span className="text-sm font-semibold tabular-nums">$0.00</span>
      </div>
    </div>
  );
}

export default function MenuOverlay({
  table,
  onClose,
  onAddItems,
  showAll = false,
  tableNote = '',
}: MenuOverlayProps) {
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [cart, setCart] = useState<CartEntry[]>([]);
  const [search, setSearch] = useState('');
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [loadingMenu, setLoadingMenu] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [sizePickerItem, setSizePickerItem] = useState<MenuItem | null>(null);
  const cartLineMeasureRef = useRef<HTMLDivElement | null>(null);
  const [cartListViewportHeight, setCartListViewportHeight] = useState<number | undefined>();

  const recomputeCartListHeight = useCallback(() => {
    const el = cartLineMeasureRef.current;
    if (!el) return;
    const rowH = el.getBoundingClientRect().height;
    const gapCount = CART_VISIBLE_MAX - 1;
    setCartListViewportHeight(rowH * CART_VISIBLE_MAX + gapCount * CART_LINE_GAP_PX);
  }, []);

  useLayoutEffect(() => {
    recomputeCartListHeight();
  }, [recomputeCartListHeight, loadingMenu]);

  useEffect(() => {
    const el = cartLineMeasureRef.current;
    if (!el) return undefined;
    const observer = new ResizeObserver(() => recomputeCartListHeight());
    observer.observe(el);
    window.addEventListener('resize', recomputeCartListHeight);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', recomputeCartListHeight);
    };
  }, [recomputeCartListHeight, loadingMenu]);

  useEffect(() => {
    let cancelled = false;
    async function loadMenu() {
      setLoadingMenu(true);
      try {
        const [cats, items] = await Promise.all([menuApi.categories(), menuApi.items()]);
        if (!cancelled) {
          setCategories(cats.filter((c) => c.isActive !== false));
          setMenuItems(items.filter((i) => i.available !== false));
        }
      } catch (err) {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : 'Failed to load menu');
          setCategories([]);
          setMenuItems([]);
        }
      } finally {
        if (!cancelled) setLoadingMenu(false);
      }
    }
    loadMenu();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredItems = useMemo(
    () =>
      menuItems.filter((item) => {
        const matchCat =
          activeCategory === 'All'
          || item.categoryId === activeCategory
          || item.category === activeCategory;
        const matchSearch = !search || item.name.toLowerCase().includes(search.toLowerCase());
        return matchCat && matchSearch;
      }),
    [menuItems, activeCategory, search],
  );

  const cartSummary = useMemo(() => {
    const lines = cart.length;
    const pieces = cart.reduce((n, c) => n + c.qty, 0);
    const total = cart.reduce((acc, c) => acc + linePrice(c.menuItem, c.sizeIndex) * c.qty, 0);
    return { lines, pieces, total };
  }, [cart]);

  const addToCart = (item: MenuItem, sizeIndex: number) => {
    setCart((prev) => {
      const existing = prev.find(
        (c) => c.menuItem.id === item.id && c.sizeIndex === sizeIndex,
      );
      if (existing) {
        return prev.map((c) =>
          c.menuItem.id === item.id && c.sizeIndex === sizeIndex
            ? { ...c, qty: c.qty + 1 }
            : c,
        );
      }
      return [...prev, { menuItem: item, sizeIndex, qty: 1, note: '' }];
    });
  };

  const updateCartQty = (menuItemId: string, sizeIndex: number, delta: number) => {
    setCart((prev) =>
      prev
        .map((c) => {
          if (c.menuItem.id !== menuItemId || c.sizeIndex !== sizeIndex) return c;
          return { ...c, qty: c.qty + delta };
        })
        .filter((c) => c.qty > 0),
    );
  };

  const removeFromCart = (menuItemId: string, sizeIndex: number) => {
    setCart((prev) =>
      prev.filter((c) => !(c.menuItem.id === menuItemId && c.sizeIndex === sizeIndex)),
    );
  };

  const clearCart = () => {
    setCart([]);
    toast.message('Selection cleared');
  };

  const handleMenuItemClick = (item: MenuItem) => {
    const sizes = item.sizes?.filter((s) => s.label?.trim());
    if (sizes && sizes.length > 1) {
      setSizePickerItem(item);
      return;
    }
    addToCart(item, 0);
  };

  const handleSubmit = async () => {
    if (cart.length === 0) return;
    setSubmitting(true);
    const stamp = Date.now();
    const newItems: OrderItem[] = cart.map((c, idx) => {
      const sizeLabel = lineSizeLabel(c.menuItem, c.sizeIndex);
      const unitPrice = linePrice(c.menuItem, c.sizeIndex);
      return {
        id: `item-${stamp}-${idx}`,
        menuItemId: c.menuItem.id,
        name: c.menuItem.name,
        qty: c.qty,
        unitPrice,
        status: 'Queued' as const,
        size: sizeLabel,
        notes: c.note || tableNote || undefined,
      };
    });
    try {
      onAddItems(table.id, newItems);
      setCart([]);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (cart.length > 0) {
      const ok = window.confirm('Discard items in your selection and close?');
      if (!ok) return;
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-40 modal-overlay flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="glass-card-elevated rounded-t-2xl sm:rounded-2xl border border-border w-full max-w-5xl max-h-[92vh] flex flex-col slide-up">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 p-4 border-b border-border">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-foreground truncate">
              Order — Table {table.label}
            </h3>
            <p className="text-xs text-muted-foreground">
              {showAll ? 'Adding to open check' : 'New check'}
              {tableNote ? ` · Table note: ${tableNote}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50"
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        {loadingMenu ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Loading menu…</div>
        ) : (
          <div className="flex flex-1 min-h-0 flex-col sm:flex-row">
            {/* Menu */}
            <div className="flex flex-col flex-1 min-h-0 min-w-0">
              <div className="p-3 border-b border-border space-y-2">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search menu…"
                    className="w-full pl-9 pr-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/40"
                  />
                </div>
                <div className="flex gap-2 overflow-x-auto scrollbar-none pb-0.5">
                  <button
                    type="button"
                    onClick={() => setActiveCategory('All')}
                    className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      activeCategory === 'All'
                        ? 'bg-primary/15 text-primary border border-primary/30'
                        : 'text-muted-foreground border border-transparent hover:bg-muted/40'
                    }`}
                  >
                    All
                  </button>
                  {categories.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setActiveCategory(cat.id)}
                      className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        activeCategory === cat.id
                          ? 'bg-primary/15 text-primary border border-primary/30'
                          : 'text-muted-foreground border border-transparent hover:bg-muted/40'
                      }`}
                    >
                      {cat.icon} {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-3 sm:p-4 grid grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3 content-start">
                {filteredItems.length === 0 ? (
                  <p className="col-span-full text-center text-sm text-muted-foreground py-8">
                    No items match your search.
                  </p>
                ) : (
                  filteredItems.map((item) => {
                    const multiSize = (item.sizes?.filter((s) => s.label?.trim()).length ?? 0) > 1;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleMenuItemClick(item)}
                        className="text-left p-3 rounded-xl border border-border bg-muted/20 hover:bg-muted/45 hover:border-primary/25 transition-all active:scale-[0.98]"
                      >
                        <div className="flex items-start justify-between gap-1 mb-1">
                          {item.popular ? (
                            <Star size={11} className="text-amber-400 flex-shrink-0 mt-0.5" fill="currentColor" />
                          ) : (
                            <span className="w-3" />
                          )}
                          {multiSize ? (
                            <span className="text-[9px] uppercase tracking-wide text-muted-foreground font-semibold">
                              Sizes
                            </span>
                          ) : null}
                        </div>
                        <p className="text-sm font-medium text-foreground leading-snug line-clamp-2">{item.name}</p>
                        {!multiSize && item.sizes?.[0]?.label ? (
                          <p className="text-[10px] text-muted-foreground mt-0.5">{item.sizes[0].label}</p>
                        ) : null}
                        <p className="text-xs text-primary font-semibold mt-1.5">{menuItemPriceLabel(item)}</p>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Cart */}
            <div className="w-full sm:w-[min(100%,22rem)] flex flex-col flex-shrink-0 border-t sm:border-t-0 sm:border-l border-border bg-muted/10">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border/80">
                <div className="flex items-center gap-2">
                  <ShoppingCart size={16} className="text-primary" />
                  <span className="text-sm font-semibold text-foreground">Your selection</span>
                </div>
                {cart.length > 0 ? (
                  <button
                    type="button"
                    onClick={clearCart}
                    className="text-[11px] font-medium text-rose-400 hover:text-rose-300 flex items-center gap-1"
                  >
                    <Trash2 size={12} />
                    Clear all
                  </button>
                ) : null}
              </div>

              <div
                className={`relative px-3 py-2 overscroll-contain ${
                  cart.length > CART_VISIBLE_MAX ? 'overflow-y-auto scrollbar-thin' : 'overflow-hidden'
                } ${
                  cartListViewportHeight == null ? 'min-h-[calc(5.75rem*4+0.5rem*3)]' : ''
                }`}
                style={
                  cartListViewportHeight != null
                    ? {
                        height: cartListViewportHeight,
                        minHeight: cartListViewportHeight,
                        maxHeight: cartListViewportHeight,
                      }
                    : undefined
                }
              >
                <CartLineHeightProbe measureRef={cartLineMeasureRef} />
                {cart.length === 0 ? (
                  <div className="flex h-full min-h-[inherit] items-center justify-center text-center px-2">
                    <div>
                      <ShoppingCart size={28} className="mx-auto text-muted-foreground/40 mb-2" />
                      <p className="text-xs text-muted-foreground">Tap menu items to add them here.</p>
                      <p className="text-[10px] text-muted-foreground/80 mt-1">
                        Multi-size drinks will ask you to pick a size first.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                  {cart.map((entry) => {
                    const key = cartLineKey(entry.menuItem.id, entry.sizeIndex);
                    const unit = linePrice(entry.menuItem, entry.sizeIndex);
                    const sizeLabel = lineSizeLabel(entry.menuItem, entry.sizeIndex);
                    return (
                      <div
                        key={key}
                        className={cartLineCardClass}
                      >
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-foreground leading-snug">
                              {entry.menuItem.name}
                            </p>
                            {sizeLabel ? (
                              <p className="text-[10px] font-medium text-primary mt-0.5">{sizeLabel}</p>
                            ) : null}
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              ${unit.toFixed(2)} each
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeFromCart(entry.menuItem.id, entry.sizeIndex)}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10"
                            title="Remove from selection"
                          >
                            <X size={14} />
                          </button>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/30 p-0.5">
                            <button
                              type="button"
                              onClick={() => updateCartQty(entry.menuItem.id, entry.sizeIndex, -1)}
                              className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-muted/60 text-foreground"
                              aria-label="Decrease quantity"
                            >
                              <Minus size={14} />
                            </button>
                            <span className="w-8 text-center text-sm font-semibold tabular-nums">{entry.qty}</span>
                            <button
                              type="button"
                              onClick={() => updateCartQty(entry.menuItem.id, entry.sizeIndex, 1)}
                              className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-muted/60 text-foreground"
                              aria-label="Increase quantity"
                            >
                              <Plus size={14} />
                            </button>
                          </div>
                          <span className="text-sm font-semibold tabular-nums text-foreground">
                            ${(unit * entry.qty).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  </div>
                )}
              </div>

              <div className="p-4 border-t border-border space-y-2 bg-background/50">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{cartSummary.pieces} item{cartSummary.pieces !== 1 ? 's' : ''}</span>
                  <span className="font-semibold text-foreground text-sm tabular-nums">
                    ${cartSummary.total.toFixed(2)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => void handleSubmit()}
                  disabled={submitting || cart.length === 0}
                  className="w-full btn-primary rounded-xl py-3 font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {submitting ? 'Sending to kitchen…' : 'Send to kitchen'}
                  {!submitting && cart.length > 0 ? <ChevronRight size={16} /> : null}
                </button>
                <p className="text-[10px] text-center text-muted-foreground">
                  Review size and quantity before sending. Use ✕ to remove a line.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Size picker */}
      {sizePickerItem ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div
            className="w-full max-w-sm rounded-2xl border border-border bg-background shadow-2xl p-4 space-y-3"
            role="dialog"
            aria-labelledby="size-picker-title"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p id="size-picker-title" className="text-sm font-semibold text-foreground">
                  Choose size
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{sizePickerItem.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setSizePickerItem(null)}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground"
              >
                <X size={16} />
              </button>
            </div>
            <div className="space-y-2">
              {(sizePickerItem.sizes ?? []).map((size, idx) => (
                <button
                  key={`${sizePickerItem.id}-${size.label}-${idx}`}
                  type="button"
                  onClick={() => {
                    addToCart(sizePickerItem, idx);
                    setSizePickerItem(null);
                    toast.success(`${sizePickerItem.name} · ${size.label}`);
                  }}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-border hover:border-primary/40 hover:bg-primary/5 transition-all text-left"
                >
                  <span className="text-sm font-medium text-foreground">{size.label}</span>
                  <span className="text-sm font-semibold text-primary tabular-nums">
                    ${size.price.toFixed(2)}
                  </span>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setSizePickerItem(null)}
              className="w-full py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
