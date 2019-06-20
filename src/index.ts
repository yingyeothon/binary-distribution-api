import { api, ApiError } from 'api-gateway-rest-handler';
import { APIGatewayProxyHandler } from 'aws-lambda';
import * as AWS from 'aws-sdk';
import { DateTime } from 'luxon';
import { ensureAuthorized } from './auth';
import plist from './utils/plist';

const bucketName = process.env.DIST_BUCKET!;
const domainName = process.env.DIST_DOMAIN!;
const cloudFrontDistributionId = process.env.DIST_CF_ID!;
const downloadUrlBase = `https://${domainName}`;
const distApiUrlPrefix = process.env.DIST_API_URL_PREFIX!;
const maxDistributionCount = 100;

const s3 = new AWS.S3();

export const createDistribution = api(
  async req => {
    await ensureAuthorized(req.header('X-Auth-Token'));

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
  },
  { contentType: 'plain/text' },
);

export const deleteDistribution = api(async req => {
  await ensureAuthorized(req.header('X-Auth-Token'));

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
    .map(e => ({
      key: e.Key!,
      modified: DateTime.fromMillis(e.LastModified!.getTime()),
    }))
    .slice(0, Math.max(1, count));

export const listAllDistributions = api(async req => {
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

  const platforms: {
    [platform: string]: Array<{ url: string; modified: string }>;
  } = {};
  for (const { key, modified } of sortedKeys(listing.Contents)) {
    const platform = key.split('/')[1];
    if (!platform) {
      continue;
    }
    if (!platforms[platform]) {
      platforms[platform] = [];
    }
    platforms[platform].push({
      url: `${downloadUrlBase}/${key}`,
      modified: modified.toFormat('yyyy-MM-dd HH:mm:ss'),
    });
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

const findPlatformDistributions = async (
  serviceName: string,
  platform: string,
  count: number,
) => {
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
  const keys = sortedKeys(listing.Contents)
    .slice(0, count)
    .map(e => e.key);
  return {
    service: serviceName,
    platform,
    versions: keys.map(key => `${downloadUrlBase}/${key}`),
  };
};

export const listPlatformDistributions = api(async req => {
  const { serviceName, platform } = req.pathParameters;
  const count = +(req.queryStringParameters.count || `${maxDistributionCount}`);
  return findPlatformDistributions(serviceName, platform, count);
});

export const getPlistForLatestIos = api(
  async req => {
    const { packageName, semver } = req.pathParameters;
    const serviceName = packageName.split('.')[2];
    if (!serviceName) {
      throw new ApiError('Invalid path parameters');
    }
    const projectName =
      serviceName.charAt(0).toUpperCase() + serviceName.substr(1);
    const distributions = await findPlatformDistributions(
      serviceName,
      'ios',
      1,
    );
    if (distributions.versions.length === 0) {
      throw new ApiError(`No distribution for ${packageName}`);
    }

    return plist({
      name: projectName,
      downloadUrl: distributions.versions[0],
      packageName,
      semver,
    });
  },
  { contentType: 'application/xml' },
);

export const redirectToIosManifest: APIGatewayProxyHandler = (
  event,
  _,
  callback,
) => {
  const { packageName, semver }: { packageName?: string; semver?: string } =
    event.pathParameters || {};
  if (!packageName || !semver) {
    callback(new ApiError('Invalid path parameters'));
  } else {
    callback(null, {
      statusCode: 302,
      headers: {
        Location:
          'itms-services://?action=download-manifest&url=' +
          `${distApiUrlPrefix}/ios/${packageName}/${semver}/manifest.plist`,
      },
      body: '',
    });
  }
};
