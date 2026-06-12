import { BadRequestException, Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { PublicBookingService } from './public-booking.service';
import { QuestionnaireService } from './questionnaire.service';
import { PublicBookDto, QuestionnaireDto } from './dto';
import { verifyTurnstile } from './turnstile';

// No auth guard — this is the public self-service booking surface. Rate-limited.
@UseGuards(ThrottlerGuard)
@Controller('public/booking')
export class PublicController {
  constructor(
    private readonly svc: PublicBookingService,
    private readonly questionnaire: QuestionnaireService,
  ) {}

  @Get('config')
  async config() {
    const cfg = await this.svc.config();
    return { ...cfg, aiEnabled: this.questionnaire.available() };
  }

  // AI "help your advisor prepare" questionnaire — runs after booking, optional.
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('questionnaire')
  questionnaireStep(@Body() dto: QuestionnaireDto) {
    return this.questionnaire.step(dto.consultationId, dto.answers ?? []);
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('slots')
  slots(@Query('from') from: string, @Query('to') to: string) {
    if (!from || !to) throw new BadRequestException('from and to are required (YYYY-MM-DD)');
    return this.svc.slots(from, to);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post()
  async book(@Body() dto: PublicBookDto, @Req() req: Request) {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip;
    const ok = await verifyTurnstile(dto.turnstileToken, ip);
    if (!ok) throw new BadRequestException('Captcha verification failed — please try again');
    return this.svc.book(dto);
  }
}
