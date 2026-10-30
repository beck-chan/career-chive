"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { loginAction } from "@/app/actions/auth";
import { PasswordField } from "@/components/PasswordField";
import { careerchiveHref } from "@/lib/paths";

export function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  function clear() {
    setUsername("");
    setPassword("");
    setError("");
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    const result = await loginAction(username, password);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.replace(careerchiveHref("/"));
    router.refresh();
  }

  return (
    <div className="page-state">
      <p className="page-state-kicker">Login</p>
      <form
        className="login-form page-state-login"
        aria-label="Login"
        onSubmit={onSubmit}
      >
        <label className="setting-field">
          <span className="setting-label">Username</span>
          <input
            className="app-field"
            type="text"
            autoComplete="username"
            spellCheck={false}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
        </label>
        <div className="setting-field">
          <span className="setting-label">Password</span>
          <PasswordField value={password} onChange={setPassword} />
        </div>
        {error ? (
          <p className="login-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="day-form-actions">
          <button
            type="button"
            className="text-link"
            disabled={pending || (!username && !password && !error)}
            onClick={clear}
          >
            Clear
          </button>
          <button
            type="submit"
            className="text-btn"
            disabled={pending || !username.trim() || !password}
          >
            Submit
          </button>
        </div>
      </form>
    </div>
  );
}
