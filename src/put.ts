import "source-map-support/register";

import { CloudFront, S3 } from "aws-sdk";

import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { BadRequest } from "./response";
import { captureAWSClient } from "aws-xray-sdk-core";

const bucketName = process.env.DIST_BUCKET!;
const cloudFrontDistributionId = process.env.DIST_CF_ID!;

const s3 = captureAWSClient(new S3());
const cf = captureAWSClient(new CloudFront());

export const createDistribution: APIGatewayProxyHandlerV2 = async (event) => {
  const {
    serviceName: service,
    platform,
    version,
  } = event.pathParameters ?? {};
  if (!service || !platform || !version) {
    return BadRequest;
  }
  const key = `${service}/${platform}/${version}`;
  const signedUrl = s3.getSignedUrl("putObject", {
    Bucket: bucketName,
    Key: key,
    Expires: 60 * 10,
    ContentType: "application/binary",
    ACL: "public-read",
  });
  return {
    statusCode: 200,
    body: signedUrl,
    headers: { "Content-Type": "text/plain" },
  };
};

export const deleteDistribution: APIGatewayProxyHandlerV2 = async (event) => {
  const {
    serviceName: service,
    platform,
    version,
  } = event.pathParameters ?? {};
  if (!service || !platform || !version) {
    return BadRequest;
  }
  const key = `${service}/${platform}/${version}`;
  await s3
    .deleteObject({
      Bucket: bucketName,
      Key: key,
    })
    .promise();

  await cf
    .createInvalidation({
      DistributionId: cloudFrontDistributionId,
      InvalidationBatch: {
        CallerReference: new Date().getTime().toString(),
        Paths: {
          Items: [`/${key}`],
          Quantity: 1,
        },
      },
    })
    .promise();
  return "ok";
};
