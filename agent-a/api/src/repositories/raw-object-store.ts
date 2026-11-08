import { createHash } from "node:crypto";
import { GetObjectCommand, PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import type { PresignedPost } from "@finance/shared";

export const PRESIGNED_POST_EXPIRY_SECONDS = 15 * 60;

/** The private raw-ingest bucket: raw emails under `raw/`, CSV uploads under `imports/`. */
export class RawObjectStore {
  constructor(
    private readonly s3: S3Client,
    private readonly bucket: string,
  ) {}

  /** Stores a raw MIME message and returns its key (the `rawRef`). The key never contains the Message-ID itself. */
  async putRawEmail(userId: string, messageId: string, mime: string): Promise<string> {
    const key = `raw/${userId}/${createHash("sha256").update(messageId).digest("hex")}.eml`;
    await this.s3.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: mime, ContentType: "message/rfc822", ServerSideEncryption: "AES256" }),
    );
    return key;
  }

  async presignCsvUpload(userId: string, importId: string, maxBytes: number): Promise<PresignedPost> {
    const key = RawObjectStore.csvKey(userId, importId);
    const post = await createPresignedPost(this.s3, {
      Bucket: this.bucket,
      Key: key,
      Conditions: [["content-length-range", 1, maxBytes], ["eq", "$key", key]],
      Fields: { key },
      Expires: PRESIGNED_POST_EXPIRY_SECONDS,
    });
    return { url: post.url, fields: post.fields };
  }

  async getObject(key: string): Promise<Uint8Array> {
    const out = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!out.Body) throw new Error("Empty S3 object");
    return out.Body.transformToByteArray();
  }

  static csvKey(userId: string, importId: string): string {
    return `imports/${userId}/${importId}.csv`;
  }

  /** Parses `imports/<userId>/<importId>.csv`. */
  static parseCsvKey(key: string): { userId: string; importId: string } | null {
    const m = /^imports\/([A-Za-z0-9-]+)\/([A-Za-z0-9-]+)\.csv$/.exec(key);
    return m ? { userId: m[1], importId: m[2] } : null;
  }
}
