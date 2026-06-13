import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles } from '../auth/roles';
import { TeachersService } from './teachers.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('staff', 'admin')
@Controller('teachers')
export class TeachersController {
  constructor(private readonly teachers: TeachersService) {}

  @Get()
  list() {
    return this.teachers.list();
  }

  @Roles('admin')
  @Post('import')
  importFromMoodle() {
    return this.teachers.importFromMoodle();
  }
}
