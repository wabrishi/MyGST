import "server-only";

/**
 * Minimal Google Drive client over fetch (no SDK). Uses the `drive.file` scope, which only grants
 * access to files this app creates — the app can never read the rest of the user's Drive.
 */

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const DRIVE = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
export const DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive.file", "openid", "email"];

export const googleConfigured = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

export const redirectUri = () => `${process.env.APP_URL ?? process.env.BETTER_AUTH_URL}/api/backup/google/callback`;

function creds() {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!id || !secret) throw new Error("Google Drive is not configured (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)");
  return { id, secret };
}

async function json<T>(res: Response, what: string): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${what} failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

export function authorizeUrl(state: string, loginHint?: string) {
  const u = new URL(AUTH_URL);
  u.searchParams.set("client_id", creds().id);
  u.searchParams.set("redirect_uri", redirectUri());
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", DRIVE_SCOPES.join(" "));
  u.searchParams.set("access_type", "offline"); // we need a refresh token for unattended backups
  u.searchParams.set("prompt", "consent"); // always return a refresh token
  u.searchParams.set("include_granted_scopes", "true");
  u.searchParams.set("state", state);
  if (loginHint) u.searchParams.set("login_hint", loginHint);
  return u.toString();
}

export async function exchangeCode(code: string) {
  const { id, secret } = creds();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: id, client_secret: secret, redirect_uri: redirectUri(), grant_type: "authorization_code" }),
  });
  const t = await json<{ access_token: string; refresh_token?: string; scope: string }>(res, "Google token exchange");
  if (!t.refresh_token) throw new Error("Google did not return a refresh token. Remove MyGST from your Google account's third-party access and connect again.");
  if (!t.scope.includes("drive.file")) throw new Error("Drive permission was not granted");
  const info = await json<{ email: string }>(await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${t.access_token}` } }), "Google user info");
  return { accessToken: t.access_token, refreshToken: t.refresh_token, email: info.email };
}

export async function accessTokenFrom(refreshToken: string) {
  const { id, secret } = creds();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ refresh_token: refreshToken, client_id: id, client_secret: secret, grant_type: "refresh_token" }),
  });
  if (res.status === 400 || res.status === 401) {
    throw new Error("Google access was revoked or expired — reconnect Google Drive.");
  }
  return (await json<{ access_token: string }>(res, "Google token refresh")).access_token;
}

export async function createFolder(accessToken: string, name: string) {
  const res = await fetch(`${DRIVE}/files?fields=id`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder" }),
  });
  return (await json<{ id: string }>(res, "Create Drive folder")).id;
}

/** Resumable upload: works for any file size. */
export async function uploadFile(accessToken: string, folderId: string, name: string, data: Buffer, mimeType: string) {
  const init = await fetch(`${UPLOAD}/files?uploadType=resumable&fields=id`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": mimeType,
      "X-Upload-Content-Length": String(data.length),
    },
    body: JSON.stringify({ name, parents: [folderId], mimeType }),
  });
  if (!init.ok) throw new Error(`Start Drive upload failed (${init.status}): ${(await init.text()).slice(0, 300)}`);
  const session = init.headers.get("location");
  if (!session) throw new Error("Drive did not return an upload session");
  const put = await fetch(session, { method: "PUT", headers: { "Content-Type": mimeType }, body: new Uint8Array(data) });
  return (await json<{ id: string }>(put, "Drive upload")).id;
}

export interface DriveFile {
  id: string;
  name: string;
  createdTime: string;
}

/** Files (created by this app) inside the backup folder. */
export async function listFiles(accessToken: string, folderId: string): Promise<DriveFile[]> {
  const out: DriveFile[] = [];
  let pageToken = "";
  do {
    const u = new URL(`${DRIVE}/files`);
    u.searchParams.set("q", `'${folderId}' in parents and trashed = false`);
    u.searchParams.set("fields", "nextPageToken, files(id, name, createdTime)");
    u.searchParams.set("pageSize", "1000");
    if (pageToken) u.searchParams.set("pageToken", pageToken);
    const r = await json<{ files: DriveFile[]; nextPageToken?: string }>(
      await fetch(u, { headers: { Authorization: `Bearer ${accessToken}` } }),
      "List Drive files",
    );
    out.push(...r.files);
    pageToken = r.nextPageToken ?? "";
  } while (pageToken);
  return out;
}

export async function deleteFile(accessToken: string, fileId: string) {
  const res = await fetch(`${DRIVE}/files/${fileId}`, { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok && res.status !== 404) throw new Error(`Delete Drive file failed (${res.status})`);
}

/** Does the folder still exist (user may have deleted it)? */
export async function folderExists(accessToken: string, folderId: string) {
  const res = await fetch(`${DRIVE}/files/${folderId}?fields=id,trashed`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (res.status === 404) return false;
  const f = await json<{ trashed?: boolean }>(res, "Check Drive folder");
  return !f.trashed;
}

export async function revoke(refreshToken: string) {
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refreshToken)}`, { method: "POST" }).catch(() => {});
}

/** The subset of Drive operations the backup runner needs (lets tests use an in-memory fake). */
export interface DriveApi {
  accessTokenFrom(refreshToken: string): Promise<string>;
  folderExists(token: string, folderId: string): Promise<boolean>;
  createFolder(token: string, name: string): Promise<string>;
  uploadFile(token: string, folderId: string, name: string, data: Buffer, mimeType: string): Promise<string>;
  listFiles(token: string, folderId: string): Promise<DriveFile[]>;
  deleteFile(token: string, fileId: string): Promise<void>;
}

export const googleDrive: DriveApi = { accessTokenFrom, folderExists, createFolder, uploadFile, listFiles, deleteFile };
