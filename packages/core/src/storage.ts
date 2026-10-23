import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { resolveFromRoot, type Env } from '@harvestslot/config';

/** Private object storage. Objects are never public; the API streams them after authorisation. */
export interface ObjectStorage {
  readonly driver: 's3' | 'filesystem';
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
  return new S3Storage(env);
}
