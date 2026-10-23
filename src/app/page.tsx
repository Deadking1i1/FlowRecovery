import Link from "next/link";

const workflowSteps = [
  ["01", "Import invoices", "Upload a CSV from the accounting system."],
  ["02", "Review next actions", "See which invoices are overdue and why."],
  ["03", "Preview follow-ups", "Approve the exact reminder before anything is sent."],
];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 py-8 sm:px-10 lg:px-16">
      <nav className="flex items-center justify-between border-b border-slate-200 pb-6" aria-label="Primary navigation">
        <Link className="text-lg font-semibold tracking-tight text-slate-950" href="/">FlowRecovery</Link>
        <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800">Preview mode · sending disabled</span>
      </nav>

      <section className="grid flex-1 items-center gap-12 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:py-24">
        <div>
          <p className="mb-5 text-sm font-semibold uppercase tracking-[0.18em] text-teal-700">Cash flow, made deliberate</p>
          <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-slate-950 sm:text-6xl">Stop losing hours to overdue invoices.</h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600">FlowRecovery turns a clean invoice list into clear, explainable next actions—using rules your team can understand and control.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link className="rounded-md bg-teal-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-teal-800 focus:outline-2 focus:outline-offset-2 focus:outline-teal-700" href="/dashboard">Try the CSV workspace</Link>
            <a className="rounded-md border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-500 focus:outline-2 focus:outline-offset-2 focus:outline-teal-700" href="#safety">Understand the controls</a>
          </div>
        </div>

        <aside className="border border-slate-200 bg-white p-6 shadow-sm" aria-label="Recovery preview">
          <div className="flex items-center justify-between border-b border-slate-200 pb-5">
            <div><p className="text-sm font-medium text-slate-500">Recovery overview</p><p className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">£18,420</p></div>
            <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">7 overdue</span>
          </div>
          <div className="space-y-4 py-5">
            {[["Acme Workshop", "£4,800", "Final review"], ["Northstar Studio", "£2,140", "First reminder"], ["Harrison & Co", "£980", "Paused · dispute"]].map(([name, amount, action]) => (
              <div className="flex items-center justify-between gap-4" key={name}>
                <div><p className="font-medium text-slate-800">{name}</p><p className="text-sm text-slate-500">{action}</p></div>
                <p className="font-semibold text-slate-900">{amount}</p>
              </div>
            ))}
          </div>
          <p className="border-t border-slate-200 pt-4 text-sm text-slate-500">No customer message is sent from this preview.</p>
        </aside>
      </section>

      <section id="workflow" className="border-t border-slate-200 py-12">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-700">The first release</p>
        <div className="mt-6 grid gap-8 md:grid-cols-3">
          {workflowSteps.map(([number, title, copy]) => <article key={number}><p className="text-sm font-semibold text-slate-400">{number}</p><h2 className="mt-3 text-lg font-semibold text-slate-950">{title}</h2><p className="mt-2 leading-7 text-slate-600">{copy}</p></article>)}
        </div>
      </section>

      <section id="safety" className="mb-8 border border-slate-200 bg-slate-50 p-6 sm:p-8">
        <h2 className="text-lg font-semibold text-slate-950">Built to be reviewed before it acts</h2>
        <p className="mt-2 max-w-3xl leading-7 text-slate-600">Every decision is deterministic and auditable. Paid, disputed, and paused invoices stop automatically, while the current release records proposed reminders instead of sending them.</p>
      </section>
    </main>
  );
}
