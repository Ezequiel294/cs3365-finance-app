import { createHash } from 'node:crypto';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';

export interface PresignedPost {
  url: string;
  fields: Record<string, string>;
}

export const UPLOAD_EXPIRY_SECONDS = 300;

/** The private `raw-ingest` bucket: raw emails under `raw/`, statement uploads under `imports/`. */
export class RawObjectStore {
  constructor(
    private readonly s3: S3Client,
    private readonly bucket: string,
  ) {}

  static csvKey(userId: string, importId: string): string {
    return `imports/${userId}/${importId}.csv`;
  }

  /** Stores a raw email and returns its key. Message-IDs are hashed so the key is always safe. */
  async putRawEmail(userId: string, messageId: string, mime: Uint8Array): Promise<string> {
    const key = `raw/${userId}/${createHash('sha256').update(messageId).digest('hex')}.eml`;
    await this.s3.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: mime, ContentType: 'message/rfc822' }),
    );
    return key;
  }

  /** Presigned POST limited to one key, 1 byte to `maxBytes`, valid for 5 minutes. */
  async presignCsvUpload(userId: string, importId: string, maxBytes: number): Promise<PresignedPost> {
    const key = RawObjectStore.csvKey(userId, importId);
    const post = await createPresignedPost(this.s3, {
      Bucket: this.bucket,
      Key: key,
      Conditions: [
        ['content-length-range', 1, maxBytes],
        ['eq', '$key', key],
      ],
      Expires: UPLOAD_EXPIRY_SECONDS,
    });
    return { url: post.url, fields: post.fields };
  }

  async getObject(key: string): Promise<Uint8Array> {
    const out = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!out.Body) throw new Error('Empty object');
    return out.Body.transformToByteArray();
  }
}
