"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { evaluateRecovery, type Invoice } from "@/domain/recovery";
import { parseInvoiceCsv } from "@/domain/csv";

type Row = Invoice;

export default function Dashboard() {
  const [rows, setRows] = useState<Row[]>([]);
  const [today, setToday] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setToday(new Date().toISOString().slice(0, 10)), 0);
    return () => window.clearTimeout(timer);
  }, []);
  const decisions = useMemo(() => today ? rows.map((invoice) => evaluateRecovery(invoice, today, { gracePeriodDays: 0, firstReminderAfterDays: 7, secondReminderAfterDays: 14, finalReminderAfterDays: 30 })) : [], [rows, today]);

  return <main className="mx-auto min-h-screen w-full max-w-6xl px-6 py-8 sm:px-10 lg:px-16">
    <nav className="flex items-center justify-between border-b border-slate-200 pb-6"><Link className="text-lg font-semibold text-slate-950" href="/">FlowRecovery</Link><span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800">Demo mode · no messages sent</span></nav>
    <section className="py-12"><p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-700">CSV recovery workspace</p><h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950">Import, review, recover.</h1><p className="mt-4 max-w-2xl leading-7 text-slate-600">Upload a CSV to classify overdue invoices and preview the next rule-based follow-up. This browser demo stores nothing and cannot contact customers.</p>
      <div className="mt-8 grid gap-6 lg:grid-cols-[0.8fr_1.2fr]"><div className="border border-slate-200 bg-white p-6 shadow-sm"><label className="block text-sm font-semibold text-slate-900" htmlFor="csv">Invoice CSV</label><p className="mt-2 text-sm text-slate-500">Required: invoice_number, customer_name, customer_email, due_date, amount_gbp</p><input id="csv" className="mt-5 block w-full rounded-md border border-slate-300 p-3 text-sm" type="file" accept=".csv,text/csv" onChange={(event) => { const file = event.target.files?.[0]; if (file) file.text().then((text) => setRows(parseInvoiceCsv(text, "demo-tenant").invoices)); }} /><label className="mt-6 block text-sm font-semibold text-slate-900" htmlFor="today">Evaluate as of</label><input id="today" className="mt-2 rounded-md border border-slate-300 p-2 text-sm" type="date" value={today} onChange={(event) => setToday(event.target.value)} /></div>
        <div className="border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center justify-between"><h2 className="font-semibold text-slate-950">Next actions</h2><span className="text-sm text-slate-500">{decisions.filter((decision) => decision.shouldCreateReminder).length} proposed reminders</span></div>{!rows.length ? <p className="mt-10 text-sm text-slate-500">Your imported invoices will appear here.</p> : <div className="mt-5 divide-y divide-slate-200">{rows.map((row, index) => <div className="flex items-center justify-between gap-4 py-4" key={row.invoiceNumber}><div><p className="font-medium text-slate-900">{row.customerName} · {row.invoiceNumber}</p><p className="text-sm text-slate-500">{row.customerEmail} · £{(row.amountMinor / 100).toFixed(2)}</p></div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${decisions[index]?.shouldCreateReminder ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-600"}`}>{decisions[index]?.shouldCreateReminder ? `${decisions[index].reminderStage} reminder` : decisions[index]?.reason}</span></div>)}</div>}</div></div>
    </section>
  </main>;
}

