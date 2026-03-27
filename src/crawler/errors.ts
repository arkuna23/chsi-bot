export class AuthExpiredError extends Error {
  constructor(message = 'CHSI session expired') {
    super(message);
    this.name = 'AuthExpiredError';
  }
}

export class ChsiApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChsiApiError';
  }
}
