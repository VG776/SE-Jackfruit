class AppError extends Error {
  constructor({ status, code, detail, invalidParams }) {
    super(detail);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.detail = detail;
    this.invalidParams = invalidParams;
  }
}

module.exports = { AppError };
