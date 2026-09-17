// How large a zip says it becomes, read without decompressing any of it.
//
// An .xlsx is a zip. A ceiling on the uploaded file bounds what arrives and
// nothing else: the ratio between packed and unpacked is chosen by whoever
// wrote the file, and the spreadsheet parser builds the entire sheet in memory
// before a row limit can be applied to it. Asking the archive first is what
// turns that into a refusal instead of an allocation.
//
// Every entry's unpacked size is recorded in the central directory at the end
// of the file, which is where a zip reader is required to start. A file that
// understates its sizes here is not a bomb that gets through: the parser
// inflates from the stream and fails on the mismatch.

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_FILE_HEADER = 0x02014b50;

// The end of central directory record is 22 bytes and may be followed by a
// comment of up to 65535, so it is found by scanning back from the end for its
// signature.
const END_RECORD_BYTES = 22;
const MAX_COMMENT_BYTES = 0xffff;

const CENTRAL_HEADER_BYTES = 46;

// Written in place of a size that will not fit in 32 bits, with the real figure
// held in a zip64 record elsewhere. Nothing an import should carry is that
// large, so it is reported as unbounded rather than followed.
const ZIP64_SENTINEL = 0xffffffff;

const findEndRecord = (view: DataView): number | null => {
    const earliest = Math.max(
        0,
        view.byteLength - END_RECORD_BYTES - MAX_COMMENT_BYTES,
    );
    for (
        let offset = view.byteLength - END_RECORD_BYTES;
        offset >= earliest;
        offset--
    ) {
        if (view.getUint32(offset, true) === END_OF_CENTRAL_DIRECTORY) {
            return offset;
        }
    }
    return null;
};

// The total every entry unpacks to, `Infinity` for an archive that declines to
// say in 32 bits, or null when this is not a zip whose directory can be read.
// Null and a large number are different answers: the first is a file that was
// never what its name claimed, and the caller says so differently.
export const unpackedSize = (bytes: ArrayBuffer): number | null => {
    if (bytes.byteLength < END_RECORD_BYTES) return null;

    const view = new DataView(bytes);
    const endRecord = findEndRecord(view);
    if (endRecord === null) return null;

    const entries = view.getUint16(endRecord + 10, true);
    let offset = view.getUint32(endRecord + 16, true);
    let total = 0;

    for (let entry = 0; entry < entries; entry++) {
        if (offset + CENTRAL_HEADER_BYTES > view.byteLength) return null;
        if (view.getUint32(offset, true) !== CENTRAL_FILE_HEADER) return null;

        const size = view.getUint32(offset + 24, true);
        if (size === ZIP64_SENTINEL) return Infinity;
        total += size;

        const nameBytes = view.getUint16(offset + 28, true);
        const extraBytes = view.getUint16(offset + 30, true);
        const commentBytes = view.getUint16(offset + 32, true);
        offset += CENTRAL_HEADER_BYTES + nameBytes + extraBytes + commentBytes;
    }

    return total;
};
