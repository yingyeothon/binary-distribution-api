import { flatten, unique } from "./functional";

import { S3 } from "aws-sdk";
import { captureAWSClient } from "aws-xray-sdk-core";
import pLimit from "p-limit";

const s3 = captureAWSClient(new S3());
const limit = pLimit(+(process.env.CONCURRENCY || "16"));

type S3ListObjectLimiter = (listResult: S3.ListObjectsOutput) => boolean;

export function acceptAllObjects(objects: S3.Object[]) {
  return objects;
}

export function limitFetchCount(maxCount?: number) {
  if (!maxCount) {
    return function () {
      return false;
    };
  }
  let currentCount = 0;
  return function (listResult: S3.ListObjectsOutput) {
    if (listResult.Contents) {
      currentCount += listResult.Contents.length;
    }
    return currentCount >= maxCount;
  };
}

interface S3OperationArguments {
  bucketName: string;
}

interface IterateObjectArguments extends S3OperationArguments {
  level: number;
  prefix?: string;
  limiter?: S3ListObjectLimiter;
}

export async function iterateObjectRecursively({
  bucketName,
  level,
  prefix,
  limiter,
}: IterateObjectArguments): Promise<S3.Object[]> {
  if (level < 0 || !bucketName) {
    throw new Error(`Illegal argument`);
  }

  if (level === 0) {
    const allOfObjects = await collectAllObjects({
      bucketName,
      prefix,
      limiter,
    });
    return allOfObjects;
  }

  const result = await s3
    .listObjects({
      Bucket: bucketName,
      Prefix: prefix,
    })
    .promise();

  // If there is no marker with a service prefix,
  // collect expired objects directly because it is the full list of that prefix.
  if (!result.Marker) {
    if (result.Contents) {
      return result.Contents;
    }
  } else {
    // Collect expired objects with a prefix of the next level.
    const nextPrefixes = await collectPrefix({ bucketName, prefix });
    return Promise.all(
      nextPrefixes.map((nextPrefix) =>
        limit(() =>
          iterateObjectRecursively({
            bucketName,
            level: level - 1,
            prefix: nextPrefix,
            limiter,
          })
        )
      )
    ).then(flatten);
  }
  return [];
}

interface CollectPrefixArguments extends S3OperationArguments {
  prefix?: string;
}

export async function collectPrefix({
  bucketName,
  prefix,
}: CollectPrefixArguments): Promise<string[]> {
  return transformAllObjects({
    transform: (result) =>
      result.CommonPrefixes
        ? result.CommonPrefixes.filter((cp) => cp.Prefix).map(
            (cp) => cp.Prefix!
          )
        : [],
    bucketName,
    prefix,
    delimiter: "/",
  })
    .then(flatten)
    .then(unique);
}

interface CollectAllObjectsArguments extends S3OperationArguments {
  prefix?: string;
  limiter?: S3ListObjectLimiter;
}

export async function collectAllObjects({
  bucketName,
  prefix,
  limiter,
}: CollectAllObjectsArguments): Promise<S3.Object[]> {
  return transformAllObjects({
    transform: (result) => (result.Contents ? result.Contents : []),
    bucketName,
    prefix,
    limiter,
  }).then(flatten);
}

interface TransformAllObjectsArguments<R> extends S3OperationArguments {
  prefix?: string;
  delimiter?: string;
  transform: (result: S3.ListObjectsOutput) => R;
  limiter?: S3ListObjectLimiter;
}

export async function transformAllObjects<R>({
  bucketName,
  prefix,
  delimiter,
  transform,
  limiter,
}: TransformAllObjectsArguments<R>): Promise<R[]> {
  const result: R[] = [];
  let marker: string | undefined;
  while (true) {
    const listResult = await s3
      .listObjects({
        Bucket: bucketName,
        Prefix: prefix,
        Delimiter: delimiter,
        Marker: marker,
      })
      .promise();

    const transformed = transform(listResult);
    if (transformed !== undefined) {
      result.push(transformed);
    }

    if (!listResult.Marker) {
      break;
    }
    if (limiter && limiter(listResult)) {
      break;
    }
    // It can be over 1000, read all completely using marker.
    // So it can be very slow and costly.
    marker = listResult.Marker;
  }
  return result;
}

export async function deleteObjects(bucketName: string, keys: string[]) {
  const bulkSize = 1000;
  const outputs: S3.DeleteObjectsOutput[] = [];
  const errors: Error[] = [];
  for (let start = 0; start < keys.length; start += bulkSize) {
    const targetKeys = keys.slice(start, start + bulkSize);
    try {
      const output = await s3
        .deleteObjects({
          Bucket: bucketName,
          Delete: {
            Objects: targetKeys.map((key) => ({ Key: key })),
            Quiet: false,
          },
        })
        .promise();
      outputs.push(output);
    } catch (error: any) {
      errors.push(error);
    }
  }
  return { outputs, errors };
}
