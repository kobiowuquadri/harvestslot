import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import { AppModule } from '../app.module.js';

/** Application context without HTTP, for command-line tasks that reuse the domain services. */
export async function createCliContext(): Promise<INestApplicationContext> {
  return NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
}
