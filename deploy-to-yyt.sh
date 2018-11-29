#!/bin/bash

if [ $# -ne 4 ]; then
  echo "$0 service-name platform-name package-namespace input-file"
  echo "Example) $0 hello android life.yyt.hello build/Hello.apk"
  exit 1
fi

YYT_DIST_SERVICE_NAME="$1"
YYT_DIST_PLATFORM_NAME="$2"
YYT_DIST_PACKAGE_NAMESPACE="$3"
YYT_DIST_INPUT_FILE="$4"
FILE_EXTENSION="${YYT_DIST_INPUT_FILE##*.}"

if [ -z "${YYT_DIST_AUTH_TOKEN}" ]; then
  echo "No auth token for yyt.life"
  exit 1
fi

if [ -z "${APP_VERSION}" ]; then
  APP_VERSION="1.0.0"
fi
if [ -z "${BUILD_NUMBER}" ]; then
  BUILD_NUMBER="0"
fi
DEPLOY_NAME="${YYT_DIST_PACKAGE_NAMESPACE}-${APP_VERSION}.${BUILD_NUMBER}.${FILE_EXTENSION}"

upload_file() {
  local LOCAL_NAME="$1"
  local SERVER_NAME="$2"

  if [ ! -f "${LOCAL_NAME}" ]; then
    echo "Cannot a file from local: ${LOCAL_NAME}"
    exit 1
  fi
 
  local UPLOAD_URL="$( \
    curl -SsL -XPUT \
      "https://api.yyt.life/d/${YYT_DIST_SERVICE_NAME}/${YYT_DIST_PLATFORM_NAME}/${SERVER_NAME}" \
      -H "X-Auth-Token: ${YYT_DIST_AUTH_TOKEN}" \
    )"

  if [ $? -ne 0 ]; then
    echo "Cannot access to yyt.life api."
    exit 1
  fi
  if [[ "${UPLOAD_URL}" != https* ]]; then
    echo "Invalid Response: ${UPLOAD_URL}"
    exit 1
  fi
  curl -T "${LOCAL_NAME}" "${UPLOAD_URL}"

  if [ $? -ne 0 ]; then
    echo "Cannot upload to d.yyt.life server."
    exit 1
  fi
  echo "Upload successfully: ${LOCAL_NAME} -> ${SERVER_NAME}"
}

# Upload a new binary file.
upload_file "${YYT_DIST_INPUT_FILE}" "${DEPLOY_NAME}"
