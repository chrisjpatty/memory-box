import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, CreateBucketCommand, HeadBucketCommand } from '@aws-sdk/client-s3';

const BUCKET = 'memories';

let client: S3Client | null = null;
let bucketReady = false;

function getClient(): S3Client {
  if (!client) {
    const host = process.env.MINIO_HOST || process.env.KNOWLEDGE_FILES_HOST || 'knowledge-files';
    const port = process.env.MINIO_PORT || process.env.KNOWLEDGE_FILES_PORT || '9000';
    const endpoint = `http://${host}:${port}`;

    client = new S3Client({
      endpoint,
      region: 'us-east-1',
      forcePathStyle: true,
      credentials: {
        accessKeyId: 'minioadmin',
        secretAccessKey: 'minioadmin',
      },
    });
  }
  return client;
}

async function ensureBucket() {
  if (bucketReady) return;
  const s3 = getClient();
  try {
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET }));
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
  }
  bucketReady = true;
}

export async function putFile(key: string, data: Buffer, contentType: string): Promise<void> {
  await ensureBucket();
  const s3 = getClient();
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: data,
    ContentType: contentType,
  }));
}

export async function getFile(key: string): Promise<{ data: Buffer; contentType: string } | null> {
  const s3 = getClient();
  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    const bytes = await res.Body?.transformToByteArray();
    if (!bytes) return null;
    return {
      data: Buffer.from(bytes),
      contentType: res.ContentType || 'application/octet-stream',
    };
  } catch {
    return null;
  }
}

export async function deleteFile(key: string): Promise<void> {
  const s3 = getClient();
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
  } catch { /* ignore if not found */ }
}

export function fileKey(memoryId: string, filename: string): string {
  return `${memoryId}/${filename}`;
}
