'use client';

import React, { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts';
import { fetchHourlyRevenue, type HourlyRevenue } from './shiftData';

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) => {
  if (!active || !payload || !payload.length) return null;
  const total = payload.reduce((a, p) => a + p.value, 0);
  return (
    <div className="glass-card-elevated rounded-xl border border-border p-3 shadow-2xl">
      <p className="text-xs font-semibold text-foreground mb-2">{label}</p>
      {payload.map(p => (
        <div key={`tt-${p.name}`} className="flex justify-between gap-4 text-xs">
          <span className="text-muted-foreground">{p.name}</span>
          <span className="text-foreground font-semibold text-tabular">${p.value}</span>
        </div>
      ))}
      <div className="flex justify-between gap-4 text-xs pt-1.5 border-t border-border mt-1.5">
        <span className="text-muted-foreground font-medium">Total</span>
        <span className="text-primary font-bold text-tabular">${total}</span>
      </div>
    </div>
  );
};

export default function ShiftRevenueChart() {
  const [data, setData] = useState<HourlyRevenue[]>([]);

  useEffect(() => {
    fetchHourlyRevenue().then(setData).catch(() => setData([]));
  }, []);

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }} barSize={14}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="hour" tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }} axisLine={false} tickLine={false} />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
        <Legend wrapperStyle={{ fontSize: 11, color: 'var(--muted-foreground)' }} />
        <Bar dataKey="cash" name="Cash" fill="var(--status-available)" radius={[3, 3, 0, 0]} stackId="a" />
        <Bar dataKey="card" name="Card" fill="var(--primary)" radius={[0, 0, 0, 0]} stackId="a" />
        <Bar dataKey="qr" name="QR" fill="var(--accent)" radius={[3, 3, 0, 0]} stackId="a" />
      </BarChart>
    </ResponsiveContainer>
  );
}
