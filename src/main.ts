import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { AppModule } from './app.module';

function loadEnvFromFile() {
  const envPath = resolve(process.cwd(), '.env');

  if (!existsSync(envPath)) {
    return;
  }

  const fileContent = readFileSync(envPath, 'utf8');

  fileContent.split('\n').forEach((line) => {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      return;
    }

    const separatorIndex = trimmed.indexOf('=');

    if (separatorIndex === -1) {
      return;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();

    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  });
}

async function bootstrap() {
  loadEnvFromFile();

  const app = await NestFactory.create(AppModule);
  
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
  }));
  
  app.enableCors({
    origin: ['http://localhost:3000', 'http://localhost:5173'],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });
  
  await app.listen(3001);
  console.log('Coverly API running on http://localhost:3001');
}
bootstrap();
