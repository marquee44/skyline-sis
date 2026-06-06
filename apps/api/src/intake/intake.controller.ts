import {
  Body,
  Controller,
  Post,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Response } from 'express';
import { IntakeService } from './intake.service';
import { ChatDto } from './dto';

/**
 * Public front-door endpoints (no auth) — this is where prospective students
 * land before they have an account. Gather-only; the heavy lifting (and the
 * hard boundaries) is in IntakeService's system prompt.
 */
@Controller('intake')
export class IntakeController {
  constructor(private readonly intake: IntakeService) {}

  // Streams the assistant reply as Server-Sent Events.
  @Post('chat')
  async chat(@Body() dto: ChatDto, @Res() res: Response) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new ServiceUnavailableException('AI intake is not configured yet');
    }
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    try {
      for await (const chunk of this.intake.streamReply(dto.messages)) {
        res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
      }
      res.write('data: [DONE]\n\n');
    } catch (e) {
      res.write(`event: error\ndata: ${JSON.stringify({ message: (e as Error).message })}\n\n`);
    } finally {
      res.end();
    }
  }

  // Extracts captured details and upserts an applicant. Returns { applicantId }.
  @Post('finalize')
  finalize(@Body() dto: ChatDto) {
    return this.intake.finalize(dto.messages);
  }
}
