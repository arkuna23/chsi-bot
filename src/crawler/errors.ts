export class AuthExpiredError extends Error {
  constructor(message = 'CHSI 登录态已失效') {
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
