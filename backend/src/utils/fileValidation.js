
const path = require("path");
const yauzl = require("yauzl");

const allowedExtensions = new Set([
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".webp",
    ".pdf",
    ".txt",
    ".csv",
    ".zip",
    ".docx",
    ".xlsx",
    ".pptx",
]);

const allowedMimeTypes = new Set([
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "application/pdf",
    "text/plain",
    "text/csv",
    "application/zip",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);


function validateOfficeDocument(buffer, extension) {
    return new Promise((resolve) => {
        const requiredEntries = {
            ".docx": ["[Content_Types].xml", "word/document.xml"],
            ".xlsx": ["[Content_Types].xml", "xl/workbook.xml"],
            ".pptx": ["[Content_Types].xml", "ppt/presentation.xml"],
        };

        const required = requiredEntries[extension];
        if (!required) return resolve(false);

        yauzl.fromBuffer(
            buffer,
            { lazyEntries: true },
            (error, zipfile) => {
                if (error || !zipfile) return resolve(false);

                const found = new Set();
                let finished = false;

                function finish(valid) {
                    if (finished) return;
                    finished = true;
                    zipfile.close();
                    resolve(valid);
                }

                zipfile.on("error", () => finish(false));

                zipfile.on("entry", (entry) => {
                    // Reject suspicious paths instead of extracting them.
                    if (
                        entry.fileName.startsWith("/") ||
                        entry.fileName.split("/").includes("..")
                    ) {
                        return finish(false);
                    }

                    found.add(entry.fileName);

                    if (required.every((name) => found.has(name))) {
                        return finish(true);
                    }

                    zipfile.readEntry();
                });

                zipfile.on("end", () => {
                    finish(required.every((name) => found.has(name)));
                });

                zipfile.readEntry();
            }
        );
    });
}

async function validateUploadedFile(file) {
    if (!file || !Buffer.isBuffer(file.buffer)) {
        return {
            valid: false,
            message: "Invalid uploaded file.",
        };
    }

    const extension = path.extname(file.originalname).toLowerCase();

    if (!allowedExtensions.has(extension)) {
        return {
            valid: false,
            message: "Unsupported file extension.",
        };
    }

    if (!allowedMimeTypes.has(file.mimetype)) {
        return {
            valid: false,
            message: "Unsupported file type.",
        };
    }

    const { fileTypeFromBuffer } = await import("file-type");
    const detected = await fileTypeFromBuffer(file.buffer);

    // Plain-text formats generally don't have a recognizable magic signature.

    if ([".txt", ".csv"].includes(extension)) {
        // Plain-text files should not contain binary null bytes.
        if (file.buffer.includes(0)) {
            return {
                valid: false,
                message: "The selected file is not valid plain text.",
            };
        }

        // Reject content that is not valid UTF-8.
        const text = file.buffer.toString("utf8");

        if (!Buffer.from(text, "utf8").equals(file.buffer)) {
            return {
                valid: false,
                message: "Text files must use valid UTF-8 encoding.",
            };
        }

        return { valid: true };
    }

    if (!detected) {
        return {
            valid: false,
            message: "Could not verify the file's actual format.",
        };
    }

    const expectedMimeTypes = {
        ".jpg": ["image/jpeg"],
        ".jpeg": ["image/jpeg"],
        ".png": ["image/png"],
        ".gif": ["image/gif"],
        ".webp": ["image/webp"],
        ".pdf": ["application/pdf"],
        ".zip": ["application/zip", "application/x-zip-compressed"],
    };

    const expected = expectedMimeTypes[extension];

    if (expected && !expected.includes(detected.mime)) {
        return {
            valid: false,
            message: "File extension does not match its actual content.",
        };
    }


    if (extension === ".zip") {
        const validZip = await new Promise((resolve) => {
            yauzl.fromBuffer(
                file.buffer,
                { lazyEntries: true },
                (error, zipfile) => {
                    if (error || !zipfile) {
                        return resolve(false);
                    }

                    zipfile.once("error", () => resolve(false));
                    zipfile.once("end", () => resolve(true));

                    zipfile.readEntry();
                }
            );
        });

        if (!validZip) {
            return {
                valid: false,
                message: "The ZIP archive is invalid or corrupted.",
            };
        }
    }


    // Office Open XML files are ZIP containers. A ZIP signature alone
    // cannot prove that a file is a valid DOCX, XLSX, or PPTX document.

    if ([".docx", ".xlsx", ".pptx"].includes(extension)) {
        const validOfficeDocument = await validateOfficeDocument(
            file.buffer,
            extension
        );

        if (!validOfficeDocument) {
            return {
                valid: false,
                message: "Invalid or unsupported Office document structure.",
            };
        }
    }


    return { valid: true };
}

module.exports = { validateUploadedFile };
