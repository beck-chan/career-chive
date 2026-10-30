import type { NextConfig } from "next";
import { withCareerChiveConfig } from "./src/lib/withCareerChiveConfig";

const nextConfig: NextConfig = {
  agentRules: false,
  env: {
    FLAG_PRIVATE: process.env.FLAG_PRIVATE,
    FLAG_CHIVEBOT: process.env.FLAG_CHIVEBOT,
  },
  serverExternalPackages: [
    "@aws-sdk/client-s3",
    "@aws-sdk/s3-request-presigner",
  ],
};

export default withCareerChiveConfig(nextConfig);
