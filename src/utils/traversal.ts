import { S3 } from 'aws-sdk';
import { asMap, IDistributionMap } from './distribution';
import { iterateObjectRecursively, limitFetchCount } from './s3';

const bucketName = process.env.DIST_BUCKET!;

interface ITraverseArguments {
  count?: number;
}

export const traverseAll = async ({ count }: ITraverseArguments = {}): Promise<
  IDistributionMap
> =>
  iterateObjectRecursively({
    bucketName,
    level: 2,
    limiter: limitFetchCount(count),
  }).then(asMap);

interface ITraverseServiceArguments extends ITraverseArguments {
  service: string;
}

export const traverseInService = async ({
  service,
  count,
}: ITraverseServiceArguments): Promise<IDistributionMap> =>
  iterateObjectRecursively({
    bucketName,
    level: 1,
    prefix: `${service}/`,
    limiter: limitFetchCount(count),
  }).then(asMap);

interface ITraverseServicePlatformArguments extends ITraverseServiceArguments {
  platform: string;
}

export const traverseInServicePlatform = async ({
  service,
  platform,
  count,
}: ITraverseServicePlatformArguments): Promise<S3.Object[]> =>
  iterateObjectRecursively({
    bucketName,
    level: 0,
    prefix: `${service}/${platform}/`,
    limiter: limitFetchCount(count),
  });
