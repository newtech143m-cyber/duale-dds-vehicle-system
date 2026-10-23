"use client";

import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const NAVY = "#1b3766";
const TEAL = "#129a9a";
const STATUS_COLORS: Record<string, string> = {
  PAID: "#16a34a", EXEMPT: "#3b82f6", PARTIALLY_PAID: "#d97706", UNPAID: "#dc2626", OVERDUE: "#991b1b", UNDER_REVIEW: "#a16207", NOT_ASSESSED: "#94a3b8",
};
const axis = { fontSize: 12, fill: "#5b6678" };

export function MonthlyBars({ data, label }: { data: { month: string; registrations: number }[]; label: string }) {
  if (!data.length) return <EmptyChart />;
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="#e3e8ef" />
        <XAxis dataKey="month" tick={axis} tickLine={false} axisLine={false} />
        <YAxis allowDecimals={false} tick={axis} tickLine={false} axisLine={false} />
        <Tooltip cursor={{ fill: "#f3f6fb" }} />
        <Bar dataKey="registrations" name={label} fill={NAVY} radius={[6, 6, 0, 0]} maxBarSize={36} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function CollectionLine({ data, label }: { data: { month: string; amount: number }[]; label: string }) {
  if (!data.length) return <EmptyChart />;
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="#e3e8ef" />
        <XAxis dataKey="month" tick={axis} tickLine={false} axisLine={false} />
        <YAxis tick={axis} tickLine={false} axisLine={false} width={70} tickFormatter={(v: number) => v.toLocaleString("en-US")} />
        <Tooltip formatter={(v) => `ETB ${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2 })}`} />
        <Line type="monotone" dataKey="amount" name={label} stroke={TEAL} strokeWidth={2.5} dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function StatusDonut({ data }: { data: { key: string; label: string; value: number }[] }) {
  const rows = data.filter((d) => d.value > 0);
  if (!rows.length) return <EmptyChart />;
  return (
    <div className="flex flex-col sm:flex-row items-center gap-4">
      <ResponsiveContainer width="100%" height={200} className="max-w-[220px]">
        <PieChart>
          <Pie data={rows} dataKey="value" nameKey="label" innerRadius={55} outerRadius={85} paddingAngle={2} stroke="none">
            {rows.map((r) => <Cell key={r.key} fill={STATUS_COLORS[r.key] ?? NAVY} />)}
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
      <ul className="text-sm space-y-1.5 w-full">
        {rows.map((r) => (
          <li key={r.key} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_COLORS[r.key] ?? NAVY }} />{r.label}</span>
            <span className="font-medium tabular-nums">{r.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CategoryBars({ data }: { data: { name: string; n: number }[] }) {
  if (!data.length) return <EmptyChart />;
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, data.length * 36)}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
        <XAxis type="number" hide allowDecimals={false} />
        <YAxis type="category" dataKey="name" tick={axis} tickLine={false} axisLine={false} width={130} />
        <Tooltip cursor={{ fill: "#f3f6fb" }} />
        <Bar dataKey="n" fill={TEAL} radius={[0, 6, 6, 0]} maxBarSize={22} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function EmptyChart() {
  return <div className="h-[200px] grid place-items-center text-sm text-muted">—</div>;
}
