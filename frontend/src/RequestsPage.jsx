
import { useEffect } from "react";
import "./RequestsPage.css";

function RequestsPage({
    room,
    requests,
    loading,
    error,
    reviewingRequestId,
    onReviewRequest,
    onBack,
}) {
    useEffect(() => {
        document.title = "Join Requests | TrustFlow";

        return () => {
            document.title = "TrustFlow";
        };
    }, []);

    return (
        <main className="requests-page">
            <header className="requests-header">
                <button
                    type="button"
                    className="button button-outline"
                    onClick={onBack}
                >
                    ← Back to room
                </button>


                <div className="requests-heading">
                    <div className="requests-heading-icon">
                        <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                        >
                            <path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                            <circle cx="10" cy="7" r="4" />
                            <path d="M20 21v-2a4 4 0 0 0-3-3.87" />
                            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                        </svg>
                    </div>

                    <div className="requests-heading-content">
                        <h1>Join Requests</h1>
                        <p>
                            Review and manage pending access to{" "}
                            <strong>{room?.name || "your room"}</strong>.
                        </p>
                    </div>
                </div>
            </header>


            {error && <p className="room-error">{error}</p>}

            {loading ? (
                <p className="requests-empty">Loading requests...</p>
            ) : requests.length === 0 ? (
                <section className="requests-empty">
                    <h2>All caught up!</h2>
                    <p>There are no pending requests for this room.</p>
                </section>
            ) : (
                <section className="requests-list">
                    {requests.map((request) => (
                        <article
                            className="request-card"
                            key={request._id}
                        >
                            <div className="request-details">
                                <span className="request-avatar">
                                    {request.displayName?.charAt(0)?.toUpperCase() || "G"}
                                </span>

                                <div>
                                    <h2>{request.displayName}</h2>
                                    <p>
                                        Requested on{" "}
                                        {new Date(request.createdAt).toLocaleString()}
                                    </p>
                                    <span className="request-status">
                                        Awaiting review
                                    </span>
                                </div>
                            </div>

                            <div className="request-actions">
                                <button
                                    type="button"
                                    className="button button-primary"
                                    disabled={reviewingRequestId === request._id}
                                    onClick={() =>
                                        onReviewRequest(request._id, "accepted")
                                    }
                                >
                                    {reviewingRequestId === request._id
                                        ? "Processing..."
                                        : "Accept"}
                                </button>

                                <button
                                    type="button"
                                    className="button button-outline"
                                    disabled={reviewingRequestId === request._id}
                                    onClick={() =>
                                        onReviewRequest(request._id, "rejected")
                                    }
                                >
                                    Reject
                                </button>
                            </div>
                        </article>
                    ))}
                </section>
            )}
        </main>
    );
}

export default RequestsPage;
