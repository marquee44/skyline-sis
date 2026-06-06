import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule], // JwtAuthGuard/RolesGuard depend on Passport + Reflector
  controllers: [CatalogController],
  providers: [CatalogService],
})
export class CatalogModule {}
