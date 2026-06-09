import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles } from '../auth/roles';
import { FinanceService } from './finance.service';
import { CreateForwardDto, CreateInvoiceDto, CreatePaymentDto } from './dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('staff', 'admin')
@Controller()
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  // Admin overview: all students, where they are + what they owe.
  @Get('students/overview')
  studentsOverview() {
    return this.finance.studentsOverview();
  }

  // Per-term (per-semester) billing.
  @Get('applicants/:id/terms')
  applicantTerms(@Param('id') id: string) {
    return this.finance.listApplicantTerms(id);
  }
  @Post('applicants/:id/terms/:termId/invoice')
  invoiceTerm(@Param('id') id: string, @Param('termId') termId: string) {
    return this.finance.invoiceTerm(id, termId);
  }

  // Invoices
  @Get('invoices')
  listInvoices(@Query('applicantId') applicantId?: string) {
    return this.finance.listInvoices(applicantId);
  }
  @Get('invoices/:id')
  getInvoice(@Param('id') id: string) {
    return this.finance.getInvoice(id);
  }
  @Post('invoices')
  createInvoice(@Body() dto: CreateInvoiceDto) {
    return this.finance.createInvoice(dto);
  }
  @Post('invoices/:id/issue')
  issueInvoice(@Param('id') id: string) {
    return this.finance.issueInvoice(id);
  }
  @Post('invoices/:id/payments')
  recordPayment(@Param('id') id: string, @Body() dto: CreatePaymentDto) {
    return this.finance.recordPayment(id, dto);
  }

  // Forwards (money out to universities)
  @Post('forwards')
  recordForward(@Body() dto: CreateForwardDto) {
    return this.finance.recordForward(dto);
  }

  // Balances
  @Get('applicants/:id/balance')
  applicantBalance(@Param('id') id: string) {
    return this.finance.applicantBalance(id);
  }
  @Get('universities/:id/balance')
  universityBalance(@Param('id') id: string) {
    return this.finance.universityBalance(id);
  }
}
