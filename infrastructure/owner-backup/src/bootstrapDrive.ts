import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { GoogleAuth, OAuth2Client } from "google-auth-library";
import { DRIVE_FOLDER_NAME, DRIVE_SCOPE } from "./types.js";
import { logEvent } from "./logging.js";

const execFileAsync = promisify(execFile);

interface BootstrapEnv {
  OWNER_BACKUP_GOOGLE_OAUTH_CLIENT_ID?: string;
  OWNER_BACKUP_GOOGLE_OAUTH_CLIENT_SECRET?: string;
  GOOGLE_CLOUD_PROJECT?: string;
  OWNER_BACKUP_OPEN_BROWSER?: string;
}

export interface BootstrapResult {
  folderId: string;
  secretsWritten: string[];
}

async function writeSecret(projectId: string, secretId: string, value: string): Promise<void> {
  const auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  if (!token.token) {
    throw new Error("Application Default Credentials did not return an access token for Secret Manager.");
  }
  const ensure = await fetch(
    `https://secretmanager.googleapis.com/v1/projects/${projectId}/secrets/${secretId}`,
    { headers: { Authorization: `Bearer ${token.token}` } },
  );
  if (ensure.status === 404) {
    const created = await fetch(
      `https://secretmanager.googleapis.com/v1/projects/${projectId}/secrets?secretId=${secretId}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ replication: { automatic: {} } }),
      },
    );
    if (!created.ok) {
      throw new Error(`Failed to create secret ${secretId}: HTTP ${created.status}`);
    }
  } else if (!ensure.ok) {
    throw new Error(`Failed to read secret ${secretId}: HTTP ${ensure.status}`);
  }

  const added = await fetch(
    `https://secretmanager.googleapis.com/v1/projects/${projectId}/secrets/${secretId}:addVersion`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ payload: { data: Buffer.from(value, "utf8").toString("base64") } }),
    },
  );
  if (!added.ok) {
    throw new Error(`Failed to add secret version for ${secretId}: HTTP ${added.status}`);
  }
}

async function openBrowser(url: string): Promise<void> {
  const platform = process.platform;
  if (platform === "win32") {
    await execFileAsync("cmd", ["/c", "start", "", url]);
    return;
  }
  if (platform === "darwin") {
    await execFileAsync("open", [url]);
    return;
  }
  await execFileAsync("xdg-open", [url]);
}

export async function bootstrapDrive(env: BootstrapEnv = process.env): Promise<BootstrapResult> {
  const clientId = env.OWNER_BACKUP_GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = env.OWNER_BACKUP_GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  const projectId = env.GOOGLE_CLOUD_PROJECT?.trim();
  if (!clientId || !clientSecret) {
    throw new Error("Set OWNER_BACKUP_GOOGLE_OAUTH_CLIENT_ID and OWNER_BACKUP_GOOGLE_OAUTH_CLIENT_SECRET in the environment, not in source files.");
  }
  if (!projectId) {
    throw new Error("Set GOOGLE_CLOUD_PROJECT so the refresh token can be written to Secret Manager.");
  }

  const oauthState = randomBytes(32).toString("base64url");
  const { code, redirectUri } = await new Promise<{ code: string; redirectUri: string }>((resolve, reject) => {
    const server = createServer((request, response) => {
      try {
        const url = new URL(request.url ?? "/", "http://127.0.0.1");
        if (url.searchParams.get("state") !== oauthState) {
          response.writeHead(400);
          response.end("Invalid OAuth state.");
          return;
        }
        const received = url.searchParams.get("code");
        if (!received) {
          response.writeHead(400);
          response.end("Missing authorization code.");
          return;
        }
        response.writeHead(200, { "Content-Type": "text/plain" });
        response.end("AcreLedger backup authorization complete. You can close this window.");
        const address = server.address();
        const port = address && typeof address !== "string" ? address.port : 0;
        resolve({ code: received, redirectUri: `http://127.0.0.1:${port}/oauth2callback` });
      } catch (error) {
        reject(error);
      } finally {
        server.close();
      }
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to bind loopback callback port."));
        return;
      }
      const redirectUri = `http://127.0.0.1:${address.port}/oauth2callback`;
      const oauthForUrl = new OAuth2Client(clientId, clientSecret, redirectUri);
      const authUrl = oauthForUrl.generateAuthUrl({
        access_type: "offline",
        prompt: "consent",
        scope: [DRIVE_SCOPE],
        state: oauthState,
      });
      logEvent("INFO", "DRIVE_BOOTSTRAP_OPEN_BROWSER", { detail: "Opening Google consent screen." });
      if (env.OWNER_BACKUP_OPEN_BROWSER === "false") {
        logEvent("INFO", "DRIVE_BOOTSTRAP_URL_READY", { detail: "Browser open disabled; visit the generated auth URL locally." });
        console.log(authUrl);
        return;
      }
      openBrowser(authUrl).catch(reject);
    });
  });
  const oauth = new OAuth2Client(clientId, clientSecret, redirectUri);

  const tokenResponse = await oauth.getToken(code);
  const refreshToken = tokenResponse.tokens.refresh_token;
  if (!refreshToken) {
    throw new Error("Google did not return a refresh token. Re-run with prompt=consent and a Desktop OAuth client.");
  }
  oauth.setCredentials(tokenResponse.tokens);
  const accessToken = tokenResponse.tokens.access_token;
  if (!accessToken) throw new Error("Google did not return an access token.");

  const folderResponse = await fetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: DRIVE_FOLDER_NAME,
      mimeType: "application/vnd.google-apps.folder",
    }),
  });
  if (!folderResponse.ok) {
    throw new Error(`Failed to create Drive folder: HTTP ${folderResponse.status}`);
  }
  const folder = (await folderResponse.json()) as { id: string };

  await writeSecret(projectId, "acreledger-backup-google-refresh-token", refreshToken);
  await writeSecret(projectId, "acreledger-backup-drive-folder-id", folder.id);
  logEvent("INFO", "DRIVE_BOOTSTRAP_COMPLETE", {
    detail: "Refresh token and folder ID written to Secret Manager.",
  });
  return {
    folderId: folder.id,
    secretsWritten: [
      "acreledger-backup-google-refresh-token",
      "acreledger-backup-drive-folder-id",
    ],
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  bootstrapDrive().catch((error) => {
    logEvent("ERROR", "DRIVE_BOOTSTRAP_FAILED", { detail: String(error) });
    process.exitCode = 1;
  });
}
