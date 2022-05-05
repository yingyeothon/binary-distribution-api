import "source-map-support/register";

import { APIGatewayProxyHandlerV2, Handler } from "aws-lambda";
import { filterMap, flattenMap, sortByLatest } from "./utils/distribution";

import { deleteObjects } from "./utils/s3";
import { skipK } from "./utils/functional";
import { traverseAll } from "./utils/traversal";

const defaultRemainCount = 100;
const bucketName = process.env.DIST_BUCKET!;

export const findExpiredDistributions: APIGatewayProxyHandlerV2<
  unknown
> = async (event) => {
  const count = +(
    (event.queryStringParameters ?? {}).count || defaultRemainCount.toString()
  );
  const map = await traverseAll();
  const expired = filterMap(map, (objects) =>
    objects.sort(sortByLatest).filter(skipK(count))
  );
  const result = flattenMap(expired).map((o) => ({
    key: o.Key,
    modified: o.LastModified,
  }));
  return result;
};

export const deleteExpiredDistributions: Handler = async () => {
  const map = await traverseAll();
  const expired = filterMap(map, (objects) =>
    objects.sort(sortByLatest).filter(skipK(defaultRemainCount))
  );
  console.info(`Delete target`, expired);
  const result = await deleteObjects(
    bucketName,
    flattenMap(expired)
      .map((o) => o.Key!)
      .filter(Boolean)
  );
  console.info(`Deleted`, result);
};
