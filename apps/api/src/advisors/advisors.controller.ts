import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles } from '../auth/roles';
import { AdvisorsService } from './advisors.service';
import {
  CreateAdvisorDto,
  CreateAvailabilityRuleDto,
  UpdateAdvisorDto,
  UpdateAvailabilityRuleDto,
} from './dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('staff', 'admin')
@Controller('advisors')
export class AdvisorsController {
  constructor(private readonly advisors: AdvisorsService) {}

  @Get()
  list() {
    return this.advisors.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.advisors.get(id);
  }

  @Post()
  create(@Body() dto: CreateAdvisorDto) {
    return this.advisors.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAdvisorDto) {
    return this.advisors.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.advisors.remove(id);
  }

  // Availability rules (nested)
  @Post(':id/availability')
  addRule(@Param('id') id: string, @Body() dto: CreateAvailabilityRuleDto) {
    return this.advisors.addRule(id, dto);
  }

  @Patch(':id/availability/:ruleId')
  updateRule(
    @Param('id') id: string,
    @Param('ruleId') ruleId: string,
    @Body() dto: UpdateAvailabilityRuleDto,
  ) {
    return this.advisors.updateRule(id, ruleId, dto);
  }

  @Delete(':id/availability/:ruleId')
  removeRule(@Param('id') id: string, @Param('ruleId') ruleId: string) {
    return this.advisors.removeRule(id, ruleId);
  }
}
