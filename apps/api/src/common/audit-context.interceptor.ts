import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { requestContext } from './request-context';

/**
 * Runs each request handler inside an AsyncLocalStorage context carrying the
 * authenticated user's id, so the Prisma audit hook can record WHO made a change.
 * Registered globally; runs after the auth guard so `req.user` is populated.
 */
@Injectable()
export class AuditContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<{ user?: { id?: string } }>();
    const store = { userId: req?.user?.id };
    return new Observable((subscriber) => {
      requestContext.run(store, () => {
        next.handle().subscribe(subscriber);
      });
    });
  }
}
