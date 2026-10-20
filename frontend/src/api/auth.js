

const API_URL = import.meta.env.VITE_API_URL;

export async function registerUser(userData) {
    const response = await fetch(`${API_URL}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(userData),
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.message || "Registration failed.");
    }

    return data;
}

export async function verifyOTP(verificationData) {
    const response = await fetch(`${API_URL}/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(verificationData),
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.message || "OTP verification failed.");
    }

    return data;
}

export async function loginUser(credentials) {
    const response = await fetch(`${API_URL}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.message || "Login failed.");
    }

    return data;
}


export async function requestPasswordReset(email) {
    const response = await fetch(`${API_URL}/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.message || "Unable to request a password reset.");
    }

    return data;
}

export async function resetPassword(resetData) {
    const response = await fetch(`${API_URL}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(resetData),
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.message || "Password reset failed.");
    }

    return data;
}

