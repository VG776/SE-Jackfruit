const { AppError } = require('../errors/AppError');

function validate(schema) {
  return (request, _response, next) => {
    const result = schema.safeParse(request.body);

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

    request.validatedBody = result.data;
    return next();
  };
}

module.exports = { validate };
