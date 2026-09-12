import {
  GetObjectCommand,
  ListBucketsCommand,
  ListObjectsV2Command,
  S3Client,
  type _Object,
} from "@aws-sdk/client-s3";
import { createHash } from "node:crypto";
import { createWriteStream, promises as fs } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable, Transform } from "node:stream";
import type { BackupConfig } from "./config.js";
import { withRetry } from "./retry.js";
import type { StorageObjectMeta } from "./types.js";
import { withDatabase } from "./databaseExport.js";

export interface StorageExportResult {
  bucketCount: number;
  objectCount: number;
  totalBytes: number;
  objects: StorageObjectMeta[];
  artifactPaths: string[];
}

export interface StorageClient {
  listBuckets(): Promise<string[]>;
  listObjects(bucket: string): Promise<Array<{
    key: string;
    size?: number;
    etag?: string;
    lastModified?: Date;
  }>>;
  download(bucket: string, key: string, destPath: string): Promise<{
    sha256: string;
    bytes: number;
    contentType?: string;
  }>;
}

export function createS3StorageClient(config: BackupConfig): StorageClient | null {
  if (!config.s3Endpoint || !config.s3AccessKeyId || !config.s3SecretAccessKey) {
    return null;
  }
  const client = new S3Client({
    region: config.s3Region,
    endpoint: config.s3Endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.s3AccessKeyId,
      secretAccessKey: config.s3SecretAccessKey,
    },
  });

  return {
    async listBuckets() {
      const result = await client.send(new ListBucketsCommand({}));
      return (result.Buckets ?? []).map((bucket) => bucket.Name).filter((name): name is string => Boolean(name));
    },
    async listObjects(bucket) {
      const objects: Array<{ key: string; size?: number; etag?: string; lastModified?: Date }> = [];
      let token: string | undefined;
      do {
        const page = await client.send(
          new ListObjectsV2Command({
            Bucket: bucket,
            ContinuationToken: token,
          }),
        );
        for (const item of page.Contents ?? []) {
          if (!item.Key) continue;
          objects.push({
            key: item.Key,
            size: item.Size,
            etag: item.ETag?.replaceAll('"', ""),
            lastModified: item.LastModified,
          });
        }
        token = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (token);
      return objects;
    },
    async download(bucket, key, destPath) {
      const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      await fs.mkdir(path.dirname(destPath), { recursive: true });
      const hash = createHash("sha256");
      let bytes = 0;
      const body = result.Body;
      if (!body) {
        await fs.writeFile(destPath, Buffer.alloc(0));
        return { sha256: hash.digest("hex"), bytes: 0, contentType: result.ContentType };
      }
      const readable = body as Readable;
      const checksum = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          bytes += chunk.length;
          hash.update(chunk);
          callback(null, chunk);
        },
      });
      await pipeline(readable, checksum, createWriteStream(destPath));
      return {
        sha256: hash.digest("hex"),
        bytes,
        contentType: result.ContentType,
      };
    },
  };
}

export async function countStorageMetadata(config: BackupConfig): Promise<{ buckets: number; objects: number }> {
  return withDatabase(config, async (client) => {
    const buckets = await client.query<{ count: string }>("SELECT count(*)::text AS count FROM storage.buckets");
    const objects = await client.query<{ count: string }>("SELECT count(*)::text AS count FROM storage.objects");
    return {
      buckets: Number(buckets.rows[0].count),
      objects: Number(objects.rows[0].count),
    };
  });
}

function encodedObjectPath(objectsDir: string, bucket: string, key: string): { absolute: string; archivePath: string } {
  const bucketHash = createHash("sha256").update(bucket).digest("hex");
  const objectHash = createHash("sha256").update(bucket).update("\0").update(key).digest("hex");
  const absolute = path.resolve(objectsDir, bucketHash, objectHash);
  const root = `${path.resolve(objectsDir)}${path.sep}`;
  if (!absolute.startsWith(root)) throw new Error("Refusing unsafe Storage archive path.");
  return {
    absolute,
    archivePath: path.posix.join("objects", bucketHash, objectHash),
  };
}

export async function exportStorageObjects(options: {
  config: BackupConfig;
  storageDir: string;
  client?: StorageClient | null;
  metadataCounts?: { buckets: number; objects: number };
}): Promise<StorageExportResult> {
  await fs.mkdir(options.storageDir, { recursive: true });
  const objectsDir = path.join(options.storageDir, "objects");
  await fs.mkdir(objectsDir, { recursive: true });

  const metadataCounts = options.metadataCounts ?? (await countStorageMetadata(options.config));
  const client = options.client === undefined ? createS3StorageClient(options.config) : options.client;

  if (metadataCounts.objects > 0 && !client) {
    throw new Error("Storage objects exist but S3 credentials are missing.");
  }

  if (!client) {
    const emptyManifest = {
      bucketCount: metadataCounts.buckets,
      objectCount: 0,
      totalBytes: 0,
      objects: [] as StorageObjectMeta[],
    };
    const manifestPath = path.join(options.storageDir, "objects-manifest.json");
    await fs.writeFile(manifestPath, `${JSON.stringify(emptyManifest, null, 2)}\n`, "utf8");
    return { ...emptyManifest, artifactPaths: [manifestPath] };
  }

  const buckets = await withRetry(() => client.listBuckets());
  const objects: StorageObjectMeta[] = [];
  let totalBytes = 0;

  for (const bucket of buckets) {
    const listed = await withRetry(() => client.listObjects(bucket));
    for (const item of listed) {
      const dest = encodedObjectPath(objectsDir, bucket, item.key);
      const downloaded = await withRetry(() => client.download(bucket, item.key, dest.absolute));
      totalBytes += downloaded.bytes;
      objects.push({
        bucket,
        key: item.key,
        archivePath: dest.archivePath,
        size: downloaded.bytes,
        etag: item.etag,
        contentType: downloaded.contentType,
        lastModified: item.lastModified?.toISOString(),
        sha256: downloaded.sha256,
      });
    }
  }

  if (objects.length !== metadataCounts.objects) {
    throw new Error(
      `Storage object count mismatch: downloaded ${objects.length}, database metadata ${metadataCounts.objects}.`,
    );
  }

  const manifest = {
    bucketCount: buckets.length,
    objectCount: objects.length,
    totalBytes,
    objects,
  };
  const manifestPath = path.join(options.storageDir, "objects-manifest.json");
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  return {
    ...manifest,
    artifactPaths: [manifestPath],
  };
}

export type { _Object };
