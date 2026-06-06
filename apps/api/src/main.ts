import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });

  // Everything is served under /api (nginx proxies https://sis.skyline-as.ae/api).
  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );

  const origins = [process.env.WEB_ORIGIN, process.env.WEB_ORIGIN_DEV].filter(
    (o): o is string => Boolean(o),
  );
  app.enableCors({ origin: origins.length ? origins : true, credentials: true });

  const port = Number(process.env.API_PORT ?? 3001);
  await app.listen(port, '127.0.0.1');
  new Logger('Bootstrap').log(`Skyline SIS API listening on http://127.0.0.1:${port}/api`);
}

bootstrap();
