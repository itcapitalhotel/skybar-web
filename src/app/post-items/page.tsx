'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import TopNav from '@/components/TopNav';
import LockModal from '@/components/LockModal';
import Link from 'next/link';
import {
  UtensilsCrossed, Plus, Search, Edit2, Trash2, X, CheckCircle2,
  Star, Eye, EyeOff, RefreshCw, Tag, Layers,
} from 'lucide-react';
import { menuApi } from '@/lib/api/client';
import type { ApiMenuItem, MenuCategory, MenuItemSize } from '@/lib/api/types';
import { toast } from 'sonner';

interface SizeRow {
  key: string;
  label: string;
  price: string;
}

interface ItemFormData {
  name: string;
  categoryId: string;
  description: string;
  popular: boolean;
  available: boolean;
  sizes: SizeRow[];
}

function newSizeRow(label = '', price = ''): SizeRow {
  return { key: `size-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, label, price };
}

const EMPTY_FORM: ItemFormData = {
  name: '',
  categoryId: '',
  description: '',
  popular: false,
  available: true,
  sizes: [newSizeRow('Single', ''), newSizeRow('Double', '')],
};

function formatPriceRange(sizes: MenuItemSize[] | undefined): string {
  if (!sizes?.length) return '—';
  const prices = sizes.map((s) => s.price).filter((p) => p != null);
  if (!prices.length) return '—';
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  if (min === max) return `$${min.toFixed(2)}`;
  return `$${min.toFixed(2)} – $${max.toFixed(2)}`;
}

function formToPayload(form: ItemFormData): Partial<ApiMenuItem> | null {
  const sizes: MenuItemSize[] = [];
  for (const row of form.sizes) {
    const label = row.label.trim();
    const price = parseFloat(row.price);
    if (!label && Number.isNaN(price)) continue;
    if (!label) {
      toast.error('Each size needs a label');
      return null;
    }
    if (Number.isNaN(price) || price < 0) {
      toast.error(`Enter a valid price for "${label}"`);
      return null;
    }
    sizes.push({ label, price });
  }

  if (!sizes.length) {
    toast.error('Add at least one size with label and price');
    return null;
  }

  return {
    name: form.name.trim(),
    categoryId: form.categoryId,
    description: form.description.trim() || undefined,
    sizes,
    popular: form.popular,
    available: form.available,
  };
}

export default function PostItemsPage() {
  const [lockOpen, setLockOpen] = useState(false);
  const [items, setItems] = useState<ApiMenuItem[]>([]);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('All');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ApiMenuItem | null>(null);
  const [form, setForm] = useState<ItemFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const fetchMenu = useCallback(async () => {
    setLoading(true);
    try {
      const [menuData, categoryData] = await Promise.all([
        menuApi.list(),
        menuApi.categories(),
      ]);
      setItems(menuData);
      setCategories(categoryData.filter((c) => c.isActive !== false));
    } catch {
      setItems([]);
      setCategories([]);
      toast.error('Failed to load menu');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchMenu();
  }, [fetchMenu]);

  const stats = useMemo(() => ({
    total: items.length,
    live: items.filter((i) => i.available !== false).length,
    hidden: items.filter((i) => i.available === false).length,
    popular: items.filter((i) => i.popular).length,
  }), [items]);

  const labelById = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.id, c.label])),
    [categories],
  );

  const categoryTabs = useMemo(
    () => [{ id: 'All', label: 'All' }, ...categories.map((c) => ({ id: c.id, label: c.label }))],
    [categories],
  );

  const filtered = items.filter((item) => {
    const q = search.toLowerCase();
    const catLabel = labelById[item.categoryId] ?? item.category;
    const matchSearch =
      item.name.toLowerCase().includes(q) ||
      catLabel.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q) ||
      (item.description?.toLowerCase().includes(q) ?? false);
    const matchCategory = filterCategory === 'All' || item.categoryId === filterCategory;
    return matchSearch && matchCategory;
  });

  const openCreate = () => {
    setEditingItem(null);
    setForm({
      ...EMPTY_FORM,
      categoryId: categories[0]?.id ?? '',
      sizes: [newSizeRow('Single', ''), newSizeRow('Double', '')],
    });
    setDrawerOpen(true);
  };

  const openEdit = (item: ApiMenuItem) => {
    setEditingItem(item);
    setForm({
      name: item.name,
      categoryId: item.categoryId,
      description: item.description ?? '',
      popular: Boolean(item.popular),
      available: item.available !== false,
      sizes: (item.sizes?.length ? item.sizes : [{ label: 'Single', price: 0 }]).map((s) =>
        newSizeRow(s.label, String(s.price)),
      ),
    });
    setDrawerOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.categoryId) {
      toast.error('Name and category are required');
      return;
    }

    const payload = formToPayload(form);
    if (!payload) return;

    setSaving(true);
    try {
      if (editingItem) {
        const updated = await menuApi.update(editingItem.id, payload);
        setItems((prev) => prev.map((i) => (i.id === editingItem.id ? updated : i)));
        toast.success('Menu item updated');
      } else {
        const created = await menuApi.create(payload);
        setItems((prev) => [created, ...prev]);
        toast.success('Menu item posted');
      }
      setDrawerOpen(false);
      setEditingItem(null);
    } catch {
      toast.error(editingItem ? 'Failed to update item' : 'Failed to post item');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await menuApi.delete(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
      toast.success('Menu item deleted');
    } catch {
      toast.error('Failed to delete item');
    }
    setDeleteConfirm(null);
  };

  const toggleAvailability = async (item: ApiMenuItem) => {
    const next = item.available === false;
    try {
      await menuApi.setAvailability(item.id, next);
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, available: next } : i)),
      );
      toast.success(next ? 'Item is now live on menu' : 'Item hidden from menu');
    } catch {
      toast.error('Failed to update availability');
    }
  };

  const updateSize = (key: string, field: 'label' | 'price', value: string) => {
    setForm((prev) => ({
      ...prev,
      sizes: prev.sizes.map((s) => (s.key === key ? { ...s, [field]: value } : s)),
    }));
  };

  const addSize = () => {
    setForm((prev) => ({ ...prev, sizes: [...prev.sizes, newSizeRow('', '')] }));
  };

  const removeSize = (key: string) => {
    setForm((prev) => ({
      ...prev,
      sizes: prev.sizes.length > 1 ? prev.sizes.filter((s) => s.key !== key) : prev.sizes,
    }));
  };

  return (
    <div className="min-h-screen bg-background">
      <TopNav onLockTerminal={() => setLockOpen(true)} />
      <LockModal isOpen={lockOpen} onClose={() => setLockOpen(false)} onUnlock={() => setLockOpen(false)} />

      <div className="max-w-screen-xl mx-auto px-3 md:px-6 py-4 md:py-6 space-y-4 md:space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div
              className="w-9 md:w-10 h-9 md:h-10 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(236,72,153,0.15)', border: '1px solid rgba(236,72,153,0.3)' }}
            >
              <UtensilsCrossed size={18} className="text-pink-400" />
            </div>
            <div>
              <h1 className="text-base md:text-lg font-semibold text-foreground">Post Items</h1>
              <p className="text-xs text-muted-foreground">
                Menu catalog hub — manage items here; open Zones or Categories when you need floor or menu structure
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href="/zone-management"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-muted/50 border border-border text-xs text-muted-foreground hover:text-foreground transition-all"
            >
              <Layers size={13} />
              Zones
            </Link>
            <Link
              href="/menu-categories"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-muted/50 border border-border text-xs text-muted-foreground hover:text-foreground transition-all"
            >
              <Tag size={13} />
              Categories
            </Link>
            <button
              onClick={() => void fetchMenu()}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-muted/50 border border-border text-xs text-muted-foreground hover:text-foreground transition-all disabled:opacity-50"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
            <button
              onClick={openCreate}
              className="flex items-center gap-1.5 px-3 md:px-4 py-2 rounded-xl text-xs md:text-sm font-semibold transition-all"
              style={{ background: 'rgba(236,72,153,0.15)', border: '1px solid rgba(236,72,153,0.35)', color: '#f472b6' }}
            >
              <Plus size={14} />
              Post Item
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Total Items', value: stats.total, icon: <Layers size={16} />, color: '#ec4899' },
            { label: 'Live on Menu', value: stats.live, icon: <Eye size={16} />, color: '#10b981' },
            { label: 'Hidden', value: stats.hidden, icon: <EyeOff size={16} />, color: '#64748b' },
            { label: 'Popular', value: stats.popular, icon: <Star size={16} />, color: '#f59e0b' },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-2xl p-4 glass-card border"
              style={{ borderColor: `${stat.color}25` }}
            >
              <div className="flex items-center gap-2 mb-2" style={{ color: stat.color }}>
                {stat.icon}
                <span className="text-xs font-medium text-muted-foreground">{stat.label}</span>
              </div>
              <p className="text-2xl font-bold text-foreground">{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Search + category pills */}
        <div className="space-y-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search name, category, description…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-muted/30 border border-border rounded-xl pl-9 pr-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
            />
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-1">
            {categoryTabs.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setFilterCategory(cat.id)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  filterCategory === cat.id
                    ? 'bg-primary/15 text-primary border border-primary/30'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50 border border-transparent'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        {loading ? (
          <div className="glass-card rounded-xl border border-border p-12 text-center text-muted-foreground text-sm">
            Loading menu…
          </div>
        ) : filtered.length === 0 ? (
          <div className="glass-card rounded-xl border border-border p-12 text-center">
            <UtensilsCrossed size={32} className="text-muted-foreground mx-auto mb-3 opacity-50" />
            <p className="text-foreground font-medium">No menu items found</p>
            <p className="text-sm text-muted-foreground mt-1">Post an item with one or more sizes (Single, Double, etc.)</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((item) => (
              <div
                key={item.id}
                className={`glass-card rounded-xl border p-4 transition-all ${
                  item.available === false ? 'opacity-65 border-border' : 'border-border hover:border-primary/20'
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-start gap-3 md:gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className="font-semibold text-sm md:text-base text-foreground">{item.name}</h3>
                      <span
                        className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border"
                        style={{ background: 'rgba(100,116,139,0.12)', borderColor: 'rgba(100,116,139,0.25)', color: '#94a3b8' }}
                      >
                        <Tag size={9} />
                        {labelById[item.categoryId] ?? item.category}
                      </span>
                      {item.popular && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/25">
                          <Star size={9} /> Popular
                        </span>
                      )}
                      {item.available === false && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-500/15 text-slate-400 border border-slate-500/25">
                          Hidden
                        </span>
                      )}
                    </div>
                    {item.description && (
                      <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{item.description}</p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {(item.sizes ?? []).map((size) => (
                        <span
                          key={`${item.id}-${size.label}`}
                          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg bg-muted/40 border border-border"
                        >
                          <span className="text-muted-foreground">{size.label}</span>
                          <span className="font-semibold text-primary">${size.price.toFixed(2)}</span>
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 md:flex-col md:items-end shrink-0">
                    <p className="text-sm font-bold text-foreground md:mb-1">{formatPriceRange(item.sizes)}</p>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => void toggleAvailability(item)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
                      >
                        {item.available === false ? <EyeOff size={12} /> : <Eye size={12} />}
                        {item.available === false ? 'Show' : 'Hide'}
                      </button>
                      <button
                        onClick={() => openEdit(item)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
                      >
                        <Edit2 size={12} /> Edit
                      </button>
                      {deleteConfirm === item.id ? (
                        <>
                          <button
                            onClick={() => void handleDelete(item.id)}
                            className="px-2 py-1.5 rounded-lg text-xs bg-rose-500 text-white font-medium"
                          >
                            Delete
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(null)}
                            className="px-2 py-1.5 rounded-lg text-xs text-muted-foreground"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirm(item.id)}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 transition-all"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="modal-overlay absolute inset-0" onClick={() => setDrawerOpen(false)} />
          <div className="relative w-full max-w-lg glass-card-elevated border-l border-border h-full overflow-y-auto slide-up">
            <div className="p-5 md:p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-base font-semibold text-foreground">
                    {editingItem ? 'Edit Menu Item' : 'Post Menu Item'}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    POST /api/menu — name, categoryId, sizes &amp; prices
                  </p>
                </div>
                <button
                  onClick={() => setDrawerOpen(false)}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1.5">Item name *</label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                    className="w-full bg-input border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary"
                    placeholder="Signature Sunset"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1.5">Category *</label>
                  {categories.length === 0 ? (
                    <p className="text-xs text-amber-400 mb-2">
                      No categories yet.{' '}
                      <Link href="/menu-categories" className="underline hover:text-amber-300">
                        Create categories first
                      </Link>
                    </p>
                  ) : null}
                  <select
                    value={form.categoryId}
                    onChange={(e) => setForm((p) => ({ ...p, categoryId: e.target.value }))}
                    className="w-full bg-input border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary"
                  >
                    <option value="">Select category</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.icon} {cat.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1.5">Description</label>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                    rows={3}
                    className="w-full bg-input border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary resize-none"
                    placeholder="Passionfruit, mango, prosecco…"
                  />
                </div>

                {/* Sizes */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-medium text-muted-foreground">Sizes &amp; prices *</label>
                    <button
                      type="button"
                      onClick={addSize}
                      className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium"
                    >
                      <Plus size={12} /> Add size
                    </button>
                  </div>
                  <div className="space-y-2">
                    {form.sizes.map((size, idx) => (
                      <div key={size.key} className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground w-4 shrink-0">{idx + 1}</span>
                        <input
                          value={size.label}
                          onChange={(e) => updateSize(size.key, 'label', e.target.value)}
                          className="flex-1 bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
                          placeholder="Single"
                        />
                        <div className="relative w-28 shrink-0">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">$</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={size.price}
                            onChange={(e) => updateSize(size.key, 'price', e.target.value)}
                            className="w-full bg-input border border-border rounded-lg pl-6 pr-2 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
                            placeholder="22.00"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => removeSize(size.key)}
                          disabled={form.sizes.length <= 1}
                          className="p-2 rounded-lg text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 disabled:opacity-30 disabled:pointer-events-none"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-2">
                    e.g. Single $22 · Double $38 — matches MenuItemResponse.sizes[]
                  </p>
                </div>

                <div className="flex flex-wrap gap-4 pt-1">
                  <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.popular}
                      onChange={(e) => setForm((p) => ({ ...p, popular: e.target.checked }))}
                      className="rounded border-border"
                    />
                    Popular item
                  </label>
                  <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.available}
                      onChange={(e) => setForm((p) => ({ ...p, available: e.target.checked }))}
                      className="rounded border-border"
                    />
                    Available on menu
                  </label>
                </div>

                <div className="pt-3 flex gap-3 border-t border-border">
                  <button
                    type="button"
                    onClick={() => setDrawerOpen(false)}
                    className="flex-1 btn-ghost rounded-xl py-2.5 text-sm font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSave()}
                    disabled={saving}
                    className="flex-1 btn-primary rounded-xl py-2.5 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    {saving ? (
                      <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                    ) : (
                      <>
                        <CheckCircle2 size={15} />
                        {editingItem ? 'Save Changes' : 'Post Item'}
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
