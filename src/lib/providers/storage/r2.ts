/** Cloudflare R2 driver over the S3 API. */
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/lib/env";
import type { StorageDriver } from "./index";

export async function createR2Driver(): Promise<StorageDriver> {
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${env.r2AccountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.r2AccessKeyId!,
      secretAccessKey: env.r2SecretAccessKey!,
    },
  });
  const Bucket = env.r2Bucket;

  return {
    kind: "r2",
    async put(key, data, contentType) {
      await client.send(
        new PutObjectCommand({ Bucket, Key: key, Body: data, ContentType: contentType }),
      );
    },
    async get(key) {
      const res = await client.send(new GetObjectCommand({ Bucket, Key: key }));
      const bytes = await res.Body!.transformToByteArray();
      return Buffer.from(bytes);
    },
    async exists(key) {
      try {
        await client.send(new HeadObjectCommand({ Bucket, Key: key }));
        return true;
      } catch {
        return false;
      }
    },
    async remove(key) {
      await client.send(new DeleteObjectCommand({ Bucket, Key: key }));
    },
    async url(key) {
      if (env.r2PublicBaseUrl) {
        return `${env.r2PublicBaseUrl.replace(/\/$/, "")}/${key}`;
      }
      // One hour is long enough for a render to download and a browser to play.
      return getSignedUrl(client, new GetObjectCommand({ Bucket, Key: key }), {
        expiresIn: 3600,
      });
    },
    localPath() {
      return null;
    },
  };
}
