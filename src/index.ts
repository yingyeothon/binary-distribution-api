import { api, ApiError } from 'api-gateway-rest-handler';
import * as AWS from 'aws-sdk';
import { ensureAuthorized } from './auth';

const bucketName = 'd.yyt.life';
const cloudFrontDistributionId = 'E3J0F0HBU3676';
const downloadUrlBase = `https://${bucketName}`;
const maxDistributionCount = 100;

export const createDistribution = api(async req => {
  await ensureAuthorized(req.header('X-Auth-Token'));

  const s3 = new AWS.S3();
  const { serviceName, platform, version } = req.pathParameters;
  if (!serviceName || !platform || !version) {
    throw new ApiError('Invalid path parameters');
  }
  const key = `${serviceName}/${platform}/${version}`;
  const signedUrl = s3.getSignedUrl('putObject', {
    Bucket: bucketName,
    Key: key,
    Expires: 60 * 10,
    ContentType: 'application/binary',
    ACL: 'public-read',
  });
  return signedUrl;
});

export const deleteDistribution = api(async req => {
  await ensureAuthorized(req.header('X-Auth-Token'));

  const s3 = new AWS.S3();
  const { serviceName, platform, version } = req.pathParameters;
  if (!serviceName || !platform || !version) {
    throw new ApiError('Invalid path parameters');
  }
  const key = `${serviceName}/${platform}/${version}`;
  await s3
    .deleteObject({
      Bucket: bucketName,
      Key: key,
    })
    .promise();

  const cf = new AWS.CloudFront();
  await new Promise<void>((resolve, reject) =>
    cf.createInvalidation(
      {
        DistributionId: cloudFrontDistributionId,
        InvalidationBatch: {
          CallerReference: new Date().getTime().toString(),
          Paths: {
            Items: [`/${key}`],
            Quantity: 1,
          },
        },
      },
      (error: AWS.AWSError) => (error ? reject(error) : resolve()),
    ),
  );
  return 'ok';
});

const sortedKeys = (
  objects?: AWS.S3.Object[],
  count: number = maxDistributionCount,
) =>
  (objects || [])
    .filter(e => e.Key && e.LastModified)
    .sort(
      (lhs, rhs) => rhs.LastModified!.getTime() - lhs.LastModified!.getTime(),
    )
    .map(e => e.Key!)
    .slice(0, Math.max(1, count));

export const listAllDistributions = api(async req => {
  const s3 = new AWS.S3();
  const { serviceName } = req.pathParameters;
  if (!serviceName) {
    throw new ApiError('Invalid path parameters');
  }
  const listing = await s3
    .listObjects({
      Bucket: bucketName,
      Prefix: `${serviceName}/`,
    })
    .promise();

  const platforms: { [platform: string]: string[] } = {};
  for (const key of sortedKeys(listing.Contents)) {
    const platform = key.split('/')[1];
    if (!platform) {
      continue;
    }
    if (!platforms[platform]) {
      platforms[platform] = [];
    }
    platforms[platform].push(`${downloadUrlBase}/${key}`);
  }
  const count = +(req.queryStringParameters.count || `${maxDistributionCount}`);
  for (const platform of Object.keys(platforms)) {
    platforms[platform] = platforms[platform].slice(0, Math.max(1, count));
  }
  return {
    service: serviceName,
    platforms,
  };
});

export const listPlatformDistributions = api(async req => {
  const s3 = new AWS.S3();
  const { serviceName, platform } = req.pathParameters;
  if (!serviceName || !platform) {
    throw new ApiError('Invalid path parameters');
  }
  const prefix = `${serviceName}/${platform}/`;
  const listing = await s3
    .listObjects({
      Bucket: bucketName,
      Prefix: prefix,
    })
    .promise();
  const count = +(req.queryStringParameters.count || `${maxDistributionCount}`);
  const keys = sortedKeys(listing.Contents).slice(0, count);
  return {
    service: serviceName,
    platform,
    versions: keys.map(key => `${downloadUrlBase}/${key}`),
  };
});
