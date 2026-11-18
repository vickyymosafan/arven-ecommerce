export { ReturnsModule } from './returns.module.js';
export { ReturnsService } from './application/services/returns.service.js';
export { ReturnsMapper, type ReturnWithRelations } from './infrastructure/mappers/returns.mapper.js';
export { PrismaReturnsRepository } from './infrastructure/repositories/prisma-returns.repository.js';
export { ReturnsController } from './presentation/returns.controller.js';
export { AdminReturnsController } from './presentation/admin-returns.controller.js';
