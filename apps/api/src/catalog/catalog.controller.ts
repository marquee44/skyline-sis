import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles } from '../auth/roles';
import { CatalogService } from './catalog.service';
import {
  CreateCourseDto,
  CreateProgramDto,
  CreateUniversityDto,
  UpdateCourseDto,
  UpdateProgramDto,
  UpdateTermDto,
  UpdateUniversityDto,
} from './dto';

// Catalog admin (spec increment 2): staff/admin only. Student-facing catalog
// reads come later and will be a separate, public/role-light surface.
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('staff', 'admin')
@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  // Universities
  @Get('universities')
  listUniversities() {
    return this.catalog.listUniversities();
  }
  @Get('universities/:id')
  getUniversity(@Param('id') id: string) {
    return this.catalog.getUniversity(id);
  }
  @Post('universities')
  createUniversity(@Body() dto: CreateUniversityDto) {
    return this.catalog.createUniversity(dto);
  }
  @Patch('universities/:id')
  updateUniversity(@Param('id') id: string, @Body() dto: UpdateUniversityDto) {
    return this.catalog.updateUniversity(id, dto);
  }
  @Delete('universities/:id')
  removeUniversity(@Param('id') id: string) {
    return this.catalog.removeUniversity(id);
  }

  // Programs
  @Get('programs')
  listPrograms(@Query('universityId') universityId?: string) {
    return this.catalog.listPrograms(universityId);
  }
  @Get('programs/:id')
  getProgram(@Param('id') id: string) {
    return this.catalog.getProgram(id);
  }
  @Post('programs')
  createProgram(@Body() dto: CreateProgramDto) {
    return this.catalog.createProgram(dto);
  }
  @Patch('programs/:id')
  updateProgram(@Param('id') id: string, @Body() dto: UpdateProgramDto) {
    return this.catalog.updateProgram(id, dto);
  }
  @Delete('programs/:id')
  removeProgram(@Param('id') id: string) {
    return this.catalog.removeProgram(id);
  }

  // Terms (semesters)
  @Get('programs/:id/terms')
  listTerms(@Param('id') id: string) {
    return this.catalog.listTerms(id);
  }
  @Patch('terms/:id')
  updateTerm(@Param('id') id: string, @Body() dto: UpdateTermDto) {
    return this.catalog.updateTerm(id, dto);
  }

  // Courses
  @Get('courses')
  listCourses(@Query('programId') programId?: string) {
    return this.catalog.listCourses(programId);
  }
  @Post('courses')
  createCourse(@Body() dto: CreateCourseDto) {
    return this.catalog.createCourse(dto);
  }
  @Patch('courses/:id')
  updateCourse(@Param('id') id: string, @Body() dto: UpdateCourseDto) {
    return this.catalog.updateCourse(id, dto);
  }
  @Delete('courses/:id')
  removeCourse(@Param('id') id: string) {
    return this.catalog.removeCourse(id);
  }
}
