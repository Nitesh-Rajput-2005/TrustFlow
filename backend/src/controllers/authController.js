
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { Resend } = require("resend");
const User = require("../models/User");

const resend = new Resend(process.env.RESEND_API_KEY);

async function register(req, res) {
    try {
        const { name, email, password } = req.body;

        if (
            typeof name !== "string" ||
            name.trim().length < 2 ||
            name.trim().length > 60
        ) {
            return res.status(400).json({
                success: false,
                message: "Name must be between 2 and 60 characters.",
            });
        }

        if (
            typeof email !== "string" ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
        ) {
            return res.status(400).json({
                success: false,
                message: "Enter a valid email address.",
            });
        }

        if (typeof password !== "string" || password.length < 8 || password.length > 72) {
            return res.status(400).json({
                success: false,
                message: "Password must be between 8 and 72 characters.",
            });
        }

        const normalizedEmail = email.trim().toLowerCase();

        let user = await User.findOne({ email: normalizedEmail });

        if (user && user.isEmailVerified) {
            return res.status(409).json({
                success: false,
                message: "An account with this email already exists. Please log in.",
            });
        }

        const passwordHash = await bcrypt.hash(password, 12);
        const otp = crypto.randomInt(100000, 1000000).toString();
        const otpHash = crypto
            .createHash("sha256")
            .update(otp)
            .digest("hex");

        const now = new Date();

        if (!user) {
            user = new User({
                name: name.trim(),
                email: normalizedEmail,
                password: passwordHash,
                isEmailVerified: false,
            });
        } else {
            user.name = name.trim();
            user.password = passwordHash;
        }

        user.otpHash = otpHash;
        user.otpExpiresAt = new Date(now.getTime() + 10 * 60 * 1000);
        user.otpAttempts = 0;
        user.otpLastSentAt = now;

        await user.save();

        const { data, error } = await resend.emails.send({
            from: process.env.EMAIL_FROM,
            to: normalizedEmail,
            subject: "Verify your TrustFlow email",
            html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: auto;">
          <h2>Welcome to TrustFlow</h2>
          <p>Use the following one-time password to verify your email:</p>
          <p style="font-size: 30px; font-weight: bold; letter-spacing: 6px;">
            ${otp}
          </p>
          <p>This code expires in 10 minutes.</p>
          <p>If you did not request this, you can ignore this email.</p>
        </div>
      `,
        });

        if (error) {
            user.otpHash = undefined;
            user.otpExpiresAt = undefined;
            user.otpAttempts = 0;
            await user.save();

            console.error("Resend email error:", error.message);

            return res.status(502).json({
                success: false,
                message: "Unable to send the verification email. Please try again.",
            });
        }

        return res.status(201).json({
            success: true,
            message: "Registration started. Check your email for the OTP.",
            email: normalizedEmail,
        });
    } catch (error) {
        console.error("Registration error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Unable to register right now.",
        });
    }
}


async function verifyOTP(req, res) {
    try {
        const { email, otp } = req.body;

        if (
            typeof email !== "string" ||
            typeof otp !== "string" ||
            !/^\d{6}$/.test(otp)
        ) {
            return res.status(400).json({
                success: false,
                message: "Enter a valid email and six-digit OTP.",
            });
        }

        const normalizedEmail = email.trim().toLowerCase();

        const user = await User.findOne({ email: normalizedEmail })
            .select("+otpHash +otpExpiresAt +otpAttempts");

        if (!user || !user.otpHash || !user.otpExpiresAt) {
            return res.status(400).json({
                success: false,
                message: "No active OTP found. Please register again.",
            });
        }

        if (user.isEmailVerified) {
            return res.status(400).json({
                success: false,
                message: "This email is already verified. Please log in.",
            });
        }

        if (user.otpExpiresAt <= new Date()) {
            user.otpHash = undefined;
            user.otpExpiresAt = undefined;
            user.otpAttempts = 0;
            await user.save();

            return res.status(400).json({
                success: false,
                message: "OTP expired. Please request a new one.",
            });
        }

        if (user.otpAttempts >= 5) {
            user.otpHash = undefined;
            user.otpExpiresAt = undefined;
            user.otpAttempts = 0;
            await user.save();

            return res.status(429).json({
                success: false,
                message: "Too many incorrect attempts. Please register again to get a new OTP.",
            });
        }

        const submittedHash = crypto
            .createHash("sha256")
            .update(otp)
            .digest("hex");

        const hashesMatch = crypto.timingSafeEqual(
            Buffer.from(user.otpHash, "hex"),
            Buffer.from(submittedHash, "hex")
        );

        if (!hashesMatch) {
            user.otpAttempts += 1;
            await user.save();

            return res.status(400).json({
                success: false,
                message: "Incorrect OTP.",
            });
        }

        user.isEmailVerified = true;
        user.otpHash = undefined;
        user.otpExpiresAt = undefined;
        user.otpAttempts = 0;

        await user.save();

        return res.status(200).json({
            success: true,
            message: "Email verified successfully. You can now log in.",
        });
    } catch (error) {
        console.error("OTP verification error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Unable to verify OTP right now.",
        });
    }
}


async function login(req, res) {
    try {
        const { email, password } = req.body;

        if (
            typeof email !== "string" ||
            typeof password !== "string" ||
            !email.trim() ||
            !password
        ) {
            return res.status(400).json({
                success: false,
                message: "Email and password are required.",
            });
        }

        const normalizedEmail = email.trim().toLowerCase();

        const user = await User.findOne({ email: normalizedEmail })
            .select("+password");

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password.",
            });
        }

        const passwordMatches = await bcrypt.compare(
            password,
            user.password
        );

        if (!passwordMatches) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password.",
            });
        }

        if (!user.isEmailVerified) {
            return res.status(403).json({
                success: false,
                message: "Please verify your email before logging in.",
            });
        }

        const token = require("jsonwebtoken").sign(
            {
                userId: user._id.toString(),
            },
            process.env.JWT_SECRET,
            {
                expiresIn: "1d",
                issuer: "trustflow",
                audience: "trustflow-users",
            }
        );

        return res.status(200).json({
            success: true,
            message: "Login successful.",
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
            },
        });
    } catch (error) {
        console.error("Login error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Unable to log in right now.",
        });
    }
}


async function requestPasswordReset(req, res) {
    try {
        const { email } = req.body;

        if (
            typeof email !== "string" ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
        ) {
            return res.status(400).json({
                success: false,
                message: "Enter a valid email address.",
            });
        }

        const normalizedEmail = email.trim().toLowerCase();

        const user = await User.findOne({
            email: normalizedEmail,
            isEmailVerified: true,
        }).select("+resetOtpHash +resetOtpExpiresAt +resetOtpAttempts");

        // Use the same response whether the account exists or not.
        // This avoids revealing registered email addresses.
        const genericResponse = {
            success: true,
            message:
                "If a verified account exists for this email, a reset code will be sent.",
        };

        if (!user) {
            return res.status(200).json(genericResponse);
        }

        // Prevent repeatedly sending reset emails.
        if (
            user.resetOtpExpiresAt &&
            user.resetOtpExpiresAt > new Date()
        ) {
            return res.status(429).json({
                success: false,
                message: "A reset code is already active. Please try again later.",
            });
        }

        const otp = crypto.randomInt(100000, 1000000).toString();
        const otpHash = crypto
            .createHash("sha256")
            .update(otp)
            .digest("hex");

        user.resetOtpHash = otpHash;
        user.resetOtpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
        user.resetOtpAttempts = 0;

        await user.save();

        const { error } = await resend.emails.send({
            from: process.env.EMAIL_FROM,
            to: normalizedEmail,
            subject: "Reset your TrustFlow password",
            html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: auto;">
          <h2>TrustFlow password reset</h2>
          <p>Use this one-time code to reset your password:</p>
          <p style="font-size: 30px; font-weight: bold; letter-spacing: 6px;">
            ${otp}
          </p>
          <p>This code expires in 10 minutes.</p>
          <p>If you did not request this, you can ignore this email.</p>
        </div>
      `,
        });

        if (error) {
            user.resetOtpHash = undefined;
            user.resetOtpExpiresAt = undefined;
            user.resetOtpAttempts = 0;
            await user.save();

            console.error("Password reset email error:", error.message);

            return res.status(502).json({
                success: false,
                message: "Unable to send the reset email. Please try again.",
            });
        }

        return res.status(200).json(genericResponse);
    } catch (error) {
        console.error("Password reset request error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Unable to process the password reset right now.",
        });
    }
}


