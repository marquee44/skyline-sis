import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles } from '../auth/roles';
import { CatalogImportService } from './catalog-import.service';

// Catalog-level Moodle operations (browse + import). Staff/admin only.
// All of these return 503 until MOODLE_BASE_URL/MOODLE_WS_TOKEN are configured.
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('staff', 'admin')
@Controller('moodle')
export class MoodleCatalogController {
  constructor(private readonly importer: CatalogImportService) {}

  @Get('categories')
  categories() {
    return this.importer.browseCategories();
  }

  @Get('courses')
  courses() {
    return this.importer.browseCourses();
  }

  // Import the whole Moodle tree into the SIS catalog (idempotent).
  @Post('import')
  import() {
    return this.importer.import();
  }
}
