import { Context } from 'telegraf';

export function isTelegramMenuCommand(context: Context): boolean {
  const text =
    context.message && 'text' in context.message
      ? context.message.text
      : undefined;

  return /^\/(?:start|menu)(?:@\w+)?(?:\s|$)/i.test(text ?? '');
}
