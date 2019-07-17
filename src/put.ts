import { api, ApiError } from 'api-gateway-rest-handler';
import { CloudFront, S3 } from 'aws-sdk';
import { captureAWSClient } from 'aws-xray-sdk';
import 'source-map-support/register';
import { ensureAuthorized } from './auth';

const bucketName = process.env.DIST_BUCKET!;
const cloudFrontDistributionId = process.env.DIST_CF_ID!;

const s3 = captureAWSClient(new S3());

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
