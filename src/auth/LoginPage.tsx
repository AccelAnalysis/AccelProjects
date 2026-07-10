import { LogIn, UserPlus } from "lucide-react";
import { useState } from "react";
import { useAuth } from "./AuthProvider";
import accelLogo from "../../Accel_GOH_Logo.png";

const enableDevSignup = import.meta.env.DEV || import.meta.env.VITE_ENABLE_FIREBASE_SIGNUP === "true";

function authErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return "Authentication failed.";
  }

  return error.message.replace("Firebase: ", "").replace(/\s*\(auth\/.*\)\.?$/, ".");
}

export function LoginPage() {
  const { login, setupError, signup } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState(setupError);
  const [submitting, setSubmitting] = useState(false);

  async function submit(action: "login" | "signup") {
    setSubmitting(true);
    setErrorMessage("");

    try {
      if (action === "signup") {
        await signup(email, password);
      } else {
        await login(email, password);
      }
    } catch (error) {
      setErrorMessage(authErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-panel">
        <div className="login-brand">
          <span className="brand-logo">
            <img src={accelLogo} alt="AccelProjects" />
          </span>
          <div>
            <h1>AccelProjects</h1>
            <p>Sign in to the project operations workspace.</p>
          </div>
        </div>
        <form
          className="login-form"
          onSubmit={(event) => {
            event.preventDefault();
            void submit("login");
          }}
        >
          <label>
            Email
            <input
              autoComplete="email"
              disabled={Boolean(setupError) || submitting}
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label>
            Password
            <input
              autoComplete="current-password"
              disabled={Boolean(setupError) || submitting}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {errorMessage ? <p className="error-message">{errorMessage}</p> : null}
          <div className="button-row">
            <button className="action-button" disabled={Boolean(setupError) || submitting} type="submit">
              <LogIn size={18} aria-hidden="true" />
              Sign In
            </button>
            {enableDevSignup ? (
              <button
                className="secondary-button"
                disabled={Boolean(setupError) || submitting}
                type="button"
                onClick={() => void submit("signup")}
              >
                <UserPlus size={18} aria-hidden="true" />
                Dev Sign Up
              </button>
            ) : null}
          </div>
        </form>
      </section>
    </main>
  );
}
