import { applyDecorators, Body, Query, type PipeTransform } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiQuery } from '@nestjs/swagger';
import { z } from 'zod';
import { DomainError } from '@harvestslot/core';

/** Converts a Zod schema to an OpenAPI 3 schema object (Zod 4's native JSON Schema output). */
export function toOpenApi(schema: z.ZodType, io: 'input' | 'output' = 'input'): Record<string, unknown> {
  try {
    const json = z.toJSONSchema(schema, { target: 'openapi-3.0', io, unrepresentable: 'any' }) as Record<string, unknown>;
    delete json.$schema;
    return json;
  } catch {
    return { type: 'object' };
  }
}

/** Validates with a shared contract schema; failures become VALIDATION_FAILED with field paths. */
export class ZodPipe<T extends z.ZodType> implements PipeTransform<unknown, z.infer<T>> {
  constructor(private readonly schema: T) {}
  transform(value: unknown): z.infer<T> {
    const result = this.schema.safeParse(value ?? {});
    if (!result.success) {
      throw new DomainError(
        'VALIDATION_FAILED',
        'Some fields need attention',
        result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      );
    }
    return result.data;
  }
}

/** `@ZodBody(schema)` — validated request body, documented in OpenAPI from the same schema. */
export function ZodBody<T extends z.ZodType>(schema: T): ParameterDecorator {
  return (target, key, index) => {
    Body(new ZodPipe(schema))(target, key, index);
    if (key) ApiBody({ schema: toOpenApi(schema) })(target, key, Object.getOwnPropertyDescriptor(target, key)!);
  };
}

export function ZodQuery<T extends z.ZodType>(schema: T): ParameterDecorator {
  return (target, key, index) => {
    Query(new ZodPipe(schema))(target, key, index);
    if (key && schema instanceof z.ZodObject) {
      for (const [name, field] of Object.entries(schema.shape as Record<string, z.ZodType>)) {
        ApiQuery({ name, required: !field.safeParse(undefined).success, schema: toOpenApi(field) })(
          target,
          key,
          Object.getOwnPropertyDescriptor(target, key)!,
        );
      }
    }
  };
}

/** Documents a 200 response with a contract schema. */
export function ApiOk(schema: z.ZodType, description = 'OK'): MethodDecorator {
  return applyDecorators(ApiOkResponse({ description, schema: toOpenApi(schema, 'output') }));
}
