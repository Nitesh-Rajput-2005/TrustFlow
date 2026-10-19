
const crypto = require("crypto");
const mongoose = require("mongoose");
const AuditEvent = require("../models/AuditEvent");

const GENESIS_HASH = "0".repeat(64);

function calculateEventHash(event) {
    // Use a fixed field order for consistent hashing.
    const canonicalEvent = JSON.stringify({
        roomId: event.roomId.toString(),
        sequence: event.sequence,
        eventType: event.eventType,
        guestDisplayName: event.guestDisplayName ?? null,
        timestamp: event.timestamp.toISOString(),
        previousHash: event.previousHash,
    });

    return crypto
        .createHash("sha256")
        .update(canonicalEvent)
        .digest("hex");
}

async function recordAuditEvent({
    roomId,
    eventType,
    guestDisplayName = null,
}) {
    // A transaction prevents two concurrent events from using
    // the same sequence number or previous hash.
    const session = await mongoose.startSession();

    try {
        let createdEvent;

        await session.withTransaction(async () => {
            const previousEvent = await AuditEvent.findOne({ room: roomId })
                .sort({ sequence: -1 })
                .session(session);

            const sequence = previousEvent ? previousEvent.sequence + 1 : 1;
            const previousHash = previousEvent
                ? previousEvent.eventHash
                : GENESIS_HASH;
            const timestamp = new Date();

            const eventData = {
                roomId,
                sequence,
                eventType,
                guestDisplayName,
                timestamp,
                previousHash,
            };

            const eventHash = calculateEventHash(eventData);

            const [event] = await AuditEvent.create(
                [
                    {
                        room: roomId,
                        sequence,
                        eventType,
                        guestDisplayName,
                        timestamp,
                        previousHash,
                        eventHash,
                    },
                ],
                { session }
            );

            createdEvent = event;
        });

        return createdEvent;
    } finally {
        await session.endSession();
    }
}


async function verifyRoomLedger(roomId) {
    const events = await AuditEvent.find({ room: roomId })
        .sort({ sequence: 1 })
        .lean();

    let expectedPreviousHash = GENESIS_HASH;
    const problems = [];
    if (events.length === 0) {
        return {
            valid: false,
            checkedEvents: 0,
            problems: [
                {
                    sequence: null,
                    issue: "No audit events found for this room",
                },
            ],
        };
    }

    for (let i = 0; i < events.length; i++) {
        const event = events[i];

        if (event.sequence !== i + 1) {
            problems.push({
                sequence: event.sequence,
                issue: "Invalid sequence",
            });
        }

        if (event.previousHash !== expectedPreviousHash) {
            problems.push({
                sequence: event.sequence,
                issue: "Previous hash does not match",
            });
        }

        const calculatedHash = calculateEventHash({
            roomId: event.room,
            sequence: event.sequence,
            eventType: event.eventType,
            guestDisplayName: event.guestDisplayName,
            timestamp: event.timestamp,
            previousHash: event.previousHash,
        });

        if (event.eventHash !== calculatedHash) {
            problems.push({
                sequence: event.sequence,
                issue: "Event hash does not match",
            });
        }

        expectedPreviousHash = event.eventHash;
    }

    return {
        valid: problems.length === 0,
        checkedEvents: events.length,
        problems,
    };
}

module.exports = {
    recordAuditEvent,
    calculateEventHash,
    verifyRoomLedger,
    GENESIS_HASH,
};
