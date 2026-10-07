import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { modes } from "@/lib/env";
import { route } from "@/lib/http/handler";
import { fail, notFound } from "@/lib/http/respond";
import { resolveKey } from "@/lib/providers/storage/local";

export const dynamic = "force-dynamic";

const CONTENT_TYPES: Record<string, string> = {
  mp4: "video/mp4",
  wav: "audio/wav",
  mp3: "audio/mpeg",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  ass: "text/plain; charset=utf-8",
};

/**
 * Serves objects from the local storage driver.
 *
 * Range requests are honoured, which is not optional: without a 206 response
 * a browser cannot seek an MP4, and the render preview player would only ever
 * play from the start.
 *
 * In R2 mode this route is unused — media URLs point at the bucket or a
 * presigned URL — so it refuses rather than proxying bytes we are paying
 * egress on.
 */
export const GET = route<{ key: string[] }>(async (req, { params }) => {
  if (modes.storage === "live") {
    return fail(404, "not_local", "Media is served directly from object storage in this environment.");
  }

  const key = (params.key ?? []).join("/");
  if (!key) return notFound("Media");

  let path: string;
  try {
    // Throws if the key tries to escape the storage root.
    path = resolveKey(key);
  } catch {
    return fail(400, "bad_key", "Invalid media key.");
  }

  let info: Awaited<ReturnType<typeof stat>>;
  try {
    info = await stat(path);
  } catch {
    return notFound("Media");
  }
  if (!info.isFile()) return notFound("Media");

  const ext = key.split(".").pop()?.toLowerCase() ?? "";
  const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";
  const total = info.size;
  const range = req.headers.get("range");

  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (match) {
      const startRaw = match[1];
      const endRaw = match[2];
      let start = startRaw ? Number(startRaw) : 0;
      let end = endRaw ? Number(endRaw) : total - 1;

      // `bytes=-500` means the last 500 bytes, not "from 0 to 500".
      if (!startRaw && endRaw) {
        start = Math.max(0, total - Number(endRaw));
        end = total - 1;
      }
      if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= total) {
        return new NextResponse(null, {
          status: 416,
          headers: { "content-range": `bytes */${total}` },
        });
      }
      end = Math.min(end, total - 1);

      const stream = Readable.toWeb(
        createReadStream(path, { start, end }),
      ) as unknown as ReadableStream;

      return new NextResponse(stream, {
        status: 206,
        headers: {
          "content-type": contentType,
          "content-length": String(end - start + 1),
          "content-range": `bytes ${start}-${end}/${total}`,
          "accept-ranges": "bytes",
          "cache-control": "private, max-age=3600",
        },
      });
    }
  }

  const stream = Readable.toWeb(createReadStream(path)) as unknown as ReadableStream;
  return new NextResponse(stream, {
    status: 200,
    headers: {
      "content-type": contentType,
      "content-length": String(total),
      "accept-ranges": "bytes",
      "cache-control": "private, max-age=3600",
    },
  });
});
