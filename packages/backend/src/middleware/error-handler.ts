import { FastifyRequest, FastifyReply, FastifyError } from 'fastify';
import { error as errorResult } from '../controller/result';

export async function errorHandler(
  error: FastifyError,
  _request: FastifyRequest,
  reply: FastifyReply
) {
  const statusCode = error.statusCode || 500;
  const message = error.message || 'Internal Server Error';

  reply.status(statusCode).send(errorResult(message, statusCode));
}
