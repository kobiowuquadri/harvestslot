import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { cloudinaryCredentials, resolveFromRoot, type CloudinaryCredentials, type Env } from '@harvestslot/config';

/** Private object storage. Objects are never public; the API streams them after authorisation. */
export interface ObjectStorage {
  readonly driver: 'cloudinary' | 's3' | 'filesystem';
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  health(): Promise<{ ok: boolean; detail: string }>;
}

class S3Storage implements ObjectStorage {
  readonly driver = 's3' as const;
  private readonly client: S3Client;
  constructor(private readonly env: Env) {
    this.client = new S3Client({
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      credentials: { accessKeyId: env.S3_ACCESS_KEY_ID!, secretAccessKey: env.S3_SECRET_ACCESS_KEY! },
    });
  }
  async put(key: string, body: Buffer, contentType: string) {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.env.S3_BUCKET, Key: key, Body: body, ContentType: contentType, ServerSideEncryption: undefined }),
    );
  }
  async get(key: string) {
    const out = await this.client.send(new GetObjectCommand({ Bucket: this.env.S3_BUCKET, Key: key }));
    const bytes = await out.Body!.transformToByteArray();
    return Buffer.from(bytes);
  }
  async health() {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.env.S3_BUCKET }));
      return { ok: true, detail: `S3 bucket ${this.env.S3_BUCKET} reachable` };
    } catch (error) {
      return { ok: false, detail: `S3 bucket ${this.env.S3_BUCKET} unreachable: ${String(error).slice(0, 200)}` };
    }
  }
}

/**
 * Cloudinary's documented request signature: parameters sorted by name, joined as `k=v&k=v`, with the
 * API secret appended, then SHA-1 (hex). Empty values are left out.
 */
export function cloudinarySignature(params: Record<string, string | number | undefined>, apiSecret: string): string {
  const toSign = Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== '')
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  return createHash('sha1').update(toSign + apiSecret).digest('hex');
}

/**
 * Cloudinary as private storage. Files are uploaded as `raw` assets of delivery type `private`, so
 * the bytes are stored unchanged and no public URL serves them; the API downloads them with a
 * short-lived signed URL after its own authorisation checks, exactly as with the other drivers.
 */
class CloudinaryStorage implements ObjectStorage {
  readonly driver = 'cloudinary' as const;
  private readonly creds: CloudinaryCredentials;
  constructor(private readonly env: Env) {
    const creds = cloudinaryCredentials(env);
    if (!creds) throw new Error('Cloudinary credentials are missing');
    this.creds = creds;
  }
  private publicId(key: string): string {
    if (key.includes('..')) throw new Error('Invalid object key');
    return `${this.env.CLOUDINARY_FOLDER.replace(/\/+$/, '')}/${key}`;
  }
  private api(path: string): string {
    return `https://api.cloudinary.com/v1_1/${encodeURIComponent(this.creds.cloudName)}/${path}`;
  }
  async put(key: string, body: Buffer, contentType: string) {
    const params = { public_id: this.publicId(key), timestamp: Math.floor(Date.now() / 1000), type: 'private', overwrite: 'false' };
    const form = new FormData();
    for (const [k, v] of Object.entries(params)) form.append(k, String(v));
    form.append('api_key', this.creds.apiKey);
    form.append('signature', cloudinarySignature(params, this.creds.apiSecret));
    form.append('file', new Blob([new Uint8Array(body)], { type: contentType }), key.split('/').pop() ?? 'file');
    const res = await fetch(this.api('raw/upload'), { method: 'POST', body: form, signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`Cloudinary upload failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
  async get(key: string) {
    const params = { public_id: this.publicId(key), timestamp: Math.floor(Date.now() / 1000), type: 'private', expires_at: Math.floor(Date.now() / 1000) + 300 };
    const query = new URLSearchParams({ ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])), api_key: this.creds.apiKey, signature: cloudinarySignature(params, this.creds.apiSecret) });
    const res = await fetch(`${this.api('raw/download')}?${query}`, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`Cloudinary download failed (${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  }
  async health() {
    try {
      const auth = Buffer.from(`${this.creds.apiKey}:${this.creds.apiSecret}`).toString('base64');
      const res = await fetch(this.api('ping'), { headers: { Authorization: `Basic ${auth}` }, signal: AbortSignal.timeout(10_000) });
      return res.ok
        ? { ok: true, detail: `Cloudinary account ${this.creds.cloudName} reachable (private raw files in "${this.env.CLOUDINARY_FOLDER}")` }
        : { ok: false, detail: `Cloudinary account ${this.creds.cloudName} refused the credentials (${res.status})` };
    } catch (error) {
      return { ok: false, detail: `Cloudinary unreachable: ${String(error).slice(0, 200)}` };
    }
  }
}

/** Development-only storage on local disk. Environment validation refuses it in production. */
class FilesystemStorage implements ObjectStorage {
  readonly driver = 'filesystem' as const;
  private readonly root: string;
  constructor(dir: string) {
    this.root = resolveFromRoot(dir);
  }
  private path(key: string): string {
    const full = resolve(join(this.root, key));
    if (!full.startsWith(this.root + sep)) throw new Error('Invalid object key');
    return full;
  }
  async put(key: string, body: Buffer) {
    const p = this.path(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, body, { flag: 'wx' });
  }
  async get(key: string) {
    return readFile(this.path(key));
  }
  async health() {
    try {
      await mkdir(this.root, { recursive: true });
      await stat(this.root);
      return { ok: true, detail: `Development filesystem storage at ${this.root}` };
    } catch (error) {
      return { ok: false, detail: String(error) };
    }
  }
}

export function createStorage(env: Env): ObjectStorage {
  if (env.STORAGE_DRIVER === 'filesystem') {
    if (env.NODE_ENV === 'production') throw new Error('Filesystem storage is not allowed in production');
    return new FilesystemStorage(env.FILESYSTEM_STORAGE_DIR);
  }
  if (env.STORAGE_DRIVER === 's3') return new S3Storage(env);
  return new CloudinaryStorage(env);
}
