export default (project: {
  name: string;
  downloadUrl: string;
  packageName: string;
  semver: string;
}) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>items</key>
  <array>
    <dict>
      <key>assets</key>
      <array>
        <dict>
          <key>kind</key>
          <string>software-package</string>
          <key>url</key>
          <string>${project.downloadUrl}</string>
        </dict>
      </array>
      <key>metadata</key>
      <dict>
        <key>bundle-identifier</key>
        <string>${project.packageName}</string>
        <key>bundle-version</key>
        <string>${project.semver}</string>
        <key>kind</key>
        <string>software</string>
        <key>title</key>
        <string>${project.name}</string>
      </dict>
    </dict>
  </array>
</dict>
</plist>
`;