import { useState } from "react";
import "./Auth.css";
import {
    registerUser,
    verifyOTP,
    loginUser,
    requestPasswordReset,
    resetPassword,
} from "./api/auth";

export default function Auth({ onLogin, onClose, initialMode = "login" }) {
    const [mode, setMode] = useState(initialMode);
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [otp, setOtp] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    async function handleSubmit(event) {
        event.preventDefault();
        setMessage("");
        setError("");
        setLoading(true);
        try {
            if (mode === "signup") {
                const data = await registerUser({ name, email, password });
                setMessage(data.message || "Check your email for the OTP.");
                setMode("verify");
            } else if (mode === "verify") {
                const data = await verifyOTP({ email, otp });
                setMessage(data.message || "Email verified. You can now log in.");
                setMode("login");
            } else if (mode === "forgot") {
                const data = await requestPasswordReset(email);
                setMessage(data.message || "Check your email for a reset code.");
                setMode("reset");
            } else if (mode === "reset") {
                const data = await resetPassword({ email, otp, newPassword });
                setMessage(data.message || "Password reset successfully.");
                setPassword("");
                setNewPassword("");
                setOtp("");
                setMode("login");
            } else {
                const data = await loginUser({ email, password });
                if (!data.token) throw new Error("Login succeeded, but no authentication token was returned.");
                onLogin(data.token, data.user);
            }
        } catch (err) {
            setError(err.message || "Something went wrong.");
        } finally {
            setLoading(false);
        }
    }

    const titles = {
        signup: "Create your account",
        verify: "Verify your email",
        forgot: "Forgot your password?",
        reset: "Reset your password",
        login: "Welcome back",
    };
    const descriptions = {
        signup: "Create an account to manage your sharing rooms.",
        verify: `Enter the OTP sent to ${email}.`,
        forgot: "Enter your email to receive a password reset code.",
        reset: `Enter the reset code sent to ${email} and choose a new password.`,
        login: "Log in to create and manage your rooms.",
    };
    const submitLabels = {
        signup: "Create account",
        verify: "Verify email",
        forgot: "Send reset code",
        reset: "Reset password",
        login: "Log in",
    };

    return (
        <div className="room-modal-backdrop auth-backdrop" onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose();
        }}>
            <section className="room-modal auth-modal auth-card" role="dialog" aria-modal="true" aria-labelledby="auth-title">
                <button className="room-modal-close" type="button" onClick={onClose} aria-label="Close authentication">×</button>
                <div className="auth-brand-mark" aria-hidden="true">T</div>
                <p className="eyebrow auth-eyebrow">TRUSTFLOW ACCOUNT</p>
                <h2 id="auth-title">{titles[mode]}</h2>
                <p className="auth-description">{descriptions[mode]}</p>

                <form onSubmit={handleSubmit} className="auth-form">
                    {mode === "signup" && <>
                        <label htmlFor="auth-name">Full name</label>
                        <input id="auth-name" value={name} onChange={(e) => setName(e.target.value)} minLength={2} maxLength={60} autoComplete="name" placeholder="Your full name" required />
                    </>}
                    {mode !== "verify" && mode !== "reset" && <>
                        <label htmlFor="auth-email">Email address</label>
                        <input id="auth-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@example.com" required />
                    </>}
                    {(mode === "login" || mode === "signup") && <>
                        <label htmlFor="auth-password">Password</label>
                        <input id="auth-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} autoComplete={mode === "signup" ? "new-password" : "current-password"} placeholder={mode === "signup" ? "At least 8 characters" : "Enter your password"} required />
                    </>}
                    {(mode === "verify" || mode === "reset") && <>
                        <label htmlFor="auth-otp">{mode === "verify" ? "Email verification code" : "Password reset code"}</label>
                        <input id="auth-otp" type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="Enter your 6-digit code" autoComplete="one-time-code" required />
                    </>}
                    {mode === "reset" && <>
                        <label htmlFor="auth-new-password">New password</label>
                        <input id="auth-new-password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={8} maxLength={72} autoComplete="new-password" placeholder="At least 8 characters" required />
                    </>}
                    <button className="button button-primary auth-submit" type="submit" disabled={loading}>
                        {loading ? "Please wait..." : submitLabels[mode]}
                    </button>
                </form>

                {error && <p className="room-error auth-feedback">{error}</p>}
                {message && <p className="room-success auth-feedback">{message}</p>}

                {mode === "login" && <>
                    <p className="auth-link-row"><button className="auth-text-button" type="button" onClick={() => { setError(""); setMessage(""); setOtp(""); setNewPassword(""); setMode("forgot"); }}>Forgot password?</button></p>
                    <p className="auth-bottom-copy">New to TrustFlow? <button className="auth-text-button" type="button" onClick={() => { setError(""); setMessage(""); setMode("signup"); }}>Create account</button></p>
                </>}
                {(mode === "forgot" || mode === "reset") && <p className="auth-bottom-copy">Remembered your password? <button className="auth-text-button" type="button" onClick={() => { setError(""); setMessage(""); setOtp(""); setNewPassword(""); setMode("login"); }}>Back to login</button></p>}
                {mode === "signup" && <p className="auth-bottom-copy">Already registered? <button className="auth-text-button" type="button" onClick={() => { setError(""); setMessage(""); setMode("login"); }}>Log in</button></p>}
                {mode === "verify" && <p className="auth-bottom-copy">Wrong email? <button className="auth-text-button" type="button" onClick={() => { setError(""); setMessage(""); setMode("signup"); }}>Go back</button></p>}
                <div className="auth-security-note"><span>✓</span> Your account details are handled securely.</div>
            </section>
        </div>
    );
}
