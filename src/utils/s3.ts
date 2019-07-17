import { S3 } from 'aws-sdk';
import { captureAWSClient } from 'aws-xray-sdk';
import pLimit from 'p-limit';
import { flatten, unique } from './functional';

const s3 = captureAWSClient(new S3());
const limit = pLimit(+(process.env.CONCURRENCY || '16'));

type S3ListObjectLimiter = (listResult: S3.ListObjectsOutput) => boolean;

export const acceptAllObjects = (objects: S3.Object[]) => objects;

export const limitFetchCount = (maxCount?: number) => {
  if (!maxCount) {
    return () => false;
  }
  let currentCount = 0;
  return (listResult: S3.ListObjectsOutput) => {
    if (listResult.Contents) {
      currentCount += listResult.Contents.length;
    }
    return currentCount >= maxCount;
  };
};

interface IS3OperationArguments {
  bucketName: string;
}

interface IIterateObjectArguments extends IS3OperationArguments {
  level: number;
  prefix?: string;
  limiter?: S3ListObjectLimiter;
}

export const iterateObjectRecursively = async ({
  bucketName,
  level,
  prefix,
  limiter,
}: IIterateObjectArguments): Promise<S3.Object[]> => {
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
      nextPrefixes.map(nextPrefix =>
        limit(() =>
          iterateObjectRecursively({
            bucketName,
            level: level - 1,
            prefix: nextPrefix,
            limiter,
          }),
        ),
      ),
    ).then(flatten);
  }
  return [];
};

interface ICollectPrefixArguments extends IS3OperationArguments {
  prefix?: string;
}

export const collectPrefix = async ({
  bucketName,
  prefix,
}: ICollectPrefixArguments) =>
  transformAllObjects({
    transform: result =>
      result.CommonPrefixes
        ? result.CommonPrefixes.filter(cp => cp.Prefix).map(cp => cp.Prefix!)
        : [],
    bucketName,
    prefix,
    delimiter: '/',
  })
    .then(flatten)
    .then(unique);

interface ICollectAllObjectsArguments extends IS3OperationArguments {
  prefix?: string;
  limiter?: S3ListObjectLimiter;
}

export const collectAllObjects = async ({
  bucketName,
  prefix,
  limiter,
}: ICollectAllObjectsArguments) =>
  transformAllObjects({
    transform: result => (result.Contents ? result.Contents : []),
    bucketName,
    prefix,
    limiter,
  }).then(flatten);

interface ITransformAllObjectsArguments<R> extends IS3OperationArguments {
  prefix?: string;
  delimiter?: string;
  transform: (result: S3.ListObjectsOutput) => R;
  limiter?: S3ListObjectLimiter;
}

export const transformAllObjects = async <R>({
  bucketName,
  prefix,
  delimiter,
  transform,
  limiter,
}: ITransformAllObjectsArguments<R>): Promise<R[]> => {
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
};
