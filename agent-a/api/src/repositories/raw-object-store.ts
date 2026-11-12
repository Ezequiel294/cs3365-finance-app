import { GetObjectCommand, PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import type { PresignedPost } from '../../../shared/api-types';
import { sha256Hex } from '../ids';

/** The private raw-ingest bucket: raw emails under raw/, CSV uploads under imports/. */
export class RawObjectStore {
  constructor(
    private readonly s3: S3Client,
    private readonly bucket: string,
  ) {}

  static csvKey(userId: string, importId: string): string {
    return `imports/${userId}/${importId}.csv`;
  }

  /** Stores the raw MIME; returns its key (the message's rawRef). */
  async putRawEmail(userId: string, messageId: string, mime: string): Promise<string> {
    const key = `raw/${userId}/${sha256Hex(messageId)}.eml`;
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: mime,
        ContentType: 'message/rfc822',
      }),
    );
    return key;
  }

  /** A presigned POST limited to one key, 1 byte to maxBytes, valid for 5 minutes. */
  async presignCsvUpload(userId: string, importId: string, maxBytes: number): Promise<PresignedPost> {
    const key = RawObjectStore.csvKey(userId, importId);
    const post = await createPresignedPost(this.s3, {
      Bucket: this.bucket,
      Key: key,
      Conditions: [
        ['content-length-range', 1, maxBytes],
        ['eq', '$key', key],
      ],
      Expires: 300,
    });
    return { url: post.url, fields: post.fields };
  }

  async getObject(key: string): Promise<Uint8Array> {
    const out = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!out.Body) throw new Error('Empty object');
    return out.Body.transformToByteArray();
  }
}
