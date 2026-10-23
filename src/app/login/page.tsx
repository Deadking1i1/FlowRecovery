import Link from "next/link";
import { signIn } from "./actions";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-12">
      <Link className="text-lg font-semibold tracking-tight text-slate-950" href="/">FlowRecovery</Link>
      <section className="mt-8 border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Sign in</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">Access your tenant&apos;s invoice recovery workspace.</p>
        <form className="mt-6 space-y-5" action={signIn}>
          <div>
            <label className="block text-sm font-semibold text-slate-900" htmlFor="email">Email</label>
            <input className="mt-2 block w-full rounded-md border border-slate-300 p-3 text-sm" id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-900" htmlFor="password">Password</label>
            <input className="mt-2 block w-full rounded-md border border-slate-300 p-3 text-sm" id="password" name="password" type="password" autoComplete="current-password" required />
          </div>
          <button className="w-full rounded-md bg-teal-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-teal-800 focus:outline-2 focus:outline-offset-2 focus:outline-teal-700" type="submit">Sign in</button>
        </form>
      </section>
    </main>
  );
}
