'use client';

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { TableData, TableShape, ZoneMeta } from './floorData';
import { zonesApi } from '@/lib/api/client';
import { zoneToMeta } from '@/lib/api/mappers';
import { Move, Save, RotateCcw, Users, Clock, DollarSign, Circle, Square, LayoutGrid, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { formatTimer } from './floorData';

type ZoneFilter = 'all' | 'vip' | 'bar' | 'terrace' | 'cabana';

interface FloorCanvasProps {
  tables: TableData[];
  selectedTableId: string | null;
  onSelectTable: (table: TableData) => void;
  onOpenMenu: (table: TableData) => void;
  zoneFilter: ZoneFilter;
  editMode: boolean;
  onUpdatePositions: (positions: Record<string, { x: number; y: number }>) => Promise<void>;
  savedPositions: Record<string, { x: number; y: number }>;
  onChangeShape?: (tableId: string, shape: TableShape) => Promise<void>;
}

const STATUS_COLORS: Record<string, { ring: string; bg: string; label: string; text: string; glow: string }> = {
  available: { ring: '#10b981', bg: 'rgba(16,185,129,0.13)', label: 'Free', text: '#10b981', glow: 'rgba(16,185,129,0.35)' },
  occupied:  { ring: '#f43f5e', bg: 'rgba(244,63,94,0.10)',  label: 'Occupied', text: '#f43f5e', glow: 'rgba(244,63,94,0.3)' },
  reserved:  { ring: '#f59e0b', bg: 'rgba(245,158,11,0.10)', label: 'Reserved', text: '#f59e0b', glow: 'rgba(245,158,11,0.3)' },
  bill:      { ring: '#06b6d4', bg: 'rgba(6,182,212,0.10)',  label: 'Bill Ready', text: '#06b6d4', glow: 'rgba(6,182,212,0.3)' },
};

function getTableDimensions(shape: TableShape) {
  if (shape === 'circle')  return { w: 84,  h: 84  };
  if (shape === 'stool')   return { w: 54,  h: 54  };
  if (shape === 'cabana')  return { w: 170, h: 100 };
  return { w: 120, h: 80 }; // rect
}

// ─── Blueprint grid background ────────────────────────────────────────────────
function BlueprintBg({ zoneColor }: { zoneColor: string }) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: `
          linear-gradient(${zoneColor} 1px, transparent 1px),
          linear-gradient(90deg, ${zoneColor} 1px, transparent 1px),
          linear-gradient(rgba(15,23,42,0.0) 1px, transparent 1px),
          linear-gradient(90deg, rgba(15,23,42,0.0) 1px, transparent 1px),
          linear-gradient(135deg, #0a1628 0%, #0f172a 100%)
        `,
        backgroundSize: '80px 80px, 80px 80px, 20px 20px, 20px 20px, 100% 100%',
        pointerEvents: 'none',
      }}
    />
  );
}

// ─── Blueprint corner marks ───────────────────────────────────────────────────
function BlueprintCorners({ color }: { color: string }) {
  const size = 22;
  const corners = [
    { top: 10, left: 10, borderTopWidth: 2, borderLeftWidth: 2 },
    { top: 10, right: 10, borderTopWidth: 2, borderRightWidth: 2 },
    { bottom: 10, left: 10, borderBottomWidth: 2, borderLeftWidth: 2 },
    { bottom: 10, right: 10, borderBottomWidth: 2, borderRightWidth: 2 },
  ];
  return (
    <>
      {corners.map((pos, i) => (
        <div
          key={`corner-${i}`}
          style={{
            position: 'absolute',
            width: size,
            height: size,
            borderColor: color,
            borderStyle: 'solid',
            borderWidth: 0,
            opacity: 0.5,
            pointerEvents: 'none',
            ...pos,
          }}
        />
      ))}
    </>
  );
}

// ─── Shape Icon for table ─────────────────────────────────────────────────────
function TableShapeIcon({ shape, size = 16, color }: { shape: TableShape; size?: number; color: string }) {
  if (shape === 'circle' || shape === 'stool') {
    return <Circle size={size} style={{ color }} strokeWidth={2} />;
  }
  return <Square size={size} style={{ color }} strokeWidth={2} />;
}

