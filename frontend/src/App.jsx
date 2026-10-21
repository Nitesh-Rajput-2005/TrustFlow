
import { useEffect, useRef, useState } from "react";
import socket from "./api/socket";
import "./App.css";
import RoomPage from "./RoomPage";
import Auth from "./Auth";
const API_URL = import.meta.env.VITE_API_URL;

function App() {
  const [backendStatus, setBackendStatus] = useState("Checking connection...");

  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState("login");

  const [authToken, setAuthToken] = useState(
    () => localStorage.getItem("trustflow_token")
  );

  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const savedUser = localStorage.getItem("trustflow_user");
      return savedUser ? JSON.parse(savedUser) : null;
    } catch {
      return null;
    }
  });

  function handleLogin(token, user) {
    localStorage.setItem("trustflow_token", token);
    localStorage.setItem("trustflow_user", JSON.stringify(user));

    setAuthToken(token);
    setCurrentUser(user);
    setCurrentPage("dashboard");
    setShowAuth(false);

  }

  useEffect(() => {
    fetch(`${API_URL}/api/health`)
      .then((response) => {
        if (!response.ok) {
          throw new Error("Backend unavailable");
        }
        return response.json();
      })
      .then((data) => {
        setBackendStatus(data.message);
      })
      .catch(() => {
        setBackendStatus("Backend connection unavailable");
      });
  }, []);

  useEffect(() => {
    socket.connect();

    return () => {
      socket.disconnect();
    };
  }, []);

  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [roomName, setRoomName] = useState("");
  const [expiryHours, setExpiryHours] = useState("24");
  const [createdRoom, setCreatedRoom] = useState(null);
  const [roomError, setRoomError] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeRoom, setActiveRoom] = useState(null);
  const [activeParticipantType, setActiveParticipantType] = useState(null);
  const [myRooms, setMyRooms] = useState([]);
  const [pendingRequestCounts, setPendingRequestCounts] = useState({});
  const [myRoomsLoading, setMyRoomsLoading] = useState(false);
  const [myRoomsError, setMyRoomsError] = useState("");
  const [roomGuests, setRoomGuests] = useState([]);
  const [guestsLoading, setGuestsLoading] = useState(false);
  const [guestsError, setGuestsError] = useState("");
  const [showJoinRoom, setShowJoinRoom] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [guestName, setGuestName] = useState("");
  const [roomFiles, setRoomFiles] = useState([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [joinedRoom, setJoinedRoom] = useState(null);
  const [joinError, setJoinError] = useState("");
  const [joining, setJoining] = useState(false);
  const [pendingJoinRequest, setPendingJoinRequest] = useState(null);
  const [restoredRequestCheck, setRestoredRequestCheck] = useState(false);
  const cancelJoinRequestRef = useRef(false);
  const [historyRoom, setHistoryRoom] = useState(null);
  const [roomHistory, setRoomHistory] = useState([]);
  const [historyVerification, setHistoryVerification] = useState(null);
  const [currentPage, setCurrentPage] = useState("dashboard");


  useEffect(() => {
    if (authToken && currentUser && currentPage === "dashboard") {
      loadMyRooms();
    }
  }, [authToken, currentUser, currentPage]);



  useEffect(() => {
    if (!authToken || !currentUser || currentPage !== "dashboard") {
      return;
    }

    const subscribedRoomIds = [];

    const subscribeToRooms = () => {
      myRooms.forEach((room) => {
        if (!room.id || subscribedRoomIds.includes(room.id)) {
          return;
        }

        socket.emit("room:subscribe", room.id, (result) => {
          if (result?.success) {
            subscribedRoomIds.push(room.id);
            console.log("Subscribed to room events:", room.id);
          } else {
            console.error(
              "Room subscription failed:",
              room.id,
              result?.message
            );
          }
        });
      });
    };

    const refreshMyRooms = (event) => {
      if (!event?.roomId) return;

      if (myRooms.some((room) => room.id === event.roomId)) {
        loadMyRooms();
      }
    };

    if (socket.connected) {
      subscribeToRooms();
    }

    socket.on("connect", subscribeToRooms);
    socket.on("join-request:new", refreshMyRooms);
    socket.on("join-request:updated", refreshMyRooms);

    return () => {
      socket.off("connect", subscribeToRooms);
      socket.off("join-request:new", refreshMyRooms);
      socket.off("join-request:updated", refreshMyRooms);

      subscribedRoomIds.forEach((roomId) => {
        socket.emit("room:unsubscribe", roomId);
      });
    };
  }, [authToken, currentUser, currentPage, myRooms]);



  useEffect(() => {
    const savedRequest = localStorage.getItem("trustflow_pending_request");

    if (!savedRequest) return;

    try {
      const request = JSON.parse(savedRequest);

      if (!request.requestToken) {
        localStorage.removeItem("trustflow_pending_request");
        return;
      }

      setPendingJoinRequest(request);
      setRestoredRequestCheck(true);
    } catch {
      localStorage.removeItem("trustflow_pending_request");
    }
  }, []);

  useEffect(() => {
    if (!restoredRequestCheck || !pendingJoinRequest?.requestToken) {
      return;
    }

    let cancelled = false;

    async function checkRestoredRequest() {
      const { requestToken } = pendingJoinRequest;

      try {
        while (!cancelled) {
          const statusResponse = await fetch(
            `${API_URL}/api/guests/join-request-status`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ requestToken }),
            }
          );

          const statusData = await statusResponse.json();

          if (!statusResponse.ok) {
            throw new Error(
              statusData.message || "Unable to check request status."
            );
          }

          if (cancelled) return;

          if (statusData.status === "pending") {
            await new Promise((resolve) => setTimeout(resolve, 2000));
            continue;
          }

          if (statusData.status === "accepted") {
            localStorage.setItem("trustflow_guest_token", requestToken);
            localStorage.removeItem("trustflow_pending_request");

            setPendingJoinRequest(null);
            setRestoredRequestCheck(false);

            setJoinedRoom({
              ...statusData.room,
              guest: statusData.guest,
              sessionExpiresAt: statusData.sessionExpiresAt,
            });

            setActiveRoom(statusData.room);
            setActiveParticipantType("guest");

            await loadRoomFiles(statusData.room.id);
            return;
          }

          if (
            statusData.status === "rejected" ||
            statusData.status === "withdrawn"
          ) {
            localStorage.removeItem("trustflow_pending_request");
            localStorage.removeItem("trustflow_guest_token");

            setPendingJoinRequest(null);
            setRestoredRequestCheck(false);

            if (statusData.status === "rejected") {
              localStorage.removeItem("trustflow_guest_token");
              localStorage.removeItem("trustflow_pending_request");

              setPendingJoinRequest(null);
              setRestoredRequestCheck(false);

              setJoinError("Your join request was rejected by the room owner.");
              return;
            }

            return;
          }

          return;
        }
      } catch (error) {
        if (!cancelled) {
          setJoinError(
            error.message === "Failed to fetch"
              ? "Cannot connect to the server. Check your internet connection."
              : error.message
          );
        }
      }
    }

    checkRestoredRequest();

    return () => {
      cancelled = true;
    };
  }, [restoredRequestCheck, pendingJoinRequest]);

  async function handleCreateRoom(event) {
    event.preventDefault();
    setRoomError("");
    setCreatedRoom(null);
    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/rooms`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          name: roomName,
          expiryHours: Number(expiryHours),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to create room.");
      }

      setCreatedRoom(data.room);
      setRoomName("");

      setActiveRoom(data.room);
      setActiveParticipantType("creator");
      setShowCreateRoom(false);
      loadRoomGuests(data.room.id);
    } catch (error) {
      setRoomError(
        error.message === "Failed to fetch"
          ? "Cannot connect to the server. Check that your backend is running."
          : error.message
      );
    } finally {
      setLoading(false);
    }
  }


  async function loadMyRooms() {
    if (!authToken) {
      setMyRooms([]);
      return;
    }

    setMyRoomsLoading(true);
    setMyRoomsError("");

    try {
      const response = await fetch(
        `${API_URL}/api/rooms/my-rooms`,
        {
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Unable to load your rooms.");
      }

      const rooms = data.rooms || [];
      setMyRooms(rooms);
      await loadPendingRequestCounts(rooms);
    } catch (error) {
      setMyRoomsError(
        error.message === "Failed to fetch"
          ? "Cannot connect to the server. Check that your backend is running."
          : error.message
      );
    } finally {
      setMyRoomsLoading(false);
    }
  }


  async function loadRoomHistory(roomId) {
    setHistoryRoom(null);
    setRoomHistory([]);
    setHistoryVerification(null);

    try {
      const [historyResponse, verifyResponse] = await Promise.all([
        fetch(`${API_URL}/api/audit/rooms/${roomId}/history`, {
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        }),
        fetch(`${API_URL}/api/audit/rooms/${roomId}/verify`, {
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        }),
      ]);

      const historyResult = await historyResponse.json();
      const verifyResult = await verifyResponse.json();

      if (!historyResponse.ok) {
        throw new Error(
          historyResult.message || "Unable to load room history."
        );
      }

      if (!verifyResponse.ok) {
        throw new Error(
          verifyResult.message || "Unable to verify room history."
        );
      }

      setHistoryRoom(historyResult.room);
      setRoomHistory(historyResult.events || []);
      setHistoryVerification(verifyResult.verification);
      return true;
    } catch (error) {
      window.alert(error.message || "Unable to load room history.");
      return false;
    }
  }


  async function loadRoomGuests(roomId) {
    if (!authToken || !roomId) {
      setRoomGuests([]);
      return;
    }

    setGuestsLoading(true);
    setGuestsError("");

    try {
      const response = await fetch(
        `${API_URL}/api/guests/rooms/${roomId}/guests`,
        {
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Unable to load room guests.");
      }

      setRoomGuests(data.guests || []);
    } catch (error) {
      setGuestsError(
        error.message === "Failed to fetch"
          ? "Cannot connect to the server. Check that your backend is running."
          : error.message
      );
    } finally {
      setGuestsLoading(false);
    }
  }


  async function loadPendingRequestCounts(rooms = myRooms) {
    if (!authToken || rooms.length === 0) {
      setPendingRequestCounts({});
      return;
    }

    const counts = {};

    await Promise.all(
      rooms.map(async (room) => {
        try {
          const response = await fetch(
            `${API_URL}/api/guests/rooms/${room.id}/join-requests`,
            {
              headers: {
                Authorization: `Bearer ${authToken}`,
              },
            }
          );

          if (!response.ok) return;

          const data = await response.json();
          counts[room.id] = (data.requests || []).length;
        } catch {
          // Keep the dashboard usable if one room's request count fails.
        }
      })
    );

    setPendingRequestCounts(counts);
  }




  async function handleJoinRoom(event) {
    event.preventDefault();

    cancelJoinRequestRef.current = false;

    setJoinError("");
    setJoinedRoom(null);

    if (guestName.trim().length < 2) {
      setJoinError("Please enter a name with at least 2 characters.");
      return;
    }

    setJoining(true);

    try {
      const response = await fetch(
        `${API_URL}/api/guests/request-join`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            inviteCode: inviteCode.trim(),
            displayName: guestName.trim(),
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Unable to send join request.");
      }

      const requestToken = data.requestToken;

      if (!requestToken) {
        throw new Error("The server did not return a request token.");
      }

      localStorage.setItem("trustflow_guest_token", requestToken);

      setPendingJoinRequest({
        requestToken,
        inviteCode: inviteCode.trim(),
        guestName: guestName.trim(),
      });

      localStorage.setItem("trustflow_pending_request", JSON.stringify({
        requestToken,
        inviteCode: inviteCode.trim(),
        guestName: guestName.trim(),
      }));

      alert("Join request sent. Waiting for the room owner to respond.");

      while (true) {
        await new Promise((resolve) => setTimeout(resolve, 1000));

        if (cancelJoinRequestRef.current) {
          break;
        }

        const statusResponse = await fetch(
          `${API_URL}/api/guests/join-request-status`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ requestToken }),
          }
        );

        const statusData = await statusResponse.json();

        if (!statusResponse.ok) {
          throw new Error(
            statusData.message || "Unable to check request status."
          );
        }

        if (statusData.status === "pending") {
          continue;
        }

        if (statusData.status === "rejected") {
          localStorage.removeItem("trustflow_guest_token");
          localStorage.removeItem("trustflow_pending_request");

          setPendingJoinRequest(null);
          setRestoredRequestCheck(false);

          throw new Error("Your join request was rejected by the room owner.");
        }

        if (statusData.status === "withdrawn") {
          localStorage.removeItem("trustflow_guest_token");
          localStorage.removeItem("trustflow_pending_request");
          setPendingJoinRequest(null);
          break;
        }

        if (statusData.status === "accepted") {
          localStorage.setItem("trustflow_guest_token", requestToken);
          localStorage.removeItem("trustflow_pending_request");

          setPendingJoinRequest(null);
          setRestoredRequestCheck(false);

          setJoinedRoom({
            ...statusData.room,
            guest: statusData.guest,
            sessionExpiresAt: statusData.sessionExpiresAt,
          });

          setActiveRoom(statusData.room);
          setActiveParticipantType("guest");

          await loadRoomFiles(statusData.room.id);
          break;
        }

        throw new Error("Unknown join request status.");
      }
    } catch (error) {
      setJoinError(
        error.message === "Failed to fetch"
          ? "Cannot connect to the server. Check that your backend is running."
          : error.message
      );
    } finally {
      setJoining(false);
    }
  }

  async function handleWithdrawJoinRequest() {
    if (!pendingJoinRequest) return;

    cancelJoinRequestRef.current = true;
    setJoinError("");

    try {
      const response = await fetch(
        `${API_URL}/api/guests/withdraw-join-request`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${pendingJoinRequest.requestToken}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Unable to withdraw join request.");
      }

      localStorage.removeItem("trustflow_guest_token");
      localStorage.removeItem("trustflow_pending_request");

      setPendingJoinRequest(null);
      setRestoredRequestCheck(false);
      setJoinError("");

    } catch (error) {
      cancelJoinRequestRef.current = false;

      setJoinError(
        error.message === "Failed to fetch"
          ? "Cannot connect to the server. Please try again."
          : error.message
      );
    }
  }


  async function handleLeaveRoom() {


    if (activeParticipantType === "creator") {
      setActiveRoom(null);
      setActiveParticipantType(null);
      setRoomFiles([]);
      setRoomError("");
      setJoinError("");

      loadMyRooms();

      return;
    }


    const guestToken = localStorage.getItem("trustflow_guest_token");

    if (!guestToken) {
      setJoinError("Guest session not found. Please join the room again.");
      setJoinedRoom(null);
      return;
    }

    try {
      const response = await fetch(
        `${API_URL}/api/guests/leave`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${guestToken}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Unable to leave the room.");
      }

      localStorage.removeItem("trustflow_guest_token");
      localStorage.removeItem("trustflow_pending_request");

      setPendingJoinRequest(null);
      setRestoredRequestCheck(false);
      setJoinedRoom(null);
      setInviteCode("");
      setGuestName("");
      setJoinError("");
      setActiveRoom(null);
      setActiveParticipantType(null);
    } catch (error) {
      setJoinError(
        error.message === "Failed to fetch"
          ? "Cannot connect to the server. Check that your backend is running."
          : error.message
      );
    }
  }


  async function loadRoomFiles(roomId, tokenOverride) {
    const token =
      tokenOverride ||
      (activeParticipantType === "creator"
        ? authToken
        : localStorage.getItem("trustflow_guest_token"));

    if (!token || !roomId) {
      setRoomFiles([]);
      return;
    }

    setFilesLoading(true);

    try {
      const response = await fetch(
        `${API_URL}/api/files/rooms/${roomId}/files`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Unable to load room files.");
      }

      setRoomFiles(data.files || []);
    } catch (error) {
      console.error("Load room files error:", error.message);
      setRoomFiles([]);
    } finally {
      setFilesLoading(false);
    }
  }




  if (activeRoom) {
    return (
      <RoomPage
        room={activeRoom}
        participantType={activeParticipantType}
        onLeaveRoom={handleLeaveRoom}
        files={roomFiles}
        filesLoading={filesLoading}

        guests={roomGuests}
        guestsLoading={guestsLoading}
        guestsError={guestsError}
        onRefreshGuests={() => loadRoomGuests(activeRoom.id)}

        accessToken={
          activeParticipantType === "guest"
            ? localStorage.getItem("trustflow_guest_token")
            : authToken
        }
        onFileUploaded={() => loadRoomFiles(activeRoom.id)}
      />
    );
  }



  return (

    <main className="app">
      <header className="navbar">
        <a className="brand" href="/" aria-label="TrustFlow home">
          <img src="/logo.png" alt="TrustFlow shield" />
          <span>
            Trust<span className="brand-accent">Flow</span>
          </span>
        </a>

        <nav className="nav-links">
          <a href="#features">Features</a>
          <a href="#how-it-works">How it works</a>

          {currentUser ? (
            <>
              <span className="nav-user">
                Hi, {currentUser.name}
              </span>
              <button
                className="button button-outline"
                type="button"
                onClick={() => {
                  localStorage.removeItem("trustflow_token");
                  localStorage.removeItem("trustflow_user");
                  setAuthToken(null);
                  setCurrentUser(null);
                }}
              >
                Log out
              </button>
            </>
          ) : (
            <>
              <button
                className="button button-outline"
                type="button"
                onClick={() => {
                  setAuthMode("login");
                  setShowAuth(true);
                }}
              >
                Log in
              </button>
              <button
                className="button button-primary"
                type="button"
                onClick={() => {
                  setAuthMode("signup");
                  setShowAuth(true);
                }}
              >
                Get started
              </button>
            </>
          )}

        </nav>
      </header>


      {currentUser && currentPage === "dashboard" && (
        <section className="dashboard">
          <h1>Welcome, {currentUser.name}!</h1>
          <p>Your TrustFlow workspace is ready.</p>

          <div className="dashboard-actions">
            <button
              className="button button-primary"
              onClick={() => {
                setShowCreateRoom(true);
                setRoomError("");
                setCreatedRoom(null);
              }}
            >
              Create a Room
            </button>

            <button
              className="button button-outline"
              onClick={() => {
                setShowJoinRoom(true);
                setJoinError("");
                setJoinedRoom(null);
              }}
            >
              Join a Room
            </button>
          </div>

          {/* My Rooms section starts here */}
          <div className="my-rooms-section">
            <div className="my-rooms-heading">
              <h2>My Rooms</h2>

              <button
                type="button"
                className="button button-outline"
                onClick={loadMyRooms}
                disabled={myRoomsLoading}
              >
                {myRoomsLoading ? "Loading..." : "Refresh"}
              </button>
            </div>

            {myRoomsError && (
              <p className="room-error">{myRoomsError}</p>
            )}

            {myRoomsLoading ? (
              <p>Loading your rooms...</p>
            ) : myRooms.length === 0 ? (
              <p>You haven't created any rooms yet.</p>
            ) : (
              <div className="my-rooms-list">
                {myRooms.map((room) => (
                  <article className="my-room-card" key={room.id}>
                    <h3 className="my-room-title">
                      {room.name}

                      {pendingRequestCounts[room.id] > 0 && (
                        <span
                          className="pending-request-indicator"
                          title={`${pendingRequestCounts[room.id]} pending join request(s)`}
                          aria-label={`${pendingRequestCounts[room.id]} pending join request(s)`}
                        >
                          <span className="pending-request-dot" />
                          Pending requests ({pendingRequestCounts[room.id]})
                        </span>
                      )}
                    </h3>

                    <p>
                      Invite code: <strong>{room.inviteCode}</strong>
                    </p>

                    <p>
                      Created At:{" "}
                      {room.createdAt
                        ? new Date(room.createdAt).toLocaleString()
                        : "Not available"}
                    </p>

                    <p>
                      Expires: {new Date(room.expiresAt).toLocaleString()}
                    </p>

                    <p>Status: {room.status}</p>

                    <button
                      type="button"
                      className="button button-primary"
                      disabled={
                        room.status !== "active" ||
                        new Date(room.expiresAt) <= new Date()
                      }

                      onClick={() => {
                        setActiveRoom(room);
                        setActiveParticipantType("creator");
                        loadRoomFiles(room.id, authToken);
                        loadRoomGuests(room.id);
                      }}

                    >
                      Re-enter Room
                    </button>

                    {room.status === "active" &&
                      new Date(room.expiresAt) > new Date() && (
                        <button
                          type="button"
                          className="button button-outline"
                          onClick={async () => {
                            const confirmed = window.confirm(
                              `Close "${room.name}"? Guests will lose access to this room.`
                            );

                            if (!confirmed) return;

                            try {
                              const response = await fetch(
                                `${API_URL}/api/rooms/${room.id}/close`,
                                {
                                  method: "PATCH",
                                  headers: {
                                    Authorization: `Bearer ${authToken}`,
                                  },
                                }
                              );

                              const result = await response.json();

                              if (!response.ok) {
                                throw new Error(result.message || "Failed to close room.");
                              }

                              // If this room is currently open, return to the dashboard.
                              if (activeRoom?.id === room.id) {
                                setActiveRoom(null);
                                setActiveParticipantType(null);
                                setRoomFiles([]);
                                setRoomGuests([]);
                              }

                              await loadMyRooms();
                            } catch (error) {
                              window.alert(error.message || "Unable to close room.");
                            }
                          }}
                        >
                          Close Room
                        </button>
                      )}

                    {room.status === "closed" &&
                      new Date(room.expiresAt) > new Date() && (
                        <button
                          type="button"
                          className="button button-primary"
                          onClick={async () => {
                            const confirmed = window.confirm(
                              `Reopen "${room.name}"? Guests will be able to access this room again.`
                            );

                            if (!confirmed) return;

                            try {
                              const response = await fetch(
                                `${API_URL}/api/rooms/${room.id}/reopen`,
                                {
                                  method: "PATCH",
                                  headers: {
                                    Authorization: `Bearer ${authToken}`,
                                  },
                                }
                              );

                              const result = await response.json();

                              if (!response.ok) {
                                throw new Error(
                                  result.message || "Failed to reopen room."
                                );
                              }

                              await loadMyRooms();
                            } catch (error) {
                              window.alert(
                                error.message || "Unable to reopen room."
                              );
                            }
                          }}
                        >
                          Reopen Room
                        </button>
                      )}


                    <button
                      type="button"
                      className="button button-outline"
                      onClick={async () => {
                        const confirmed = window.confirm(
                          `Permanently delete "${room.name}"? All uploaded files and room history will be deleted. This action cannot be undone.`
                        );

                        if (!confirmed) return;

                        try {
                          const response = await fetch(
                            `${API_URL}/api/rooms/${room.id}`,
                            {
                              method: "DELETE",
                              headers: {
                                Authorization: `Bearer ${authToken}`,
                              },
                            }
                          );

                          const result = await response.json();

                          if (!response.ok) {
                            throw new Error(
                              result.message || "Failed to delete room."
                            );
                          }

                          if (activeRoom?.id === room.id) {
                            setActiveRoom(null);
                            setActiveParticipantType(null);
                            setRoomFiles([]);
                            setRoomGuests([]);
                          }

                          await loadMyRooms();

                          window.alert("Room deleted successfully.");
                        } catch (error) {
                          window.alert(
                            error.message || "Unable to delete room."
                          );
                        }
                      }}
                    >
                      Delete Room
                    </button>


                    <button
                      type="button"
                      className="button button-outline"
                      onClick={async () => {
                        const loaded = await loadRoomHistory(room.id);

                        if (loaded) {
                          setCurrentPage("history");
                        }
                      }}
                    >
                      History
                    </button>

                  </article>
                ))}
              </div>
            )}
          </div>
          {/* My Rooms section ends here */}






        </section>
      )}

      {currentUser && currentPage === "history" && historyRoom && (
        <section className="dashboard history-page">
          <button
            type="button"
            className="button button-outline"
            onClick={() => setCurrentPage("dashboard")}
          >
            ← Back to My Rooms
          </button>

          <div className="my-rooms-heading">
            <div>
              <p className="eyebrow">TRUSTFLOW AUDIT LOG</p>
              <h1>Room History</h1>
              <p>{historyRoom.name}</p>
            </div>

            <button
              type="button"
              className="button button-outline"
              onClick={() => loadRoomHistory(historyRoom.id)}
            >
              Refresh History
            </button>
          </div>

          <section className="my-rooms-section">
            <h2>Audit Verification</h2>

            {historyVerification ? (
              <>
                <p>
                  Status:{" "}
                  <strong>
                    {historyVerification.valid
                      ? "Verified"
                      : "Verification failed"}
                  </strong>
                </p>

                <p>
                  Events checked: {historyVerification.checkedEvents ?? "N/A"}
                </p>

                {historyVerification.problems?.length > 0 && (
                  <ul>
                    {historyVerification.problems.map((problem, index) => (
                      <li key={index}>
                        {typeof problem === "string"
                          ? problem
                          : JSON.stringify(problem)}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <p>Verification information is unavailable.</p>
            )}
          </section>

          <section className="my-rooms-section">
            <h2>Activity</h2>

            {roomHistory.length === 0 ? (
              <p>No activity events recorded for this room.</p>
            ) : (
              <div className="my-rooms-list">
                {roomHistory.map((event) => (
                  <article
                    className="my-room-card"
                    key={`${event.sequence}-${event.timestamp}`}
                  >
                    <h3>
                      #{event.sequence} — {event.eventType.replaceAll("_", " ")}
                    </h3>

                    {event.guestDisplayName && (
                      <p>Participant: {event.guestDisplayName}</p>
                    )}

                    <p>
                      Time: {new Date(event.timestamp).toLocaleString()}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </section>
        </section>
      )}

      <section
        className="hero"
        id="how-it-works"
        style={{ display: currentUser ? "none" : "grid" }}
      >
        <div className="hero-content">
          <div className="eyebrow">
            <span className="status-dot" />
            SECURE FILE SHARING, REIMAGINED
          </div>

          <h1>
            Your files.
            <br />
            Your people.
            <br />
            <span>Verified trust.</span>
          </h1>

          <p className="hero-description">
            Share files through temporary rooms, control who gets access,
            and verify a record of what happened.
          </p>

          <div className="hero-actions">
            <button
              className="button button-primary button-large"
              type="button"
              onClick={() => {
                setShowCreateRoom(true);
                setCreatedRoom(null);
                setRoomError("");
              }}
            >
              Create a room <span aria-hidden="true">↗</span>
            </button>
            <button
              className="button button-outline button-large"
              type="button"
              onClick={() => {
                setShowJoinRoom(true);
                setJoinedRoom(null);
                setJoinError("");
              }}
            >
              Join a room
            </button>
          </div>

          <p className="hero-note">
            No account needed to join as a guest.
          </p>
        </div>

        <div className="visual-card" aria-label="TrustFlow security overview">
          <div className="visual-card-header">
            <span className="window-dots"><i /><i /><i /></span>
            <span className="live-label">
              <span className="status-dot" /> LIVE ROOM
            </span>
          </div>

          <div className="room-symbol">↗</div>
          <p className="room-label">YOUR SHARED SPACE</p>
          <h2>Project files</h2>
          <p className="room-description">
            One room. The right people. A verifiable history.
          </p>

          <div className="room-divider" />

          <div className="room-feature">
            <span className="feature-symbol">⌘</span>
            <div>
              <strong>Controlled access</strong>
              <p>Approve who can join</p>
            </div>
            <span className="check-mark">✓</span>
          </div>

          <div className="room-feature">
            <span className="feature-symbol">◇</span>
            <div>
              <strong>File integrity</strong>
              <p>SHA-256 verification</p>
            </div>
            <span className="check-mark">✓</span>
          </div>

          <div className="room-feature">
            <span className="feature-symbol">≋</span>
            <div>
              <strong>Activity history</strong>
              <p>Hash-linked audit events</p>
            </div>
            <span className="check-mark">✓</span>
          </div>

          <div className="integrity-footer">
            <span className="integrity-icon">✓</span>
            <span>Built for accountable sharing</span>
          </div>
        </div>
      </section>

      {showCreateRoom && (
        <div className="room-modal-backdrop">
          <div className="room-modal">
            <button
              type="button"
              className="room-modal-close"
              onClick={() => setShowCreateRoom(false)}
              aria-label="Close"
            >
              ×
            </button>

            <h2>Create a room</h2>
            <p>Create a temporary space to share files with others.</p>

            <form onSubmit={handleCreateRoom}>
              <label htmlFor="roomName">Room name</label>
              <input
                id="roomName"
                type="text"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                placeholder="e.g. Project documents"
                minLength={3}
                maxLength={60}
                required
              />

              <label htmlFor="expiryHours">Room expiry</label>
              <select
                id="expiryHours"
                value={expiryHours}
                onChange={(e) => setExpiryHours(e.target.value)}
              >
                <option value="1">1 hour</option>
                <option value="6">6 hours</option>
                <option value="24">24 hours</option>
                <option value="72">3 days</option>
                <option value="168">7 days</option>
              </select>

              <button
                className="button button-primary"
                type="submit"
                disabled={loading}
              >
                {loading ? "Creating..." : "Create room"}
              </button>
            </form>

            {roomError && <p className="room-error">{roomError}</p>}


            {createdRoom && (
              <div className="room-success">
                <h3>Room created successfully!</h3>

                <p>
                  <strong>Room:</strong> {createdRoom.name}
                </p>


                <div className="invite-code-row">
                  <p>
                    <strong>Invite code:</strong> {createdRoom.inviteCode}
                  </p>

                  <button
                    type="button"
                    className="button button-outline"
                    onClick={() => {
                      navigator.clipboard.writeText(createdRoom.inviteCode);
                    }}
                  >
                    Copy code
                  </button>
                </div>


                <p>
                  <strong>Room expires:</strong>{" "}
                  {new Date(createdRoom.expiresAt).toLocaleString()}
                </p>
              </div>
            )}

          </div>
        </div>
      )}


      {showJoinRoom && (
        <div className="room-modal-backdrop">
          <div className="room-modal">
            <button
              type="button"
              className="room-modal-close"
              onClick={() => setShowJoinRoom(false)}
              aria-label="Close"
            >
              ×
            </button>

            <h2>Join a room</h2>
            <p>Enter the invite code shared with you.</p>

            <form onSubmit={handleJoinRoom}>
              <label htmlFor="inviteCode">Invite code</label>

              <input
                type="text"
                placeholder="Enter your name"
                value={guestName}
                onChange={(event) => setGuestName(event.target.value)}
                minLength={2}
                maxLength={40}
                required
              />

              <input
                id="inviteCode"
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                placeholder="Enter your invite code"
                required
              />

              <button
                className="button button-primary"
                type="submit"
                disabled={joining || !!pendingJoinRequest}
              >
                {joining ? "Joining..." : "Join room"}
              </button>
            </form>

            {pendingJoinRequest && (
              <div className="join-request-pending">
                <p>Join request pending. Waiting for the room owner...</p>

                <button
                  type="button"
                  className="button button-secondary"
                  onClick={handleWithdrawJoinRequest}
                >
                  Withdraw Request
                </button>
              </div>
            )}

            {joinError && <p className="room-error">{joinError}</p>}

            {joinedRoom && (
              <div className="room-success">
                <h3>Joined room successfully!</h3>

                <p>
                  <strong>Room:</strong> {joinedRoom.name}
                </p>

                <p>
                  <strong>Guest:</strong> {joinedRoom.guest?.displayName}
                </p>

                <p>
                  <strong>Room expires:</strong>{" "}
                  {new Date(joinedRoom.expiresAt).toLocaleString()}
                </p>

                <p>
                  <strong>Your session expires:</strong>{" "}
                  {new Date(joinedRoom.sessionExpiresAt).toLocaleString()}
                </p>

                <p>You have joined the room as a guest.</p>
                <button
                  type="button"
                  className="button button-outline"
                  onClick={handleLeaveRoom}
                >
                  Leave Room
                </button>
                <div className="room-files">
                  <h4>Shared Room Files</h4>

                  {filesLoading ? (
                    <p>Loading files...</p>
                  ) : roomFiles.length === 0 ? (
                    <p>No files have been shared in this room yet.</p>
                  ) : (
                    <ul>
                      {roomFiles.map((file) => (
                        <li key={file._id}>
                          <strong>{file.originalName}</strong>
                          <span>
                            {" "}
                            — {(file.fileSize / 1024).toFixed(1)} KB
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}


      <section
        className="features"
        id="features"
        style={{ display: currentUser ? "none" : "block" }}
      >
        <div className="section-heading">
          <p className="eyebrow">MADE FOR PEACE OF MIND</p>
          <h2>Sharing is easy. Trust should be too.</h2>
          <p>
            Useful sharing tools backed by clear permissions and verifiable records.
          </p>
        </div>

        <div className="feature-grid">
          <article className="feature-card">
            <div className="feature-icon">↗</div>
            <h3>Temporary rooms</h3>
            <p>
              Create a shared space for your files, invite people, and set an expiry.
            </p>
          </article>

          <article className="feature-card">
            <div className="feature-icon">⌑</div>
            <h3>Access by approval</h3>
            <p>
              Review join requests and give trusted moderators limited permissions.
            </p>
          </article>

          <article className="feature-card">
            <div className="feature-icon">⛨</div>
            <h3>Verifiable activity</h3>
            <p>
              Check file hashes and a hash-linked history of room events.
            </p>
          </article>
        </div>
      </section>

      <footer className="footer">
        <span>© {new Date().getFullYear()} TrustFlow</span>
        <span>Share Securely. Verify Always.</span>
        <span className="backend-status">
          <span className="status-dot" />
          {backendStatus}
        </span>
      </footer>
      {showAuth && (
        <Auth
          onLogin={handleLogin}
          onClose={() => setShowAuth(false)}
          initialMode={authMode}
        />
      )}
    </main>
  );
}

export default App;

