import { useState } from "react";
import "./RoomPage.css";



function RoomPage({
    room,
    participantType,
    onLeaveRoom,
    files = [],
    filesLoading = false,
    guests = [],
    guestsLoading = false,
    guestsError = "",
    onRefreshGuests,
    accessToken,
    onFileUploaded,
}) {



    const [selectedFile, setSelectedFile] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState("");
    const [uploadMessage, setUploadMessage] = useState("");


    async function handleUpload(event) {
        event.preventDefault();

        if (!selectedFile) {
            setUploadError("Please select a file first.");
            return;
        }

        setUploading(true);
        setUploadError("");
        setUploadMessage("");

        try {
            const formData = new FormData();
            formData.append("file", selectedFile);

            const response = await fetch(
                `http://localhost:5000/api/files/rooms/${room.id}/upload`,
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                    },
                    body: formData,
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || "File upload failed.");
            }

            setUploadMessage("File uploaded successfully.");
            setSelectedFile(null);
            event.target.reset();
            onFileUploaded();
        } catch (error) {
            setUploadError(
                error.message === "Failed to fetch"
                    ? "Cannot connect to the server. Check that your backend is running."
                    : error.message
            );
        } finally {
            setUploading(false);
        }
    }


    async function handleDownload(file) {
        try {
            const response = await fetch(
                `http://localhost:5000/api/files/rooms/${room.id}/files/${file._id}/download`,
                {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                    },
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || "Unable to download file.");
            }

            const downloadUrl = data.file?.downloadUrl;

            if (!downloadUrl) {
                throw new Error("The server did not return a download link.");
            }

            window.open(downloadUrl, "_blank", "noopener,noreferrer");
        } catch (error) {
            alert(error.message);
        }
    }


    if (!room) {
        return null;
    }

    return (
        <main className="room-page">

            <header className="room-page-header">
                <div>
                    <p className="room-eyebrow">TRUSTFLOW WORKSPACE</p>
                    <h1>{room.name}</h1>
                    <p className="room-subtitle">
                        Secure file sharing for your room.
                    </p>

                    {participantType === "creator" && room.inviteCode && (
                        <div className="room-invite-code">
                            <span>
                                Invite code: <strong>{room.inviteCode}</strong>
                            </span>
                            <button
                                type="button"
                                className="button button-outline"
                                onClick={() => navigator.clipboard.writeText(room.inviteCode)}
                            >
                                Copy code
                            </button>
                        </div>
                    )}
                </div>

                <button
                    type="button"
                    className="room-leave-button"
                    onClick={onLeaveRoom}
                >
                    Leave Room
                </button>
            </header>


            <section className="room-info-grid">
                <article className="room-info-card">
                    <span>Participant</span>
                    <strong>
                        {participantType === "guest" ? "Guest" : "Room creator"}
                    </strong>
                </article>

                <article className="room-info-card">
                    <span>Room expiry</span>
                    <strong>
                        {room.expiresAt
                            ? new Date(room.expiresAt).toLocaleString()
                            : "Not available"}
                    </strong>
                </article>
            </section>


            {participantType === "creator" && (
                <section className="room-guests-panel">
                    <div className="room-guests-heading">
                        <div>
                            <h2>Room Participants</h2>
                            <p>View guests who have joined this room.</p>
                        </div>

                        <button
                            type="button"
                            className="button button-outline"
                            onClick={onRefreshGuests}
                            disabled={guestsLoading}
                        >
                            {guestsLoading ? "Loading..." : "Refresh"}
                        </button>
                    </div>

                    {guestsError && (
                        <p className="room-error">{guestsError}</p>
                    )}

                    {guestsLoading ? (
                        <p>Loading participants...</p>
                    ) : guests.length === 0 ? (
                        <p>No guests have joined this room yet.</p>
                    ) : (
                        <div className="room-guests-list">
                            {guests.map((guest) => (
                                <article className="room-guest-card" key={guest.id}>
                                    <h3>{guest.displayName}</h3>
                                    <p>
                                        Joined: {new Date(guest.joinedAt).toLocaleString()}
                                    </p>
                                    <p>
                                        Session expires:{" "}
                                        {new Date(guest.expiresAt).toLocaleString()}
                                    </p>
                                    <p>
                                        Status: <strong>{guest.status}</strong>
                                    </p>
                                    {guest.leftAt && (
                                        <p>
                                            Left: {new Date(guest.leftAt).toLocaleString()}
                                        </p>
                                    )}
                                </article>
                            ))}
                        </div>
                    )}
                </section>
            )}

            <section className="room-files-panel">
                <div>
                    <h2>Shared files</h2>
                    <p>Files shared with participants in this room will appear here.</p>
                </div>


                <form onSubmit={handleUpload} className="room-upload-form">
                    <input
                        type="file"
                        onChange={(event) =>
                            setSelectedFile(event.target.files?.[0] || null)
                        }
                        disabled={uploading}
                        required
                    />

                    <button type="submit" disabled={uploading || !selectedFile}>
                        {uploading ? "Uploading..." : "Upload file"}
                    </button>

                    {uploadError && <p className="room-error">{uploadError}</p>}
                    {uploadMessage && (
                        <p className="room-upload-success">{uploadMessage}</p>
                    )}
                </form>

                <div className="room-files-empty">
                    <h3>
                        {filesLoading
                            ? "Loading files..."
                            : files.length === 0
                                ? "No files shared yet"
                                : `${files.length} shared file${files.length === 1 ? "" : "s"}`}
                    </h3>

                    {filesLoading ? (
                        <p>Please wait while we load the room files.</p>
                    ) : files.length === 0 ? (
                        <p>Files uploaded to this room will appear here.</p>
                    ) : (
                        <ul>

                            {files.map((file) => (

                                <li key={file._id}>
                                    <strong>{file.originalName}</strong>

                                    <p>
                                        Size: {((file.fileSize || 0) / 1024).toFixed(1)} KB
                                    </p>

                                    <p>
                                        Uploaded by: {
                                            typeof file.uploadedBy === "string"
                                                ? file.uploadedBy
                                                : file.uploadedBy?.name || "Unknown"
                                        }
                                    </p>

                                    <p>
                                        Uploaded on: {
                                            file.createdAt
                                                ? new Date(file.createdAt).toLocaleString()
                                                : "Not available"
                                        }
                                    </p>

                                    <button
                                        type="button"
                                        className="button button-outline"
                                        onClick={() => handleDownload(file)}
                                    >
                                        Download
                                    </button>
                                </li>

                            ))}

                        </ul>
                    )}
                </div>
            </section>

        </main>
    );
}

export default RoomPage;