async function resetPassword(req, res) {
    try {
        const { email, otp, newPassword } = req.body;

        if (
            typeof email !== "string" ||
            typeof otp !== "string" ||
            !/^\d{6}$/.test(otp) ||
            typeof newPassword !== "string" ||
            newPassword.length < 8 ||
            newPassword.length > 72
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Enter a valid email, six-digit reset code, and password between 8 and 72 characters.",
            });
        }

        const normalizedEmail = email.trim().toLowerCase();

        const user = await User.findOne({
            email: normalizedEmail,
            isEmailVerified: true,
        }).select("+password +resetOtpHash +resetOtpExpiresAt +resetOtpAttempts");

        if (!user || !user.resetOtpHash || !user.resetOtpExpiresAt) {
            return res.status(400).json({
                success: false,
                message: "Invalid or expired reset code. Request a new code.",
            });
        }

        if (user.resetOtpExpiresAt <= new Date()) {
            user.resetOtpHash = undefined;
            user.resetOtpExpiresAt = undefined;
            user.resetOtpAttempts = 0;
            await user.save();

            return res.status(400).json({
                success: false,
                message: "Reset code expired. Please request a new one.",
            });
        }

        if (user.resetOtpAttempts >= 5) {
            user.resetOtpHash = undefined;
            user.resetOtpExpiresAt = undefined;
            user.resetOtpAttempts = 0;
            await user.save();

            return res.status(429).json({
                success: false,
                message: "Too many incorrect attempts. Request a new reset code.",
            });
        }

        const submittedHash = crypto
            .createHash("sha256")
            .update(otp)
            .digest("hex");

        const hashesMatch = crypto.timingSafeEqual(
            Buffer.from(user.resetOtpHash, "hex"),
            Buffer.from(submittedHash, "hex")
        );

        if (!hashesMatch) {
            user.resetOtpAttempts += 1;
            await user.save();

            return res.status(400).json({
                success: false,
                message: "Incorrect reset code.",
            });
        }

        user.password = await bcrypt.hash(newPassword, 12);
        user.resetOtpHash = undefined;
        user.resetOtpExpiresAt = undefined;
        user.resetOtpAttempts = 0;

        await user.save();

        return res.status(200).json({
            success: true,
            message: "Password reset successfully. Please log in with your new password.",
        });
    } catch (error) {
        console.error("Password reset error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Unable to reset the password right now.",
        });
    }
}

module.exports = {
    register,
    verifyOTP,
    login,
    requestPasswordReset,
    resetPassword,
};

