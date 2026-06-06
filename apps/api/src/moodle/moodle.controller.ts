import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles } from '../auth/roles';
import { ProvisioningService } from './provisioning.service';
import { MoodleReadbackService } from './readback.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('staff', 'admin')
@Controller('applicants/:id/moodle')
export class MoodleController {
  constructor(
    private readonly provisioning: ProvisioningService,
    private readonly readback: MoodleReadbackService,
  ) {}

  // Manually (re)run provisioning — idempotent, safe to retry.
  @Post('provision')
  provision(@Param('id') id: string) {
    return this.provisioning.provision(id);
  }

  // Read-back (increment 14, read-only): grades + completion per course.
  @Get('progress')
  progress(@Param('id') id: string) {
    return this.readback.progress(id);
  }

  // University export (increment 14): completion/grades bundle for the partner.
  @Get('export')
  export(@Param('id') id: string) {
    return this.readback.universityExport(id);
  }
}
