import { api } from 'api-gateway-rest-handler';
import 'source-map-support/register';
import { filterMap, flattenMap, sortByLatest } from './utils/distribution';
import { skipK } from './utils/functional';
import { deleteObjects } from './utils/s3';
import { traverseAll } from './utils/traversal';

const defaultRemainCount = 100;
const bucketName = process.env.DIST_BUCKET!;

export const findExpiredDistributions = api(async req => {
  const count = +(
    req.queryStringParameters.count || defaultRemainCount.toString()
  );
  const map = await traverseAll();
  const expired = filterMap(map, objects =>
    objects.sort(sortByLatest).filter(skipK(count)),
  );
  return flattenMap(expired).map(o => ({
    key: o.Key,
    modified: o.LastModified,
  }));
});

export const deleteExpiredDistributions = api(async () => {
  const map = await traverseAll();
  const expired = filterMap(map, objects =>
    objects.sort(sortByLatest).filter(skipK(defaultRemainCount)),
  );
  console.info(`Delete target`, expired);
  const result = await deleteObjects(
    bucketName,
    flattenMap(expired)
      .map(o => o.Key!)
      .filter(Boolean),
  );
  console.info(`Deleted`, result);
  return result;
});
