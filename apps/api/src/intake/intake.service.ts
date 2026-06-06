import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { PrismaService } from '../prisma/prisma.service';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// Hard boundaries live in the system prompt (spec section 4): gather-only.
const SYSTEM_PROMPT = `You are the friendly front-door assistant for Skyline University Admission Services, helping Balkan professionals living in the UAE explore studying with our partner faculties in Serbia.

Your ONLY job is to GATHER information and REASSURE, then hand off to a human advisor who books a consultation. You are NOT an advisor.

You MUST collect, conversationally and warmly (one or two questions at a time):
- what they are interested in studying
- first and last name
- email
- phone (optional)
- country of origin
- city in the UAE
- a short description of their prior education

Hard rules — never break these:
- Do NOT assess eligibility or admissions chances.
- Do NOT quote prices, tuition, or fees.
- Do NOT recommend a specific program as a decision, or compare programs.
- Do NOT make any recognition, accreditation, or visa/legalization promises.
- Do NOT collect budget.
- If asked any of the above, warmly explain that the human advisor will cover it in the consultation, and steer back to gathering.

Keep replies short and human. Once you have the key details (especially name, email, interests, prior education), let them know an advisor will reach out to book a consultation, and that they can proceed to pick a time.`;

@Injectable()
export class IntakeService {
  private readonly logger = new Logger(IntakeService.name);

  constructor(private readonly prisma: PrismaService) {}

  private client(): Anthropic {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new ServiceUnavailableException('AI intake is not configured (ANTHROPIC_API_KEY missing)');
    }
    return new Anthropic({ apiKey });
  }

  private model(): string {
    return process.env.INTAKE_MODEL || 'claude-sonnet-4-6';
  }

  /** Stream the assistant's next reply as text chunks (gather-only). */
  async *streamReply(messages: ChatMessage[]): AsyncGenerator<string> {
    const client = this.client();
    const stream = client.messages.stream({
      model: this.model(),
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield event.delta.text;
      }
    }
  }

  /**
   * Extract the captured details from the conversation and upsert an applicant.
   * Uses a forced tool call for reliable structured output. Returns the
   * applicant id when an email was captured, plus the captured fields.
   */
  async finalize(messages: ChatMessage[]): Promise<{
    applicantId: string | null;
    captured: Record<string, string | undefined>;
  }> {
    const client = this.client();
    const captureTool: Anthropic.Tool = {
      name: 'capture_applicant',
      description: 'Save the details gathered from the prospective student.',
      input_schema: {
        type: 'object',
        properties: {
          firstName: { type: 'string' },
          lastName: { type: 'string' },
          email: { type: 'string' },
          phone: { type: 'string' },
          countryOfOrigin: { type: 'string' },
          residenceCity: { type: 'string' },
          priorEducation: { type: 'string' },
          interests: { type: 'string' },
        },
      },
    };

    const res = await client.messages.create({
      model: this.model(),
      max_tokens: 1024,
      system:
        'Extract the prospective student details from the conversation. Only include fields that were actually stated. Call capture_applicant once.',
      tools: [captureTool],
      tool_choice: { type: 'tool', name: 'capture_applicant' },
      messages: [
        ...messages.map((m) => ({ role: m.role, content: m.content })),
        { role: 'user' as const, content: 'Please capture my details now.' },
      ],
    });

    const block = res.content.find((b) => b.type === 'tool_use');
    const captured = (block && block.type === 'tool_use'
      ? (block.input as Record<string, string | undefined>)
      : {}) as Record<string, string | undefined>;

    if (!captured.email) {
      return { applicantId: null, captured };
    }

    const applicant = await this.prisma.applicant.upsert({
      where: { email: captured.email },
      update: {
        firstName: captured.firstName || undefined,
        lastName: captured.lastName || undefined,
        phone: captured.phone || undefined,
        countryOfOrigin: captured.countryOfOrigin || undefined,
        residenceCity: captured.residenceCity || undefined,
        priorEducation: captured.priorEducation || undefined,
        interests: captured.interests || undefined,
      },
      create: {
        firstName: captured.firstName || 'Unknown',
        lastName: captured.lastName || 'Unknown',
        email: captured.email,
        phone: captured.phone,
        countryOfOrigin: captured.countryOfOrigin,
        residenceCity: captured.residenceCity,
        priorEducation: captured.priorEducation,
        interests: captured.interests,
      },
    });

    this.logger.log(`Intake captured applicant ${applicant.id}`);
    return { applicantId: applicant.id, captured };
  }
}
