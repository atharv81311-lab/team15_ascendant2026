import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase, Subscription, DetectedCharge, Frequency } from '../lib/supabase';
import CsvUpload from '../components/CsvUpload';
import {
  Wallet,
  LogOut,
  TrendingUp,
  TrendingDown,
  Trash2,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from 'recharts';

const FREQ_ANNUAL_FACTOR: Record<Frequency, number> = {
  weekly: 52,
  monthly: 12,
  yearly: 1,
};

function annualCost(amount: number, frequency: Frequency): number {
  return amount * FREQ_ANNUAL_FACTOR[frequency];
}

function formatCurrency(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingCharges, setSavingCharges] = useState(false);

  const fetchSubscriptions = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .order('amount', { ascending: false });

    if (error) {
      setError(error.message);
    } else {
      setSubscriptions((data as Subscription[]) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSubscriptions();
  }, [fetchSubscriptions]);

  const handleDetected = async (charges: DetectedCharge[]) => {
    if (charges.length === 0) return;
    setSavingCharges(true);
    setError(null);

    const rows = charges.map((c) => ({
      name: c.name,
      amount: c.amount,
      frequency: c.frequency,
    }));

    const { error } = await supabase
      .from('subscriptions')
      .upsert(rows, { onConflict: 'user_id,name,amount' });

    setSavingCharges(false);
    if (error) {
      setError(error.message);
      return;
    }
    await fetchSubscriptions();
  };

  const toggleStillUsing = async (id: string, current: boolean) => {
    // Optimistic update
    setSubscriptions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, still_using: !current } : s))
    );
    const { error } = await supabase
      .from('subscriptions')
      .update({ still_using: !current })
      .eq('id', id);

    if (error) {
      // Revert on failure
      setSubscriptions((prev) =>
        prev.map((s) => (s.id === id ? { ...s, still_using: current } : s))
      );
      setError(error.message);
    }
  };

  const handleDelete = async (id: string) => {
    const prev = subscriptions;
    setSubscriptions((p) => p.filter((s) => s.id !== id));
    const { error } = await supabase.from('subscriptions').delete().eq('id', id);
    if (error) {
      setSubscriptions(prev);
      setError(error.message);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  const totalAnnual = subscriptions.reduce((sum, s) => sum + annualCost(s.amount, s.frequency), 0);
  const wastedAnnual = subscriptions
    .filter((s) => !s.still_using)
    .reduce((sum, s) => sum + annualCost(s.amount, s.frequency), 0);
  const activeAnnual = totalAnnual - wastedAnnual;

  const chartData = subscriptions.map((s) => ({
    name: s.name.length > 14 ? s.name.slice(0, 13) + '…' : s.name,
    annual: Math.round(annualCost(s.amount, s.frequency)),
    still_using: s.still_using,
  }));

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-teal-500 flex items-center justify-center">
              <Wallet className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-slate-800">Waste Tracker</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline text-sm text-slate-500">{user?.email}</span>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition"
            >
              <LogOut className="w-4 h-4" />
              Log out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <SummaryCard
            label="Total annual spend"
            value={formatCurrency(totalAnnual)}
            icon={<TrendingUp className="w-4 h-4" />}
            tone="teal"
          />
          <SummaryCard
            label="Active subscriptions"
            value={formatCurrency(activeAnnual)}
            icon={<Wallet className="w-4 h-4" />}
            tone="slate"
          />
          <SummaryCard
            label="Wasted (not using)"
            value={formatCurrency(wastedAnnual)}
            icon={<TrendingDown className="w-4 h-4" />}
            tone="red"
          />
        </div>

        <CsvUpload onDetected={handleDetected} saving={savingCharges} />

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Subscriptions table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-semibold text-slate-800">Your subscriptions</h2>
            <span className="text-sm text-slate-500">{subscriptions.length} total</span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 text-teal-500 animate-spin" />
            </div>
          ) : subscriptions.length === 0 ? (
            <div className="py-16 text-center">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
                <Wallet className="w-5 h-5 text-slate-400" />
              </div>
              <p className="text-slate-600 font-medium">No subscriptions yet</p>
              <p className="text-sm text-slate-400 mt-1">
                Upload a CSV of your transactions to detect recurring charges.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50/60 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">
                    <th className="px-6 py-3">Name</th>
                    <th className="px-6 py-3">Amount</th>
                    <th className="px-6 py-3">Frequency</th>
                    <th className="px-6 py-3">Est. Annual Cost</th>
                    <th className="px-6 py-3">Still Using?</th>
                    <th className="px-6 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {subscriptions.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50/40 transition">
                      <td className="px-6 py-4">
                        <span className="font-medium text-slate-800">{s.name}</span>
                      </td>
                      <td className="px-6 py-4 text-slate-700">{formatCurrency(Number(s.amount))}</td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 capitalize">
                          {s.frequency}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-medium text-slate-800">
                        {formatCurrency(annualCost(Number(s.amount), s.frequency))}
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => toggleStillUsing(s.id, s.still_using)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                            s.still_using ? 'bg-teal-500' : 'bg-slate-300'
                          }`}
                          aria-label="Toggle still using"
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                              s.still_using ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                        </button>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => handleDelete(s.id)}
                          className="text-slate-400 hover:text-red-500 transition p-1 rounded"
                          aria-label="Delete subscription"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Chart */}
        {subscriptions.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h2 className="font-semibold text-slate-800 mb-1">Annual cost by subscription</h2>
            <p className="text-xs text-slate-500 mb-4">
              Red bars are subscriptions you've marked as not using.
            </p>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    interval={0}
                    angle={-15}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(v) => `$${v}`} />
                  <Tooltip
                    formatter={(v) => formatCurrency(Number(v))}
                    contentStyle={{
                      borderRadius: 8,
                      border: '1px solid #e2e8f0',
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="annual" radius={[4, 4, 0, 0]}>
                    {chartData.map((entry, i) => (
                      <Cell key={i} fill={entry.still_using ? '#14b8a6' : '#f87171'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone: 'teal' | 'slate' | 'red';
}) {
  const tones = {
    teal: 'bg-teal-50 text-teal-600',
    slate: 'bg-slate-100 text-slate-600',
    red: 'bg-red-50 text-red-600',
  } as const;
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-slate-500">{label}</span>
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${tones[tone]}`}>
          {icon}
        </div>
      </div>
      <p className="text-2xl font-bold text-slate-800">{value}</p>
    </div>
  );
}
