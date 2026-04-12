import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";

import { toApiErrorEnvelope } from "./api-envelope";
import { deepToSnakeCase } from "./snake-case.interceptor";

@Catch()
export class SnakeCaseExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<{
      status: (code: number) => { json: (body: unknown) => void };
    }>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const payload =
      exception instanceof HttpException
        ? exception.getResponse()
        : toApiErrorEnvelope(
            "INTERNAL_SERVER_ERROR",
            "An unexpected error occurred.",
          );

    response.status(status).json(deepToSnakeCase(payload));
  }
}
