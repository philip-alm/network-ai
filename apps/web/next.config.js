const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pin tracing root to the monorepo so Next doesn't walk up to a stray lockfile.
  outputFileTracingRoot: path.join(__dirname, '../..'),
  transpilePackages: [
    '@network-ai/app',
    '@network-ai/ui',
    '@network-ai/types',
    // React Native packages compiled for web via react-native-web (added in Phase 6)
    'react-native',
    'react-native-web',
    'solito',
    'nativewind',
  ],
  typedRoutes: true,
};

module.exports = nextConfig;
