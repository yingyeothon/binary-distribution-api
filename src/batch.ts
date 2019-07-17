import { api } from 'api-gateway-rest-handler';
import 'source-map-support/register';
import { filterMap, flattenMap, sortByLatest } from './utils/distribution';
import { skipK } from './utils/functional';
import { traverseAll } from './utils/traversal';

export const findExpiredDistributions = api(async req => {
  const count = +(req.queryStringParameters.count || `100`);
  const map = await traverseAll();
  const expired = filterMap(map, objects =>
    objects.sort(sortByLatest).filter(skipK(count)),
  );
  return flattenMap(expired).map(o => ({
    key: o.Key,
    modified: o.LastModified,
  }));
});
