export const ACCESS_COOKIE_NAME = "eval_studio_access";
export const ACCESS_COOKIE_VALUE = "granted";

export function isAccessControlEnabled(): boolean {
  return !!process.env.DEMO_ACCESS_CODE;
}

export function isValidAccessCode(code: unknown): boolean {
  return (
    typeof code === "string" &&
    !!process.env.DEMO_ACCESS_CODE &&
    code === process.env.DEMO_ACCESS_CODE
  );
}
