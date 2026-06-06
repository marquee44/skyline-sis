import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles } from '../auth/roles';
import { ProgramSelectionService } from './program-selection.service';
import { DecisionDto, ProposeDto } from './dto';

// Spec section 7. Staff/admin drive all of these for v1 (a student-facing
// propose/confirm surface can reuse the same service later).
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('staff', 'admin')
@Controller('applicants/:id/program')
export class ProgramSelectionController {
  constructor(private readonly selection: ProgramSelectionService) {}

  @Post('propose')
  propose(@Param('id') id: string, @Body() dto: ProposeDto, @Req() req: { user?: { id: string } }) {
    return this.selection.propose(id, dto.programId, req.user?.id);
  }

  @Post('approve')
  approve(@Param('id') id: string, @Body() dto: DecisionDto, @Req() req: { user?: { id: string } }) {
    return this.selection.approve(id, dto.note, req.user?.id);
  }

  @Post('reject')
  reject(@Param('id') id: string, @Body() dto: DecisionDto, @Req() req: { user?: { id: string } }) {
    return this.selection.reject(id, dto.note, req.user?.id);
  }

  @Post('confirm')
  confirm(@Param('id') id: string, @Req() req: { user?: { id: string } }) {
    return this.selection.confirm(id, req.user?.id);
  }
}
