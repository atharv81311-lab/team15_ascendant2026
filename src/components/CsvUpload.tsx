import { useRef, useState } from 'react';
import Papa from 'papaparse';
import { Upload, FileText, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { detectRecurringCharges, Transaction } from '../lib/detectRecurring';
import type { DetectedCharge } from '../lib/supabase';

interface Props {
  onDetected: (charges: DetectedCharge[]) => void;
  saving?: boolean;
}

/** Find the first key in a row that contains one of the substrings (case-insensitive). */
function findColumn(keys: string[], needles: string[]): string | undefined {
  const lower = keys.map((k) => k.toLowerCase());
  for (const needle of needles) {
    const idx = lower.findIndex((k) => k.includes(needle));
    if (idx !== -1) return keys[idx];
  }
  return undefined;
}

export default function CsvUpload({ onDetected, saving }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<'idle' | 'parsing' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');

  const handleFile = (file: File) => {
    setFileName(file.name);
    setStatus('parsing');
    setMessage('');

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = (results.data as Record<string, string>[]).filter(
          (r) => Object.keys(r).length > 0
        );
        if (rows.length === 0) {
          setStatus('error');
          setMessage('CSV appears to be empty.');
          return;
        }

        const keys = Object.keys(rows[0]);
        const dateCol = findColumn(keys, ['date', 'time', 'posted', 'trans']);
        const descCol = findColumn(keys, ['desc', 'merchant', 'name', 'payee', 'memo']);
        const amountCol = findColumn(keys, ['amount', 'amt', 'value', 'total', 'debit']);

        if (!dateCol || !descCol || !amountCol) {
          setStatus('error');
          setMessage(
            `Could not detect required columns. Found date=${dateCol ?? '—'}, description=${descCol ?? '—'}, amount=${amountCol ?? '—'}.`
          );
          return;
        }

        const transactions: Transaction[] = rows
          .map((r) => ({
            date: r[dateCol],
            description: r[descCol],
            amount: parseFloat(String(r[amountCol]).replace(/[$,\s]/g, '')),
          }))
          .filter((t) => t.description && !Number.isNaN(Date.parse(t.date)) && !Number.isNaN(t.amount));

        if (transactions.length === 0) {
          setStatus('error');
          setMessage('No valid transactions found after parsing.');
          return;
        }

        const charges = detectRecurringCharges(transactions);
        if (charges.length === 0) {
          setStatus('done');
          setMessage(`Parsed ${transactions.length} transactions, but no recurring charges were detected.`);
          onDetected([]);
          return;
        }

        setStatus('done');
        setMessage(`Detected ${charges.length} recurring charge${charges.length === 1 ? '' : 's'} from ${transactions.length} transactions.`);
        onDetected(charges);
      },
      error: (err) => {
        setStatus('error');
        setMessage(err.message || 'Failed to parse CSV.');
      },
    });
  };

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center">
          <Upload className="w-4 h-4 text-teal-600" />
        </div>
        <div>
          <h2 className="font-semibold text-slate-800">Upload transactions CSV</h2>
          <p className="text-xs text-slate-500">We'll auto-detect recurring charges.</p>
        </div>
      </div>

      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer.files?.[0];
          if (file) handleFile(file);
        }}
        className="cursor-pointer rounded-xl border-2 border-dashed border-slate-200 hover:border-teal-400 hover:bg-teal-50/30 transition p-6 text-center"
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={onInputChange}
        />
        {status === 'parsing' ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="w-6 h-6 text-teal-500 animate-spin" />
            <p className="text-sm text-slate-600">Parsing & detecting recurring charges…</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <FileText className="w-6 h-6 text-slate-400" />
            <p className="text-sm text-slate-600">
              <span className="text-teal-600 font-medium">Click to upload</span> or drag a CSV here
            </p>
            <p className="text-xs text-slate-400">Expected columns: date, description, amount (flexible)</p>
          </div>
        )}
      </div>

      {fileName && status !== 'parsing' && (
        <p className="text-xs text-slate-500 mt-3 flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5" /> {fileName}
        </p>
      )}

      {status === 'done' && message && (
        <div className="flex items-start gap-2 mt-3 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm">
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{message}</span>
        </div>
      )}
      {status === 'error' && message && (
        <div className="flex items-start gap-2 mt-3 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {saving && (
        <p className="text-xs text-slate-500 mt-3 flex items-center gap-1.5">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving detected charges…
        </p>
      )}
    </div>
  );
}
