import { createReadStream, createWriteStream, promises as fs } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { OAuth2Client } from "google-auth-library";
import type { BackupConfig } from "./config.js";
import { isTransientError, withRetry } from "./retry.js";
import {
  APPLICATION_ID,
  DRIVE_SCOPE,
  type DriveFileRecord,
  type RetentionTier,
} from "./types.js";

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";

function nextUploadOffset(response: Response): number {
  const range = response.headers.get("Range");
  if (!range) return 0;
  const match = /bytes=0-(\d+)/.exec(range);
  return match ? Number(match[1]) + 1 : 0;
}

export class DriveAuthError extends Error {
  readonly code = "AUTH_REVOKED" as const;
  constructor(message: string) {
    super(message);
    this.name = "DriveAuthError";
  }
}

export interface DriveClient {
  getAccessToken(): Promise<string>;
  listBackupFiles(): Promise<DriveFileRecord[]>;
  findByAppProperty(key: string, value: string): Promise<DriveFileRecord[]>;
  uploadResumable(options: {
    filePath: string;
    name: string;
    mimeType: string;
    appProperties: Record<string, string>;
  }): Promise<DriveFileRecord>;
  uploadJson(options: {
    name: string;
    body: unknown;
    appProperties: Record<string, string>;
    existingId?: string;
  }): Promise<DriveFileRecord>;
  getFile(id: string): Promise<DriveFileRecord>;
  updateAppProperties(id: string, appProperties: Record<string, string>): Promise<DriveFileRecord>;
  deleteFile(id: string): Promise<void>;
  downloadFile(id: string, destPath: string): Promise<void>;
}

function assertOk(response: Response, context: string): void {
  if (response.ok) return;
  if (response.status === 401 || response.status === 403) {
    throw new DriveAuthError(`${context} returned HTTP ${response.status}`);
  }
  const error = new Error(`${context} returned HTTP ${response.status}`) as Error & { status: number };
  error.status = response.status;
  throw error;
}

export function createOAuthClient(config: BackupConfig): OAuth2Client {
  const client = new OAuth2Client({
    clientId: config.googleClientId,
    clientSecret: config.googleClientSecret,
  });
  client.setCredentials({ refresh_token: config.googleRefreshToken });
  return client;
}

