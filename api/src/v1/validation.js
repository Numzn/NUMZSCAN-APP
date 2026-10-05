import { ApiError } from "./security.js";

export function parse(schema, data) {
  const result = schema.safeParse(data ?? {});
  if (!result.success) {
    throw new ApiError(
      400,
      "INVALID_INPUT",
      "Request is invalid",
      result.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }))
    );
  }
  return result.data;
}
