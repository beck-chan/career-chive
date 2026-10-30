function envFlag(value: string | undefined, fallback: boolean) {
  if (value === undefined || value === "") return fallback;
  return value === "true" || value === "1";
}

export const flags = {
  // Static process.env.* access so Next can inline these for client/proxy.
  private: envFlag(process.env.FLAG_PRIVATE, false),
  chivebot: envFlag(process.env.FLAG_CHIVEBOT, false),
};
