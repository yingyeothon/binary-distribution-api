import { ApiError } from 'api-gateway-rest-handler';
import { S3 } from 'aws-sdk';
import { captureAWSClient } from 'aws-xray-sdk-core';

const bucketName = process.env.CONFIG_BUCKET!;
const tokensKey = process.env.DIST_CONFIG_TOKENS!;

const s3 = captureAWSClient(new S3());

const loadTokens = async () => {
  const tokensObject = await s3
    .getObject({
      Bucket: bucketName,
      Key: tokensKey,
    })
    .promise();
  if (!tokensObject.Body) {
    return [];
  }

  if (!(tokensObject.Body instanceof Buffer)) {
    throw new ApiError('Invalid S3 Body type.', 500);
  }
  const tokens = tokensObject.Body.toString('utf-8');
  return tokens
    .split('\n')
    .map(e => e.trim())
    .filter(Boolean);
};

export const ensureAuthorized = async (token?: string) => {
  if (!token) {
    throw new ApiError('Invalid authentication token.', 401);
  }
  const tokens = await loadTokens();
  if (!tokens.includes(token)) {
    throw new ApiError('Invalid authentication token.', 401);
  }
};

export const authorizeToken = async (token?: string, secret?: string) => {
  const normalizedToken = (token || '').trim();
  if (!normalizedToken) {
    throw new ApiError('Invalid token', 400);
  }

  const envSecret = process.env.BINARY_DISTRIBUTION_SECRET;
  if (!envSecret || envSecret !== secret) {
    throw new ApiError('Invalid secret', 403);
  }

  const tokens = await loadTokens();
  await s3
    .putObject({
      Bucket: bucketName,
      Key: tokensKey,
      Body: Array.from(new Set([...tokens, normalizedToken])).join('\n'),
    })
    .promise();
};