export function createDriveClient(config: BackupConfig, oauth = createOAuthClient(config)): DriveClient {
  const getAccessToken = async (): Promise<string> => {
    try {
      const result = await oauth.getAccessToken();
      if (!result.token) throw new DriveAuthError("Google OAuth did not return an access token.");
      return result.token;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("invalid_grant") || message.includes("invalid_rapt") || message.includes("revoked")) {
        throw new DriveAuthError("Google refresh token is revoked or expired.");
      }
      throw error;
    }
  };

  const authorizedFetch = async (url: string, init: RequestInit = {}): Promise<Response> => {
    const token = await getAccessToken();
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    return fetch(url, { ...init, headers });
  };

  const listBackupFiles = async (): Promise<DriveFileRecord[]> => {
    const files: DriveFileRecord[] = [];
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({
        q: `'${config.driveFolderId}' in parents and appProperties has { key='application' and value='${APPLICATION_ID}' } and trashed = false`,
        fields: "nextPageToken, files(id,name,size,parents,appProperties,createdTime)",
        pageSize: "100",
        supportsAllDrives: "false",
        spaces: "drive",
      });
      if (pageToken) params.set("pageToken", pageToken);
      const response = await withRetry(() => authorizedFetch(`${DRIVE_API}/files?${params.toString()}`));
      assertOk(response, "Drive list");
      const body = (await response.json()) as { files?: DriveFileRecord[]; nextPageToken?: string };
      files.push(...(body.files ?? []));
      pageToken = body.nextPageToken;
    } while (pageToken);
    return files;
  };

  return {
    getAccessToken,
    listBackupFiles,
    async findByAppProperty(key, value) {
      const files = await listBackupFiles();
      return files.filter((file) => file.appProperties?.[key] === value);
    },
    async uploadResumable({ filePath, name, mimeType, appProperties }) {
      const stat = await fs.stat(filePath);
      const metadata = {
        name,
        parents: [config.driveFolderId],
        appProperties: { application: APPLICATION_ID, ...appProperties },
      };
      const start = await withRetry(() =>
        authorizedFetch(`${DRIVE_UPLOAD}?uploadType=resumable`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json; charset=UTF-8",
            "X-Upload-Content-Type": mimeType,
            "X-Upload-Content-Length": String(stat.size),
          },
          body: JSON.stringify(metadata),
        }),
      );
      assertOk(start, "Drive resumable init");
      const sessionUrl = start.headers.get("Location");
      if (!sessionUrl) throw new Error("Drive resumable upload did not return a session URI.");

      let offset = 0;
      for (let attempt = 1; attempt <= 5; attempt += 1) {
        try {
          const remaining = stat.size - offset;
          const response = await fetch(sessionUrl, {
            method: "PUT",
            headers: {
              "Content-Length": String(remaining),
              "Content-Range": `bytes ${offset}-${stat.size - 1}/${stat.size}`,
              "Content-Type": mimeType,
            },
            body: createReadStream(filePath, { start: offset }) as unknown as import("node:stream").Readable,
            duplex: "half",
          } as RequestInit);
          if (response.ok) return (await response.json()) as DriveFileRecord;
          if (response.status === 308) {
            offset = nextUploadOffset(response);
            continue;
          }
          const error = new Error(`Drive upload returned HTTP ${response.status}`) as Error & { status: number };
          error.status = response.status;
          throw error;
        } catch (error) {
          if (attempt === 5 || !isTransientError(error)) throw error;
          const status = await fetch(sessionUrl, {
            method: "PUT",
            headers: { "Content-Length": "0", "Content-Range": `bytes */${stat.size}` },
          });
          if (status.ok) return (await status.json()) as DriveFileRecord;
          if (status.status !== 308) {
            const statusError = new Error(`Drive upload status returned HTTP ${status.status}`) as Error & { status: number };
            statusError.status = status.status;
            throw statusError;
          }
          offset = nextUploadOffset(status);
          await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** (attempt - 1)));
        }
      }
      throw new Error("Drive resumable upload exhausted retries.");
    },
    async uploadJson({ name, body, appProperties, existingId }) {
      const payload = JSON.stringify(body);
      const metadata = {
        name,
        ...(existingId ? {} : { parents: [config.driveFolderId] }),
        appProperties: { application: APPLICATION_ID, ...appProperties },
      };
      const boundary = "acreledger_status_boundary";
      const requestBody = [
        `--${boundary}`,
        "Content-Type: application/json; charset=UTF-8",
        "",
        JSON.stringify(metadata),
        `--${boundary}`,
        "Content-Type: application/json; charset=UTF-8",
        "",
        payload,
        `--${boundary}--`,
      ].join("\r\n");
      const response = await withRetry(() =>
        authorizedFetch(`${DRIVE_UPLOAD}${existingId ? `/${existingId}` : ""}?uploadType=multipart`, {
          method: existingId ? "PATCH" : "POST",
          headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
          body: requestBody,
        }),
      );
      assertOk(response, existingId ? "Drive JSON update" : "Drive JSON upload");
      return (await response.json()) as DriveFileRecord;
    },
    async getFile(id) {
      const params = new URLSearchParams({
        fields: "id,name,size,md5Checksum,parents,appProperties,createdTime",
      });
      const response = await withRetry(() => authorizedFetch(`${DRIVE_API}/files/${id}?${params.toString()}`));
      assertOk(response, "Drive get");
      return (await response.json()) as DriveFileRecord;
    },
    async updateAppProperties(id, appProperties) {
      const response = await withRetry(() => authorizedFetch(`${DRIVE_API}/files/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appProperties: { application: APPLICATION_ID, ...appProperties } }),
      }));
      assertOk(response, "Drive metadata update");
      return (await response.json()) as DriveFileRecord;
    },
    async deleteFile(id) {
      const response = await withRetry(() => authorizedFetch(`${DRIVE_API}/files/${id}`, { method: "DELETE" }));
      if (response.status === 404) return;
      assertOk(response, "Drive delete");
    },
    async downloadFile(id, destPath) {
      const response = await withRetry(() =>
        authorizedFetch(`${DRIVE_API}/files/${id}?alt=media`),
      );
      assertOk(response, "Drive download");
      if (!response.body) throw new Error("Drive download returned no response body.");
      await fs.mkdir(path.dirname(destPath), { recursive: true });
      await pipeline(
        Readable.fromWeb(response.body as import("node:stream/web").ReadableStream),
        createWriteStream(destPath),
      );
    },
  };
}

export function archiveAppProperties(input: {
  manifestId: string;
  backupTimeUtc: string;
  retentionTier: RetentionTier;
  encryptedSha256: string;
  runDateChicago?: string;
}): Record<string, string> {
  return {
    application: APPLICATION_ID,
    kind: "archive",
    manifest_id: input.manifestId,
    backup_time_utc: input.backupTimeUtc,
    retention_tier: input.retentionTier,
    archive_sha256: input.encryptedSha256,
    ...(input.runDateChicago ? { run_date_chicago: input.runDateChicago } : {}),
  };
}

export { DRIVE_SCOPE };
