type RuntimeEnv = {
  DEV?: boolean;
  PROD?: boolean;
  MODE?: string;
  VITE_ENABLE_ROLE_PREVIEW?: string;
  VITE_ENABLE_DEVELOPMENT_TOOLS?: string;
};

export function isRolePreviewEnabled(env: RuntimeEnv = import.meta.env) {
  return env.VITE_ENABLE_ROLE_PREVIEW === "true" && (env.DEV === true || env.MODE === "test");
}

export function areDevelopmentToolsEnabled(env: RuntimeEnv = import.meta.env) {
  if (env.PROD === true) {
    return false;
  }

  return env.DEV === true || (env.MODE === "test" && env.VITE_ENABLE_DEVELOPMENT_TOOLS === "true");
}
