import { api, ApiError } from 'api-gateway-rest-handler';
import { APIGatewayProxyHandler } from 'aws-lambda';
import { CloudFront, S3 } from 'aws-sdk';
import { DateTime } from 'luxon';
import 'source-map-support/register';
import { ensureAuthorized } from './auth';
import { filterMap, flattenMap, sortByLatest } from './utils/distribution';
import { skipK, takeK } from './utils/functional';
import plist from './utils/plist';
import {
  traverseAll,
  traverseInService,
  traverseInServicePlatform,
} from './utils/traversal';

const bucketName = process.env.DIST_BUCKET!;
const domainName = process.env.DIST_DOMAIN!;
const cloudFrontDistributionId = process.env.DIST_CF_ID!;
const downloadUrlBase = `https://${domainName}`;
const distApiUrlPrefix = process.env.DIST_API_URL_PREFIX!;
const maxDistributionCount = 100;

const s3 = new S3();

export const createDistribution = api(
  async req => {
    await ensureAuthorized(req.header('X-Auth-Token'));

    const { serviceName: service, platform, version } = req.pathParameters;
    if (!service || !platform || !version) {
      throw new ApiError('Invalid path parameters');
    }
    const key = `${service}/${platform}/${version}`;
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

  const { serviceName: service, platform, version } = req.pathParameters;
  if (!service || !platform || !version) {
    throw new ApiError('Invalid path parameters');
  }
  const key = `${service}/${platform}/${version}`;
  await s3
    .deleteObject({
      Bucket: bucketName,
      Key: key,
    })
    .promise();

  const cf = new CloudFront();
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

interface IPlatformVersions {
  [platform: string]: Array<{ url: string; modified: string }>;
}

const asDownloadVersion = (o: S3.Object) => ({
  url: `${downloadUrlBase}/${o.Key!}`,
  modified: DateTime.fromMillis(o.LastModified!.getTime()).toFormat(
    `yyyy-MM-dd HH:mm:ss`,
  ),
});

export const listAllDistributions = api(async req => {
  const { serviceName: service } = req.pathParameters;
  if (!service) {
    throw new ApiError('Invalid path parameters');
  }

  const count = Math.max(
    1,
    +(req.queryStringParameters.count || `${maxDistributionCount}`),
  );
  const map = await traverseInService({ service, count });
  const latest = filterMap(map, objects =>
    objects.sort(sortByLatest).filter(takeK(count)),
  )[service];

  const platforms = Object.keys(latest)
    .map(platform => ({
      platform,
      versions: latest[platform].map(asDownloadVersion),
    }))
    .reduce(
      (a, b) => Object.assign(a, { [b.platform]: b.versions }),
      {} as IPlatformVersions,
    );
  return {
    service,
    platforms,
  };
});

const findPlatformDistributions = async (
  service: string,
  platform: string,
  count: number,
) => {
  if (!service || !platform) {
    throw new ApiError('Invalid path parameters');
  }
  const distributions = await traverseInServicePlatform({
    service,
    platform,
    count,
  });
  return {
    service,
    platform,
    versions: distributions
      .sort(sortByLatest)
      .filter(takeK(count))
      .map(asDownloadVersion),
  };
};

export const listPlatformDistributions = api(async req => {
  const { serviceName: service, platform } = req.pathParameters;
  const count = +(req.queryStringParameters.count || `${maxDistributionCount}`);
  return findPlatformDistributions(service, platform, count);
});

export const getPlistForLatestIos = api(
  async req => {
    const { packageName, semver } = req.pathParameters;
    const service = packageName.split('.')[2];
    if (!service) {
      throw new ApiError('Invalid path parameters');
    }
    const projectName = service.charAt(0).toUpperCase() + service.substr(1);
    const distributions = await findPlatformDistributions(service, 'ios', 1);
    if (distributions.versions.length === 0) {
      throw new ApiError(`No distribution for ${packageName}`);
    }

    return plist({
      name: projectName,
      downloadUrl: distributions.versions[0].url,
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

export const findExpiredDistributions = api(async req => {
  try {
    const count = +(req.queryStringParameters.count || `100`);
    const map = await traverseAll();
    const expired = filterMap(map, objects =>
      objects.sort(sortByLatest).filter(skipK(count)),
    );
    return flattenMap(expired).map(asDownloadVersion);
  } catch (error) {
    console.error(error);
    throw error;
  }
});
