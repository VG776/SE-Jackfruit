const { AppError } = require('../errors/AppError');

function validate(schema, { source = 'body', target = 'validatedBody' } = {}) {
  return (request, _response, next) => {
    const result = schema.safeParse(request[source]);

    if (!result.success) {
      return next(
        new AppError({
          status: 400,
          code: 'INVALID_INPUT_PAYLOAD',
          detail: 'Please check your input and try again.',
          invalidParams: result.error.issues.map((issue) => ({
            name: issue.path.join('.') || 'body',
            reason: issue.message,
          })),
        }),
      );
    }

    request[target] = result.data;
    return next();
  };
}

module.exports = { validate };
