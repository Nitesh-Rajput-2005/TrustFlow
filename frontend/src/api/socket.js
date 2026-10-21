
import { io } from "socket.io-client";

const API_URL = import.meta.env.VITE_API_URL;

const socket = io(API_URL, {
    autoConnect: false,
    auth: (callback) => {
        const ownerToken = localStorage.getItem("trustflow_token");
        const guestToken = localStorage.getItem("trustflow_guest_token");

        callback({
            token: ownerToken || guestToken,
            role: ownerToken ? "owner" : "guest",
        });
    },
});

socket.on("connect", () => {
    console.log("TrustFlow socket connected:", socket.id);
});

socket.on("connect_error", (error) => {
    console.error("TrustFlow socket connection error:", error.message);
});

export default socket;
