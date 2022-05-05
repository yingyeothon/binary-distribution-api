import {
  APIGatewayRequestAuthorizerEventV2,
  APIGatewayRequestSimpleAuthorizerHandlerV2,
} from "aws-lambda";

import { createVerifier } from "fast-jwt";

const secretKey = process.env.JWT_SECRET_KEY!;
const verifyToken: (token: string) => any = createVerifier({ key: secretKey });

const headerName = "x-auth-token";
const cookieName = "login";

export const authorize: APIGatewayRequestSimpleAuthorizerHandlerV2 = async (
  event
) => {
  try {
    const token =
      findTokenFromHeader(event) ?? parseTokenFromCookie(event.cookies ?? []);
    const { email } = verifyToken(token);
    return {
      isAuthorized: true,
      context: { email },
    };
  } catch (error) {
    return { isAuthorized: false, context: {} };
  }
};

function findTokenFromHeader(
  event: APIGatewayRequestAuthorizerEventV2
): string | undefined {
  return event.headers ? event.headers[headerName] : undefined;
}

function parseTokenFromCookie(cookies: string[]): string {
  const cookiePrefix = `${cookieName}=`;
  return (
    cookies
      .filter((cookie) => cookie.includes(cookiePrefix))
      .flatMap((cookie) => cookie.split(/;\s*/g))
      .filter((part) => part.startsWith(cookiePrefix))[0]
      ?.substring(cookiePrefix.length) ?? ""
  );
}