// ─── Shape Picker Popover ─────────────────────────────────────────────────────
function ShapePicker({ tableId, currentShape, onChangeShape, onClose }: {
  tableId: string;
  currentShape: TableShape;
  onChangeShape: (id: string, shape: TableShape) => void | Promise<void>;
  onClose: () => void;
}) {
  const shapes: { value: TableShape; label: string }[] = [
    { value: 'circle',  label: 'Circle' },
    { value: 'rect',    label: 'Square' },
    { value: 'cabana',  label: 'Cabana' },
    { value: 'stool',   label: 'Stool'  },
  ];
  return (
    <div
      style={{
        position: 'absolute',
        top: -10,
        left: '110%',
        zIndex: 200,
        background: '#1e293b',
        border: '1px solid rgba(100,116,139,0.4)',
        borderRadius: 10,
        padding: '6px 4px',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        minWidth: 100,
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      }}
      onClick={e => e.stopPropagation()}
    >
      <span style={{ fontSize: 9, color: '#64748b', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '2px 8px 4px' }}>Shape</span>
      {shapes.map(s => (
        <button
          key={s.value}
          onClick={() => { void onChangeShape(tableId, s.value); onClose(); }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '5px 8px',
            borderRadius: 6,
            background: currentShape === s.value ? 'rgba(6,182,212,0.15)' : 'transparent',
            border: currentShape === s.value ? '1px solid rgba(6,182,212,0.4)' : '1px solid transparent',
            color: currentShape === s.value ? '#06b6d4' : '#94a3b8',
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
            width: '100%',
            textAlign: 'left',
          }}
        >
          <TableShapeIcon shape={s.value} size={12} color={currentShape === s.value ? '#06b6d4' : '#64748b'} />
          {s.label}
        </button>
      ))}
    </div>
  );
}

// ─── Single Table Node ────────────────────────────────────────────────────────
interface TableNodeProps {
  table: TableData;
  x: number;
  y: number;
  isSelected: boolean;
  isDragging: boolean;
  editMode: boolean;
  showShapePicker: boolean;
  onMouseDown: (e: React.MouseEvent, id: string) => void;
  onClick: (e: React.MouseEvent, table: TableData) => void;
  onToggleShapePicker: (id: string) => void;
  onChangeShape?: (id: string, shape: TableShape) => void;
}

