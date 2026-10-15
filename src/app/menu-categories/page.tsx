'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import TopNav from '@/components/TopNav';
import LockModal from '@/components/LockModal';
import Link from 'next/link';
import {
  Tag, Plus, Search, Edit2, Trash2, X, CheckCircle2,
  RefreshCw, Layers, Eye, EyeOff, UtensilsCrossed,
} from 'lucide-react';
import { menuCategoryApi } from '@/lib/api/client';
import type { MenuCategory, CreateMenuCategoryRequest } from '@/lib/api/types';
import { toast } from 'sonner';

const ICON_PRESETS = ['🍹', '🥃', '🍾', '🍺', '🍽️', '💨', '🍸', '🧃', '🍔', '☕'];

interface CategoryFormData {
  label: string;
  icon: string;
  sortOrder: string;
  isActive: boolean;
}

const EMPTY_FORM: CategoryFormData = {
  label: '',
  icon: '🍸',
  sortOrder: '',
  isActive: true,
};

export default function MenuCategoriesPage() {
  const [lockOpen, setLockOpen] = useState(false);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<MenuCategory | null>(null);
  const [form, setForm] = useState<CategoryFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const fetchCategories = useCallback(async () => {
    setLoading(true);
    try {
      const data = await menuCategoryApi.list();
      setCategories(data.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)));
    } catch {
      setCategories([]);
      toast.error('Failed to load categories');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchCategories();
  }, [fetchCategories]);

  const stats = useMemo(() => ({
    total: categories.length,
    active: categories.filter((c) => c.isActive !== false).length,
    inactive: categories.filter((c) => c.isActive === false).length,
  }), [categories]);

  const filtered = categories.filter((cat) => {
    const q = search.toLowerCase();
    return (
      cat.label.toLowerCase().includes(q) ||
      cat.id.toLowerCase().includes(q)
    );
  });

  const openCreate = () => {
    setEditingCategory(null);
    setForm(EMPTY_FORM);
    setDrawerOpen(true);
  };

  const openEdit = (cat: MenuCategory) => {
    setEditingCategory(cat);
    setForm({
      label: cat.label,
      icon: cat.icon || '🍸',
      sortOrder: cat.sortOrder != null ? String(cat.sortOrder) : '',
      isActive: cat.isActive !== false,
    });
    setDrawerOpen(true);
  };

  const handleSave = async () => {
    if (!form.label.trim()) {
      toast.error('Category label is required');
      return;
    }

    const sortOrder = form.sortOrder.trim() ? parseInt(form.sortOrder, 10) : undefined;
    if (form.sortOrder.trim() && Number.isNaN(sortOrder)) {
      toast.error('Sort order must be a number');
      return;
    }

    const payload: CreateMenuCategoryRequest = {
      label: form.label.trim(),
      icon: form.icon || '🍸',
      sortOrder,
      isActive: form.isActive,
    };

    setSaving(true);
    try {
      if (editingCategory) {
        const updated = await menuCategoryApi.update(editingCategory.id, payload);
        setCategories((prev) =>
          prev
            .map((c) => (c.id === editingCategory.id ? updated : c))
            .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
        );
        toast.success('Category updated');
      } else {
        const created = await menuCategoryApi.create(payload);
        setCategories((prev) =>
          [...prev, created].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
        );
        toast.success('Category created');
      }
      setDrawerOpen(false);
      setEditingCategory(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save category');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await menuCategoryApi.delete(id);
      setCategories((prev) => prev.filter((c) => c.id !== id));
      toast.success('Category deleted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete category');
    }
    setDeleteConfirm(null);
  };

  const toggleActive = async (cat: MenuCategory) => {
    const next = cat.isActive === false;
    try {
      const updated = await menuCategoryApi.update(cat.id, { isActive: next });
      setCategories((prev) => prev.map((c) => (c.id === cat.id ? updated : c)));
      toast.success(next ? 'Category activated' : 'Category deactivated');
    } catch {
      toast.error('Failed to update category');
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <TopNav onLockTerminal={() => setLockOpen(true)} />
      <LockModal isOpen={lockOpen} onClose={() => setLockOpen(false)} onUnlock={() => setLockOpen(false)} />

      <div className="max-w-screen-xl mx-auto px-3 md:px-6 py-4 md:py-6 space-y-4 md:space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div
              className="w-9 md:w-10 h-9 md:h-10 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.3)' }}
            >
              <Tag size={18} className="text-purple-400" />
            </div>
            <div>
              <h1 className="text-base md:text-lg font-semibold text-foreground">Categories</h1>
              <p className="text-xs text-muted-foreground">
                Create, edit, and remove menu categories (used by menu items)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href="/post-items"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-muted/50 border border-border text-xs text-muted-foreground hover:text-foreground transition-all"
            >
              <UtensilsCrossed size={13} />
              Back to Post Items
            </Link>
            <button
              onClick={() => void fetchCategories()}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-muted/50 border border-border text-xs text-muted-foreground hover:text-foreground transition-all disabled:opacity-50"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
            <button
              onClick={openCreate}
              className="flex items-center gap-1.5 px-3 md:px-4 py-2 rounded-xl text-xs md:text-sm font-semibold transition-all"
              style={{ background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.35)', color: '#c084fc' }}
            >
              <Plus size={14} />
              Add Category
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Total', value: stats.total, icon: <Layers size={16} />, color: '#a855f7' },
            { label: 'Active', value: stats.active, icon: <Eye size={16} />, color: '#10b981' },
            { label: 'Inactive', value: stats.inactive, icon: <EyeOff size={16} />, color: '#64748b' },
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

        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search categories…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-muted/30 border border-border rounded-xl pl-9 pr-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
          />
        </div>

        {loading ? (
          <div className="glass-card rounded-xl border border-border p-12 text-center text-muted-foreground text-sm">
            Loading categories…
          </div>
        ) : filtered.length === 0 ? (
          <div className="glass-card rounded-xl border border-border p-12 text-center">
            <Tag size={32} className="text-muted-foreground mx-auto mb-3 opacity-50" />
            <p className="text-foreground font-medium">No categories yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Add Cocktails, Spirits, Bites, etc. before posting menu items.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((cat) => (
              <div
                key={cat.id}
                className={`glass-card rounded-xl border p-4 transition-all ${
                  cat.isActive === false ? 'opacity-60 border-border' : 'border-border hover:border-primary/20'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-2xl">{cat.icon || '🍸'}</span>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-foreground truncate">{cat.label}</p>
                      <p className="text-[10px] text-muted-foreground font-mono">{cat.id}</p>
                    </div>
                  </div>
                  {cat.isActive === false && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-500/15 text-slate-400 border border-slate-500/25 shrink-0">
                      Inactive
                    </span>
                  )}
                </div>

                {cat.sortOrder != null && (
                  <p className="text-xs text-muted-foreground mb-3">Sort order: {cat.sortOrder}</p>
                )}

                <div className="flex items-center gap-1.5 pt-2 border-t border-border">
                  <button
                    onClick={() => void toggleActive(cat)}
                    className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
                  >
                    {cat.isActive === false ? <EyeOff size={12} /> : <Eye size={12} />}
                    {cat.isActive === false ? 'Activate' : 'Deactivate'}
                  </button>
                  <button
                    onClick={() => openEdit(cat)}
                    className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
                  >
                    <Edit2 size={12} /> Edit
                  </button>
                  {deleteConfirm === cat.id ? (
                    <div className="flex items-center gap-1 ml-auto">
                      <button
                        onClick={() => void handleDelete(cat.id)}
                        className="px-2 py-1 rounded text-xs bg-rose-500 text-white font-medium"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(null)}
                        className="px-2 py-1 rounded text-xs text-muted-foreground"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeleteConfirm(cat.id)}
                      className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 transition-all ml-auto"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="modal-overlay absolute inset-0" onClick={() => setDrawerOpen(false)} />
          <div className="relative w-full max-w-md glass-card-elevated border-l border-border h-full overflow-y-auto slide-up">
            <div className="p-5 md:p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-base font-semibold text-foreground">
                    {editingCategory ? 'Edit Category' : 'Add Category'}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    POST /api/menu/categories
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
                  <label className="text-xs font-medium text-muted-foreground block mb-1.5">Label *</label>
                  <input
                    value={form.label}
                    onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))}
                    className="w-full bg-input border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary"
                    placeholder="Cocktails"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1.5">Icon</label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {ICON_PRESETS.map((icon) => (
                      <button
                        key={icon}
                        type="button"
                        onClick={() => setForm((p) => ({ ...p, icon }))}
                        className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center border transition-all ${
                          form.icon === icon
                            ? 'border-primary bg-primary/10'
                            : 'border-border hover:border-primary/40'
                        }`}
                      >
                        {icon}
                      </button>
                    ))}
                  </div>
                  <input
                    value={form.icon}
                    onChange={(e) => setForm((p) => ({ ...p, icon: e.target.value }))}
                    className="w-full bg-input border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary"
                    placeholder="🍸"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1.5">Sort order</label>
                  <input
                    type="number"
                    min="0"
                    value={form.sortOrder}
                    onChange={(e) => setForm((p) => ({ ...p, sortOrder: e.target.value }))}
                    className="w-full bg-input border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary"
                    placeholder="1"
                  />
                </div>

                <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))}
                    className="rounded border-border"
                  />
                  Active on menu
                </label>

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
                        {editingCategory ? 'Save Changes' : 'Create Category'}
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
