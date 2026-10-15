'use client';

import React, { useState, useEffect } from 'react';
import TopNav from '@/components/TopNav';
import LockModal from '@/components/LockModal';
import ManagerPinModal from '@/components/ManagerPinModal';
import { Settings, Percent, Printer, BookOpen, Save, RotateCcw, CheckCircle, ChevronRight, Wifi, Globe, FileText, Plus, Trash2, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { configApi, zonesApi } from '@/lib/api/client';
import type { VenueConfig, ZoneData, ZonePrinter } from '@/lib/api/types';
import { validatePrinterEndpoint } from '@/lib/printerValidate';
import {
  idlePingSlots,
  pingSummary,
  PRINTER_PING_COUNT,
  runTcpPrinterPingSeries,
  type PingSlot,
} from '@/lib/printerTcpTest';
import { PrinterPingIndicators } from '@/app/admin-config/PrinterPingIndicators';
import { CategoryPrinterSettings } from '@/app/admin-config/CategoryPrinterRouting';
import { ReceiptLayoutReviewer } from '@/app/admin-config/ReceiptLayoutReviewer';

interface ConfigState {
  serviceCharge: string;
  vatRate: string;
  currency: string;
  currencySymbol: string;
  printerIp: string;
  printerPort: string;
  houseRules: string;
  receiptHeader: string;
  receiptFooter: string;
}

interface ZonePrinterGroup {
  zoneId: string;
  zoneName: string;
  zoneColor: string;
  printers: ZonePrinter[];
}

const CURRENCIES = [
  { code: 'USD', symbol: '$', label: 'US Dollar' },
  { code: 'EUR', symbol: '€', label: 'Euro' },
  { code: 'GBP', symbol: '£', label: 'British Pound' },
  { code: 'THB', symbol: '฿', label: 'Thai Baht' },
  { code: 'SGD', symbol: 'S$', label: 'Singapore Dollar' },
  { code: 'AED', symbol: 'د.إ', label: 'UAE Dirham' },
  { code: 'JPY', symbol: '¥', label: 'Japanese Yen' },
  { code: 'AUD', symbol: 'A$', label: 'Australian Dollar' },
];

const DEFAULT_CONFIG: ConfigState = {
  serviceCharge: '10',
  vatRate: '7',
  currency: 'USD',
  currencySymbol: '$',
  printerIp: '192.168.1.100',
  printerPort: '9100',
  houseRules: `Welcome to SkyBar Rooftop Lounge.\n\n1. Minimum spend applies to all VIP and Cabana tables.\n2. Management reserves the right to refuse service.\n3. No outside food or beverages permitted.\n4. Dress code strictly enforced — smart casual required.\n5. Last orders at 1:30 AM. Venue closes at 2:00 AM.\n6. All prices include applicable taxes and service charge.\n7. Guests are responsible for their personal belongings.\n8. Photography for personal use only — no commercial shoots without prior approval.`,
  receiptHeader: 'SkyBar Rooftop Lounge\nLevel 32, Skyline Tower\nTel: +1 (555) 987-6543',
  receiptFooter: 'Thank you for visiting SkyBar!\nFollow us @SkyBarLounge',
};

function isDraftZonePrinterId(printerId: string): boolean {
  return printerId.startsWith('draft-');
}

function newDraftZonePrinter(zoneId: string, index: number, isDefault: boolean): ZonePrinter {
  return {
    id: `draft-${zoneId}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    zoneId,
    name: `Printer ${index}`,
    printerIp: '',
    printerPort: 9100,
    isDefault,
  };
}
type ActiveSection = 'charges' | 'currency' | 'printer' | 'categoryPrinter' | 'rules' | 'receipt';

export default function AdminConfigPage() {
  const [isLocked, setIsLocked] = useState(false);
  const [showManagerPin, setShowManagerPin] = useState(false);
  const [config, setConfig] = useState<ConfigState>(DEFAULT_CONFIG);
  const [saved, setSaved] = useState<ConfigState>(DEFAULT_CONFIG);
  const [activeSection, setActiveSection] = useState<ActiveSection>('charges');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [defaultPingSlots, setDefaultPingSlots] = useState<PingSlot[]>(idlePingSlots);
  const [defaultPingRunning, setDefaultPingRunning] = useState(false);
  const [defaultPingDetail, setDefaultPingDetail] = useState<string | null>(null);

  // Zone printers state — each zone has an array of printers
  const [zonePrinters, setZonePrinters] = useState<ZonePrinterGroup[]>([]);
  const [zonePrintersLoading, setZonePrintersLoading] = useState(true);
  const [zonePingSlots, setZonePingSlots] = useState<Record<string, PingSlot[]>>({});
  const [zonePingRunning, setZonePingRunning] = useState<Record<string, boolean>>({});
  const [zonePingDetail, setZonePingDetail] = useState<Record<string, string>>({});
  const [routingReloadToken, setRoutingReloadToken] = useState(0);

  // ── Fetch config from API ─────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    configApi.get()
      .then((data: VenueConfig) => {
        if (!cancelled) {
          setConfig(data as ConfigState);
          setSaved(data as ConfigState);
        }
      })
      .catch(() => { /* keep DEFAULT_CONFIG */ });
    return () => { cancelled = true; };
  }, []);

  const loadZonePrinters = React.useCallback(async () => {
    setZonePrintersLoading(true);
    try {
      const zones = await zonesApi.list();
      const groups = await Promise.all(
        zones.map(async (z: ZoneData) => {
          let printers: ZonePrinter[] = [];
          try {
            printers = await zonesApi.getPrinters(z.id);
          } catch {
            printers = [];
          }
          return {
            zoneId: z.id,
            zoneName: z.label,
            zoneColor: z.color,
            printers,
          };
        }),
      );
      setZonePrinters(groups);
    } catch {
      setZonePrinters([]);
      toast.error('Could not load zone printers');
    } finally {
      setZonePrintersLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadZonePrinters();
  }, [loadZonePrinters]);

  useEffect(() => {
    if (activeSection === 'categoryPrinter') {
      setRoutingReloadToken((t) => t + 1);
    }
  }, [activeSection]);

  const hasChanges = JSON.stringify(config) !== JSON.stringify(saved);

  const handleSave = async () => {
    setSaveStatus('saving');
    try {
      await configApi.update(config as Partial<VenueConfig>);
      setSaved({ ...config });
      setSaveStatus('saved');
    } catch {
      setSaved({ ...config });
      setSaveStatus('saved');
    }
    setTimeout(() => setSaveStatus('idle'), 2500);
  };

  const handleReset = () => {
    setConfig({ ...saved });
  };

  const handleTestPrinter = async () => {
    if (defaultPingRunning) return;
    const pre = validatePrinterEndpoint(config.printerIp, config.printerPort);
    if (!pre.ok) {
      toast.error(pre.error);
      setDefaultPingSlots(Array.from({ length: PRINTER_PING_COUNT }, () => 'fail' as PingSlot));
      setDefaultPingDetail(pre.error);
      return;
    }
    setDefaultPingRunning(true);
    setDefaultPingDetail(null);
    setDefaultPingSlots(idlePingSlots().map(() => 'idle'));
    try {
      await runTcpPrinterPingSeries(config.printerIp, config.printerPort, (index, slot) => {
        setDefaultPingSlots(prev => {
          const next = [...prev];
          next[index] = slot;
          return next;
        });
      }, ({ lastMessage, okCount }) => {
        setDefaultPingDetail(
          okCount === 0
            ? `${lastMessage} — TCP ${config.printerPort} on ${config.printerIp} (not ICMP ping).`
            : `${lastMessage} (${okCount}/${PRINTER_PING_COUNT} TCP OK)`,
        );
      });
    } finally {
      setDefaultPingRunning(false);
    }
  };

  const flushZonePrinter = async (zoneId: string, printer: ZonePrinter) => {
    const port = Number(printer.printerPort) || 9100;
    const endpoint = validatePrinterEndpoint(printer.printerIp, port);
    if (!endpoint.ok) {
      if (printer.printerIp.trim()) {
        throw new Error(endpoint.error);
      }
      return printer;
    }

    if (isDraftZonePrinterId(printer.id)) {
      const created = await zonesApi.addPrinter(zoneId, {
        name: printer.name.trim() || 'Printer',
        printerIp: printer.printerIp.trim(),
        printerPort: port,
        isDefault: printer.isDefault,
      });
      setZonePrinters(prev =>
        prev.map(zp =>
          zp.zoneId === zoneId
            ? { ...zp, printers: zp.printers.map(p => (p.id === printer.id ? created : p)) }
            : zp,
        ),
      );
      return created;
    }

    const updated = await zonesApi.updatePrinter(zoneId, printer.id, {
      name: printer.name.trim() || 'Printer',
      printerIp: printer.printerIp.trim(),
      printerPort: port,
      isDefault: printer.isDefault,
    });
    setZonePrinters(prev =>
      prev.map(zp =>
        zp.zoneId === zoneId
          ? { ...zp, printers: zp.printers.map(p => (p.id === printer.id ? updated : p)) }
          : zp,
      ),
    );
    return updated;
  };

  const handleTestZonePrinter = async (zoneId: string, printerId: string) => {
    const zone = zonePrinters.find(z => z.zoneId === zoneId);
    const printer = zone?.printers.find(p => p.id === printerId);
    if (!printer) return;
    const key = `${zoneId}:${printerId}`;
    if (zonePingRunning[key]) return;
    setZonePingRunning(prev => ({ ...prev, [key]: true }));
    setZonePingSlots(prev => ({ ...prev, [key]: idlePingSlots() }));
    setZonePingDetail(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    try {
      let ip = printer.printerIp.trim();
      let port = printer.printerPort;
      if (ip) {
        const saved = await flushZonePrinter(zoneId, printer);
        ip = saved.printerIp.trim();
        port = saved.printerPort;
      }
      const pre = validatePrinterEndpoint(ip, port);
      if (!pre.ok) {
        toast.error(pre.error);
        setZonePingSlots(prev => ({
          ...prev,
          [key]: Array.from({ length: PRINTER_PING_COUNT }, () => 'fail' as PingSlot),
        }));
        setZonePingDetail(prev => ({ ...prev, [key]: pre.error }));
        return;
      }
      await runTcpPrinterPingSeries(ip, port, (index, slot) => {
        setZonePingSlots(prev => {
          const current = prev[key] ?? idlePingSlots();
          const next = [...current];
          next[index] = slot;
          return { ...prev, [key]: next };
        });
      }, ({ lastMessage, okCount }) => {
        setZonePingDetail(prev => ({
          ...prev,
          [key]:
            okCount === 0
              ? `${lastMessage} — TCP ${port} on ${ip} (not ICMP ping).`
              : `${lastMessage} (${okCount}/${PRINTER_PING_COUNT} TCP OK)`,
        }));
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Printer test failed');
    } finally {
      setZonePingRunning(prev => ({ ...prev, [key]: false }));
    }
  };

  const updatePrinterField = (
    zoneId: string,
    printerId: string,
    field: 'name' | 'printerIp' | 'printerPort',
    value: string,
  ) => {
    setZonePrinters(prev =>
      prev.map(zp =>
        zp.zoneId === zoneId
          ? {
              ...zp,
              printers: zp.printers.map(p =>
                p.id === printerId
                  ? {
                      ...p,
                      [field]: field === 'printerPort' ? Number(value) || 9100 : value,
                    }
                  : p,
              ),
            }
          : zp,
      ),
    );
  };

  const handlePrinterFieldBlur = (zoneId: string, printerId: string) => {
    const zone = zonePrinters.find(z => z.zoneId === zoneId);
    const printer = zone?.printers.find(p => p.id === printerId);
    if (!printer) return;
    const wasDraft = isDraftZonePrinterId(printerId);
    void flushZonePrinter(zoneId, printer)
      .then(saved => {
        if (wasDraft && !isDraftZonePrinterId(saved.id)) {
          toast.success('Printer saved to zone');
        }
      })
      .catch(err => {
        toast.error(err instanceof Error ? err.message : 'Could not save printer');
      });
  };

  const setZonePrinterDefault = (zoneId: string, printerId: string) => {
    if (isDraftZonePrinterId(printerId)) {
      setZonePrinters(prev =>
        prev.map(zp =>
          zp.zoneId === zoneId
            ? {
                ...zp,
                printers: zp.printers.map(p => ({
                  ...p,
                  isDefault: p.id === printerId,
                })),
              }
            : zp,
        ),
      );
      return;
    }
    void (async () => {
      try {
        await zonesApi.updatePrinter(zoneId, printerId, { isDefault: true });
        const list = await zonesApi.getPrinters(zoneId);
        setZonePrinters(prev =>
          prev.map(zp => (zp.zoneId === zoneId ? { ...zp, printers: list } : zp)),
        );
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not set default printer');
      }
    })();
  };

  const addPrinterToZone = (zoneId: string) => {
    const zone = zonePrinters.find(z => z.zoneId === zoneId);
    const count = zone?.printers.length ?? 0;
    const draft = newDraftZonePrinter(zoneId, count + 1, count === 0);
    setZonePrinters(prev =>
      prev.map(zp => (zp.zoneId === zoneId ? { ...zp, printers: [...zp.printers, draft] } : zp)),
    );
  };

  const removePrinterFromZone = (zoneId: string, printerId: string) => {
    if (isDraftZonePrinterId(printerId)) {
      setZonePrinters(prev =>
        prev.map(zp =>
          zp.zoneId === zoneId
            ? { ...zp, printers: zp.printers.filter(p => p.id !== printerId) }
            : zp,
        ),
      );
      return;
    }
    void (async () => {
      try {
        await zonesApi.deletePrinter(zoneId, printerId);
        setZonePrinters(prev =>
          prev.map(zp =>
            zp.zoneId === zoneId
              ? { ...zp, printers: zp.printers.filter(p => p.id !== printerId) }
              : zp,
          ),
        );
        toast.success('Printer removed');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not remove printer');
      }
    })();
  };

  const handleCurrencyChange = (code: string) => {
    const found = CURRENCIES.find(c => c.code === code);
    if (found) setConfig(p => ({ ...p, currency: found.code, currencySymbol: found.symbol }));
  };

  const SECTIONS: { id: ActiveSection; label: string; icon: React.ReactNode; desc: string }[] = [
    { id: 'charges', label: 'Charges & Tax', icon: <Percent size={16} />, desc: 'Service charge & VAT rates' },
    { id: 'currency', label: 'Currency', icon: <Globe size={16} />, desc: 'Display currency & symbol' },
    { id: 'printer', label: 'Receipt Printer', icon: <Printer size={16} />, desc: 'Printer IP & port config' },
    { id: 'categoryPrinter', label: 'Category Printer', icon: <Link2 size={16} />, desc: 'Name / IP / port per menu category' },
    { id: 'rules', label: 'House Rules', icon: <BookOpen size={16} />, desc: 'Venue policies & rules' },
    { id: 'receipt', label: 'Receipt Layout', icon: <FileText size={16} />, desc: 'Header, footer & preview' },
  ];

  return (
    <div className="min-h-screen bg-background">
      <TopNav onLockTerminal={() => setIsLocked(true)} />

      {isLocked && (
        <LockModal isOpen={isLocked} onClose={() => setIsLocked(false)} onUnlock={() => setIsLocked(false)} />
      )}
      {showManagerPin && (
        <ManagerPinModal isOpen={showManagerPin} onClose={() => setShowManagerPin(false)} onApprove={() => setShowManagerPin(false)} actionLabel="Save configuration" />
      )}

      <div className="max-w-6xl mx-auto px-3 md:px-4 lg:px-6 py-4 md:py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 md:mb-6 gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 md:w-10 h-9 md:h-10 rounded-xl bg-rose-500/15 border border-rose-500/25 flex items-center justify-center">
              <Settings size={18} className="text-rose-400" />
            </div>
            <div>
              <h1 className="text-lg md:text-xl font-semibold text-foreground">Admin Configuration</h1>
              <p className="text-xs md:text-sm text-muted-foreground">Venue-level parameters & settings</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {hasChanges && (
              <button
                onClick={handleReset}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted/50 text-sm transition-all"
              >
                <RotateCcw size={14} />
                <span className="hidden sm:inline">Reset</span>
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={!hasChanges || saveStatus === 'saving'}
              className={`flex items-center gap-1.5 px-3 md:px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                saveStatus === 'saved' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : hasChanges
                  ? 'bg-primary text-primary-foreground hover:opacity-90'
                  : 'bg-muted/50 text-muted-foreground border border-border cursor-not-allowed'
              }`}
            >
              {saveStatus === 'saving' ? (
                <><span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />Saving…</>
              ) : saveStatus === 'saved' ? (
                <><CheckCircle size={14} />Saved</>
              ) : (
                <><Save size={14} />Save</>
              )}
            </button>
          </div>
        </div>

        {/* Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 md:gap-4">
          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="glass-card rounded-xl border border-border overflow-hidden">
              <div className="flex lg:flex-col overflow-x-auto scrollbar-none">
                {SECTIONS.map((sec, i) => (
                  <button
                    key={sec.id}
                    onClick={() => setActiveSection(sec.id)}
                    className={`flex-shrink-0 flex items-center gap-2 md:gap-3 px-3 md:px-4 py-3 md:py-3.5 text-left transition-all ${
                      i < SECTIONS.length - 1 ? 'lg:border-b border-r lg:border-r-0 border-border/50' : ''
                    } ${
                      activeSection === sec.id
                        ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
                    }`}
                  >
                    <span className={`flex-shrink-0 ${activeSection === sec.id ? 'text-primary' : ''}`}>{sec.icon}</span>
                    <div className="flex-1 min-w-0 hidden sm:block">
                      <p className="text-xs md:text-sm font-medium text-foreground truncate">{sec.label}</p>
                      <p className="text-xs text-muted-foreground truncate hidden md:block">{sec.desc}</p>
                    </div>
                    <ChevronRight size={14} className={`hidden lg:block ${activeSection === sec.id ? 'text-primary' : 'text-muted-foreground/40'}`} />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="lg:col-span-3">
            <div className="glass-card rounded-xl border border-border p-4 md:p-6">

              {/* Charges & Tax */}
              {activeSection === 'charges' && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-base font-semibold text-foreground mb-1">Charges & Tax Rates</h2>
                    <p className="text-sm text-muted-foreground">These rates are applied automatically to all orders.</p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl bg-amber-500/8 border border-amber-500/20">
                      <label className="block text-xs font-medium text-amber-400 mb-3 uppercase tracking-wider">
                        <Percent size={12} className="inline mr-1" />Service Charge
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="0"
                          max="50"
                          step="0.5"
                          value={config.serviceCharge}
                          onChange={e => setConfig(p => ({ ...p, serviceCharge: e.target.value }))}
                          className="flex-1 bg-background border border-border rounded-lg px-3 py-2.5 text-lg font-semibold text-foreground focus:outline-none focus:border-amber-500/50 text-center"
                        />
                        <span className="text-2xl font-bold text-amber-400">%</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">Applied to all table orders</p>
                    </div>

                    <div className="p-4 rounded-xl bg-cyan-500/8 border border-cyan-500/20">
                      <label className="block text-xs font-medium text-cyan-400 mb-3 uppercase tracking-wider">
                        <Percent size={12} className="inline mr-1" />VAT Rate
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="0"
                          max="30"
                          step="0.5"
                          value={config.vatRate}
                          onChange={e => setConfig(p => ({ ...p, vatRate: e.target.value }))}
                          className="flex-1 bg-background border border-border rounded-lg px-3 py-2.5 text-lg font-semibold text-foreground focus:outline-none focus:border-cyan-500/50 text-center"
                        />
                        <span className="text-2xl font-bold text-cyan-400">%</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">Value Added Tax rate</p>
                    </div>
                  </div>

                  {/* Preview */}
                  <div className="p-4 rounded-xl bg-muted/30 border border-border">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Live Preview — ฿1,000 order</p>
                    <div className="space-y-1.5 text-sm">
                      <div className="flex justify-between text-muted-foreground">
                        <span>Subtotal</span><span>{config.currencySymbol}1,000.00</span>
                      </div>
                      <div className="flex justify-between text-amber-400">
                        <span>Service Charge ({config.serviceCharge}%)</span>
                        <span>+{config.currencySymbol}{(1000 * parseFloat(config.serviceCharge || '0') / 100).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-cyan-400">
                        <span>VAT ({config.vatRate}%)</span>
                        <span>+{config.currencySymbol}{(1000 * parseFloat(config.vatRate || '0') / 100).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between font-semibold text-foreground border-t border-border pt-1.5 mt-1.5">
                        <span>Total</span>
                        <span>{config.currencySymbol}{(1000 * (1 + parseFloat(config.serviceCharge || '0') / 100 + parseFloat(config.vatRate || '0') / 100)).toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Currency */}
              {activeSection === 'currency' && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-base font-semibold text-foreground mb-1">Currency Settings</h2>
                    <p className="text-sm text-muted-foreground">Select the display currency for all POS screens and receipts.</p>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {CURRENCIES.map(cur => (
                      <button
                        key={cur.code}
                        onClick={() => handleCurrencyChange(cur.code)}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          config.currency === cur.code
                            ? 'bg-primary/15 border-primary/40 text-primary' : 'border-border text-muted-foreground hover:border-border/80 hover:bg-muted/30'
                        }`}
                      >
                        <div className="text-xl font-bold mb-1">{cur.symbol}</div>
                        <div className="text-xs font-semibold text-foreground">{cur.code}</div>
                        <div className="text-xs text-muted-foreground truncate">{cur.label}</div>
                      </button>
                    ))}
                  </div>

                  <div className="p-4 rounded-xl bg-muted/30 border border-border">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Current Selection</p>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center text-lg font-bold text-primary">
                        {config.currencySymbol}
                      </div>
                      <div>
                        <p className="font-semibold text-foreground">{config.currency} — {CURRENCIES.find(c => c.code === config.currency)?.label}</p>
                        <p className="text-xs text-muted-foreground">Symbol: <span className="text-foreground font-medium">{config.currencySymbol}</span></p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Printer */}
              {activeSection === 'printer' && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-base font-semibold text-foreground mb-1">Receipt Printer</h2>
                    <p className="text-sm text-muted-foreground">Configure the default printer and assign dedicated printers per zone. Each zone can have multiple printers.</p>
                  </div>

                  {/* ── Default / Fallback Printer ─────────────────────────── */}
                  <div className="p-4 rounded-xl bg-muted/20 border border-border space-y-4">
                    <div className="flex items-center gap-2">
                      <Printer size={15} className="text-primary" />
                      <p className="text-sm font-semibold text-foreground">Default Printer</p>
                      <span className="ml-auto text-xs text-muted-foreground">Used when no zone-specific printer is set</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">IP Address</label>
                        <input
                          type="text"
                          placeholder="192.168.1.100"
                          value={config.printerIp}
                          onChange={e => setConfig(p => ({ ...p, printerIp: e.target.value }))}
                          className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/50 font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Port</label>
                        <input
                          type="text"
                          placeholder="9100"
                          value={config.printerPort}
                          onChange={e => setConfig(p => ({ ...p, printerPort: e.target.value }))}
                          className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/50 font-mono"
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() => void handleTestPrinter()}
                        disabled={defaultPingRunning || !validatePrinterEndpoint(config.printerIp, config.printerPort).ok}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all border border-border text-muted-foreground hover:text-foreground hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {defaultPingRunning ? (
                          <>
                            <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                            Pinging…
                          </>
                        ) : (
                          <>
                            <Wifi size={14} />
                            Test (5 pings)
                          </>
                        )}
                      </button>
                      <PrinterPingIndicators slots={defaultPingSlots} />
                      {pingSummary(defaultPingSlots) && (
                        <span className="text-xs text-muted-foreground tabular-nums">{pingSummary(defaultPingSlots)}</span>
                      )}
                    </div>
                    {defaultPingDetail && (
                      <p className={`text-[11px] ${defaultPingSlots.some(s => s === 'ok') ? 'text-sky-400/90' : 'text-rose-400/90'}`}>
                        {defaultPingDetail}
                      </p>
                    )}
                    <p className="text-[11px] text-muted-foreground">
                      Blue = TCP connect OK to port {config.printerPort || '9100'} (ESC/POS). Red = refused/timeout.
                      This is <strong className="font-normal text-foreground/90">not</strong> ICMP ping — a host can fail{' '}
                      <span className="font-mono">ping</span> in Terminal but still respond on 9100, or the opposite if the backend returns a stub{' '}
                      <span className="font-mono">connected: true</span>.
                    </p>
                  </div>

                  {/* ── Zone Printer Assignment ────────────────────────────── */}
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-5 h-5 rounded bg-primary/15 flex items-center justify-center">
                        <Printer size={11} className="text-primary" />
                      </div>
                      <p className="text-sm font-semibold text-foreground">Zone Printer Assignment</p>
                    </div>
                    <p className="text-xs text-muted-foreground mb-4">
                      <strong className="text-foreground font-medium">Add Printer</strong> opens a row locally; the server save runs when you enter a valid IP (e.g.{' '}
                      <span className="font-mono text-foreground/80">172.19.14.1</span>) and tab out of the field (
                      <span className="font-mono text-foreground/80">POST /api/zones/{'{zoneId}'}/printers</span>).
                      Mark one printer as <strong className="text-foreground font-medium">Default</strong> per zone.
                    </p>

                    {zonePrintersLoading ? (
                      <p className="text-sm text-muted-foreground py-6 text-center">Loading zone printers…</p>
                    ) : (
                    <div className="space-y-4">
                      {zonePrinters.map(zp => (
                        <div key={zp.zoneId} className="rounded-xl border border-border bg-background/50 overflow-hidden">
                          {/* Zone header */}
                          <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-muted/20">
                            <div className="flex items-center gap-2">
                              <span
                                className="w-3 h-3 rounded-full flex-shrink-0"
                                style={{ backgroundColor: zp.zoneColor }}
                              />
                              <span className="text-sm font-semibold text-foreground">{zp.zoneName}</span>
                              <span className="text-xs text-muted-foreground">({zp.printers.length} printer{zp.printers.length !== 1 ? 's' : ''})</span>
                            </div>
                            <button
                              onClick={() => addPrinterToZone(zp.zoneId)}
                              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-primary/30 text-primary hover:bg-primary/10 transition-all"
                            >
                              <Plus size={12} />
                              Add Printer
                            </button>
                          </div>

                          {/* Printer rows */}
                          <div className="divide-y divide-border/40">
                            {zp.printers.length === 0 && (
                              <p className="p-4 text-xs text-muted-foreground text-center">
                                No printers for this zone — click Add Printer.
                              </p>
                            )}
                            {zp.printers.map((printer, idx) => {
                              const key = `${zp.zoneId}:${printer.id}`;
                              const pingSlots = zonePingSlots[key] ?? idlePingSlots();
                              const pingRunning = zonePingRunning[key] ?? false;
                              return (
                                <div key={printer.id} className="p-3 md:p-4 space-y-3">
                                  {/* Printer label row */}
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-xs font-medium text-muted-foreground">
                                      Printer {idx + 1}
                                      {isDraftZonePrinterId(printer.id) && (
                                        <span className="ml-2 text-amber-500/90 normal-case tracking-normal">
                                          (unsaved — enter IP, then click outside the field)
                                        </span>
                                      )}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => removePrinterFromZone(zp.zoneId, printer.id)}
                                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-rose-400 hover:bg-rose-500/10 border border-rose-500/20 transition-all"
                                    >
                                      <Trash2 size={11} />
                                      Remove
                                    </button>
                                  </div>

                                  <div className="space-y-2">
                                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_5rem_auto] gap-2 items-end">
                                      <div>
                                        <label className="block text-xs text-muted-foreground mb-1.5 uppercase tracking-wider">Name</label>
                                        <input
                                          type="text"
                                          placeholder="VIP Bar Printer"
                                          value={printer.name}
                                          onChange={e => updatePrinterField(zp.zoneId, printer.id, 'name', e.target.value)}
                                          onBlur={() => handlePrinterFieldBlur(zp.zoneId, printer.id)}
                                          className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50"
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-xs text-muted-foreground mb-1.5 uppercase tracking-wider">IP</label>
                                        <input
                                          type="text"
                                          placeholder="192.168.1.100"
                                          value={printer.printerIp}
                                          onChange={e => updatePrinterField(zp.zoneId, printer.id, 'printerIp', e.target.value)}
                                          onBlur={() => handlePrinterFieldBlur(zp.zoneId, printer.id)}
                                          className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50 font-mono"
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-xs text-muted-foreground mb-1.5 uppercase tracking-wider">Port</label>
                                        <input
                                          type="text"
                                          placeholder="9100"
                                          value={String(printer.printerPort ?? 9100)}
                                          onChange={e => updatePrinterField(zp.zoneId, printer.id, 'printerPort', e.target.value)}
                                          onBlur={() => handlePrinterFieldBlur(zp.zoneId, printer.id)}
                                          className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50 font-mono"
                                        />
                                      </div>
                                      <label className="flex items-center gap-2 pb-2 cursor-pointer select-none">
                                        <input
                                          type="radio"
                                          name={`default-printer-${zp.zoneId}`}
                                          checked={printer.isDefault}
                                          onChange={() => setZonePrinterDefault(zp.zoneId, printer.id)}
                                          className="text-primary focus:ring-primary/50"
                                        />
                                        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Default</span>
                                      </label>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={() => void handleTestZonePrinter(zp.zoneId, printer.id)}
                                        disabled={
                                          pingRunning
                                          || !validatePrinterEndpoint(printer.printerIp, printer.printerPort).ok
                                        }
                                        title={
                                          validatePrinterEndpoint(printer.printerIp, printer.printerPort).ok
                                            ? 'TCP test ×5'
                                            : 'Enter a valid IP (e.g. 192.168.1.100) and port'
                                        }
                                        className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all border border-border text-muted-foreground hover:text-foreground hover:bg-muted/50 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                                      >
                                        {pingRunning ? (
                                          <><span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />Ping…</>
                                        ) : (
                                          <><Wifi size={12} />Test ×5</>
                                        )}
                                      </button>
                                      <PrinterPingIndicators slots={pingSlots} />
                                      {pingSummary(pingSlots) && (
                                        <span className="text-[10px] text-muted-foreground tabular-nums">{pingSummary(pingSlots)}</span>
                                      )}
                                      {zonePingDetail[key] && (
                                        <span className={`text-[10px] w-full ${pingSlots.some(s => s === 'ok') ? 'text-sky-400/90' : 'text-rose-400/90'}`}>
                                          {zonePingDetail[key]}
                                        </span>
                                      )}
                                      <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[8rem]" title={printer.id}>
                                        id: {printer.id.slice(0, 8)}…
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                    )}

                  </div>

                  {/* Setup Notes */}
                  <div className="p-4 rounded-xl bg-muted/20 border border-border text-xs text-muted-foreground space-y-1">
                    <p className="font-medium text-foreground text-sm mb-2">Setup Notes</p>
                    <p>• Ensure each printer is connected to the same local network as this terminal.</p>
                    <p>• Default port for ESC/POS network printers is <span className="font-mono text-foreground">9100</span>.</p>
                    <p>• Assign a static IP to each printer in your router settings to prevent IP changes.</p>
                    <p>• Zone printers (<span className="font-mono">zone_printers</span>) override venue config for that zone.</p>
                    <p>• Test runs 5× <span className="font-mono">POST /api/config/printer/test</span> (TCP to IP:port). Backend must set <span className="font-mono">connected: false</span> when the socket fails — not a stub always-true.</p>
                    <p>• Map menu categories to printers in the sidebar → <strong className="text-foreground">Category Printer</strong>.</p>
                  </div>
                </div>
              )}

              {/* Category → printer routing */}
              {activeSection === 'categoryPrinter' && (
                <div className="space-y-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-base font-semibold text-foreground mb-1">Category Printer</h2>
                      <p className="text-sm text-muted-foreground">
                        Food &amp; drink tickets when ordering — <strong className="text-foreground font-medium">name, IP, port</strong> per category only.
                        Not Receipt Printer. See <span className="font-mono text-foreground/80">docs/FRONTEND_CATEGORY_PRINTERS.md</span>.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setRoutingReloadToken((t) => t + 1)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground"
                    >
                      <RotateCcw size={12} />
                      Refresh
                    </button>
                  </div>

                  <CategoryPrinterSettings reloadToken={routingReloadToken} />
                </div>
              )}

              {/* House Rules */}
              {activeSection === 'rules' && (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-base font-semibold text-foreground mb-1">House Rules</h2>
                    <p className="text-sm text-muted-foreground">These rules are displayed to staff and can be printed on venue materials.</p>
                  </div>
                  <textarea
                    value={config.houseRules}
                    onChange={e => setConfig(p => ({ ...p, houseRules: e.target.value }))}
                    rows={14}
                    className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:outline-none focus:border-primary/50 resize-none leading-relaxed"
                    placeholder="Enter venue house rules…"
                  />
                  <p className="text-xs text-muted-foreground">{config.houseRules.length} characters</p>
                </div>
              )}

              {/* Receipt Layout */}
              {activeSection === 'receipt' && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-base font-semibold text-foreground mb-1">Receipt Layout</h2>
                    <p className="text-sm text-muted-foreground">
                      Header and footer from config; preview uses{' '}
                      <span className="font-mono text-foreground/80">GET /api/receipts/{'{paymentId}'}</span> for lines.
                      See <span className="font-mono text-foreground/80">docs/FRONTEND_RECEIPT_PREVIEW.md</span>.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Receipt Header</label>
                    <textarea
                      value={config.receiptHeader}
                      onChange={e => setConfig(p => ({ ...p, receiptHeader: e.target.value }))}
                      rows={3}
                      className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:outline-none focus:border-primary/50 resize-none font-mono"
                      placeholder="Venue name, address, phone…"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Receipt Footer</label>
                    <textarea
                      value={config.receiptFooter}
                      onChange={e => setConfig(p => ({ ...p, receiptFooter: e.target.value }))}
                      rows={3}
                      className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:outline-none focus:border-primary/50 resize-none font-mono"
                      placeholder="Thank you message, social handles…"
                    />
                  </div>

                  <ReceiptLayoutReviewer
                    receiptHeader={config.receiptHeader}
                    receiptFooter={config.receiptFooter}
                    currencySymbol={config.currencySymbol}
                  />
                </div>
              )}

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
