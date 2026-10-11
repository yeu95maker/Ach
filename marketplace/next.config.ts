import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // The marketplace lives in a sub-folder of a repository that has its own lockfile.
  turbopack: { root: import.meta.dirname },
}

export default nextConfig
