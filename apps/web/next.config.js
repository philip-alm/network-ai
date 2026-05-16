const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pin tracing root to the monorepo so Next doesn't walk up to a stray lockfile.
  outputFileTracingRoot: path.join(__dirname, '../..'),
  transpilePackages: [
    // Workspace packages — names match the @reknowable/* scope used in
    // package.json. (Previously these were @network-ai/* from before the
    // rename, which meant transpilePackages was a no-op and dev had to
    // re-discover + compile our shared sources on every cold request.)
    '@reknowable/app',
    '@reknowable/ui',
    '@reknowable/types',
    // React Native packages compiled for web via react-native-web (added in Phase 6)
    'react-native',
    'react-native-web',
    'solito',
    'nativewind',
  ],
  typedRoutes: true,
};

module.exports = nextConfig;