function TableNode({
  table, x, y, isSelected, isDragging, editMode,
  showShapePicker, onMouseDown, onClick, onToggleShapePicker, onChangeShape,
}: TableNodeProps) {
  const { w, h } = getTableDimensions(table.shape);
  const colors = STATUS_COLORS[table.status];
  const isCircle = table.shape === 'circle' || table.shape === 'stool';
  const isCabana = table.shape === 'cabana';
  const isStool  = table.shape === 'stool';
  const borderRadius = isCircle ? '50%' : isCabana ? 18 : 10;

  return (
    <div
      onMouseDown={e => onMouseDown(e, table.id)}
      onClick={e => onClick(e, table)}
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: w,
        height: h,
        borderRadius,
        background: colors.bg,
        border: `2px solid ${isSelected ? '#06b6d4' : colors.ring}`,
        boxShadow: isSelected
          ? `0 0 0 3px rgba(6,182,212,0.4), 0 0 20px ${colors.glow}`
          : `0 0 12px ${colors.glow}`,
        cursor: editMode ? 'grab' : 'pointer',
        transition: isDragging ? 'none' : 'box-shadow 0.2s, border-color 0.2s',
        zIndex: isDragging ? 100 : isSelected ? 10 : 1,
        transform: isDragging ? 'scale(1.05)' : 'scale(1)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: isStool ? 4 : 8,
        userSelect: 'none',
        backdropFilter: 'blur(4px)',
      }}
    >
      {/* Shape icon top-left (non-stool) */}
      {!isStool && (
        <div style={{ position: 'absolute', top: 5, left: 6, opacity: 0.4 }}>
          <TableShapeIcon shape={table.shape} size={10} color={colors.ring} />
        </div>
      )}

      {/* Table label */}
      <span style={{ fontSize: isStool ? 9 : 13, fontWeight: 800, color: '#f1f5f9', letterSpacing: '0.02em', lineHeight: 1 }}>
        {table.label}
      </span>

      {/* Status label */}
      {!isStool && (
        <span style={{ fontSize: 9, fontWeight: 700, color: colors.text, textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 3 }}>
          {colors.label}
        </span>
      )}

      {/* Guests / timer */}
      {!isStool && table.status !== 'available' && table.status !== 'reserved' && (
        <div style={{ display: 'flex', gap: 6, marginTop: 4, alignItems: 'center' }}>
          <span style={{ fontSize: 9, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 2 }}>
            <Users size={8} />{table.guests}
          </span>
          {table.seatedMinutes > 0 && (
            <span style={{ fontSize: 9, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 2 }}>
              <Clock size={8} />{formatTimer(table.seatedMinutes)}
            </span>
          )}
        </div>
      )}

      {/* Order total */}
      {!isStool && table.orderTotal > 0 && (
        <span style={{ fontSize: 9, color: '#f1f5f9', fontWeight: 700, marginTop: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
          <DollarSign size={8} />{table.orderTotal}
        </span>
      )}

      {/* Min spend badge */}
      {table.minSpend && !isStool && (
        <span style={{
          position: 'absolute', top: -9, right: -4,
          fontSize: 8, fontWeight: 700, padding: '1px 5px', borderRadius: 8,
          background: 'rgba(245,158,11,0.2)', border: '1px solid rgba(245,158,11,0.4)', color: '#f59e0b', whiteSpace: 'nowrap',
        }}>
          ${table.minSpend} Min
        </span>
      )}

      {/* Edit mode: drag dots + shape picker toggle */}
      {editMode && (
        <>
          <div style={{ position: 'absolute', top: 4, right: 4, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, opacity: 0.5 }}>
            {[0,1,2,3].map(i => (
              <div key={`dot-${table.id}-${i}`} style={{ width: 3, height: 3, borderRadius: '50%', background: '#94a3b8' }} />
            ))}
          </div>
          {onChangeShape && (
            <button
              onMouseDown={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); onToggleShapePicker(table.id); }}
              style={{
                position: 'absolute',
                bottom: isStool ? -18 : -20,
                left: '50%',
                transform: 'translateX(-50%)',
                fontSize: 8,
                fontWeight: 700,
                padding: '2px 6px',
                borderRadius: 6,
                background: 'rgba(6,182,212,0.15)',
                border: '1px solid rgba(6,182,212,0.35)',
                color: '#06b6d4',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
              }}
            >
              Shape
            </button>
          )}
          {showShapePicker && onChangeShape && (
            <ShapePicker
              tableId={table.id}
              currentShape={table.shape}
              onChangeShape={onChangeShape}
              onClose={() => onToggleShapePicker('')}
            />
          )}
        </>
      )}

      {/* Free table pulse ring */}
      {table.status === 'available' && !editMode && (
        <div style={{
          position: 'absolute',
          inset: -5,
          borderRadius: isCircle ? '50%' : isCabana ? 22 : 14,
          border: '1.5px solid rgba(16,185,129,0.3)',
          animation: 'pulseRing 2.5s ease-in-out infinite',
          pointerEvents: 'none',
        }} />
      )}
    </div>
  );
}

// ─── Zone Blueprint Page ──────────────────────────────────────────────────────
interface ZonePageProps {
  zone: ZoneMeta;
  tables: TableData[];
  selectedTableId: string | null;
  editMode: boolean;
  positions: Record<string, { x: number; y: number }>;
  onPositionChange: (id: string, x: number, y: number) => void;
  onSelectTable: (table: TableData) => void;
  onOpenMenu: (table: TableData) => void;
  onChangeShape?: (id: string, shape: TableShape) => Promise<void>;
  hasUnsaved: boolean;
  onSave: () => Promise<void>;
  onReset: () => void;
  saving: boolean;
  zoom: number;
}

