import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApplicantStage } from '@skyline/db';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles } from '../auth/roles';
import { ApplicantsService } from './applicants.service';
import { CreateApplicantDto, TransitionStageDto, UpdateApplicantDto } from './dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('staff', 'admin')
@Controller('applicants')
export class ApplicantsController {
  constructor(private readonly applicants: ApplicantsService) {}

  @Get()
  list(
    @Query('stage') stage?: ApplicantStage,
    @Query('advisorId') advisorId?: string,
  ) {
    return this.applicants.list({ stage, advisorId });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.applicants.get(id);
  }

  @Post()
  create(@Body() dto: CreateApplicantDto) {
    return this.applicants.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateApplicantDto) {
    return this.applicants.update(id, dto);
  }

  @Post(':id/transition')
  transition(
    @Param('id') id: string,
    @Body() dto: TransitionStageDto,
    @Req() req: { user?: { id: string } },
  ) {
    return this.applicants.transition(id, dto.toStage, {
      note: dto.note,
      byUserId: req.user?.id,
    });
  }

  @Get(':id/history')
  history(@Param('id') id: string) {
    return this.applicants.history(id);
  }
}
