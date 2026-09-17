import { describe, expect, test } from "bun:test";
import { deflateRawSync } from "node:zlib";
import { unpackedSize } from "./archive";

// Zips are built here rather than committed as fixtures, so the bomb case is a
// real archive with a real ratio instead of a number someone typed.
const zip = (files: { name: string; content: Buffer }[]): ArrayBuffer => {
    const locals: Buffer[] = [];
    const centrals: Buffer[] = [];
    let offset = 0;

    for (const file of files) {
        const name = Buffer.from(file.name, "utf8");
        const packed = deflateRawSync(file.content);

        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(8, 8); // deflate
        local.writeUInt32LE(packed.length, 18);
        local.writeUInt32LE(file.content.length, 22);
        local.writeUInt16LE(name.length, 26);
        locals.push(local, name, packed);

        const central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014b50, 0);
        central.writeUInt16LE(20, 6);
        central.writeUInt16LE(8, 10);
        central.writeUInt32LE(packed.length, 20);
        central.writeUInt32LE(file.content.length, 24);
        central.writeUInt16LE(name.length, 28);
        central.writeUInt32LE(offset, 42);
        centrals.push(central, name);

        offset += local.length + name.length + packed.length;
    }

    const directory = Buffer.concat(centrals);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(files.length, 8);
    end.writeUInt16LE(files.length, 10);
    end.writeUInt32LE(directory.length, 12);
    end.writeUInt32LE(offset, 16);

    const all = Buffer.concat([Buffer.concat(locals), directory, end]);
    return all.buffer.slice(
        all.byteOffset,
        all.byteOffset + all.byteLength,
    ) as ArrayBuffer;
};

describe("unpackedSize", () => {
    test("adds up what every entry unpacks to", () => {
        const archive = zip([
            { name: "a.xml", content: Buffer.alloc(1_000, 0x41) },
            { name: "b.xml", content: Buffer.alloc(2_500, 0x42) },
        ]);
        expect(unpackedSize(archive)).toBe(3_500);
    });

    test("reads an archive whose entries compress to almost nothing", () => {
        // Ten megabytes of one repeated byte packs into a few kilobytes. The
        // packed length is what a file size limit sees; the number below is
        // what the parser would actually have to hold.
        const archive = zip([
            {
                name: "sheet.xml",
                content: Buffer.alloc(10 * 1024 * 1024, 0x41),
            },
        ]);
        expect(archive.byteLength).toBeLessThan(64 * 1024);
        expect(unpackedSize(archive)).toBe(10 * 1024 * 1024);
    });

    test("is null for bytes that are not a zip", () => {
        const notAZip = new TextEncoder().encode(
            "company,role\nStripe,Engineer\n",
        );
        expect(unpackedSize(notAZip.buffer as ArrayBuffer)).toBeNull();
    });

    test("is null for an empty file", () => {
        expect(unpackedSize(new ArrayBuffer(0))).toBeNull();
    });

    test("is null when the directory points past the end", () => {
        const archive = zip([{ name: "a.xml", content: Buffer.from("hello") }]);
        const bytes = new Uint8Array(archive);
        // The end record's directory offset is the last four bytes but six.
        new DataView(bytes.buffer).setUint32(
            bytes.byteLength - 6,
            0xfffffff0,
            true,
        );
        expect(unpackedSize(bytes.buffer as ArrayBuffer)).toBeNull();
    });
});