function ZonePage({
  zone, tables, selectedTableId, editMode, positions,
  onPositionChange, onSelectTable, onOpenMenu, onChangeShape,
  hasUnsaved, onSave, onReset, saving, zoom,
}: ZonePageProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<{ id: string; startX: number; startY: number; origX: number; origY: number } | null>(null);
  const [shapePickerFor, setShapePickerFor] = useState<string>('');
  const dragMovedRef = useRef(false);

  const canvasW = Math.max(zone.canvasWidth, ...tables.map(t => {
    const pos = positions[t.id] ?? { x: t.x, y: t.y };
    return pos.x + getTableDimensions(t.shape).w + 200;
  }), 1200);
  const canvasH = Math.max(zone.canvasHeight, ...tables.map(t => {
    const pos = positions[t.id] ?? { x: t.x, y: t.y };
    return pos.y + getTableDimensions(t.shape).h + 200;
  }), 700);

  const handleMouseDown = useCallback((e: React.MouseEvent, tableId: string) => {
    if (!editMode) return;
    e.preventDefault();
    e.stopPropagation();
    dragMovedRef.current = false;
    const table = tables.find(t => t.id === tableId);
    if (table) onSelectTable(table);
    const pos = positions[tableId] ?? { x: 0, y: 0 };
    setDragging({ id: tableId, startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y });
  }, [editMode, positions, tables, onSelectTable]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging) return;
    dragMovedRef.current = true;
    const dx = e.clientX - dragging.startX;
    const dy = e.clientY - dragging.startY;
    const newX = Math.max(10, dragging.origX + dx);
    const newY = Math.max(10, dragging.origY + dy);
    onPositionChange(dragging.id, newX, newY);
  }, [dragging, onPositionChange]);

  const handleMouseUp = useCallback(() => setDragging(null), []);

  const handleTableClick = (e: React.MouseEvent, table: TableData) => {
    e.stopPropagation();
    if (editMode) {
      if (dragMovedRef.current) {
        dragMovedRef.current = false;
        return;
      }
      onSelectTable(table);
      return;
    }
    onSelectTable(table);
    if (table.status === 'available') onOpenMenu(table);
  };

  const gridColor = `rgba(${zone.id === 'vip' ? '245,158,11' : zone.id === 'bar' ? '6,182,212' : zone.id === 'terrace' ? '16,185,129' : '168,85,247'},0.05)`;

  return (
    <div className="flex flex-col h-full">
      {/* Zone header bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '8px 16px',
          borderBottom: `1px solid ${zone.color}22`,
          background: zone.accentColor,
          flexShrink: 0,
        }}
      >
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: zone.color, boxShadow: `0 0 8px ${zone.color}` }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: zone.color, letterSpacing: '0.04em' }}>{zone.label}</span>
        <span style={{ fontSize: 11, color: '#64748b', marginLeft: 4 }}>{zone.description}</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: '#475569', fontWeight: 600 }}>
          {tables.length} table{tables.length !== 1 ? 's' : ''}
          {' · '}
          {tables.filter(t => t.status === 'available').length} free
        </span>
        {editMode && hasUnsaved && (
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={onReset}
              disabled={saving}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 8, background: 'rgba(100,116,139,0.15)', border: '1px solid rgba(100,116,139,0.3)', color: '#94a3b8', fontSize: 11, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}
            >
              <RotateCcw size={10} /> Reset
            </button>
            <button
              onClick={() => { void onSave(); }}
              disabled={saving}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 8, background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.4)', color: '#10b981', fontSize: 11, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}
            >
              <Save size={10} /> {saving ? 'Saving…' : 'Save Layout'}
            </button>
          </div>
        )}
      </div>

      {/* Blueprint canvas */}
      <div className="flex-1 overflow-auto" style={{ position: 'relative' }}>
        <div
          style={{
            width: '100%',
            height: '100%',
            overflow: 'auto',
            position: 'relative',
          }}
        >
          <div
            ref={canvasRef}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            style={{
              position: 'relative',
              width: canvasW,
              height: canvasH,
              minWidth: '100%',
              userSelect: 'none',
              transform: `scale(${zoom})`,
              transformOrigin: 'top left',
              transition: 'transform 0.15s ease',
            }}
          >
            <BlueprintBg zoneColor={gridColor} />
            <BlueprintCorners color={zone.color} />

            {/* Zone label watermark */}
            <div style={{
              position: 'absolute',
              bottom: 16,
              right: 20,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              color: zone.color,
              opacity: 0.12,
              pointerEvents: 'none',
              userSelect: 'none',
            }}>
              {zone.label}
            </div>

            {/* Edit mode hint */}
            {editMode && (
              <div style={{
                position: 'absolute',
                top: 14,
                left: '50%',
                transform: 'translateX(-50%)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 12px',
                borderRadius: 20,
                background: 'rgba(245,158,11,0.1)',
                border: '1px solid rgba(245,158,11,0.25)',
                pointerEvents: 'none',
              }}>
                <Move size={10} style={{ color: '#f59e0b' }} />
                <span style={{ fontSize: 10, color: '#f59e0b', fontWeight: 600 }}>Tap to edit name · Drag to move · Shape button to change type</span>
              </div>
            )}

            {/* Tables */}
            {tables.map(table => {
              const pos = positions[table.id] ?? { x: table.x, y: table.y };
              return (
                <TableNode
                  key={table.id}
                  table={table}
                  x={pos.x}
                  y={pos.y}
                  isSelected={selectedTableId === table.id}
                  isDragging={dragging?.id === table.id}
                  editMode={editMode}
                  showShapePicker={shapePickerFor === table.id}
                  onMouseDown={handleMouseDown}
                  onClick={handleTableClick}
                  onToggleShapePicker={id => setShapePickerFor(prev => prev === id ? '' : id)}
                  onChangeShape={onChangeShape}
                />
              );
            })}

            {tables.length === 0 && (
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center', color: '#475569' }}>
                <LayoutGrid size={32} style={{ margin: '0 auto 8px', opacity: 0.3 }} />
                <p style={{ fontSize: 13, fontWeight: 600 }}>No tables in this zone</p>
                <p style={{ fontSize: 11, marginTop: 4 }}>Add tables in Edit Mode</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main FloorCanvas ─────────────────────────────────────────────────────────
export default function FloorCanvas({
  tables,
  selectedTableId,
  onSelectTable,
  onOpenMenu,
  zoneFilter,
  editMode,
  onUpdatePositions,
  savedPositions,
  onChangeShape,
}: FloorCanvasProps) {
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>(() => {
    const init: Record<string, { x: number; y: number }> = {};
    tables.forEach(t => { init[t.id] = savedPositions[t.id] ?? { x: t.x, y: t.y }; });
    return init;
  });
  const [hasUnsaved, setHasUnsaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeZoneIdx, setActiveZoneIdx] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [zones, setZones] = useState<ZoneMeta[]>([]);

  useEffect(() => {
    zonesApi.list()
      .then(data => setZones(data.filter(z => z.isActive).map(zoneToMeta)))
      .catch(() => setZones([]));
  }, []);

  const MIN_ZOOM = 0.3;
  const MAX_ZOOM = 2.5;
  const ZOOM_STEP = 0.15;

  const handleZoomIn = () => setZoom(z => Math.min(MAX_ZOOM, parseFloat((z + ZOOM_STEP).toFixed(2))));
  const handleZoomOut = () => setZoom(z => Math.max(MIN_ZOOM, parseFloat((z - ZOOM_STEP).toFixed(2))));
  const handleZoomReset = () => setZoom(1);

  useEffect(() => {
    setPositions(prev => {
      const next = { ...prev };
      tables.forEach(t => { if (!next[t.id]) next[t.id] = savedPositions[t.id] ?? { x: t.x, y: t.y }; });
      return next;
    });
  }, [tables, savedPositions]);

  const handlePositionChange = useCallback((id: string, x: number, y: number) => {
    setPositions(prev => ({ ...prev, [id]: { x, y } }));
    setHasUnsaved(true);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onUpdatePositions(positions);
      setHasUnsaved(false);
    } catch {
      /* error toast handled in FloorMapClient */
    } finally {
      setSaving(false);
    }
  };
  const handleReset = () => {
    const reset: Record<string, { x: number; y: number }> = {};
    tables.forEach(t => { reset[t.id] = { x: t.x, y: t.y }; });
    setPositions(reset);
    setHasUnsaved(false);
  };

  // Determine which zones to show
  const zonesToShow = zoneFilter === 'all' ? zones : zones.filter(z => z.id === zoneFilter);
  const currentZoneIdx = zoneFilter === 'all' ? activeZoneIdx : 0;
  const currentZone = zonesToShow[currentZoneIdx] ?? zonesToShow[0];

  if (!currentZone) return null;

  const zoneTables = tables.filter(t => t.zone === currentZone.id);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Zone page tabs (only when "all" is selected) */}
      {zoneFilter === 'all' && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          padding: '6px 12px',
          borderBottom: '1px solid rgba(100,116,139,0.15)',
          background: 'rgba(15,23,42,0.6)',
          flexShrink: 0,
          overflowX: 'auto',
        }}>
          <span style={{ fontSize: 10, color: '#475569', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginRight: 6, whiteSpace: 'nowrap' }}>Floor Plans:</span>
          {zones.map((z, idx) => (
            <button
              key={z.id}
              onClick={() => setActiveZoneIdx(idx)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '4px 12px',
                borderRadius: 8,
                background: activeZoneIdx === idx ? `${z.color}18` : 'transparent',
                border: `1px solid ${activeZoneIdx === idx ? z.color + '55' : 'transparent'}`,
                color: activeZoneIdx === idx ? z.color : '#64748b',
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s',
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: z.color, opacity: activeZoneIdx === idx ? 1 : 0.4 }} />
              {z.label}
              <span style={{ fontSize: 9, opacity: 0.6, fontWeight: 600 }}>
                ({tables.filter(t => t.zone === z.id).length})
              </span>
            </button>
          ))}
          {/* Prev/Next arrows */}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
            <button
              onClick={() => setActiveZoneIdx(i => Math.max(0, i - 1))}
              disabled={activeZoneIdx === 0}
              style={{ padding: '3px 6px', borderRadius: 6, background: 'rgba(100,116,139,0.1)', border: '1px solid rgba(100,116,139,0.2)', color: activeZoneIdx === 0 ? '#334155' : '#94a3b8', cursor: activeZoneIdx === 0 ? 'not-allowed' : 'pointer' }}
            >
              <ChevronLeft size={12} />
            </button>
            <button
              onClick={() => setActiveZoneIdx(i => Math.min(zones.length - 1, i + 1))}
              disabled={activeZoneIdx === zones.length - 1}
              style={{ padding: '3px 6px', borderRadius: 6, background: 'rgba(100,116,139,0.1)', border: '1px solid rgba(100,116,139,0.2)', color: activeZoneIdx === zones.length - 1 ? '#334155' : '#94a3b8', cursor: activeZoneIdx === zones.length - 1 ? 'not-allowed' : 'pointer' }}
            >
              <ChevronRight size={12} />
            </button>
          </div>
        </div>
      )}

      {/* Zoom Controls Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '5px 12px',
        borderBottom: '1px solid rgba(100,116,139,0.12)',
        background: 'rgba(15,23,42,0.5)',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 10, color: '#475569', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginRight: 2 }}>Zoom</span>
        <button
          onClick={handleZoomOut}
          disabled={zoom <= MIN_ZOOM}
          title="Zoom Out"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 26, height: 26, borderRadius: 7,
            background: zoom <= MIN_ZOOM ? 'rgba(100,116,139,0.05)' : 'rgba(100,116,139,0.12)',
            border: '1px solid rgba(100,116,139,0.2)',
            color: zoom <= MIN_ZOOM ? '#334155' : '#94a3b8',
            cursor: zoom <= MIN_ZOOM ? 'not-allowed' : 'pointer',
            transition: 'all 0.15s',
          }}
        >
          <ZoomOut size={13} />
        </button>
        <button
          onClick={handleZoomReset}
          title="Reset Zoom to 100%"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '2px 8px', height: 26, borderRadius: 7,
            background: zoom === 1 ? 'rgba(6,182,212,0.12)' : 'rgba(100,116,139,0.12)',
            border: `1px solid ${zoom === 1 ? 'rgba(6,182,212,0.3)' : 'rgba(100,116,139,0.2)'}`,
            color: zoom === 1 ? '#06b6d4' : '#94a3b8',
            cursor: 'pointer',
            fontSize: 11,
            fontWeight: 700,
            minWidth: 44,
            transition: 'all 0.15s',
          }}
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          onClick={handleZoomIn}
          disabled={zoom >= MAX_ZOOM}
          title="Zoom In"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 26, height: 26, borderRadius: 7,
            background: zoom >= MAX_ZOOM ? 'rgba(100,116,139,0.05)' : 'rgba(100,116,139,0.12)',
            border: '1px solid rgba(100,116,139,0.2)',
            color: zoom >= MAX_ZOOM ? '#334155' : '#94a3b8',
            cursor: zoom >= MAX_ZOOM ? 'not-allowed' : 'pointer',
            transition: 'all 0.15s',
          }}
        >
          <ZoomIn size={13} />
        </button>
        <div style={{ width: 1, height: 16, background: 'rgba(100,116,139,0.2)', margin: '0 2px' }} />
        <button
          onClick={handleZoomReset}
          title="Reset to 100%"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 26, height: 26, borderRadius: 7,
            background: 'rgba(100,116,139,0.12)',
            border: '1px solid rgba(100,116,139,0.2)',
            color: '#64748b',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          <Maximize2 size={12} />
        </button>
        <span style={{ fontSize: 9, color: '#334155', marginLeft: 4 }}>Click +/− to zoom the floor plan</span>
      </div>

      {/* Zone blueprint page */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <ZonePage
          zone={currentZone}
          tables={zoneTables}
          selectedTableId={selectedTableId}
          editMode={editMode}
          positions={positions}
          onPositionChange={handlePositionChange}
          onSelectTable={onSelectTable}
          onOpenMenu={onOpenMenu}
          onChangeShape={onChangeShape}
          hasUnsaved={hasUnsaved}
          onSave={handleSave}
          onReset={handleReset}
          saving={saving}
          zoom={zoom}
        />
      </div>
    </div>
  );
}
