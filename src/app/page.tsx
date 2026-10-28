"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@example.com");
  const [password, setPassword] = useState("demo-password");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function login(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        setError(result?.error || `Sign in failed (${response.status})`);
        return;
      }
      router.replace("/dashboard");
    } catch {
      setError("The backend is waking up or unavailable. Wait a few seconds and try again.");
    } finally {
      setLoading(false);
    }
  }
  return <main className="min-h-screen bg-[#f5f7fa] grid place-items-center p-6"><form onSubmit={login} className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl"><div className="mb-8 flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-xl bg-[#003087] text-2xl text-white">⬡</span><div><h1 className="text-xl font-bold text-[#003087]">Agent Wallet Guard</h1><p className="text-sm text-[#6c7378]">Sandbox control center</p></div></div><div className="mb-5 rounded-lg bg-[#fff7df] p-3 text-sm text-[#765500]">SANDBOX MODE · No live payments</div><label className="mb-4 block text-sm font-medium">Email<input autoComplete="email" className="mt-1 w-full rounded-lg border p-3" value={email} onChange={e => setEmail(e.target.value)} /></label><label className="mb-5 block text-sm font-medium">Password<input autoComplete="current-password" type="password" className="mt-1 w-full rounded-lg border p-3" value={password} onChange={e => setPassword(e.target.value)} /></label>{error && <p className="mb-3 text-sm text-[#d0021b]">{error}</p>}<button disabled={loading} className="w-full rounded-lg bg-[#ffc439] px-4 py-3 font-semibold text-[#003087] disabled:opacity-60">{loading ? "Signing in…" : "Sign in"}</button><p className="mt-4 text-xs text-[#6c7378]">Demo credentials are configured through ADMIN_EMAIL and ADMIN_PASSWORD.</p></form></main>;
}
