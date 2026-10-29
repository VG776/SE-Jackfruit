const { randomUUID } = require('crypto');
const { AppError } = require('../errors/AppError');

const titles = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
};

function errorHandler(error, request, response, _next) {
  const isApplicationError = error instanceof AppError;
  const isMalformedJson = error.type === 'entity.parse.failed';
  const status = isApplicationError || isMalformedJson ? error.status || 400 : 500;
  const code = isApplicationError
    ? error.code
    : isMalformedJson
      ? 'INVALID_INPUT_PAYLOAD'
      : 'INTERNAL_SERVER_ERROR';
  const correlationId = randomUUID();

  if (status >= 500 && process.env.NODE_ENV !== 'test') {
    console.error({
      event: 'request_failed',
      correlationId,
      errorName: error.name || 'Error',
    });
  }

  const problem = {
    type: `https://nexuschat.internal/errors/${code.toLowerCase().replaceAll('_', '-')}`,
    title: titles[status] || 'Error',
    status,
    code,
    detail: isApplicationError
      ? error.detail
      : isMalformedJson
        ? 'The request body must contain valid JSON.'
        : 'An unexpected error occurred. Please try again later.',
    instance: request.originalUrl,
  };

  if (isApplicationError && error.invalidParams) {
    problem.invalidParams = error.invalidParams;
  }

  if (status >= 500) {
    problem.correlationId = correlationId;
  }

  response.status(status).type('application/problem+json').json(problem);
}

module.exports = { errorHandler };
