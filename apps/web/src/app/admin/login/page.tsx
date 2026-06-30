import Link from "next/link";

export default function AdminLoginPage() {
  return (
    <main className="auth-shell">
      <section className="login-panel">
        <p className="eyebrow">Admin</p>
        <h1>Crawler access</h1>
        <form action="/api/admin/login" method="post" className="login-form">
          <label>
            Password
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          <button type="submit">Sign in</button>
        </form>
        <Link className="text-link" href="/">
          Back to analytics
        </Link>
      </section>
    </main>
  );
}
