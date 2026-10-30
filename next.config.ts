import type { NextConfig } from "next";
import { withCareerChiveConfig } from "./package/config";

const nextConfig: NextConfig = {
  agentRules: false,
};

export default withCareerChiveConfig(nextConfig);
