"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LockKeyhole, ShieldCheck } from "lucide-react";

export default function Home() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@example.com");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/auth/login", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
      const result = await response.json().catch(() => null);
      if (!response.ok) { setError(result?.error || "Sign in failed. Check your credentials and try again."); return; }
      router.replace("/dashboard");
    } catch {
      setError("The dashboard could not connect. Check that the app and database are running, then try again.");
    } finally { setLoading(false); }
  }

  return <main className="login-page">
    <section className="login-story">
      <div className="login-brand"><span><ShieldCheck size={23} /></span><strong>Agent Wallet Guard</strong></div>
      <div className="login-story-copy"><span className="login-kicker">PAYMENTS WITH GUARDRAILS</span><h1>Give agents room to act. Keep the final say.</h1><p>Every request meets your spending rules before it reaches PayPal Sandbox. Risky or unusual purchases come back to you first.</p></div>
      <div className="login-story-foot"><LockKeyhole size={15} /> Signed mandates · Spending limits · Verifiable activity</div>
    </section>
    <section className="login-side"><form className="login-form" onSubmit={login}>
      <div className="login-mobile-brand"><span><ShieldCheck size={20} /></span><strong>Agent Wallet Guard</strong></div>
      <p className="login-kicker">WALLET OWNER ACCESS</p><h2>Welcome back</h2><p className="login-subtitle">Sign in to manage agents and payment rules.</p>
      <div className="login-sandbox"><span className="sandbox-dot" /><div><strong>Sandbox environment</strong><span>No live payments can be made</span></div></div>
      <label>Email address<input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></label>
      <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" /></label>
      {error && <p className="login-error" role="alert">{error}</p>}
      <button className="login-submit" disabled={loading}>{loading ? "Signing in…" : <>Sign in <ArrowRight size={17} /></>}</button>
      <p className="login-help">Demo access is set by <code>ADMIN_EMAIL</code> and <code>ADMIN_PASSWORD</code>.</p>
    </form><footer className="login-footer">Agent Wallet Guard <span>Sandbox control center</span></footer></section>
  </main>;
}
