import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './jwt.strategy';
import { RolesGuard } from './guards';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'dev-only-change-me',
      signOptions: { expiresIn: process.env.JWT_EXPIRES_IN ?? '1d' },
    }),
  ],
  controllers: [AuthController],
  providers: [JwtStrategy, RolesGuard, AuthService],
  exports: [JwtModule, PassportModule],
})
export class AuthModule {}
