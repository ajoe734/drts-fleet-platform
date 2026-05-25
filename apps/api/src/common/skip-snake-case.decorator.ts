import { SetMetadata } from "@nestjs/common";

export const SKIP_SNAKE_CASE_KEY = "skipSnakeCase";

export const SkipSnakeCase = () => SetMetadata(SKIP_SNAKE_CASE_KEY, true);
