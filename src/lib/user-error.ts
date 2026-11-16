/** Error with a message that is safe to show the user (no imports: usable from plugins and tests). */
export class UserError extends Error {
  constructor(
    message: string,
    public field?: string,
  ) {
    super(message);
  }
}
