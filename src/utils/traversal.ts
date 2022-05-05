import { DistributionMap, asMap } from "./distribution";
import { iterateObjectRecursively, limitFetchCount } from "./s3";

import { S3 } from "aws-sdk";

const bucketName = process.env.DIST_BUCKET!;

interface TraverseArguments {
  count?: number;
}

export async function traverseAll({
  count,
}: TraverseArguments = {}): Promise<DistributionMap> {
  return iterateObjectRecursively({
    bucketName,
    level: 2,
    limiter: limitFetchCount(count),
  }).then(asMap);
}

interface TraverseServiceArguments extends TraverseArguments {
  service: string;
}

export async function traverseInService({
  service,
  count,
}: TraverseServiceArguments): Promise<DistributionMap> {
  return iterateObjectRecursively({
    bucketName,
    level: 1,
    prefix: `${service}/`,
    limiter: limitFetchCount(count),
  }).then(asMap);
}

interface TraverseServicePlatformArguments extends TraverseServiceArguments {
  platform: string;
}

export async function traverseInServicePlatform({
  service,
  platform,
  count,
}: TraverseServicePlatformArguments): Promise<S3.Object[]> {
  return iterateObjectRecursively({
    bucketName,
    level: 0,
    prefix: `${service}/${platform}/`,
    limiter: limitFetchCount(count),
  });
}
